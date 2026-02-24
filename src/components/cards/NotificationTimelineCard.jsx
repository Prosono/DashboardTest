import React, { useMemo } from 'react';
import { AlertCircle, AlertTriangle, Bell, Check, Clock, Trash2 } from '../../icons';
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

const getSeverityMeta = (level) => {
  switch (String(level || '').trim().toLowerCase()) {
    case 'critical':
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

const formatDateTime = (value, locale = 'nb-NO') => {
  const timestampMs = Date.parse(String(value || ''));
  if (!Number.isFinite(timestampMs)) return '--';
  try {
    return new Date(timestampMs).toLocaleString(locale, {
      day: '2-digit',
      month: '2-digit',
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
  const { notificationHistory, clearNotificationHistory } = useNotifications();
  const heading = customNames[cardId] || settings.heading || tr(t, 'notificationTimeline.title', 'Notification timeline');
  const maxEntries = clamp(settings.maxEntries, 1, 200, 200);
  const rows = useMemo(
    () => (Array.isArray(notificationHistory) ? notificationHistory : []).slice(0, maxEntries),
    [notificationHistory, maxEntries],
  );

  return (
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
            {rows.length} {tr(t, 'notificationTimeline.entries', 'entries')}
          </p>
        </div>
        {!editMode && rows.length > 0 && (
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

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--glass-border)] bg-[var(--glass-bg)] px-4 py-6 text-center">
          <p className="text-xs font-bold uppercase tracking-widest text-[var(--text-secondary)]">
            {tr(t, 'notificationTimeline.emptyTitle', 'No notifications yet')}
          </p>
          <p className="text-[11px] mt-1 text-[var(--text-muted)]">
            {tr(t, 'notificationTimeline.emptyHint', 'When alerts are triggered, they will appear here.')}
          </p>
        </div>
      ) : (
        <div className="space-y-2 max-h-[420px] overflow-y-auto custom-scrollbar pr-1">
          {rows.map((entry) => {
            const severity = getSeverityMeta(entry?.level);
            const SeverityIcon = severity.icon || Bell;
            const levelLabel = String(entry?.level || tr(t, 'notifications.severity.info', 'Info'))
              .trim()
              .toUpperCase();
            const plainMessage = toPlainText(entry?.message);
            return (
              <div
                key={entry.id}
                className="rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] p-2.5"
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
                  <div className="inline-flex items-center gap-1 text-[10px] text-[var(--text-secondary)] shrink-0 mt-0.5">
                    <Clock className="w-3 h-3" />
                    <span>{formatDateTime(entry?.createdAt, locale)}</span>
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
  );
}

