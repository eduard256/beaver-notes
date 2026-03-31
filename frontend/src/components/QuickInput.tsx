import { useState, useRef, useCallback, type DragEvent, type KeyboardEvent } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import './QuickInput.css';

interface QuickInputProps {
  onSend: (content: string, files: File[]) => Promise<void>;
  onOpenEditor: (initialContent?: string) => void;
  uploadProgress: number | null;
}

export default function QuickInput({ onSend, onOpenEditor, uploadProgress }: QuickInputProps) {
  const [text, setText] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const [sending, setSending] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = useCallback(async () => {
    if (!text.trim() && files.length === 0) return;
    if (sending) return;
    setSending(true);
    try {
      await onSend(text, files);
      setText('');
      setFiles([]);
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    } finally {
      setSending(false);
    }
  }, [text, files, onSend, sending]);

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter to send, Shift+Enter for newline
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  const handleTextChange = useCallback((value: string) => {
    setText(value);
    // Auto-resize textarea
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 150) + 'px';
    }
  }, []);

  const handleFileSelect = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFilesAdded = useCallback((newFiles: FileList | File[]) => {
    setFiles(prev => [...prev, ...Array.from(newFiles)]);
  }, []);

  const removeFile = useCallback((index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  }, []);

  // Drag and drop handlers
  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    setDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    if (e.currentTarget === e.target) {
      setDragging(false);
    }
  }, []);

  const handleDrop = useCallback((e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files.length > 0) {
      handleFilesAdded(e.dataTransfer.files);
    }
  }, [handleFilesAdded]);

  // Paste images from clipboard
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    const pastedFiles: File[] = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        const file = items[i].getAsFile();
        if (file) pastedFiles.push(file);
      }
    }
    if (pastedFiles.length > 0) {
      handleFilesAdded(pastedFiles);
    }
  }, [handleFilesAdded]);

  return (
    <>
      {/* Full-screen drag overlay */}
      <AnimatePresence>
        {dragging && (
          <motion.div
            className="qi-drag-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <div className="qi-drag-content">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="17 8 12 3 7 8"/>
                <line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
              <p>Перетащите файлы сюда</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div
        className="qi-container"
        onDragOver={handleDragOver}
      >
        {/* Attached files preview */}
        {files.length > 0 && (
          <div className="qi-files">
            {files.map((f, i) => (
              <div key={i} className="qi-file-chip">
                <span className="qi-file-chip-name">{f.name}</span>
                <button className="qi-file-chip-remove" onClick={() => removeFile(i)}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Upload progress */}
        {uploadProgress !== null && (
          <div className="qi-progress">
            <div className="qi-progress-bar" style={{ width: `${uploadProgress}%` }} />
          </div>
        )}

        <div className="qi-input-row">
          {/* File attach button */}
          <button className="qi-btn qi-btn-attach" onClick={handleFileSelect} title="Прикрепить файл">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
            </svg>
          </button>

          <input
            ref={fileInputRef}
            type="file"
            multiple
            style={{ display: 'none' }}
            onChange={(e) => e.target.files && handleFilesAdded(e.target.files)}
          />

          {/* Text input */}
          <textarea
            ref={textareaRef}
            className="qi-textarea"
            placeholder="Сообщение..."
            value={text}
            onChange={(e) => handleTextChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            rows={1}
          />

          {/* Expand to full editor */}
          <button
            className="qi-btn qi-btn-expand"
            onClick={() => onOpenEditor(text || undefined)}
            title="Открыть редактор"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 3h6v6"/><path d="M9 21H3v-6"/><path d="M21 3l-7 7"/><path d="M3 21l7-7"/>
            </svg>
          </button>

          {/* Send button */}
          <button
            className={`qi-btn qi-btn-send ${(text.trim() || files.length > 0) ? 'qi-btn-send--active' : ''} ${sending ? 'qi-btn-send--sending' : ''}`}
            onClick={handleSend}
            disabled={(!text.trim() && files.length === 0) || sending}
            title={uploadProgress !== null ? `${uploadProgress}%` : 'Отправить'}
          >
            {uploadProgress !== null ? (
              <span className="qi-send-progress">{uploadProgress}%</span>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
              </svg>
            )}
          </button>
        </div>
      </div>
    </>
  );
}

export { type QuickInputProps };
