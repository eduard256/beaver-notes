package models

import "time"

// Message represents a single entry on the wall.
// DeletedAt set = tombstone (returned only with ?since=).
type Message struct {
	ID        string     `json:"id"`
	Content   string     `json:"content"`
	Pinned    bool       `json:"pinned"`
	CreatedAt time.Time  `json:"created_at"`
	UpdatedAt time.Time  `json:"updated_at"`
	DeletedAt *time.Time `json:"deleted_at,omitempty"`
	Files     []File     `json:"files,omitempty"`
	Tags      []string   `json:"tags,omitempty"`
}

// File represents an uploaded file attached to a message.
type File struct {
	ID          string    `json:"id"`
	MessageID   string    `json:"message_id"`
	Filename    string    `json:"filename"`
	MimeType    string    `json:"mime_type"`
	Size        int64     `json:"size"`
	StoragePath string    `json:"-"`
	CreatedAt   time.Time `json:"created_at"`
}

// MessagesResponse is the paginated response for message listing.
type MessagesResponse struct {
	Messages []Message `json:"messages"`
	Total    int       `json:"total"`
	HasMore  bool      `json:"has_more"`
}

// AuthRequest is the login request body.
type AuthRequest struct {
	Password string `json:"password"`
}

// AuthResponse is the login response.
type AuthResponse struct {
	OK bool `json:"ok"`
}

// MessageQuery holds all search/filter parameters.
// Since set = incremental pull mode: includes tombstones, ORDER BY updated_at ASC.
type MessageQuery struct {
	Search   string
	Type     string // text, image, video, file, pinned
	DateFrom string
	DateTo   string
	Tag      string
	Pinned   *bool
	SizeMin  *int64
	SizeMax  *int64
	Since    string
	Offset   int
	Limit    int
}
