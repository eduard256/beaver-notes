import { useState, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { motion, AnimatePresence } from 'motion/react';
import type { Message, FileInfo } from '../utils/api';
import { fileUrl, pinMessage, unpinMessage, deleteMessage } from '../utils/api';
import { formatTime, formatFileSize, isImageMime, isVideoMime } from '../utils/format';
import './MessageCard.css';

interface MessageCardProps {
  message: Message;
  onEdit: (msg: Message) => void;
  onDelete: (id: string) => void;
  onUpdate: (msg: Message) => void;
}

export default function MessageCard({ message, onEdit, onDelete, onUpdate }: MessageCardProps) {
  const [showActions, setShowActions] = useState(false);
  const [copied, setCopied] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Fallback for older browsers
      const ta = document.createElement('textarea');
      ta.value = message.content;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  }, [message.content]);

  const handlePin = useCallback(async () => {
    try {
      const updated = message.pinned
        ? await unpinMessage(message.id)
        : await pinMessage(message.id);
      onUpdate(updated);
    } catch { /* ignore */ }
  }, [message, onUpdate]);

  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleDelete = useCallback(async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      setTimeout(() => setConfirmDelete(false), 3000);
      return;
    }
    try {
      await deleteMessage(message.id);
      onDelete(message.id);
    } catch { /* ignore */ }
  }, [message.id, onDelete, confirmDelete]);

  const images = message.files?.filter((f) => isImageMime(f.mime_type)) || [];
  const videos = message.files?.filter((f) => isVideoMime(f.mime_type)) || [];
  const otherFiles = message.files?.filter(
    (f) => !isImageMime(f.mime_type) && !isVideoMime(f.mime_type)
  ) || [];

  return (
    <>
      <motion.div
        className={`msg-card ${message.pinned ? 'msg-card--pinned' : ''}`}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        onMouseEnter={() => setShowActions(true)}
        onMouseLeave={() => setShowActions(false)}
      >
        {message.pinned && (
          <div className="msg-pin-badge">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 17v5"/>
              <path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 1 1 0 0 0 1-1V4a2 2 0 0 0-2-2H9a2 2 0 0 0-2 2v1a1 1 0 0 0 1 1 1 1 0 0 1 1 1z"/>
            </svg>
            Закреплено
          </div>
        )}

        {message.content && (
          <div className="msg-content">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeRaw]}
              components={{
                code({ className, children, ...props }) {
                  const match = /language-(\w+)/.exec(className || '');
                  const codeStr = String(children).replace(/\n$/, '');

                  if (match) {
                    return (
                      <div className="msg-code-block">
                        <div className="msg-code-header">
                          <span className="msg-code-lang">{match[1]}</span>
                          <button
                            className="msg-code-copy"
                            onClick={async () => {
                              await navigator.clipboard.writeText(codeStr);
                            }}
                          >
                            Копировать
                          </button>
                        </div>
                        <SyntaxHighlighter
                          style={oneDark}
                          language={match[1]}
                          PreTag="div"
                          customStyle={{
                            margin: 0,
                            borderRadius: '0 0 var(--radius-sm) var(--radius-sm)',
                            fontSize: '0.8125rem',
                          }}
                        >
                          {codeStr}
                        </SyntaxHighlighter>
                      </div>
                    );
                  }

                  return (
                    <code className="msg-inline-code" {...props}>
                      {children}
                    </code>
                  );
                },
                a({ href, children }) {
                  return (
                    <a href={href} target="_blank" rel="noopener noreferrer">
                      {children}
                    </a>
                  );
                },
              }}
            >
              {message.content}
            </ReactMarkdown>
          </div>
        )}

        {images.length > 0 && (
          <div className={`msg-images ${images.length === 1 ? 'msg-images--single' : ''}`}>
            {images.map((f) => (
              <button
                key={f.id}
                className="msg-image-thumb"
                onClick={() => setImagePreview(fileUrl(f.id))}
              >
                <img src={fileUrl(f.id)} alt={f.filename} loading="lazy" />
              </button>
            ))}
          </div>
        )}

        {videos.map((f) => (
          <VideoAttachment key={f.id} file={f} />
        ))}

        {otherFiles.map((f) => (
          <FileAttachment key={f.id} file={f} />
        ))}

        {message.tags && message.tags.length > 0 && (
          <div className="msg-tags">
            {message.tags.map((tag) => (
              <span key={tag} className="msg-tag">#{tag}</span>
            ))}
          </div>
        )}

        <div className="msg-footer">
          <span className="msg-time">{formatTime(message.created_at)}</span>

          <AnimatePresence>
            {showActions && (
              <motion.div
                className="msg-actions"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.1 }}
              >
                <button className={`msg-action-btn ${copied ? 'msg-action-btn--success' : ''}`} onClick={handleCopy} title="Копировать">
                  {copied ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                  )}
                </button>
                <button className="msg-action-btn" onClick={handlePin} title={message.pinned ? 'Открепить' : 'Закрепить'}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill={message.pinned ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2"><path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 1 1 0 0 0 1-1V4a2 2 0 0 0-2-2H9a2 2 0 0 0-2 2v1a1 1 0 0 0 1 1 1 1 0 0 1 1 1z"/></svg>
                </button>
                <button className="msg-action-btn" onClick={() => onEdit(message)} title="Редактировать">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                </button>
                <button className={`msg-action-btn ${confirmDelete ? 'msg-action-btn--confirm' : 'msg-action-btn--danger'}`} onClick={handleDelete} title={confirmDelete ? 'Нажмите ещё раз' : 'Удалить'}>
                  {confirmDelete ? (
                    <span className="msg-action-confirm-text">Удалить?</span>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                  )}
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="msg-actions-mobile">
            <button className={`msg-action-btn ${copied ? 'msg-action-btn--success' : ''}`} onClick={handleCopy}>
              {copied ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
              )}
            </button>
            <button className="msg-action-btn" onClick={handlePin}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill={message.pinned ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2"><path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 1 1 0 0 0 1-1V4a2 2 0 0 0-2-2H9a2 2 0 0 0-2 2v1a1 1 0 0 0 1 1 1 1 0 0 1 1 1z"/></svg>
            </button>
            <button className="msg-action-btn" onClick={() => onEdit(message)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            <button className={`msg-action-btn ${confirmDelete ? 'msg-action-btn--confirm' : 'msg-action-btn--danger'}`} onClick={handleDelete}>
              {confirmDelete ? (
                <span className="msg-action-confirm-text">Удалить?</span>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
              )}
            </button>
          </div>
        </div>
      </motion.div>

      <AnimatePresence>
        {imagePreview && (
          <motion.div
            className="msg-image-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setImagePreview(null)}
          >
            <img src={imagePreview} alt="" />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function VideoAttachment({ file }: { file: FileInfo }) {
  const [showPlayer, setShowPlayer] = useState(false);

  return (
    <div className="msg-video-card">
      {showPlayer ? (
        <div className="msg-video-player">
          <video controls autoPlay preload="auto" playsInline>
            <source src={fileUrl(file.id)} type={file.mime_type} />
          </video>
          <button className="msg-video-close" onClick={() => setShowPlayer(false)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      ) : (
        <div className="msg-video-preview">
          <div className="msg-video-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <polygon points="5 3 19 12 5 21 5 3"/>
            </svg>
          </div>
          <div className="msg-video-info">
            <span className="msg-file-name">{file.filename}</span>
            <span className="msg-file-size">{formatFileSize(file.size)}</span>
          </div>
          <div className="msg-video-actions">
            <button className="msg-video-btn" onClick={() => setShowPlayer(true)} title="Открыть">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="5 3 19 12 5 21 5 3"/>
              </svg>
            </button>
            <a href={fileUrl(file.id)} download={file.filename} className="msg-video-btn" title="Скачать" onClick={(e) => e.stopPropagation()}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

function FileAttachment({ file }: { file: FileInfo }) {
  return (
    <a href={fileUrl(file.id)} className="msg-file" download={file.filename} target="_blank" rel="noopener noreferrer">
      <div className="msg-file-icon">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
        </svg>
      </div>
      <div className="msg-file-info">
        <span className="msg-file-name">{file.filename}</span>
        <span className="msg-file-size">{formatFileSize(file.size)}</span>
      </div>
      <div className="msg-file-download">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="7 10 12 15 17 10"/>
          <line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
      </div>
    </a>
  );
}
