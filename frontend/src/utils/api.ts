// API client for Beaver Notes backend.
// All endpoints use credentials: 'include' for HttpOnly cookie auth.

const BASE = '/api';

class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: 'include',
    ...options,
  });

  if (res.status === 401) {
    window.location.href = '/login';
    throw new ApiError('Unauthorized', 401);
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new ApiError(body.error || res.statusText, res.status);
  }

  return res.json();
}

// Auth
export async function login(password: string) {
  return request<{ ok: boolean }>('/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
}

export async function checkAuth() {
  return request<{ ok: boolean }>('/auth');
}

// Messages
export interface FileInfo {
  id: string;
  message_id: string;
  filename: string;
  mime_type: string;
  size: number;
  created_at: string;
}

export interface Message {
  id: string;
  content: string;
  pinned: boolean;
  created_at: string;
  updated_at: string;
  files?: FileInfo[];
  tags?: string[];
}

export interface MessagesResponse {
  messages: Message[];
  total: number;
  has_more: boolean;
}

export interface MessageQuery {
  search?: string;
  type?: string;
  date_from?: string;
  date_to?: string;
  tag?: string;
  pinned?: boolean;
  size_min?: number;
  size_max?: number;
  offset?: number;
  limit?: number;
}

export async function getMessages(query: MessageQuery = {}) {
  const params = new URLSearchParams();
  if (query.search) params.set('search', query.search);
  if (query.type) params.set('type', query.type);
  if (query.date_from) params.set('date_from', query.date_from);
  if (query.date_to) params.set('date_to', query.date_to);
  if (query.tag) params.set('tag', query.tag);
  if (query.pinned !== undefined) params.set('pinned', query.pinned ? 'true' : 'false');
  if (query.size_min !== undefined) params.set('size_min', String(query.size_min));
  if (query.size_max !== undefined) params.set('size_max', String(query.size_max));
  if (query.offset !== undefined) params.set('offset', String(query.offset));
  if (query.limit !== undefined) params.set('limit', String(query.limit));

  const qs = params.toString();
  return request<MessagesResponse>(`/messages${qs ? '?' + qs : ''}`);
}

export async function createMessage(content: string, files?: File[]) {
  if (files && files.length > 0) {
    const form = new FormData();
    form.append('content', content);
    files.forEach((f) => form.append('files', f));
    return request<Message>('/messages', {
      method: 'POST',
      body: form,
    });
  }

  return request<Message>('/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
}

export async function editMessage(id: string, content: string) {
  return request<Message>(`/messages/${id}?action=edit`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
}

export async function pinMessage(id: string) {
  return request<Message>(`/messages/${id}?action=pin`, { method: 'PATCH' });
}

export async function unpinMessage(id: string) {
  return request<Message>(`/messages/${id}?action=unpin`, { method: 'PATCH' });
}

export async function deleteMessage(id: string) {
  return request<{ ok: boolean }>(`/messages/${id}?action=delete`, { method: 'PATCH' });
}

// Files
export function fileUrl(fileId: string) {
  return `${BASE}/files/${fileId}`;
}

export async function deleteFile(id: string) {
  return request<{ ok: boolean }>(`/files/${id}`, { method: 'DELETE' });
}

// Upload with progress tracking
export function uploadWithProgress(
  content: string,
  files: File[],
  onProgress: (percent: number) => void,
): Promise<Message> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${BASE}/messages`);
    xhr.withCredentials = true;

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status === 401) {
        window.location.href = '/login';
        reject(new ApiError('Unauthorized', 401));
        return;
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(JSON.parse(xhr.responseText));
      } else {
        reject(new ApiError(xhr.statusText, xhr.status));
      }
    };

    xhr.onerror = () => reject(new Error('Network error'));

    const form = new FormData();
    form.append('content', content);
    files.forEach((f) => form.append('files', f));
    xhr.send(form);
  });
}
