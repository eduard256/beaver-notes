# Beaver Notes

Self-hosted cloud note wall for transferring logs, passwords, files and data between devices. PWA-first, mobile-optimized.

## Features

- Infinite message wall with virtual scroll
- Full markdown support with syntax highlighting
- Inline images with fullscreen preview
- File uploads up to 40GB (any format: images, video, documents, torrents)
- Full-text search with flexible filters (date range, content type, tags, file size)
- Pin important messages
- Drag & drop file upload + clipboard paste
- Copy in one click or select partial text
- Auto dark/light theme (graphite/cream) with smooth transition
- Password-only auth with long-lived sessions (30 days)
- SQLite + FTS5 for instant full-text search
- Docker deployment, single container
- PWA with offline shell, installable on mobile

## Tech Stack

- **Frontend**: React 19, TypeScript, Vite, react-virtuoso, react-markdown
- **Backend**: Go 1.22, net/http, SQLite with FTS5
- **Auth**: JWT (HttpOnly Secure SameSite=Strict cookie), rate-limited login
- **Deploy**: Docker (multi-stage build), Docker Hub

## Quick Start

```bash
docker run -d \
  -p 8762:8762 \
  -e AUTH_PASSWORD=your_secret_password \
  -e JWT_SECRET=$(openssl rand -hex 32) \
  -v beaver-data:/data \
  webaweba/beaver-notes:latest
```

Or with docker compose:

```bash
cp .env.example .env
# Edit .env with your password and secret
docker compose up -d
```

Then open `https://notes.webaweba.com` in your browser.

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `AUTH_PASSWORD` | Yes | - | Password for login |
| `JWT_SECRET` | Yes | - | Secret key for JWT signing (min 32 chars) |
| `SECURE_COOKIE` | No | `true` | Set to `false` for HTTP (development) |
| `PORT` | No | `8762` | Server port |
| `DATA_DIR` | No | `/data` | Data directory (SQLite DB + uploads) |

## Security

- Constant-time password comparison
- JWT HttpOnly Secure SameSite=Strict cookies
- Rate limiting on login (5 attempts/minute)
- Security headers (X-Frame-Options, CSP, etc.)
- UUID filenames to prevent path traversal
- Parameterized SQL queries only
- Session invalidation on password change

## License

MIT
