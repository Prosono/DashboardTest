import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, AlertTriangle, Bell, Check, Clock, Search, Trash2, X } from '../../icons';
import { useNotifications } from '../../contexts';

const clamp = (value, min, max, fallback) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.round(parsed)));
};

const toPlainText = (value) => String(value || '')
  .replace(/<br\s*\/?>/gi, '\n')
  .replace(/<\/(p|div)>/gi, '\n')
  .replace(/<[^>]+>/g, '')
  .replace(/&nbsp;/gi, ' ')
  .replace(/&amp;/gi, '&')
  .replace(/&lt;/gi, '<')
  .replace(/&gt;/gi, '>')
  .replace(/&quot;/gi, '"')
  .replace(/&#39;/gi, "'")
  .replace(/\r/g, '')
  .trim();

const normalizeLevel = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'critical' || normalized === 'warning' || normalized === 'success' || normalized === 'error') {
    return normalized;
  }
  return 'info';
};

const getSeverityMeta = (level) => {
  switch (normalizeLevel(level)) {
    case 'critical':
      return {
        icon: AlertTriangle,
        textClass: 'text-rose-300',
        chipClass: 'border-rose-500/30 bg-rose-500/12 text-rose-300',
      };
    case 'error':
      return {
        icon: AlertTriangle,
        textClass: 'text-rose-300',
        chipClass: 'border-rose-500/30 bg-rose-500/12 text-rose-300',
      };
    case 'warning':
      return {
        icon: AlertTriangle,
        textClass: 'text-amber-300',
        chipClass: 'border-amber-500/30 bg-amber-500/12 text-amber-300',
      };
    case 'success':
      return {
        icon: Check,
        textClass: 'text-emerald-300',
        chipClass: 'border-emerald-500/30 bg-emerald-500/12 text-emerald-300',
      };
    default:
      return {
        icon: AlertCircle,
        textClass: 'text-blue-300',
        chipClass: 'border-blue-500/30 bg-blue-500/12 text-blue-300',
      };
  }
};

const formatDateTime = (value, locale = 'nb-NO', includeYear = false) => {
  const timestampMs = Date.parse(String(value || ''));
  if (!Number.isFinite(timestampMs)) return '--';
  try {
    return new Date(timestampMs).toLocaleString(locale, {
      day: '2-digit',
      month: '2-digit',
      ...(includeYear ? { year: 'numeric' } : {}),
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return new Date(timestampMs).toLocaleString();
  }
};

const tr = (t, key, fallback) => {
  const value = typeof t === 'function' ? t(key) : '';
  if (!value || value === key) return fallback;
  return value;
};

const getTimeThresholdMs = (windowKey, nowMs) => {
  if (windowKey === '24h') return nowMs - (24 * 60 * 60 * 1000);
  if (windowKey === '7d') return nowMs - (7 * 24 * 60 * 60 * 1000);
  return null;
};

export default function NotificationTimelineCard({
  cardId,
  settings = {},
  dragProps,
  controls,
  cardStyle,
  editMode,
  customNames = {},
  t,
  locale = 'nb-NO',
}) {
  const {
    notificationHistory,
    clearNotificationHistory,
    removeNotificationHistoryEntry,
  } = useNotifications();

  const heading = customNames[cardId] || settings.heading || tr(t, 'notificationTimeline.title', 'Notification timeline');
  const maxEntries = clamp(settings.maxEntries, 1, 200, 200);
  const [searchQuery, setSearchQuery] = useState('');
  const [severityFilter, setSeverityFilter] = useState('all');
  const [timeWindowFilter, setTimeWindowFilter] = useState('all');
  const [selectedEntryId, setSelectedEntryId] = useState('');

  const allRows = useMemo(
    () => (Array.isArray(notificationHistory) ? notificationHistory : []),
    [notificationHistory],
  );

  const rows = useMemo(() => {
    const query = String(searchQuery || '').trim().toLowerCase();
    const nowMs = Date.now();
    const thresholdMs = getTimeThresholdMs(timeWindowFilter, nowMs);

    const filtered = allRows.filter((entry) => {
      const level = normalizeLevel(entry?.level);
      if (severityFilter !== 'all' && level !== severityFilter) return false;

      if (thresholdMs !== null) {
        const createdAtMs = Date.parse(String(entry?.createdAt || ''));
        if (!Number.isFinite(createdAtMs) || createdAtMs < thresholdMs) return false;
      }

      if (!query) return true;
      const haystack = [
        String(entry?.title || ''),
        toPlainText(entry?.message),
        String(entry?.id || ''),
      ].join(' ').toLowerCase();
      return haystack.includes(query);
    });

    return filtered.slice(0, maxEntries);
  }, [allRows, searchQuery, severityFilter, timeWindowFilter, maxEntries]);

  const selectedEntry = useMemo(() => {
    if (!selectedEntryId) return null;
    return allRows.find((entry) => String(entry?.id || '') === selectedEntryId) || null;
  }, [allRows, selectedEntryId]);

  useEffect(() => {
    if (!selectedEntryId) return;
    if (!selectedEntry) setSelectedEntryId('');
  }, [selectedEntryId, selectedEntry]);

  const handleDeleteEntry = useCallback((entryId) => {
    const normalizedId = String(entryId || '').trim();
    if (!normalizedId) return;
    removeNotificationHistoryEntry?.(normalizedId);
    if (selectedEntryId === normalizedId) setSelectedEntryId('');
  }, [removeNotificationHistoryEntry, selectedEntryId]);

  const severityOptions = useMemo(() => ([
    { value: 'all', label: tr(t, 'notificationTimeline.filter.severity.all', 'All severities') },
    { value: 'critical', label: tr(t, 'notificationTimeline.filter.severity.critical', 'Critical') },
    { value: 'error', label: tr(t, 'notificationTimeline.filter.severity.error', 'Error') },
    { value: 'warning', label: tr(t, 'notificationTimeline.filter.severity.warning', 'Warning') },
    { value: 'info', label: tr(t, 'notificationTimeline.filter.severity.info', 'Info') },
    { value: 'success', label: tr(t, 'notificationTimeline.filter.severity.success', 'Success') },
  ]), [t]);

  const timeWindowOptions = useMemo(() => ([
    { value: 'all', label: tr(t, 'notificationTimeline.filter.time.all', 'All time') },
    { value: '24h', label: tr(t, 'notificationTimeline.filter.time.24h', 'Last 24h') },
    { value: '7d', label: tr(t, 'notificationTimeline.filter.time.7d', 'Last 7 days') },
  ]), [t]);

  const detailModal = selectedEntry && typeof document !== 'undefined'
    ? createPortal(
      <div
        className="fixed inset-0 z-[150] flex items-center justify-center p-3 sm:p-5"
        style={{ backgroundColor: 'rgba(0, 0, 0, 0.55)', backdropFilter: 'blur(6px)' }}
        onClick={() => setSelectedEntryId('')}
      >
        <div
          className="w-full max-w-2xl max-h-[84vh] rounded-3xl border overflow-hidden"
          style={{
            background: 'linear-gradient(135deg, var(--card-bg) 0%, var(--modal-bg) 100%)',
            borderColor: 'var(--glass-border)',
          }}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-3 px-4 py-3 border-b border-[var(--glass-border)]">
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-secondary)] font-bold">
                {tr(t, 'notificationTimeline.details', 'Notification details')}
              </p>
              <p className="text-base font-semibold text-[var(--text-primary)] truncate mt-1">
                {String(selectedEntry?.title || tr(t, 'notificationTimeline.untitled', 'Notification'))}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSelectedEntryId('')}
              className="w-9 h-9 rounded-full border border-[var(--glass-border)] bg-[var(--glass-bg)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex items-center justify-center"
              title={tr(t, 'notificationTimeline.close', 'Close')}
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-4 space-y-3 max-h-[calc(84vh-70px)] overflow-y-auto custom-scrollbar">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] p-2.5">
                <p className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)] font-bold">
                  {tr(t, 'notificationTimeline.field.severity', 'Severity')}
                </p>
                <p className="mt-1 text-sm font-semibold text-[var(--text-primary)]">
                  {String(normalizeLevel(selectedEntry?.level || 'info')).toUpperCase()}
                </p>
              </div>
              <div className="rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] p-2.5">
                <p className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)] font-bold">
                  {tr(t, 'notificationTimeline.field.createdAt', 'Created')}
                </p>
                <p className="mt-1 text-sm font-semibold text-[var(--text-primary)]">
                  {formatDateTime(selectedEntry?.createdAt, locale, true)}
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] p-2.5">
              <p className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)] font-bold">
                {tr(t, 'notificationTimeline.field.id', 'Entry ID')}
              </p>
              <p className="mt-1 text-xs font-mono break-all text-[var(--text-primary)]">
                {String(selectedEntry?.id || '-')}
              </p>
            </div>

            <div className="rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] p-2.5">
              <p className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)] font-bold">
                {tr(t, 'notificationTimeline.field.message', 'Message')}
              </p>
              <p className="mt-1 text-sm whitespace-pre-wrap break-words text-[var(--text-primary)]">
                {toPlainText(selectedEntry?.message) || '-'}
              </p>
            </div>

            {selectedEntry?.meta ? (
              <div className="rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] p-2.5">
                <p className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)] font-bold">
                  {tr(t, 'notificationTimeline.field.meta', 'Metadata')}
                </p>
                <pre className="mt-1 text-[11px] whitespace-pre-wrap break-words text-[var(--text-primary)] font-mono">
                  {JSON.stringify(selectedEntry.meta, null, 2)}
                </pre>
              </div>
            ) : null}

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => handleDeleteEntry(selectedEntry?.id)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-500/25 bg-red-500/10 text-red-300 text-xs font-bold hover:bg-red-500/15 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{tr(t, 'notificationTimeline.deleteEntry', 'Delete entry')}</span>
              </button>
            </div>
          </div>
        </div>
      </div>,
      document.body,
    )
    : null;

  return (
    <>
      <div
        {...dragProps}
        className={`touch-feedback w-full rounded-3xl border relative overflow-hidden p-4 sm:p-5 font-sans break-inside-avoid ${
          editMode ? 'cursor-move' : ''
        }`}
        style={{
          ...cardStyle,
          background: 'linear-gradient(135deg, var(--card-bg) 0%, var(--modal-bg) 100%)',
          borderColor: 'var(--glass-border)',
        }}
      >
        {controls}

        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-[0.26em] font-bold text-[var(--text-secondary)] truncate">
              {heading}
            </p>
            <p className="text-xs mt-1 text-[var(--text-secondary)]">
              {rows.length}/{allRows.length} {tr(t, 'notificationTimeline.entries', 'entries')}
            </p>
          </div>
          {!editMode && allRows.length > 0 && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                clearNotificationHistory?.();
              }}
              className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg border border-red-500/25 bg-red-500/10 text-red-300 text-[10px] uppercase tracking-wider font-bold hover:bg-red-500/15 transition-colors"
              title={tr(t, 'notificationTimeline.clear', 'Clear timeline')}
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>{tr(t, 'notificationTimeline.clear', 'Clear')}</span>
            </button>
          )}
        </div>

        {!editMode && allRows.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_10rem_10rem] gap-2 mb-3">
            <label className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                className="w-full h-9 pl-8 pr-3 rounded-lg border border-[var(--glass-border)] bg-[var(--glass-bg)] text-xs text-[var(--text-primary)] outline-none focus:border-blue-500/40"
                placeholder={tr(t, 'notificationTimeline.filter.search', 'Search notifications')}
              />
            </label>
            <select
              value={severityFilter}
              onChange={(event) => setSeverityFilter(event.target.value)}
              className="h-9 px-2.5 rounded-lg border border-[var(--glass-border)] bg-[var(--glass-bg)] text-xs text-[var(--text-primary)] outline-none focus:border-blue-500/40"
            >
              {severityOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <select
              value={timeWindowFilter}
              onChange={(event) => setTimeWindowFilter(event.target.value)}
              className="h-9 px-2.5 rounded-lg border border-[var(--glass-border)] bg-[var(--glass-bg)] text-xs text-[var(--text-primary)] outline-none focus:border-blue-500/40"
            >
              {timeWindowOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>
        )}

        {allRows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--glass-border)] bg-[var(--glass-bg)] px-4 py-6 text-center">
            <p className="text-xs font-bold uppercase tracking-widest text-[var(--text-secondary)]">
              {tr(t, 'notificationTimeline.emptyTitle', 'No notifications yet')}
            </p>
            <p className="text-[11px] mt-1 text-[var(--text-muted)]">
              {tr(t, 'notificationTimeline.emptyHint', 'When alerts are triggered, they will appear here.')}
            </p>
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--glass-border)] bg-[var(--glass-bg)] px-4 py-6 text-center">
            <p className="text-xs font-bold uppercase tracking-widest text-[var(--text-secondary)]">
              {tr(t, 'notificationTimeline.noMatch', 'No entries match your filters')}
            </p>
          </div>
        ) : (
          <div className="space-y-2 max-h-[420px] overflow-y-auto custom-scrollbar pr-1">
            {rows.map((entry) => {
              const severity = getSeverityMeta(entry?.level);
              const SeverityIcon = severity.icon || Bell;
              const levelLabel = String(normalizeLevel(entry?.level || 'info')).toUpperCase();
              const plainMessage = toPlainText(entry?.message);
              return (
                <div
                  key={entry.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedEntryId(String(entry?.id || ''))}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      setSelectedEntryId(String(entry?.id || ''));
                    }
                  }}
                  className="w-full text-left rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] p-2.5 hover:bg-[var(--glass-bg-hover)] transition-colors cursor-pointer"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-wider ${severity.chipClass}`}>
                          <SeverityIcon className={`w-3 h-3 ${severity.textClass}`} />
                          {levelLabel}
                        </span>
                        <p className="text-sm font-semibold text-[var(--text-primary)] truncate">
                          {String(entry?.title || tr(t, 'notificationTimeline.untitled', 'Notification'))}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2 shrink-0 mt-0.5">
                      <div className="inline-flex items-center gap-1 text-[10px] text-[var(--text-secondary)]">
                        <Clock className="w-3 h-3" />
                        <span>{formatDateTime(entry?.createdAt, locale)}</span>
                      </div>
                      {!editMode && (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleDeleteEntry(entry?.id);
                          }}
                          className="w-6 h-6 rounded-md border border-red-500/25 bg-red-500/10 text-red-300 hover:bg-red-500/15 flex items-center justify-center transition-colors"
                          title={tr(t, 'notificationTimeline.deleteEntry', 'Delete entry')}
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                  {plainMessage ? (
                    <p className="mt-1.5 text-xs text-[var(--text-secondary)] whitespace-pre-wrap break-words">
                      {plainMessage}
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>
      {detailModal}
    </>
  );
}
