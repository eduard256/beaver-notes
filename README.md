# Beaver Notes

Self-hosted note wall for transferring data between devices. Like Telegram Saved Messages, but better.

I built this because I needed a fast way to throw logs, passwords, configs, screenshots and files between my machines. Telegram splits large messages, has file size limits, and can't guarantee full security of your data -- it's stored on someone else's servers. With Beaver Notes, everything stays on your own machine. No third parties, no cloud, no trust required.

## Features

- Infinite message wall with virtual scroll
- Full markdown rendering with syntax highlighting
- Inline images with fullscreen preview
- File uploads up to 40GB (any format)
- Full-text search with filters (date, type, tags, file size)
- Pin important messages
- Drag & drop, clipboard paste
- Real-time sync between devices (3s polling)
- Auto dark/light theme (graphite/cream)
- Password-only auth, 30-day sessions
- PWA, installable on mobile
- Single Docker container, SQLite inside

## Quick Start

```bash
docker run -d \
  --name beaver-notes \
  -p 8762:8762 \
  -e AUTH_PASSWORD=your_password \
  -e JWT_SECRET=$(openssl rand -hex 32) \
  -v beaver-data:/data \
  eduard256/beaver-notes:latest
```

Open `http://localhost:8762` in your browser.

## Docker Compose

```yaml
services:
  beaver-notes:
    image: eduard256/beaver-notes:latest
    ports:
      - "8762:8762"
    environment:
      - AUTH_PASSWORD=${AUTH_PASSWORD}
      - JWT_SECRET=${JWT_SECRET}
      - SECURE_COOKIE=${SECURE_COOKIE:-true}
    volumes:
      - beaver-data:/data
    restart: unless-stopped

volumes:
  beaver-data:
```

```bash
# Create .env
echo "AUTH_PASSWORD=your_password" > .env
echo "JWT_SECRET=$(openssl rand -hex 32)" >> .env

docker compose up -d
```

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `AUTH_PASSWORD` | Yes | - | Login password |
| `JWT_SECRET` | Yes | - | JWT signing key, min 32 chars |
| `SECURE_COOKIE` | No | `true` | Set `false` for HTTP |
| `PORT` | No | `8762` | Server port |
| `DATA_DIR` | No | `/data` | Database and uploads directory |

**Important:**

1. `SECURE_COOKIE=true` requires HTTPS. If you access via HTTP, set it to `false`.
2. Changing `AUTH_PASSWORD` invalidates all active sessions.
3. `JWT_SECRET` must be at least 32 characters. Use `openssl rand -hex 32` to generate.

## Reverse Proxy

### Caddy

```
notes.example.com {
    reverse_proxy localhost:8762
}
```

### Nginx

```nginx
server {
    server_name notes.example.com;
    client_max_body_size 40G;

    location / {
        proxy_pass http://localhost:8762;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $remote_addr;
    }
}
```

With a reverse proxy handling TLS, keep `SECURE_COOKIE=true`.

## Backup

All data is in a single Docker volume. Database file + uploaded files.

```bash
# Stop the container
docker compose down

# Copy the volume
docker run --rm -v beaver-data:/data -v $(pwd):/backup alpine tar czf /backup/beaver-backup.tar.gz /data

# Start again
docker compose up -d
```

## Tech Stack

- **Frontend**: React, TypeScript, Vite, react-virtuoso, react-markdown
- **Backend**: Go, net/http, SQLite with FTS5
- **Auth**: JWT in HttpOnly Secure SameSite=Strict cookie
- **Deploy**: Docker (multi-stage build)

## Security

- Constant-time password comparison
- Rate limiting on login (5 attempts/minute)
- Security headers (X-Frame-Options, CSP, X-Content-Type-Options)
- UUID filenames, no path traversal
- Parameterized SQL queries only
- Session invalidation on password change

## License

MIT
