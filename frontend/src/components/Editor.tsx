import { useState, useRef, useCallback, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { motion } from 'motion/react';
import './Editor.css';

interface EditorProps {
  initialContent?: string;
  onSave: (content: string, files: File[]) => void;
  onCancel: () => void;
  isEdit?: boolean;
}

type ToolAction = 'bold' | 'italic' | 'code' | 'codeblock' | 'heading' | 'list' | 'link' | 'image' | 'hr';

export default function Editor({ initialContent = '', onSave, onCancel, isEdit }: EditorProps) {
  const [content, setContent] = useState(initialContent);
  const [preview, setPreview] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const insertAtCursor = useCallback((before: string, after: string = '') => {
    const ta = textareaRef.current;
    if (!ta) return;

    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = content.substring(start, end);
    const newText = content.substring(0, start) + before + selected + after + content.substring(end);

    setContent(newText);

    requestAnimationFrame(() => {
      ta.focus();
      const cursorPos = start + before.length + selected.length;
      ta.setSelectionRange(cursorPos, cursorPos);
    });
  }, [content]);

  const handleToolbar = useCallback((action: ToolAction) => {
    switch (action) {
      case 'bold': insertAtCursor('**', '**'); break;
      case 'italic': insertAtCursor('*', '*'); break;
      case 'code': insertAtCursor('`', '`'); break;
      case 'codeblock': insertAtCursor('\n```\n', '\n```\n'); break;
      case 'heading': insertAtCursor('## '); break;
      case 'list': insertAtCursor('- '); break;
      case 'link': insertAtCursor('[', '](url)'); break;
      case 'image': fileInputRef.current?.click(); break;
      case 'hr': insertAtCursor('\n---\n'); break;
    }
  }, [insertAtCursor]);

  const handleSave = useCallback(() => {
    if (!content.trim() && files.length === 0) return;
    onSave(content, files);
  }, [content, files, onSave]);

  const handleFileAdd = useCallback((newFiles: FileList) => {
    setFiles(prev => [...prev, ...Array.from(newFiles)]);
  }, []);

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
      setFiles(prev => [...prev, ...pastedFiles]);
    }
  }, []);

  return (
    <motion.div
      className="editor-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      <div className="editor-container">
        <div className="editor-header">
          <button className="editor-header-btn" onClick={onCancel}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
            Отмена
          </button>
          <span className="editor-title">{isEdit ? 'Редактирование' : 'Новая запись'}</span>
          <button
            className="editor-header-btn editor-header-btn--primary"
            onClick={handleSave}
            disabled={!content.trim() && files.length === 0}
          >
            Сохранить
          </button>
        </div>

        <div className="editor-toolbar">
          <div className="editor-toolbar-group">
            <button className="editor-tool" onClick={() => handleToolbar('bold')} title="Жирный"><strong>B</strong></button>
            <button className="editor-tool" onClick={() => handleToolbar('italic')} title="Курсив"><em>I</em></button>
            <button className="editor-tool" onClick={() => handleToolbar('code')} title="Код">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
            </button>
            <button className="editor-tool" onClick={() => handleToolbar('codeblock')} title="Блок кода">{"{ }"}</button>
          </div>
          <div className="editor-toolbar-sep" />
          <div className="editor-toolbar-group">
            <button className="editor-tool" onClick={() => handleToolbar('heading')} title="Заголовок">H</button>
            <button className="editor-tool" onClick={() => handleToolbar('list')} title="Список">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
            </button>
            <button className="editor-tool" onClick={() => handleToolbar('link')} title="Ссылка">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
            </button>
            <button className="editor-tool" onClick={() => handleToolbar('hr')} title="Разделитель">--</button>
          </div>
          <div className="editor-toolbar-sep" />
          <div className="editor-toolbar-group">
            <button className="editor-tool" onClick={() => handleToolbar('image')} title="Изображение">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
            </button>
          </div>
          <div className="editor-toolbar-spacer" />
          <button
            className={`editor-tool editor-tool--toggle ${preview ? 'editor-tool--active' : ''}`}
            onClick={() => setPreview(!preview)}
            title="Предпросмотр"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
          </button>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*"
          style={{ display: 'none' }}
          onChange={(e) => e.target.files && handleFileAdd(e.target.files)}
        />

        <div className="editor-body">
          {preview ? (
            <div className="editor-preview msg-content">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeRaw]}
                components={{
                  code({ className, children, ...props }) {
                    const match = /language-(\w+)/.exec(className || '');
                    const codeStr = String(children).replace(/\n$/, '');
                    if (match) {
                      return (
                        <SyntaxHighlighter style={oneDark} language={match[1]} PreTag="div">
                          {codeStr}
                        </SyntaxHighlighter>
                      );
                    }
                    return <code className="msg-inline-code" {...props}>{children}</code>;
                  },
                }}
              >
                {content}
              </ReactMarkdown>
            </div>
          ) : (
            <textarea
              ref={textareaRef}
              className="editor-textarea"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onPaste={handlePaste}
              placeholder="Напишите что-нибудь... (поддерживается Markdown)"
            />
          )}
        </div>

        {files.length > 0 && (
          <div className="editor-files">
            {files.map((f, i) => (
              <div key={i} className="editor-file-chip">
                <span>{f.name}</span>
                <button onClick={() => setFiles(prev => prev.filter((_, idx) => idx !== i))}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}
