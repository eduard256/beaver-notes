package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
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

	// Auth routes (no auth middleware)
	mux.Handle("POST /api/auth", middleware.RateLimit(authLimiter, http.HandlerFunc(h.AuthLogin)))
	mux.Handle("GET /api/auth", http.HandlerFunc(h.AuthCheck))

	// Protected API routes
	protected := http.NewServeMux()
	protected.HandleFunc("GET /api/messages", h.Messages)
	protected.HandleFunc("POST /api/messages", h.Messages)
	protected.HandleFunc("/api/messages/", h.MessageAction)
	protected.HandleFunc("GET /api/files/", h.FileDownload)
	protected.HandleFunc("DELETE /api/files/", h.FileDelete)

	mux.Handle("/api/", middleware.AuthMiddleware(a, protected))

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

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := server.Shutdown(ctx); err != nil {
		log.Fatalf("Server forced shutdown: %v", err)
	}

	fmt.Println("Beaver Notes stopped")
}

func getEnv(key, fallback string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return fallback
}
