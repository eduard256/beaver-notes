import { useState, useCallback, useEffect, useRef } from 'react';
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso';
import { AnimatePresence, motion } from 'motion/react';
import type { Message as MessageType, MessageQuery } from '../utils/api';
import { getMessages, createMessage, editMessage, uploadWithProgress } from '../utils/api';
import { formatDate, getDateKey } from '../utils/format';
import MessageCard from './MessageCard';
import QuickInput from './QuickInput';
import Editor from './Editor';
import Search from './Search';
import './Wall.css';

const PAGE_SIZE = 50;
const POLL_INTERVAL = 3000;

interface WallProps {
  onUnauthorized?: () => void;
}

export default function Wall({ onUnauthorized: _onUnauthorized }: WallProps) {
  const [messages, setMessages] = useState<MessageType[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [searchQuery, setSearchQuery] = useState<MessageQuery | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingMessage, setEditingMessage] = useState<MessageType | null>(null);
  const [editorInitialContent, setEditorInitialContent] = useState('');
  const [newCount, setNewCount] = useState(0);
  const [isAtTop, setIsAtTop] = useState(true);
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const messagesRef = useRef<MessageType[]>([]);

  // Keep ref in sync with state for polling callback
  messagesRef.current = messages;

  // Load messages
  const loadMessages = useCallback(async (offset: number, query?: MessageQuery | null) => {
    try {
      const q = query || {};
      const resp = await getMessages({ ...q, offset, limit: PAGE_SIZE });
      return resp;
    } catch {
      return { messages: [], total: 0, has_more: false };
    }
  }, []);

  // Initial load
  useEffect(() => {
    (async () => {
      setLoading(true);
      const resp = await loadMessages(0, searchQuery);
      setMessages(resp.messages);
      setHasMore(resp.has_more);
      setLoading(false);
      setNewCount(0);
    })();
  }, [searchQuery, loadMessages]);

  // Polling for new messages every 3 seconds
  useEffect(() => {
    if (searchQuery) return; // no polling during search

    const interval = setInterval(async () => {
      try {
        const resp = await getMessages({ offset: 0, limit: PAGE_SIZE });
        const current = messagesRef.current;
        if (resp.messages.length === 0) return;

        // Find messages that are not in our current list
        const currentIds = new Set(current.map(m => m.id));
        const fresh = resp.messages.filter(m => !currentIds.has(m.id));

        if (fresh.length === 0) {
          // Check for edits/pin changes on existing messages
          let changed = false;
          const updatedMap = new Map(resp.messages.map(m => [m.id, m]));
          const updated = current.map(m => {
            const newer = updatedMap.get(m.id);
            if (newer && newer.updated_at !== m.updated_at) {
              changed = true;
              return newer;
            }
            return m;
          });
          if (changed) setMessages(updated);
          return;
        }

        if (isAtTop) {
          // User is at top - insert new messages directly
          setMessages(prev => [...fresh, ...prev]);
        } else {
          // User is scrolling down - show "new messages" badge
          setMessages(prev => [...fresh, ...prev]);
          setNewCount(prev => prev + fresh.length);
        }
      } catch { /* ignore polling errors */ }
    }, POLL_INTERVAL);

    return () => clearInterval(interval);
  }, [searchQuery, isAtTop]);

  // Load more (older messages)
  const loadMore = useCallback(async () => {
    if (!hasMore) return;
    const resp = await loadMessages(messages.length, searchQuery);
    setMessages(prev => [...prev, ...resp.messages]);
    setHasMore(resp.has_more);
  }, [hasMore, messages.length, searchQuery, loadMessages]);

  // Scroll to top and dismiss new messages badge
  const scrollToTop = useCallback(() => {
    virtuosoRef.current?.scrollToIndex({ index: 0, behavior: 'smooth' });
    setNewCount(0);
  }, []);

  // Track scroll position
  const handleAtTopChange = useCallback((atTop: boolean) => {
    setIsAtTop(atTop);
    if (atTop) setNewCount(0);
  }, []);

  // Send message (quick input)
  const handleSend = useCallback(async (content: string, files: File[]) => {
    try {
      let msg: MessageType;
      if (files.length > 0) {
        msg = await uploadWithProgress(content, files, () => {});
      } else {
        msg = await createMessage(content);
      }
      setMessages(prev => [msg, ...prev]);
      virtuosoRef.current?.scrollToIndex({ index: 0, behavior: 'smooth' });
    } catch { /* ignore */ }
  }, []);

  // Save from editor (new or edit)
  const handleEditorSave = useCallback(async (content: string, files: File[]) => {
    try {
      if (editingMessage) {
        const updated = await editMessage(editingMessage.id, content);
        setMessages(prev => prev.map(m => m.id === updated.id ? updated : m));
      } else {
        let msg: MessageType;
        if (files.length > 0) {
          msg = await uploadWithProgress(content, files, () => {});
        } else {
          msg = await createMessage(content);
        }
        setMessages(prev => [msg, ...prev]);
        virtuosoRef.current?.scrollToIndex({ index: 0, behavior: 'smooth' });
      }
    } catch { /* ignore */ }

    setEditorOpen(false);
    setEditingMessage(null);
    setEditorInitialContent('');
  }, [editingMessage]);

  // Open editor for new message
  const handleOpenEditor = useCallback((initialContent?: string) => {
    setEditingMessage(null);
    setEditorInitialContent(initialContent || '');
    setEditorOpen(true);
  }, []);

  // Open editor for editing
  const handleEdit = useCallback((msg: MessageType) => {
    setEditingMessage(msg);
    setEditorInitialContent(msg.content);
    setEditorOpen(true);
  }, []);

  // Delete message
  const handleDelete = useCallback((id: string) => {
    setMessages(prev => prev.filter(m => m.id !== id));
  }, []);

  // Update message (pin/unpin)
  const handleUpdate = useCallback((msg: MessageType) => {
    setMessages(prev => prev.map(m => m.id === msg.id ? msg : m));
  }, []);

  // Search
  const handleSearch = useCallback((query: MessageQuery) => {
    setSearchQuery(query);
  }, []);

  const handleClearSearch = useCallback(() => {
    setSearchQuery(null);
  }, []);

  // Group messages by date for date separators
  const itemsWithSeparators = buildItemsWithSeparators(messages);

  return (
    <div className="wall">
      <Search
        onSearch={handleSearch}
        onClear={handleClearSearch}
        isActive={searchQuery !== null}
      />

      <div className="wall-content">
        {/* New messages badge */}
        <AnimatePresence>
          {newCount > 0 && !isAtTop && (
            <motion.button
              className="wall-new-badge"
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.2 }}
              onClick={scrollToTop}
            >
              {newCount} {newCount === 1 ? 'новое сообщение' : newCount < 5 ? 'новых сообщения' : 'новых сообщений'}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="18 15 12 9 6 15"/>
              </svg>
            </motion.button>
          )}
        </AnimatePresence>

        {loading ? (
          <div className="wall-loading">
            <div className="wall-spinner" />
          </div>
        ) : messages.length === 0 ? (
          <div className="wall-empty">
            <img src="/beaver.svg" alt="" className="wall-empty-icon" />
            <p>{searchQuery ? 'Ничего не найдено' : 'Пока пусто. Отправьте первое сообщение!'}</p>
          </div>
        ) : (
          <Virtuoso
            ref={virtuosoRef}
            data={itemsWithSeparators}
            endReached={loadMore}
            atTopStateChange={handleAtTopChange}
            overscan={500}
            className="wall-virtuoso"
            itemContent={(_, item) => {
              if (item.type === 'separator') {
                return (
                  <div className="wall-date-separator">
                    <span>{item.label}</span>
                  </div>
                );
              }
              return (
                <div className="wall-message-wrapper">
                  <MessageCard
                    message={item.message!}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                    onUpdate={handleUpdate}
                  />
                </div>
              );
            }}
            components={{
              Footer: () =>
                hasMore ? (
                  <div className="wall-loading-more">
                    <div className="wall-spinner wall-spinner--small" />
                  </div>
                ) : null,
            }}
          />
        )}
      </div>

      <QuickInput onSend={handleSend} onOpenEditor={handleOpenEditor} />

      <AnimatePresence>
        {editorOpen && (
          <Editor
            initialContent={editorInitialContent}
            onSave={handleEditorSave}
            onCancel={() => {
              setEditorOpen(false);
              setEditingMessage(null);
            }}
            isEdit={!!editingMessage}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// Types for wall items
type WallItem =
  | { type: 'separator'; label: string; key: string }
  | { type: 'message'; message: MessageType; key: string };

function buildItemsWithSeparators(messages: MessageType[]): WallItem[] {
  const items: WallItem[] = [];
  let lastDateKey = '';

  for (const msg of messages) {
    const dk = getDateKey(msg.created_at);
    if (dk !== lastDateKey) {
      items.push({ type: 'separator', label: formatDate(msg.created_at), key: 'sep-' + dk });
      lastDateKey = dk;
    }
    items.push({ type: 'message', message: msg, key: msg.id });
  }

  return items;
}
