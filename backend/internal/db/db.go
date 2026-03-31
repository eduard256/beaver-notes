package db

import (
	"database/sql"
	"fmt"
	"strings"
	"time"

	"github.com/eduard256/beaver-notes/backend/internal/models"
	"github.com/google/uuid"
	_ "github.com/mattn/go-sqlite3"
)

// DB wraps the SQLite database connection.
type DB struct {
	conn *sql.DB
}

// New opens the SQLite database at the given path and runs migrations.
func New(dbPath string) (*DB, error) {
	conn, err := sql.Open("sqlite3", dbPath+"?_journal_mode=WAL&_foreign_keys=on&_busy_timeout=5000")
	if err != nil {
		return nil, fmt.Errorf("open db: %w", err)
	}
	conn.SetMaxOpenConns(1)

	d := &DB{conn: conn}
	if err := d.migrate(); err != nil {
		conn.Close()
		return nil, fmt.Errorf("migrate: %w", err)
	}
	return d, nil
}

// Close closes the database connection.
func (d *DB) Close() error {
	return d.conn.Close()
}

func (d *DB) migrate() error {
	stmts := []string{
		`CREATE TABLE IF NOT EXISTS messages (
			id TEXT PRIMARY KEY,
			content TEXT NOT NULL DEFAULT '',
			pinned INTEGER NOT NULL DEFAULT 0,
			created_at DATETIME NOT NULL DEFAULT (datetime('now')),
			updated_at DATETIME NOT NULL DEFAULT (datetime('now'))
		)`,
		`CREATE TABLE IF NOT EXISTS files (
			id TEXT PRIMARY KEY,
			message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
			filename TEXT NOT NULL,
			mime_type TEXT NOT NULL,
			size INTEGER NOT NULL,
			storage_path TEXT NOT NULL,
			created_at DATETIME NOT NULL DEFAULT (datetime('now'))
		)`,
		`CREATE INDEX IF NOT EXISTS idx_files_message ON files(message_id)`,
		`CREATE TABLE IF NOT EXISTS tags (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			name TEXT NOT NULL UNIQUE
		)`,
		`CREATE TABLE IF NOT EXISTS message_tags (
			message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
			tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
			PRIMARY KEY (message_id, tag_id)
		)`,
		// FTS5 virtual table for full-text search
		`CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
			content,
			content=messages,
			content_rowid=rowid
		)`,
		// Triggers to keep FTS index in sync
		`CREATE TRIGGER IF NOT EXISTS messages_ai AFTER INSERT ON messages BEGIN
			INSERT INTO messages_fts(rowid, content) VALUES (new.rowid, new.content);
		END`,
		`CREATE TRIGGER IF NOT EXISTS messages_ad AFTER DELETE ON messages BEGIN
			INSERT INTO messages_fts(messages_fts, rowid, content) VALUES('delete', old.rowid, old.content);
		END`,
		`CREATE TRIGGER IF NOT EXISTS messages_au AFTER UPDATE ON messages BEGIN
			INSERT INTO messages_fts(messages_fts, rowid, content) VALUES('delete', old.rowid, old.content);
			INSERT INTO messages_fts(rowid, content) VALUES (new.rowid, new.content);
		END`,
	}

	for _, stmt := range stmts {
		if _, err := d.conn.Exec(stmt); err != nil {
			return fmt.Errorf("exec %q: %w", stmt[:60], err)
		}
	}
	return nil
}

// CreateMessage inserts a new message and extracts hashtags from the content.
func (d *DB) CreateMessage(content string) (*models.Message, error) {
	id := uuid.New().String()
	now := time.Now().UTC()

	_, err := d.conn.Exec(
		`INSERT INTO messages (id, content, created_at, updated_at) VALUES (?, ?, ?, ?)`,
		id, content, now, now,
	)
	if err != nil {
		return nil, fmt.Errorf("insert message: %w", err)
	}

	// Extract and save hashtags
	tags := extractTags(content)
	for _, tag := range tags {
		d.addTag(id, tag)
	}

	return &models.Message{
		ID:        id,
		Content:   content,
		Pinned:    false,
		CreatedAt: now,
		UpdatedAt: now,
		Tags:      tags,
	}, nil
}

// UpdateMessage updates the content of an existing message.
func (d *DB) UpdateMessage(id, content string) (*models.Message, error) {
	now := time.Now().UTC()
	res, err := d.conn.Exec(
		`UPDATE messages SET content = ?, updated_at = ? WHERE id = ?`,
		content, now, id,
	)
	if err != nil {
		return nil, fmt.Errorf("update message: %w", err)
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return nil, fmt.Errorf("message not found")
	}

	// Re-sync tags
	d.conn.Exec(`DELETE FROM message_tags WHERE message_id = ?`, id)
	tags := extractTags(content)
	for _, tag := range tags {
		d.addTag(id, tag)
	}

	return d.GetMessage(id)
}

// DeleteMessage removes a message and its associated files metadata.
// Returns the file storage paths so the caller can remove them from disk.
func (d *DB) DeleteMessage(id string) ([]string, error) {
	rows, err := d.conn.Query(`SELECT storage_path FROM files WHERE message_id = ?`, id)
	if err != nil {
		return nil, err
	}
	var paths []string
	for rows.Next() {
		var p string
		rows.Scan(&p)
		paths = append(paths, p)
	}
	rows.Close()

	_, err = d.conn.Exec(`DELETE FROM messages WHERE id = ?`, id)
	if err != nil {
		return nil, fmt.Errorf("delete message: %w", err)
	}
	return paths, nil
}

// PinMessage sets or unsets the pinned flag.
func (d *DB) PinMessage(id string, pinned bool) error {
	val := 0
	if pinned {
		val = 1
	}
	res, err := d.conn.Exec(`UPDATE messages SET pinned = ?, updated_at = ? WHERE id = ?`, val, time.Now().UTC(), id)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return fmt.Errorf("message not found")
	}
	return nil
}

// GetMessage retrieves a single message by ID with its files and tags.
func (d *DB) GetMessage(id string) (*models.Message, error) {
	msg := &models.Message{}
	var pinned int
	err := d.conn.QueryRow(
		`SELECT id, content, pinned, created_at, updated_at FROM messages WHERE id = ?`, id,
	).Scan(&msg.ID, &msg.Content, &pinned, &msg.CreatedAt, &msg.UpdatedAt)
	if err != nil {
		return nil, err
	}
	msg.Pinned = pinned == 1
	msg.Files, _ = d.getFiles(id)
	msg.Tags, _ = d.getTags(id)
	return msg, nil
}

// QueryMessages searches and filters messages based on the provided query parameters.
func (d *DB) QueryMessages(q models.MessageQuery) (*models.MessagesResponse, error) {
	if q.Limit <= 0 {
		q.Limit = 50
	}
	if q.Limit > 200 {
		q.Limit = 200
	}

	var where []string
	var args []interface{}

	// Full-text search using FTS5
	if q.Search != "" {
		where = append(where, `m.rowid IN (SELECT rowid FROM messages_fts WHERE messages_fts MATCH ?)`)
		// Escape FTS5 special characters and use prefix search
		searchTerm := escapeFTS(q.Search)
		args = append(args, searchTerm)
	}

	// Date filters
	if q.DateFrom != "" {
		where = append(where, `m.created_at >= ?`)
		args = append(args, q.DateFrom)
	}
	if q.DateTo != "" {
		where = append(where, `m.created_at <= ?`)
		args = append(args, q.DateTo+" 23:59:59")
	}

	// Pinned filter
	if q.Pinned != nil {
		val := 0
		if *q.Pinned {
			val = 1
		}
		where = append(where, `m.pinned = ?`)
		args = append(args, val)
	}

	// Tag filter
	if q.Tag != "" {
		where = append(where, `m.id IN (SELECT mt.message_id FROM message_tags mt JOIN tags t ON mt.tag_id = t.id WHERE t.name = ?)`)
		args = append(args, q.Tag)
	}

	// Content type filter (requires join with files)
	switch q.Type {
	case "image":
		where = append(where, `m.id IN (SELECT message_id FROM files WHERE mime_type LIKE 'image/%')`)
	case "video":
		where = append(where, `m.id IN (SELECT message_id FROM files WHERE mime_type LIKE 'video/%')`)
	case "file":
		where = append(where, `m.id IN (SELECT message_id FROM files)`)
	case "text":
		where = append(where, `m.id NOT IN (SELECT message_id FROM files)`)
	}

	// File size filters
	if q.SizeMin != nil {
		where = append(where, `m.id IN (SELECT message_id FROM files WHERE size >= ?)`)
		args = append(args, *q.SizeMin)
	}
	if q.SizeMax != nil {
		where = append(where, `m.id IN (SELECT message_id FROM files WHERE size <= ?)`)
		args = append(args, *q.SizeMax)
	}

	whereClause := ""
	if len(where) > 0 {
		whereClause = "WHERE " + strings.Join(where, " AND ")
	}

	// Count total matching
	var total int
	countQuery := fmt.Sprintf(`SELECT COUNT(*) FROM messages m %s`, whereClause)
	d.conn.QueryRow(countQuery, args...).Scan(&total)

	// Fetch page
	query := fmt.Sprintf(
		`SELECT m.id, m.content, m.pinned, m.created_at, m.updated_at
		FROM messages m %s
		ORDER BY m.created_at DESC
		LIMIT ? OFFSET ?`,
		whereClause,
	)
	args = append(args, q.Limit, q.Offset)

	rows, err := d.conn.Query(query, args...)
	if err != nil {
		return nil, fmt.Errorf("query messages: %w", err)
	}
	defer rows.Close()

	var messages []models.Message
	for rows.Next() {
		var msg models.Message
		var pinned int
		if err := rows.Scan(&msg.ID, &msg.Content, &pinned, &msg.CreatedAt, &msg.UpdatedAt); err != nil {
			return nil, err
		}
		msg.Pinned = pinned == 1
		msg.Files, _ = d.getFiles(msg.ID)
		msg.Tags, _ = d.getTags(msg.ID)
		messages = append(messages, msg)
	}

	if messages == nil {
		messages = []models.Message{}
	}

	return &models.MessagesResponse{
		Messages: messages,
		Total:    total,
		HasMore:  q.Offset+q.Limit < total,
	}, nil
}

// AddFile records a file attachment in the database.
func (d *DB) AddFile(messageID, filename, mimeType string, size int64, storagePath string) (*models.File, error) {
	id := uuid.New().String()
	now := time.Now().UTC()
	_, err := d.conn.Exec(
		`INSERT INTO files (id, message_id, filename, mime_type, size, storage_path, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
		id, messageID, filename, mimeType, size, storagePath, now,
	)
	if err != nil {
		return nil, err
	}
	return &models.File{
		ID:          id,
		MessageID:   messageID,
		Filename:    filename,
		MimeType:    mimeType,
		Size:        size,
		StoragePath: storagePath,
		CreatedAt:   now,
	}, nil
}

// GetFile retrieves a file record by ID.
func (d *DB) GetFile(id string) (*models.File, error) {
	f := &models.File{}
	err := d.conn.QueryRow(
		`SELECT id, message_id, filename, mime_type, size, storage_path, created_at FROM files WHERE id = ?`, id,
	).Scan(&f.ID, &f.MessageID, &f.Filename, &f.MimeType, &f.Size, &f.StoragePath, &f.CreatedAt)
	if err != nil {
		return nil, err
	}
	return f, nil
}

// DeleteFile removes a file record and returns its storage path for disk cleanup.
func (d *DB) DeleteFile(id string) (string, error) {
	var path string
	err := d.conn.QueryRow(`SELECT storage_path FROM files WHERE id = ?`, id).Scan(&path)
	if err != nil {
		return "", err
	}
	_, err = d.conn.Exec(`DELETE FROM files WHERE id = ?`, id)
	return path, err
}

func (d *DB) getFiles(messageID string) ([]models.File, error) {
	rows, err := d.conn.Query(
		`SELECT id, message_id, filename, mime_type, size, storage_path, created_at FROM files WHERE message_id = ? ORDER BY created_at`, messageID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var files []models.File
	for rows.Next() {
		var f models.File
		rows.Scan(&f.ID, &f.MessageID, &f.Filename, &f.MimeType, &f.Size, &f.StoragePath, &f.CreatedAt)
		files = append(files, f)
	}
	return files, nil
}

func (d *DB) getTags(messageID string) ([]string, error) {
	rows, err := d.conn.Query(
		`SELECT t.name FROM tags t JOIN message_tags mt ON t.id = mt.tag_id WHERE mt.message_id = ?`, messageID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var tags []string
	for rows.Next() {
		var name string
		rows.Scan(&name)
		tags = append(tags, name)
	}
	return tags, nil
}

func (d *DB) addTag(messageID, tagName string) {
	// Upsert tag
	d.conn.Exec(`INSERT OR IGNORE INTO tags (name) VALUES (?)`, tagName)
	var tagID int
	d.conn.QueryRow(`SELECT id FROM tags WHERE name = ?`, tagName).Scan(&tagID)
	d.conn.Exec(`INSERT OR IGNORE INTO message_tags (message_id, tag_id) VALUES (?, ?)`, messageID, tagID)
}

// extractTags finds all #hashtags in the content.
func extractTags(content string) []string {
	var tags []string
	seen := make(map[string]bool)
	words := strings.Fields(content)
	for _, w := range words {
		if strings.HasPrefix(w, "#") && len(w) > 1 {
			tag := strings.ToLower(strings.TrimRight(w, ".,;:!?"))
			tag = strings.TrimPrefix(tag, "#")
			if tag != "" && !seen[tag] {
				seen[tag] = true
				tags = append(tags, tag)
			}
		}
	}
	return tags
}

// escapeFTS escapes special FTS5 query characters for safe searching.
func escapeFTS(s string) string {
	// Wrap each word in quotes for exact matching, join with AND
	words := strings.Fields(s)
	var parts []string
	for _, w := range words {
		// Remove FTS special chars
		clean := strings.NewReplacer(
			`"`, ``,
			`*`, ``,
			`(`, ``,
			`)`, ``,
			`{`, ``,
			`}`, ``,
		).Replace(w)
		if clean != "" {
			parts = append(parts, `"`+clean+`"`)
		}
	}
	if len(parts) == 0 {
		return `""`
	}
	return strings.Join(parts, " ")
}
