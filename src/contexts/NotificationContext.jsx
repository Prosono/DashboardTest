import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { AlertTriangle, AlertCircle, Bell, Check, X } from '../icons';

const MAX_NOTIFICATIONS = 40;
const DEFAULT_DURATION_MS = 7000;
const LocalNotifications = registerPlugin('LocalNotifications');

const NotificationContext = createContext(null);

const nowIso = () => new Date().toISOString();

const levelTone = (level) => {
  switch (String(level || '').toLowerCase()) {
    case 'critical':
    case 'error':
      return {
        border: 'rgba(244, 63, 94, 0.38)',
        bg: 'rgba(244, 63, 94, 0.12)',
        icon: 'text-rose-300',
        IconComp: AlertTriangle,
      };
    case 'warning':
      return {
        border: 'rgba(245, 158, 11, 0.35)',
        bg: 'rgba(245, 158, 11, 0.12)',
        icon: 'text-amber-300',
        IconComp: AlertTriangle,
      };
    case 'success':
      return {
        border: 'rgba(16, 185, 129, 0.34)',
        bg: 'rgba(16, 185, 129, 0.11)',
        icon: 'text-emerald-300',
        IconComp: Check,
      };
    default:
      return {
        border: 'rgba(96, 165, 250, 0.34)',
        bg: 'rgba(96, 165, 250, 0.11)',
        icon: 'text-blue-300',
        IconComp: AlertCircle,
      };
  }
};

const isNativePlatform = () => {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
};

const canUseBrowserNotification = () => typeof window !== 'undefined' && typeof Notification !== 'undefined';

const maybeSendBrowserNotification = async ({ title, message, browserOnlyWhenBackground = true }) => {
  if (!canUseBrowserNotification()) return false;
  try {
    if (Notification.permission === 'granted') {
      if (
        browserOnlyWhenBackground
        && typeof document !== 'undefined'
        && document.visibilityState === 'visible'
      ) return false;
      new Notification(String(title || 'Notification'), { body: String(message || '') });
      return true;
    }
    if (Notification.permission === 'default' && typeof Notification.requestPermission === 'function') {
      const status = await Notification.requestPermission();
      if (status === 'granted') {
        if (
          browserOnlyWhenBackground
          && typeof document !== 'undefined'
          && document.visibilityState === 'visible'
        ) return false;
        new Notification(String(title || 'Notification'), { body: String(message || '') });
        return true;
      }
    }
  } catch {
    return false;
  }
  return false;
};

const maybeSendNativeNotification = async ({ title, message }) => {
  if (!isNativePlatform()) return false;
  try {
    if (!LocalNotifications?.checkPermissions || !LocalNotifications?.requestPermissions || !LocalNotifications?.schedule) {
      return false;
    }
    const checked = await LocalNotifications.checkPermissions();
    const initial = checked?.display || checked?.receive || 'prompt';
    let granted = initial === 'granted';
    if (!granted) {
      const requested = await LocalNotifications.requestPermissions();
      const requestedDisplay = requested?.display || requested?.receive || 'denied';
      granted = requestedDisplay === 'granted';
    }
    if (!granted) return false;
    const nativeId = Date.now() % 2147483647;
    await LocalNotifications.schedule({
      notifications: [
        {
          id: nativeId,
          title: String(title || 'Notification'),
          body: String(message || ''),
          schedule: { at: new Date(Date.now() + 100) },
        },
      ],
    });
    return true;
  } catch {
    return false;
  }
};

const NotificationViewport = ({ notifications, onDismiss }) => {
  if (!notifications.length) return null;
  return (
    <div className="fixed top-4 right-4 left-4 sm:left-auto sm:w-[min(360px,92vw)] z-[80] pointer-events-none space-y-2">
      {notifications.map((entry) => {
        const tone = levelTone(entry.level);
        const IconComp = tone.IconComp || Bell;
        return (
          <div
            key={entry.id}
            className="pointer-events-auto rounded-xl border px-3 py-2.5 shadow-xl backdrop-blur-lg"
            style={{
              borderColor: tone.border,
              backgroundColor: 'color-mix(in srgb, var(--card-bg) 88%, transparent)',
              boxShadow: '0 10px 30px rgba(0,0,0,0.26)',
            }}
          >
            <div className="flex items-start gap-2.5">
              <div
                className="shrink-0 w-7 h-7 rounded-lg border flex items-center justify-center"
                style={{ borderColor: tone.border, backgroundColor: tone.bg }}
              >
                <IconComp className={`w-4 h-4 ${tone.icon}`} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs uppercase tracking-widest font-bold text-[var(--text-secondary)] truncate">
                  {entry.title}
                </div>
                {entry.message ? (
                  <div className="mt-0.5 text-sm leading-snug text-[var(--text-primary)] break-words">
                    {entry.message}
                  </div>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => onDismiss(entry.id)}
                className="shrink-0 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                aria-label="Dismiss notification"
                title="Dismiss"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export const NotificationProvider = ({ children }) => {
  const [notifications, setNotifications] = useState([]);
  const timersRef = useRef(new Map());

  const dismissNotification = useCallback((id) => {
    setNotifications((prev) => prev.filter((entry) => entry.id !== id));
    const timer = timersRef.current.get(id);
    if (timer) {
      window.clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  const notify = useCallback(async ({
    title,
    message = '',
    level = 'info',
    inApp = true,
    browser = true,
    native = true,
    browserOnlyWhenBackground = true,
    durationMs = DEFAULT_DURATION_MS,
    persistent = false,
  }) => {
    const id = `${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
    const payload = {
      id,
      title: String(title || 'Notification'),
      message: String(message || ''),
      level,
      createdAt: nowIso(),
    };

    if (inApp) {
      setNotifications((prev) => [payload, ...prev].slice(0, MAX_NOTIFICATIONS));
      if (!persistent && Number.isFinite(Number(durationMs)) && Number(durationMs) > 0) {
        const timeoutId = window.setTimeout(() => dismissNotification(id), Number(durationMs));
        timersRef.current.set(id, timeoutId);
      }
    }

    if (browser) {
      void maybeSendBrowserNotification({ ...payload, browserOnlyWhenBackground });
    }
    if (native) {
      void maybeSendNativeNotification(payload);
    }
    return id;
  }, [dismissNotification]);

  const clearNotifications = useCallback(() => {
    setNotifications([]);
    timersRef.current.forEach((timerId) => window.clearTimeout(timerId));
    timersRef.current.clear();
  }, []);

  const value = useMemo(() => ({
    notifications,
    notify,
    dismissNotification,
    clearNotifications,
  }), [notifications, notify, dismissNotification, clearNotifications]);

  return (
    <NotificationContext.Provider value={value}>
      {children}
      <NotificationViewport notifications={notifications} onDismiss={dismissNotification} />
    </NotificationContext.Provider>
  );
};

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within NotificationProvider');
  }
  return context;
};
