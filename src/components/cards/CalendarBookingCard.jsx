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
      entry.events.forEach((evt) => allEvents.push(evt));
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

const formatRelative = (targetMs, nowMs, t) => {
  const delta = targetMs - nowMs;
  if (delta <= 0) return t('calendar.now') || 'Now';
  const totalMinutes = Math.round(delta / 60000);
  if (totalMinutes < 60) return `${totalMinutes}m`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
};

const sameDay = (a, b) =>
  a.getFullYear() === b.getFullYear()
  && a.getMonth() === b.getMonth()
  && a.getDate() === b.getDate();

const formatDayLabel = (date, now, locale, t) => {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (sameDay(date, today)) return t('calendar.today') || 'Today';
  if (sameDay(date, tomorrow)) return t('calendar.tomorrow') || 'Tomorrow';
  return date.toLocaleDateString(locale, { weekday: 'short', day: '2-digit', month: 'short' });
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
  const cardRef = useRef(null);

  const selectedCalendarId = settings?.calendarEntityId
    || (Array.isArray(settings?.calendars) && settings.calendars.length ? settings.calendars[0] : null);
  const daysAhead = clamp(settings?.daysAhead, 1, 30, 7);
  const maxItems = clamp(settings?.maxItems, 3, 12, 6);

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
    if (!conn || !selectedCalendarId || !isVisible) {
      if (!selectedCalendarId) setEvents([]);
      return undefined;
    }

    let cancelled = false;
    const fetchEvents = async () => {
      setLoading(true);
      setError(null);
      try {
        const start = new Date();
        const end = new Date();
        end.setDate(end.getDate() + daysAhead);
        const result = await getCalendarEvents(conn, {
          start,
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
            const safeEnd = endDate && !Number.isNaN(endDate.getTime())
              ? endDate.getTime()
              : (allDay ? (startDate.getTime() + (24 * 60 * 60 * 1000)) : startDate.getTime());
            return {
              id: `${event?.uid || event?.id || event?.summary || 'event'}_${index}`,
              summary: String(event?.summary || event?.title || event?.description || (t('calendar.noEvents') || 'Event')),
              location: event?.location || '',
              description: event?.description || '',
              startMs: startDate.getTime(),
              endMs: safeEnd,
              allDay,
            };
          })
          .filter(Boolean)
          .sort((a, b) => a.startMs - b.startMs);

        const nowMs = Date.now();
        const active = parsed.filter((event) => event.endMs >= (nowMs - (15 * 60 * 1000)));
        setEvents(active);
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
  }, [conn, selectedCalendarId, daysAhead, isVisible, t]);

  const now = useMemo(() => Date.now(), [events, loading]);
  const selectedCalendarName = selectedCalendarId
    ? (entities?.[selectedCalendarId]?.attributes?.friendly_name || selectedCalendarId)
    : '';
  const displayName = customName || settings?.name || t('calendar.bookingTitle') || t('calendar.title') || 'Calendar booking';
  const IconComp = iconName ? (getIconComponent(iconName) || CalendarIcon) : CalendarIcon;

  const ongoingEvent = events.find((event) => event.startMs <= now && now < event.endMs) || null;
  const nextEvent = ongoingEvent || events.find((event) => event.startMs > now) || null;
  const upcomingEvents = events.filter((event) => event.endMs >= now).slice(0, maxItems);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayEnd = new Date(today);
  todayEnd.setDate(todayEnd.getDate() + 1);
  const weekEnd = new Date(today);
  weekEnd.setDate(weekEnd.getDate() + 7);

  const todayCount = events.filter((event) => event.startMs >= today.getTime() && event.startMs < todayEnd.getTime()).length;
  const weekCount = events.filter((event) => event.startMs >= today.getTime() && event.startMs < weekEnd.getTime()).length;
  const nextIn = nextEvent
    ? (ongoingEvent
      ? (t('calendarBooking.inProgress') || 'In progress')
      : `${t('calendarBooking.startsIn') || 'Starts in'} ${formatRelative(nextEvent.startMs, now, t)}`)
    : (t('calendar.noEvents') || 'No upcoming events');

  const isSmall = size === 'small';
  const renderTimeRange = (event) => {
    if (!event) return '';
    if (event.allDay) return t('calendar.allDay') || 'All day';
    const startText = formatTime(new Date(event.startMs), locale);
    const endText = formatTime(new Date(event.endMs), locale);
    return endText ? `${startText} - ${endText}` : startText;
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

      <div className={`h-full flex ${isSmall ? 'items-center gap-3 p-4' : 'flex-col p-5 gap-4'} min-w-0`}>
        <div className={`${isSmall ? 'shrink-0' : ''} w-12 h-12 rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg-hover)] flex items-center justify-center`}>
          <IconComp className="w-6 h-6 text-[var(--text-secondary)]" />
        </div>

        <div className={`${isSmall ? 'min-w-0 flex-1' : 'space-y-4 min-h-0 h-full flex flex-col'}`}>
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
            <div className="min-w-0">
              <div className="text-[11px] uppercase tracking-widest text-[var(--text-secondary)] font-bold truncate">
                {nextIn}
              </div>
              <div className="text-sm font-semibold text-[var(--text-primary)] truncate mt-1">
                {nextEvent ? nextEvent.summary : (loading ? (t('common.loading') || 'Loading...') : (t('calendar.noEvents') || 'No upcoming events'))}
              </div>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] px-3 py-2.5">
                  <div className="text-[10px] uppercase tracking-widest text-[var(--text-secondary)] font-bold">
                    {t('calendarBooking.next') || 'Next'}
                  </div>
                  <div className="text-sm font-semibold text-[var(--text-primary)] mt-1 truncate">
                    {loading && !events.length ? (t('common.loading') || 'Loading...') : nextIn}
                  </div>
                </div>
                <div className="rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] px-3 py-2.5">
                  <div className="text-[10px] uppercase tracking-widest text-[var(--text-secondary)] font-bold">
                    {t('calendar.today') || 'Today'}
                  </div>
                  <div className="text-2xl leading-none font-semibold tabular-nums text-[var(--text-primary)] mt-1">
                    {todayCount}
                  </div>
                </div>
                <div className="rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] px-3 py-2.5">
                  <div className="text-[10px] uppercase tracking-widest text-[var(--text-secondary)] font-bold">
                    {t('calendarBooking.thisWeek') || 'This week'}
                  </div>
                  <div className="text-2xl leading-none font-semibold tabular-nums text-[var(--text-primary)] mt-1">
                    {weekCount}
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg)] p-3">
                {nextEvent ? (
                  <>
                    <div className="flex items-center justify-between gap-2">
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-[var(--glass-border)] bg-[var(--glass-bg-hover)] text-[10px] uppercase tracking-widest font-bold text-[var(--text-secondary)]">
                        <Sparkles className="w-3.5 h-3.5" />
                        {ongoingEvent ? (t('calendarBooking.inProgress') || 'In progress') : (t('calendar.next') || 'Next')}
                      </div>
                      <div className="text-[10px] uppercase tracking-widest font-bold text-[var(--text-secondary)]">
                        {renderTimeRange(nextEvent)}
                      </div>
                    </div>
                    <div className="mt-2 text-[15px] leading-snug font-semibold text-[var(--text-primary)] line-clamp-2">
                      {nextEvent.summary}
                    </div>
                    {nextEvent.location && (
                      <div className="mt-2 inline-flex items-center gap-1.5 text-[11px] text-[var(--text-secondary)]">
                        <MapPin className="w-3.5 h-3.5" />
                        <span className="truncate">{nextEvent.location}</span>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-sm text-[var(--text-secondary)]">{t('calendar.noEvents') || 'No upcoming events'}</div>
                )}
              </div>

              <div className="min-h-0 flex-1 rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg)] p-3 overflow-y-auto custom-scrollbar">
                <div className="text-[10px] uppercase tracking-widest font-bold text-[var(--text-secondary)] mb-2">
                  {t('calendarBooking.upcoming') || 'Upcoming bookings'}
                </div>
                <div className="space-y-2">
                  {!upcomingEvents.length && (
                    <div className="text-xs text-[var(--text-secondary)]">{t('calendar.noEvents') || 'No upcoming events'}</div>
                  )}
                  {upcomingEvents.map((event) => {
                    const eventDate = new Date(event.startMs);
                    return (
                      <div key={event.id} className="rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg-hover)] px-3 py-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-[11px] uppercase tracking-widest font-bold text-[var(--text-secondary)] inline-flex items-center gap-1.5">
                            <Clock3 className="w-3.5 h-3.5" />
                            {formatDayLabel(eventDate, new Date(now), locale, t)}
                          </div>
                          <div className="text-[11px] uppercase tracking-widest font-bold text-[var(--text-secondary)]">
                            {renderTimeRange(event)}
                          </div>
                        </div>
                        <div className="mt-1 text-sm font-semibold text-[var(--text-primary)] line-clamp-2">
                          {event.summary}
                        </div>
                        {event.location && (
                          <div className="mt-1 text-[11px] text-[var(--text-secondary)] truncate">
                            {event.location}
                          </div>
                        )}
                      </div>
                    );
                  })}
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
