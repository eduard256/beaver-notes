package handlers

import (
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/eduard256/beaver-notes/backend/internal/auth"
	"github.com/eduard256/beaver-notes/backend/internal/db"
	"github.com/eduard256/beaver-notes/backend/internal/models"
	"github.com/google/uuid"
)

// Handlers holds dependencies for HTTP handlers.
type Handlers struct {
	db       *db.DB
	auth     *auth.Auth
	uploads  string // path to uploads directory
}

// New creates a new Handlers instance.
func New(database *db.DB, a *auth.Auth, uploadsDir string) *Handlers {
	os.MkdirAll(uploadsDir, 0750)
	return &Handlers{
		db:      database,
		auth:    a,
		uploads: uploadsDir,
	}
}

// AuthLogin handles POST /api/auth - password login.
func (h *Handlers) AuthLogin(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	var req models.AuthRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request"}`, http.StatusBadRequest)
		return
	}

	if !h.auth.CheckPassword(req.Password) {
		http.Error(w, `{"error":"wrong password"}`, http.StatusUnauthorized)
		return
	}

	if err := h.auth.CreateToken(w); err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusOK, models.AuthResponse{OK: true})
}

// AuthCheck handles GET /api/auth - session validation.
func (h *Handlers) AuthCheck(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	if err := h.auth.ValidateRequest(r); err != nil {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	writeJSON(w, http.StatusOK, models.AuthResponse{OK: true})
}

// Messages handles GET /api/messages (list/search) and POST /api/messages (create).
func (h *Handlers) Messages(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		h.listMessages(w, r)
	case http.MethodPost:
		h.createMessage(w, r)
	default:
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
	}
}

// MessageAction handles PATCH /api/messages/{id}?action=pin|unpin|edit|delete
func (h *Handlers) MessageAction(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPatch {
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	// Extract message ID from path: /api/messages/{id}
	id := strings.TrimPrefix(r.URL.Path, "/api/messages/")
	if id == "" || strings.Contains(id, "/") {
		http.Error(w, `{"error":"invalid message id"}`, http.StatusBadRequest)
		return
	}

	action := r.URL.Query().Get("action")
	switch action {
	case "pin":
		if err := h.db.PinMessage(id, true); err != nil {
			http.Error(w, `{"error":"not found"}`, http.StatusNotFound)
			return
		}
		msg, _ := h.db.GetMessage(id)
		writeJSON(w, http.StatusOK, msg)

	case "unpin":
		if err := h.db.PinMessage(id, false); err != nil {
			http.Error(w, `{"error":"not found"}`, http.StatusNotFound)
			return
		}
		msg, _ := h.db.GetMessage(id)
		writeJSON(w, http.StatusOK, msg)

	case "edit":
		var body struct {
			Content string `json:"content"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, `{"error":"invalid request"}`, http.StatusBadRequest)
			return
		}
		msg, err := h.db.UpdateMessage(id, body.Content)
		if err != nil {
			http.Error(w, `{"error":"not found"}`, http.StatusNotFound)
			return
		}
		writeJSON(w, http.StatusOK, msg)

	case "delete":
		paths, err := h.db.DeleteMessage(id)
		if err != nil {
			http.Error(w, `{"error":"not found"}`, http.StatusNotFound)
			return
		}
		// Clean up files from disk
		for _, p := range paths {
			os.Remove(p)
		}
		writeJSON(w, http.StatusOK, map[string]bool{"ok": true})

	default:
		http.Error(w, `{"error":"invalid action, use: pin, unpin, edit, delete"}`, http.StatusBadRequest)
	}
}

// FileDownload handles GET /api/files/{id} - streams the file.
func (h *Handlers) FileDownload(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	id := strings.TrimPrefix(r.URL.Path, "/api/files/")
	if id == "" {
		http.Error(w, `{"error":"invalid file id"}`, http.StatusBadRequest)
		return
	}

	f, err := h.db.GetFile(id)
	if err != nil {
		http.Error(w, `{"error":"not found"}`, http.StatusNotFound)
		return
	}

	// Prevent path traversal
	cleanPath := filepath.Clean(f.StoragePath)
	if !strings.HasPrefix(cleanPath, filepath.Clean(h.uploads)) {
		http.Error(w, `{"error":"forbidden"}`, http.StatusForbidden)
		return
	}

	file, err := os.Open(cleanPath)
	if err != nil {
		http.Error(w, `{"error":"file not found on disk"}`, http.StatusNotFound)
		return
	}
	defer file.Close()

	w.Header().Set("Content-Type", f.MimeType)
	w.Header().Set("Content-Disposition", fmt.Sprintf(`inline; filename="%s"`, sanitizeFilename(f.Filename)))
	w.Header().Set("Content-Length", strconv.FormatInt(f.Size, 10))

	io.Copy(w, file)
}

// FileDelete handles DELETE /api/files/{id}.
func (h *Handlers) FileDelete(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	id := strings.TrimPrefix(r.URL.Path, "/api/files/")
	path, err := h.db.DeleteFile(id)
	if err != nil {
		http.Error(w, `{"error":"not found"}`, http.StatusNotFound)
		return
	}
	os.Remove(path)
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (h *Handlers) listMessages(w http.ResponseWriter, r *http.Request) {
	q := models.MessageQuery{
		Search:   r.URL.Query().Get("search"),
		Type:     r.URL.Query().Get("type"),
		DateFrom: r.URL.Query().Get("date_from"),
		DateTo:   r.URL.Query().Get("date_to"),
		Tag:      r.URL.Query().Get("tag"),
	}

	if v := r.URL.Query().Get("offset"); v != "" {
		q.Offset, _ = strconv.Atoi(v)
	}
	if v := r.URL.Query().Get("limit"); v != "" {
		q.Limit, _ = strconv.Atoi(v)
	}
	if v := r.URL.Query().Get("pinned"); v != "" {
		pinned := v == "true" || v == "1"
		q.Pinned = &pinned
	}
	if v := r.URL.Query().Get("size_min"); v != "" {
		n, _ := strconv.ParseInt(v, 10, 64)
		q.SizeMin = &n
	}
	if v := r.URL.Query().Get("size_max"); v != "" {
		n, _ := strconv.ParseInt(v, 10, 64)
		q.SizeMax = &n
	}

	resp, err := h.db.QueryMessages(q)
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"%s"}`, err.Error()), http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusOK, resp)
}

func (h *Handlers) createMessage(w http.ResponseWriter, r *http.Request) {
	// Support up to 40GB uploads
	r.Body = http.MaxBytesReader(w, r.Body, 40<<30)

	contentType := r.Header.Get("Content-Type")

	// Handle multipart form data (text + files)
	if strings.HasPrefix(contentType, "multipart/form-data") {
		if err := r.ParseMultipartForm(32 << 20); err != nil { // 32MB in memory, rest on disk
			http.Error(w, `{"error":"failed to parse form"}`, http.StatusBadRequest)
			return
		}

		content := r.FormValue("content")
		msg, err := h.db.CreateMessage(content)
		if err != nil {
			http.Error(w, `{"error":"failed to create message"}`, http.StatusInternalServerError)
			return
		}

		// Handle file uploads
		if r.MultipartForm != nil && r.MultipartForm.File != nil {
			for _, fileHeaders := range r.MultipartForm.File {
				for _, fh := range fileHeaders {
					if err := h.saveUploadedFile(msg.ID, fh); err != nil {
						// Message created but file failed - log and continue
						continue
					}
				}
			}
			// Reload message to include files
			msg, _ = h.db.GetMessage(msg.ID)
		}

		writeJSON(w, http.StatusCreated, msg)
		return
	}

	// Handle plain JSON (text only)
	var body struct {
		Content string `json:"content"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, `{"error":"invalid request"}`, http.StatusBadRequest)
		return
	}

	msg, err := h.db.CreateMessage(body.Content)
	if err != nil {
		http.Error(w, `{"error":"failed to create message"}`, http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusCreated, msg)
}

func (h *Handlers) saveUploadedFile(messageID string, fh *multipart.FileHeader) error {
	src, err := fh.Open()
	if err != nil {
		return err
	}
	defer src.Close()

	// Generate safe filename: uuid + original extension
	ext := filepath.Ext(fh.Filename)
	safeName := uuid.New().String() + ext
	storagePath := filepath.Join(h.uploads, safeName)

	dst, err := os.Create(storagePath)
	if err != nil {
		return err
	}
	defer dst.Close()

	written, err := io.Copy(dst, src)
	if err != nil {
		os.Remove(storagePath)
		return err
	}

	// Detect MIME type from header or extension
	mimeType := fh.Header.Get("Content-Type")
	if mimeType == "" || mimeType == "application/octet-stream" {
		mimeType = detectMIME(ext)
	}

	_, err = h.db.AddFile(messageID, fh.Filename, mimeType, written, storagePath)
	return err
}

func writeJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

// sanitizeFilename removes path separators and null bytes from filenames.
func sanitizeFilename(name string) string {
	name = filepath.Base(name)
	name = strings.ReplaceAll(name, "\x00", "")
	return name
}

// detectMIME returns a MIME type based on file extension.
func detectMIME(ext string) string {
	types := map[string]string{
		".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
		".gif": "image/gif", ".webp": "image/webp", ".svg": "image/svg+xml",
		".mp4": "video/mp4", ".webm": "video/webm", ".mov": "video/quicktime",
		".pdf": "application/pdf", ".zip": "application/zip",
		".json": "application/json", ".xml": "application/xml",
		".txt": "text/plain", ".md": "text/markdown",
		".html": "text/html", ".css": "text/css", ".js": "text/javascript",
		".torrent": "application/x-bittorrent",
	}
	if t, ok := types[strings.ToLower(ext)]; ok {
		return t
	}
	return "application/octet-stream"
}
