package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/eduard256/beaver-notes/backend/internal/auth"
	"github.com/eduard256/beaver-notes/backend/internal/db"
	"github.com/eduard256/beaver-notes/backend/internal/handlers"
	"github.com/eduard256/beaver-notes/backend/internal/middleware"
)

func main() {
	// Load configuration from environment
	password := getEnv("AUTH_PASSWORD", "")
	if password == "" {
		log.Fatal("AUTH_PASSWORD environment variable is required")
	}

	jwtSecret := getEnv("JWT_SECRET", "")
	if jwtSecret == "" {
		log.Fatal("JWT_SECRET environment variable is required")
	}

	dataDir := getEnv("DATA_DIR", "/data")
	port := getEnv("PORT", "8762")
	secureCookie := getEnv("SECURE_COOKIE", "true") == "true"

	// physical file purge after soft-delete window (default 7 days)
	retentionDays := 7
	if v := getEnv("FILE_RETENTION_DAYS", ""); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			retentionDays = n
		}
	}

	// Ensure data directories exist
	dbPath := filepath.Join(dataDir, "beaver.db")
	uploadsDir := filepath.Join(dataDir, "uploads")
	os.MkdirAll(dataDir, 0750)
	os.MkdirAll(uploadsDir, 0750)

	// Initialize database
	database, err := db.New(dbPath)
	if err != nil {
		log.Fatalf("Failed to initialize database: %v", err)
	}
	defer database.Close()

	// Initialize auth
	a := auth.New(password, jwtSecret, secureCookie)

	// Initialize handlers
	h := handlers.New(database, a, uploadsDir)

	// Rate limiter for auth endpoint: 5 attempts per minute
	authLimiter := middleware.NewRateLimiter(5, time.Minute)

	// Setup routes
	mux := http.NewServeMux()

	// Helper to wrap handler with auth middleware
	withAuth := func(handler http.HandlerFunc) http.Handler {
		return middleware.AuthMiddleware(a, http.HandlerFunc(handler))
	}

	// Auth routes (no auth middleware)
	mux.Handle("POST /api/auth", middleware.RateLimit(authLimiter, http.HandlerFunc(h.AuthLogin)))
	mux.Handle("GET /api/auth", http.HandlerFunc(h.AuthCheck))

	// Protected API routes (flat routing, each wrapped with auth)
	mux.Handle("GET /api/messages", withAuth(h.Messages))
	mux.Handle("POST /api/messages", withAuth(h.Messages))
	mux.Handle("PATCH /api/messages/{id}", withAuth(h.MessageAction))
	mux.Handle("GET /api/files/{id}", withAuth(h.FileDownload))
	mux.Handle("DELETE /api/files/{id}", withAuth(h.FileDelete))

	// Serve frontend static files
	staticDir := getEnv("STATIC_DIR", "./static")
	if _, err := os.Stat(staticDir); err == nil {
		fs := http.FileServer(http.Dir(staticDir))
		mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
			// API routes are already handled above
			if strings.HasPrefix(r.URL.Path, "/api/") {
				http.NotFound(w, r)
				return
			}
			// Try to serve static file, fallback to index.html for SPA routing
			path := filepath.Join(staticDir, r.URL.Path)
			if _, err := os.Stat(path); os.IsNotExist(err) {
				http.ServeFile(w, r, filepath.Join(staticDir, "index.html"))
				return
			}
			fs.ServeHTTP(w, r)
		})
	}

	// Wrap everything with security headers
	handler := middleware.SecurityHeaders(mux)

	// purge files of soft-deleted messages older than retention window
	stopGC := make(chan struct{})
	go runFileGC(database, time.Duration(retentionDays)*24*time.Hour, stopGC)

	server := &http.Server{
		Addr:              ":" + port,
		Handler:           handler,
		ReadHeaderTimeout: 10 * time.Second,
		IdleTimeout:       120 * time.Second,
		MaxHeaderBytes:    1 << 20, // 1MB headers max
	}

	// Graceful shutdown
	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		log.Printf("Beaver Notes server starting on :%s", port)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Server error: %v", err)
		}
	}()

	<-stop
	log.Println("Shutting down...")

	close(stopGC)

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := server.Shutdown(ctx); err != nil {
		log.Fatalf("Server forced shutdown: %v", err)
	}

	fmt.Println("Beaver Notes stopped")
}

// runFileGC removes physical files for messages soft-deleted before `now - retention`.
// Runs every hour; ticker also fires once on start.
func runFileGC(d *db.DB, retention time.Duration, stop <-chan struct{}) {
	purge := func() {
		paths, err := d.PurgeExpiredFiles(time.Now().UTC().Add(-retention))
		if err != nil {
			log.Printf("file gc: %v", err)
			return
		}
		for _, p := range paths {
			if err := os.Remove(p); err != nil && !os.IsNotExist(err) {
				log.Printf("file gc unlink %s: %v", p, err)
			}
		}
		if len(paths) > 0 {
			log.Printf("file gc: removed %d files", len(paths))
		}
	}

	purge() // run once on startup

	t := time.NewTicker(time.Hour)
	defer t.Stop()
	for {
		select {
		case <-t.C:
			purge()
		case <-stop:
			return
		}
	}
}

func getEnv(key, fallback string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return fallback
}
