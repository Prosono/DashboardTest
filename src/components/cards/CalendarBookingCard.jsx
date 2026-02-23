import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Calendar as CalendarIcon, Clock3, MapPin, Sparkles } from 'lucide-react';
import { getIconComponent } from '../../icons';
import { getCalendarEvents } from '../../services/haClient';

const clamp = (value, min, max, fallback) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.round(parsed)));
};

const getDateValue = (value) => {
  if (!value) return null;
  if (typeof value === 'string' || typeof value === 'number') return value;
  return value.dateTime || value.date_time || value.date || null;
};

const isAllDayValue = (value) => {
  if (!value) return false;
  if (typeof value === 'string') return value.length === 10;
  return !!value.date && !value.dateTime && !value.date_time;
};

const parseCalendarEvents = (result) => {
  if (!result) return [];
  const allEvents = [];
  const addEntries = (entry) => {
    if (!entry) return;
    if (Array.isArray(entry)) {
      entry.forEach(addEntries);
      return;
    }
    if (Array.isArray(entry.events)) {
      entry.events.forEach((event) => allEvents.push(event));
    }
  };
  Object.values(result).forEach(addEntries);
  return allEvents;
};

const formatTime = (date, locale = 'nb-NO') => {
  if (!date || Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString(locale, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: locale === 'en-US',
  });
};

const formatRelative = (targetMs, nowMs) => {
  const delta = targetMs - nowMs;
  if (delta <= 0) return '0m';
  const totalMinutes = Math.round(delta / 60000);
  if (totalMinutes < 60) return `${totalMinutes}m`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
};

const getDayBounds = (nowMs) => {
  const now = new Date(nowMs);
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const tomorrowStart = new Date(todayStart);
  tomorrowStart.setDate(tomorrowStart.getDate() + 1);
  const afterTomorrowStart = new Date(tomorrowStart);
  afterTomorrowStart.setDate(afterTomorrowStart.getDate() + 1);
  return {
    todayStartMs: todayStart.getTime(),
    tomorrowStartMs: tomorrowStart.getTime(),
    afterTomorrowStartMs: afterTomorrowStart.getTime(),
  };
};

const CalendarBookingCard = ({
  cardId,
  settings,
  conn,
  entities,
  t,
  locale = 'nb-NO',
  className,
  style,
  dragProps,
  getControls,
  onClick,
  isEditMode,
  size,
  iconName,
  customName,
}) => {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isVisible, setIsVisible] = useState(false);
  const [clockMs, setClockMs] = useState(Date.now());
  const cardRef = useRef(null);

  const selectedCalendarId = settings?.calendarEntityId
    || (Array.isArray(settings?.calendars) && settings.calendars.length ? settings.calendars[0] : null);
  const maxItemsPerDay = clamp(settings?.maxItems, 2, 10, 4);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '200px' }
    );
    if (cardRef.current) observer.observe(cardRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const intervalId = window.setInterval(() => setClockMs(Date.now()), 60000);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    if (!conn || !selectedCalendarId || !isVisible) {
      if (!selectedCalendarId) setEvents([]);
      return undefined;
    }

    let cancelled = false;
    const fetchEvents = async () => {
      setLoading(true);
      setError(null);
      try {
        const nowMs = Date.now();
        const now = new Date(nowMs);
        const { afterTomorrowStartMs } = getDayBounds(nowMs);
        const end = new Date(afterTomorrowStartMs);
        const result = await getCalendarEvents(conn, {
          start: now,
          end,
          entityIds: [selectedCalendarId],
        });
        if (cancelled) return;

        const parsed = parseCalendarEvents(result)
          .map((event, index) => {
            const startRaw = getDateValue(event?.start);
            const endRaw = getDateValue(event?.end);
            const startDate = startRaw ? new Date(startRaw) : null;
            const endDate = endRaw ? new Date(endRaw) : null;
            if (!startDate || Number.isNaN(startDate.getTime())) return null;
            const allDay = isAllDayValue(event?.start);
            const safeEndMs = endDate && !Number.isNaN(endDate.getTime())
              ? endDate.getTime()
              : (allDay ? (startDate.getTime() + (24 * 60 * 60 * 1000)) : startDate.getTime());
            return {
              id: `${event?.uid || event?.id || event?.summary || 'event'}_${index}`,
              summary: String(event?.summary || event?.title || event?.description || (t('calendar.noEvents') || 'Event')),
              location: event?.location || '',
              startMs: startDate.getTime(),
              endMs: safeEndMs,
              allDay,
            };
          })
          .filter(Boolean)
          .filter((event) => event.startMs < afterTomorrowStartMs)
          .sort((a, b) => a.startMs - b.startMs);

        const visibleEvents = parsed.filter((event) => event.endMs >= (nowMs - (15 * 60 * 1000)));
        setEvents(visibleEvents);
      } catch (err) {
        if (cancelled) return;
        setError(err?.message || 'Failed to fetch calendar events');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchEvents();
    const intervalId = window.setInterval(fetchEvents, 5 * 60 * 1000);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [conn, selectedCalendarId, isVisible, t]);

  const selectedCalendarName = selectedCalendarId
    ? (entities?.[selectedCalendarId]?.attributes?.friendly_name || selectedCalendarId)
    : '';
  const displayName = customName || settings?.name || t('calendar.bookingTitle') || t('calendar.title') || 'Calendar booking';
  const IconComp = iconName ? (getIconComponent(iconName) || CalendarIcon) : CalendarIcon;

  const {
    todayEvents,
    tomorrowEvents,
    ongoingEvent,
    nextEvent,
  } = useMemo(() => {
    const { todayStartMs, tomorrowStartMs, afterTomorrowStartMs } = getDayBounds(clockMs);
    const sorted = [...events].sort((a, b) => a.startMs - b.startMs);
    const today = sorted.filter((event) => event.startMs >= todayStartMs && event.startMs < tomorrowStartMs);
    const tomorrow = sorted.filter((event) => event.startMs >= tomorrowStartMs && event.startMs < afterTomorrowStartMs);
    const ongoing = sorted.find((event) => event.startMs <= clockMs && clockMs < event.endMs) || null;
    const upcoming = ongoing || sorted.find((event) => event.startMs > clockMs) || null;
    return {
      todayEvents: today,
      tomorrowEvents: tomorrow,
      ongoingEvent: ongoing,
      nextEvent: upcoming,
    };
  }, [events, clockMs]);

  const renderTimeRange = (event) => {
    if (!event) return '';
    if (event.allDay) return t('calendar.allDay') || 'All day';
    const startText = formatTime(new Date(event.startMs), locale);
    const endText = formatTime(new Date(event.endMs), locale);
    return endText ? `${startText} - ${endText}` : startText;
  };

  const nextStatus = nextEvent
    ? (ongoingEvent
      ? (t('calendarBooking.inProgress') || 'In progress')
      : `${t('calendarBooking.startsIn') || 'Starts in'} ${formatRelative(nextEvent.startMs, clockMs)}`)
    : (t('calendar.noEvents') || 'No upcoming events');

  const isSmall = size === 'small';

  const renderEventItem = (event) => {
    const live = event.startMs <= clockMs && clockMs < event.endMs;
    const relative = live
      ? (t('calendarBooking.inProgress') || 'In progress')
      : `${t('calendarBooking.startsIn') || 'Starts in'} ${formatRelative(event.startMs, clockMs)}`;

    return (
      <div key={event.id} className="rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg-hover)] px-3 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="text-[10px] uppercase tracking-widest font-bold text-[var(--text-secondary)] inline-flex items-center gap-1.5">
            <Clock3 className="w-3.5 h-3.5" />
            {renderTimeRange(event)}
          </div>
          <div className={`text-[10px] uppercase tracking-widest font-bold ${live ? 'text-emerald-400' : 'text-[var(--text-secondary)]'}`}>
            {relative}
          </div>
        </div>
        <div className="mt-1 text-sm font-semibold text-[var(--text-primary)] line-clamp-2">
          {event.summary}
        </div>
        {event.location && (
          <div className="mt-1 text-[11px] text-[var(--text-secondary)] truncate inline-flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5" />
            <span className="truncate">{event.location}</span>
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      ref={cardRef}
      {...dragProps}
      data-haptic={isEditMode ? undefined : 'card'}
      onClick={onClick}
      className={`touch-feedback relative overflow-hidden font-sans h-full rounded-3xl border border-[var(--card-border)] bg-[var(--card-bg)] backdrop-blur-xl transition-all duration-300 ${
        isEditMode ? 'cursor-move' : 'cursor-pointer'
      } ${className || ''}`}
      style={style}
    >
      {getControls && getControls(cardId)}

      <div className={`h-full ${isSmall ? 'flex items-center gap-3 p-4' : 'flex flex-col p-5 gap-3'} min-w-0`}>
        <div className={`${isSmall ? 'shrink-0' : ''} w-12 h-12 rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg-hover)] flex items-center justify-center`}>
          <IconComp className="w-6 h-6 text-[var(--text-secondary)]" />
        </div>

        <div className={`${isSmall ? 'min-w-0 flex-1' : 'min-h-0 h-full flex flex-col gap-3'}`}>
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-[0.28em] text-[var(--text-secondary)] font-bold truncate">
              {selectedCalendarName || (t('calendar.selectCalendars') || 'Select calendars')}
            </div>
            <div className="text-base md:text-lg font-semibold text-[var(--text-primary)] truncate">
              {displayName}
            </div>
          </div>

          {!selectedCalendarId ? (
            <div className="flex-1 rounded-2xl border border-orange-500/30 bg-orange-500/10 px-4 py-3 flex items-center gap-2.5 text-orange-200">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span className="text-xs uppercase tracking-widest font-bold">
                {t('calendarBooking.selectCalendarPrompt') || 'Select one calendar in card settings'}
              </span>
            </div>
          ) : error ? (
            <div className="flex-1 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 flex items-center gap-2.5 text-rose-200">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span className="text-xs">{error}</span>
            </div>
          ) : isSmall ? (
            <div className="min-w-0 space-y-2">
              <div className="text-[11px] uppercase tracking-widest text-[var(--text-secondary)] font-bold truncate">
                {loading && !events.length ? (t('common.loading') || 'Loading...') : nextStatus}
              </div>
              <div className="text-sm font-semibold text-[var(--text-primary)] truncate">
                {nextEvent ? nextEvent.summary : (t('calendar.noEvents') || 'No upcoming events')}
              </div>
              <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-[var(--text-secondary)]">
                <span className="px-2 py-1 rounded-full border border-[var(--glass-border)] bg-[var(--glass-bg)]">{t('calendar.today') || 'Today'} {todayEvents.length}</span>
                <span className="px-2 py-1 rounded-full border border-[var(--glass-border)] bg-[var(--glass-bg)]">{t('calendar.tomorrow') || 'Tomorrow'} {tomorrowEvents.length}</span>
              </div>
            </div>
          ) : (
            <>
              <div className="rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg)] p-3.5">
                {nextEvent ? (
                  <>
                    <div className="flex items-center justify-between gap-2">
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-[var(--glass-border)] bg-[var(--glass-bg-hover)] text-[10px] uppercase tracking-widest font-bold text-[var(--text-secondary)]">
                        <Sparkles className="w-3.5 h-3.5" />
                        {ongoingEvent ? (t('calendarBooking.inProgress') || 'In progress') : (t('calendarBooking.next') || 'Next')}
                      </div>
                      <div className="text-[10px] uppercase tracking-widest font-bold text-[var(--text-secondary)]">
                        {nextStatus}
                      </div>
                    </div>
                    <div className="mt-2 text-[15px] leading-snug font-semibold text-[var(--text-primary)] line-clamp-2">
                      {nextEvent.summary}
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-[var(--glass-border)] bg-[var(--glass-bg-hover)] text-[11px] text-[var(--text-secondary)]">
                        <Clock3 className="w-3.5 h-3.5" />
                        {renderTimeRange(nextEvent)}
                      </span>
                      {nextEvent.location && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-[var(--glass-border)] bg-[var(--glass-bg-hover)] text-[11px] text-[var(--text-secondary)] max-w-full">
                          <MapPin className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate">{nextEvent.location}</span>
                        </span>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="text-sm text-[var(--text-secondary)]">
                    {loading ? (t('common.loading') || 'Loading...') : (t('calendar.noEvents') || 'No upcoming events')}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] px-3 py-2.5">
                  <div className="text-[10px] uppercase tracking-widest text-[var(--text-secondary)] font-bold">
                    {t('calendar.today') || 'Today'}
                  </div>
                  <div className="text-2xl leading-none font-semibold tabular-nums text-[var(--text-primary)] mt-1">
                    {todayEvents.length}
                  </div>
                </div>
                <div className="rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] px-3 py-2.5">
                  <div className="text-[10px] uppercase tracking-widest text-[var(--text-secondary)] font-bold">
                    {t('calendar.tomorrow') || 'Tomorrow'}
                  </div>
                  <div className="text-2xl leading-none font-semibold tabular-nums text-[var(--text-primary)] mt-1">
                    {tomorrowEvents.length}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 min-h-0 flex-1">
                <div className="min-h-0 rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg)] p-3 flex flex-col">
                  <div className="text-[10px] uppercase tracking-widest font-bold text-[var(--text-secondary)] mb-2">
                    {t('calendar.today') || 'Today'}
                  </div>
                  <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar pr-1 space-y-2">
                    {todayEvents.length === 0 ? (
                      <div className="text-xs text-[var(--text-secondary)]">{t('calendar.noEvents') || 'No upcoming events'}</div>
                    ) : (
                      todayEvents.slice(0, maxItemsPerDay).map(renderEventItem)
                    )}
                  </div>
                </div>
                <div className="min-h-0 rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg)] p-3 flex flex-col">
                  <div className="text-[10px] uppercase tracking-widest font-bold text-[var(--text-secondary)] mb-2">
                    {t('calendar.tomorrow') || 'Tomorrow'}
                  </div>
                  <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar pr-1 space-y-2">
                    {tomorrowEvents.length === 0 ? (
                      <div className="text-xs text-[var(--text-secondary)]">{t('calendar.noEvents') || 'No upcoming events'}</div>
                    ) : (
                      tomorrowEvents.slice(0, maxItemsPerDay).map(renderEventItem)
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default CalendarBookingCard;
