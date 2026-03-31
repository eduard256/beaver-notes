import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import type { MessageQuery } from '../utils/api';
import './Search.css';

interface SearchProps {
  onSearch: (query: MessageQuery) => void;
  onClear: () => void;
  isActive: boolean;
}

const CONTENT_TYPES = [
  { value: '', label: 'Все' },
  { value: 'text', label: 'Текст' },
  { value: 'image', label: 'Изображения' },
  { value: 'video', label: 'Видео' },
  { value: 'file', label: 'Файлы' },
];

export default function Search({ onSearch, onClear, isActive }: SearchProps) {
  const [expanded, setExpanded] = useState(false);
  const [search, setSearch] = useState('');
  const [type, setType] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [tag, setTag] = useState('');
  const [pinned, setPinned] = useState(false);

  const handleSearch = useCallback(() => {
    const query: MessageQuery = {};
    if (search.trim()) query.search = search.trim();
    if (type) query.type = type;
    if (dateFrom) query.date_from = dateFrom;
    if (dateTo) query.date_to = dateTo;
    if (tag.trim()) query.tag = tag.trim().replace(/^#/, '');
    if (pinned) query.pinned = true;

    if (Object.keys(query).length === 0) {
      onClear();
      return;
    }

    onSearch(query);
  }, [search, type, dateFrom, dateTo, tag, pinned, onSearch, onClear]);

  const handleClear = useCallback(() => {
    setSearch('');
    setType('');
    setDateFrom('');
    setDateTo('');
    setTag('');
    setPinned(false);
    setExpanded(false);
    onClear();
  }, [onClear]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
    if (e.key === 'Escape') {
      handleClear();
    }
  }, [handleSearch, handleClear]);

  return (
    <div className="search-container">
      <div className="search-bar">
        <svg className="search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>

        <input
          className="search-input"
          type="text"
          placeholder="Поиск..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={handleKeyDown}
        />

        <button
          className={`search-filter-btn ${expanded ? 'search-filter-btn--active' : ''}`}
          onClick={() => setExpanded(!expanded)}
          title="Фильтры"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/>
            <line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/>
            <line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/>
            <line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/>
          </svg>
        </button>

        {isActive && (
          <button className="search-clear-btn" onClick={handleClear} title="Сбросить">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        )}
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            className="search-filters"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div className="search-filters-inner">
              {/* Content type chips */}
              <div className="search-filter-row">
                <label className="search-filter-label">Тип</label>
                <div className="search-chips">
                  {CONTENT_TYPES.map((ct) => (
                    <button
                      key={ct.value}
                      className={`search-chip ${type === ct.value ? 'search-chip--active' : ''}`}
                      onClick={() => setType(ct.value)}
                    >
                      {ct.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Date range */}
              <div className="search-filter-row">
                <label className="search-filter-label">Дата</label>
                <div className="search-dates">
                  <input
                    type="date"
                    className="search-date-input"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    placeholder="От"
                  />
                  <span className="search-date-sep">-</span>
                  <input
                    type="date"
                    className="search-date-input"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    placeholder="До"
                  />
                </div>
              </div>

              {/* Tag filter */}
              <div className="search-filter-row">
                <label className="search-filter-label">Тег</label>
                <input
                  className="search-tag-input"
                  type="text"
                  placeholder="#тег"
                  value={tag}
                  onChange={(e) => setTag(e.target.value)}
                  onKeyDown={handleKeyDown}
                />
              </div>

              {/* Pinned toggle */}
              <div className="search-filter-row">
                <label className="search-filter-label">Закрепленные</label>
                <button
                  className={`search-toggle ${pinned ? 'search-toggle--active' : ''}`}
                  onClick={() => setPinned(!pinned)}
                >
                  <div className="search-toggle-knob" />
                </button>
              </div>

              {/* Apply button */}
              <button className="search-apply-btn" onClick={handleSearch}>
                Применить
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
