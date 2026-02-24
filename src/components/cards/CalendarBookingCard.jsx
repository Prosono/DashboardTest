import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Calendar as CalendarIcon,
  Clock3,
  MapPin,
  User,
  Users,
  Wrench,
  ShieldCheck,
} from 'lucide-react';
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
  return {
    todayStartMs: todayStart.getTime(),
    tomorrowStartMs: tomorrowStart.getTime(),
  };
};

const normalizePaxLabel = (value, locale = 'nb-NO') => {
  if (value == null) return '';
  const text = String(value);
  const normalizedLocale = String(locale || '').toLowerCase();
  const peopleWord = normalizedLocale.startsWith('en') ? 'People' : 'Personer';
  return text.replace(/\bpax\b/gi, peopleWord);
};

const BOOKING_TYPE_PATTERNS = {
  service: ['service'],
  aufguss: ['aufguss'],
  private: ['privat', 'private'],
  felles: ['felles'],
};

const getBookingType = (event) => {
  const normalizeText = (value) => String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '');

  const summary = normalizeText(event?.summary);
  const description = normalizeText(event?.description);
  const location = normalizeText(event?.location);
  const haystack = `${summary} ${description} ${location}`.trim();

  const hasServiceFlagTrue = /\bservice\s*[:=]\s*(ja|yes|true|1)\b/.test(haystack);
  const hasServiceFlagFalse = /\bservice\s*[:=]\s*(nei|no|false|0)\b/.test(haystack);
  const hasServiceInTitle = BOOKING_TYPE_PATTERNS.service.some((pattern) =>
    summary.includes(pattern) || location.includes(pattern),
  );

  if (BOOKING_TYPE_PATTERNS.aufguss.some((pattern) => haystack.includes(pattern))) return 'aufguss';
  if (hasServiceFlagTrue || (!hasServiceFlagFalse && hasServiceInTitle)) return 'service';
  if (BOOKING_TYPE_PATTERNS.private.some((pattern) => haystack.includes(pattern))) return 'private';
  if (BOOKING_TYPE_PATTERNS.felles.some((pattern) => haystack.includes(pattern))) return 'felles';
  return 'felles';
};

const getBookingPalette = (type, isOngoing = false) => {
  if (isOngoing) {
    return {
      color: '#60a5fa',
      softBg: 'rgba(96, 165, 250, 0.2)',
      softBorder: 'rgba(96, 165, 250, 0.46)',
    };
  }
  if (type === 'service') {
    return {
      color: '#f59e0b',
      softBg: 'rgba(245, 158, 11, 0.14)',
      softBorder: 'rgba(245, 158, 11, 0.38)',
    };
  }
  if (type === 'aufguss') {
    return {
      color: '#a855f7',
      softBg: 'rgba(168, 85, 247, 0.14)',
      softBorder: 'rgba(168, 85, 247, 0.4)',
    };
  }
  if (type === 'private') {
    return {
      color: '#ec4899',
      softBg: 'rgba(236, 72, 153, 0.14)',
      softBorder: 'rgba(236, 72, 153, 0.38)',
    };
  }
  return {
    color: '#3b82f6',
    softBg: 'rgba(59, 130, 246, 0.14)',
    softBorder: 'rgba(59, 130, 246, 0.38)',
  };
};

const getBookingTypeMeta = (type, t) => {
  switch (type) {
    case 'service':
      return { label: t('calendarBooking.type.service') || 'Service', Icon: Wrench };
    case 'aufguss':
      return { label: t('calendarBooking.type.aufguss') || 'Aufguss', Icon: User };
    case 'private':
      return { label: t('calendarBooking.type.private') || 'Private', Icon: ShieldCheck };
    case 'felles':
      return { label: t('calendarBooking.type.felles') || 'Felles', Icon: Users };
    default:
      return { label: t('calendarBooking.type.felles') || 'Felles', Icon: Users };
  }
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
  const daysAhead = clamp(settings?.daysAhead, 1, 7, 2);

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
        const { todayStartMs } = getDayBounds(nowMs);
        const windowEndMs = todayStartMs + (daysAhead * 24 * 60 * 60 * 1000);
        const end = new Date(windowEndMs);
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
              summary: normalizePaxLabel((event?.summary || event?.title || event?.description || (t('calendar.noEvents') || 'Event')), locale),
              location: normalizePaxLabel(event?.location || '', locale),
              description: normalizePaxLabel(event?.description || '', locale),
              startMs: startDate.getTime(),
              endMs: safeEndMs,
              allDay,
              bookingType: getBookingType(event),
            };
          })
          .filter(Boolean)
          .filter((event) => event.startMs < windowEndMs)
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
  }, [conn, selectedCalendarId, isVisible, t, daysAhead]);

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
    upcomingEvents,
  } = useMemo(() => {
    const { todayStartMs, tomorrowStartMs } = getDayBounds(clockMs);
    const windowEndMs = todayStartMs + (daysAhead * 24 * 60 * 60 * 1000);
    const sorted = [...events].sort((a, b) => a.startMs - b.startMs);
    const windowEvents = sorted.filter((event) => event.startMs >= todayStartMs && event.startMs < windowEndMs);
    const today = windowEvents.filter((event) => event.startMs < tomorrowStartMs);
    const tomorrow = windowEvents.filter((event) => event.startMs >= tomorrowStartMs);
    const ongoing = today.find((event) => event.startMs <= clockMs && clockMs < event.endMs) || null;
    const upcoming = ongoing || windowEvents.find((event) => event.startMs > clockMs) || null;
    return {
      todayEvents: today,
      tomorrowEvents: tomorrow,
      ongoingEvent: ongoing,
      nextEvent: upcoming,
      upcomingEvents: windowEvents,
    };
  }, [events, clockMs, daysAhead]);

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
  const summaryEvent = ongoingEvent || nextEvent;
  const summaryIsLive = !!ongoingEvent;
  const heroPalette = nextEvent ? getBookingPalette(nextEvent.bookingType, !!ongoingEvent) : null;
  const heroTypeMeta = nextEvent ? getBookingTypeMeta(nextEvent.bookingType, t) : null;
  const HeroTypeIcon = heroTypeMeta?.Icon || User;
  const summaryPalette = summaryEvent
    ? getBookingPalette(summaryEvent.bookingType, summaryIsLive)
    : getBookingPalette('felles', false);
  const summaryTypeMeta = summaryEvent
    ? getBookingTypeMeta(summaryEvent.bookingType, t)
    : getBookingTypeMeta('felles', t);
  const SummaryTypeIcon = summaryTypeMeta.Icon;

  const typeCounts = useMemo(() => {
    const initial = { felles: 0, service: 0, private: 0, aufguss: 0 };
    todayEvents.forEach((event) => {
      const key = event.bookingType in initial ? event.bookingType : 'felles';
      initial[key] += 1;
    });
    return initial;
  }, [todayEvents]);

  const typeCountRows = [
    { type: 'felles', count: typeCounts.felles },
    { type: 'service', count: typeCounts.service },
    { type: 'private', count: typeCounts.private },
  ];
  if (typeCounts.aufguss > 0) {
    typeCountRows.push({ type: 'aufguss', count: typeCounts.aufguss });
  }

  const { tomorrowStartMs } = getDayBounds(clockMs);
  const summaryIsTomorrow = !!summaryEvent && summaryEvent.startMs >= tomorrowStartMs;
  const summaryDayLabel = summaryIsTomorrow
    ? (t('calendar.tomorrow') || 'Tomorrow')
    : (t('calendar.today') || 'Today');

  const listTodayEvents = todayEvents.filter((event) => {
    if (summaryEvent && event.id === summaryEvent.id) return false;
    return event.endMs > clockMs;
  });
  const listTomorrowEvents = tomorrowEvents.filter((event) => {
    if (summaryEvent && event.id === summaryEvent.id) return false;
    return true;
  });

  const renderEventItem = (event) => {
    const live = event.startMs <= clockMs && clockMs < event.endMs;
    const relative = live
      ? (t('calendarBooking.inProgress') || 'In progress')
      : `${t('calendarBooking.startsIn') || 'Starts in'} ${formatRelative(event.startMs, clockMs)}`;
    const typeMeta = getBookingTypeMeta(event.bookingType, t);
    const ItemTypeIcon = typeMeta.Icon;
    const itemPalette = getBookingPalette(event.bookingType, live);
    const statusLabel = live ? (t('calendarBooking.live') || 'Live') : typeMeta.label;

    return (
      <div
        key={event.id}
        className="relative rounded-xl border pl-5 pr-3 py-2.5 overflow-hidden"
        style={{
          borderColor: itemPalette.softBorder,
          backgroundColor: 'var(--glass-bg-hover)',
          backgroundImage: `linear-gradient(130deg, ${itemPalette.softBg} 0%, rgba(0,0,0,0) 58%)`,
          boxShadow: live ? `0 0 0 1px ${itemPalette.softBorder} inset` : 'none',
        }}
      >
        <span
          className="absolute left-0 top-2 bottom-2 w-1.5 rounded-r-full"
          style={{ backgroundColor: itemPalette.color }}
        />
        <div className="flex items-center justify-between gap-2">
          <div className="inline-flex items-center gap-2 text-[10px] uppercase tracking-widest font-bold text-[var(--text-secondary)]">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border" style={{ color: itemPalette.color, borderColor: itemPalette.softBorder, backgroundColor: itemPalette.softBg }}>
              <ItemTypeIcon className="w-3 h-3" />
              {statusLabel}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Clock3 className="w-3.5 h-3.5" />
              {renderTimeRange(event)}
            </span>
          </div>
          <div
            className="text-[10px] uppercase tracking-widest font-bold"
            style={{ color: live ? itemPalette.color : 'var(--text-secondary)' }}
          >
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
              {nextEvent && (
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest font-bold min-w-0">
                  <span
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-full border truncate"
                    style={{
                      color: heroPalette?.color || 'var(--text-secondary)',
                      borderColor: heroPalette?.softBorder || 'var(--glass-border)',
                      backgroundColor: heroPalette?.softBg || 'var(--glass-bg)',
                    }}
                  >
                    <HeroTypeIcon className="w-3 h-3 shrink-0" />
                    <span className="truncate">{heroTypeMeta?.label || (t('calendarBooking.type.standard') || 'Regular')}</span>
                  </span>
                </div>
              )}
              <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-[var(--text-secondary)]">
                <span className="px-2 py-1 rounded-full border border-[var(--glass-border)] bg-[var(--glass-bg)]">{t('calendar.today') || 'Today'} {todayEvents.length}</span>
              </div>
            </div>
          ) : (
            <>
              {summaryEvent && (
                <div className="rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] px-3 py-2.5">
                  <div className="text-[10px] uppercase tracking-widest text-[var(--text-secondary)] font-bold mb-1">
                    {summaryDayLabel}
                  </div>
                  <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest font-bold min-w-0">
                    <span
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border"
                      style={{
                        color: summaryPalette.color,
                        borderColor: summaryPalette.softBorder,
                        backgroundColor: summaryPalette.softBg,
                      }}
                    >
                      <SummaryTypeIcon className="w-3 h-3 shrink-0" />
                      {summaryIsLive ? (t('calendarBooking.inProgress') || 'In progress') : summaryTypeMeta.label}
                    </span>
                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border border-[var(--glass-border)] bg-[var(--glass-bg-hover)] text-[var(--text-secondary)]">
                      <Clock3 className="w-3.5 h-3.5" />
                      {renderTimeRange(summaryEvent)}
                    </span>
                    <span className="ml-auto text-[10px] text-[var(--text-secondary)] truncate max-w-[46%]">
                      {nextStatus}
                    </span>
                  </div>
                  <div className="mt-1.5 text-base font-semibold text-[var(--text-primary)] truncate">
                    {summaryEvent.summary}
                  </div>
                </div>
              )}

              <div
                className="relative overflow-hidden rounded-2xl border bg-[var(--glass-bg)] p-3.5"
                style={summaryEvent
                  ? {
                    borderColor: summaryPalette.softBorder,
                    backgroundImage: `linear-gradient(130deg, ${summaryPalette.softBg} 0%, rgba(0,0,0,0) 56%)`,
                  }
                  : undefined}
              >
                {summaryEvent ? (
                  <>
                    <div className="relative rounded-xl overflow-hidden">
                      <span
                        className="absolute -top-8 -right-8 w-28 h-28 rounded-full blur-3xl pointer-events-none"
                        style={{
                          backgroundColor: summaryPalette.softBg,
                          opacity: 0.95,
                        }}
                      />
                      <div className="mt-1 text-center">
                        <div className="text-[50px] leading-none font-semibold tabular-nums text-[var(--text-secondary)]">
                          {todayEvents.length}
                        </div>
                        <div className="mt-1 text-[13px] text-[var(--text-secondary)]">
                          {t('calendarBooking.todayCountLabel') || 'Bookings today'}
                        </div>
                      </div>

                      <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-2">
                        {typeCountRows.map((row) => {
                          const rowMeta = getBookingTypeMeta(row.type, t);
                          const rowPalette = getBookingPalette(row.type, false);
                          const RowIcon = rowMeta.Icon;
                          return (
                            <div key={row.type} className="rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg-hover)] px-2.5 py-2 inline-flex items-center justify-between gap-2 min-w-0">
                              <span className="text-[12px] font-semibold tabular-nums text-[var(--text-secondary)] shrink-0">{row.count}x</span>
                              <span
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] uppercase tracking-[0.1em] font-bold min-w-0"
                                style={{
                                  color: rowPalette.color,
                                  borderColor: rowPalette.softBorder,
                                  backgroundColor: rowPalette.softBg,
                                }}
                              >
                                <RowIcon className="w-3 h-3 shrink-0" />
                                <span className="truncate">{rowMeta.label}</span>
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="text-sm text-[var(--text-secondary)]">
                    {loading ? (t('common.loading') || 'Loading...') : (t('calendar.noEvents') || 'No upcoming events')}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 gap-3 min-h-0 flex-1">
                <div className="min-h-0 rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg)] p-3 flex flex-col">
                  <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar pr-1 space-y-2">
                    {upcomingEvents.length === 0 ? (
                      <div className="text-xs text-[var(--text-secondary)]">{t('calendar.noEvents') || 'No upcoming events'}</div>
                    ) : (
                      <>
                        {listTodayEvents.length > 0 && (
                          <>
                            <div className="text-[10px] uppercase tracking-widest font-bold text-[var(--text-secondary)]">
                              {t('calendar.today') || 'Today'}
                            </div>
                            {listTodayEvents.map(renderEventItem)}
                          </>
                        )}
                        {listTomorrowEvents.length > 0 && (
                          <>
                            <div className="pt-1 text-[10px] uppercase tracking-widest font-bold text-[var(--text-secondary)]">
                              {t('calendar.tomorrow') || 'Tomorrow'}
                            </div>
                            {listTomorrowEvents.map(renderEventItem)}
                          </>
                        )}
                      </>
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
