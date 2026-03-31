# Beaver Notes

Self-hosted cloud note wall for transferring logs, passwords, files and data between devices. PWA-first, mobile-optimized.

## Features

- Infinite message wall with virtual scroll
- Full markdown support with syntax highlighting
- Inline images and Excalidraw drawing canvas
- File uploads up to 40GB (any format)
- Full-text search with filters (date, type, tags, size)
- Pin important messages
- Drag & drop file upload
- Copy in one click
- Auto dark/light theme (graphite/cream)
- Password-only auth (no username)
- SQLite + FTS5 for instant search
- Docker deployment

## Tech Stack

- **Frontend**: React, PWA, TypeScript
- **Backend**: Go
- **Database**: SQLite with FTS5
- **Deploy**: Docker, Docker Hub

## Quick Start

```bash
docker run -d \
  -p 8080:8080 \
  -e AUTH_PASSWORD=your_secret_password \
  -v beaver-data:/data \
  webaweba/beaver-notes:latest
```

Then open `https://notes.webaweba.com` in your browser.

## License

MIT
