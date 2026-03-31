# Stage 1: Build frontend
FROM node:20-alpine AS frontend
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci --legacy-peer-deps
COPY frontend/ ./
RUN npm run build

# Stage 2: Build backend
FROM golang:1.22-alpine AS backend
RUN apk add --no-cache gcc musl-dev
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY backend/ ./backend/
RUN CGO_ENABLED=1 go build -tags "fts5" -o server ./backend/cmd/main.go

# Stage 3: Runtime
FROM alpine:3.19
RUN apk add --no-cache ca-certificates
WORKDIR /app
COPY --from=backend /app/server .
COPY --from=frontend /app/frontend/dist ./static
RUN mkdir -p /data/uploads
VOLUME /data
EXPOSE 8762
ENV PORT=8762
ENV DATA_DIR=/data
ENV STATIC_DIR=./static
CMD ["./server"]
