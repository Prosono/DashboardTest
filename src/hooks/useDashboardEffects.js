import { useState, useEffect, useRef } from 'react';
import {
  ENTITY_UPDATE_INTERVAL,
  MEDIA_TICK_INTERVAL,
  INITIAL_FETCH_DELAY,
} from '../config/constants';

/**
 * Miscellaneous App-level side-effects that don't belong in a specific domain:
 *   – `now` clock tick
 *   – media-tick timer
 *   – optimistic-light-brightness clear
 *   – haptic-feedback listener
 *   – document-title / favicon / viewport meta
 *   – inactivity/idle auto-reset timer
 */
export function useDashboardEffects({
  resolvedHeaderTitle,
  inactivityTimeout,
  resetToHome,
  activeMediaModal,
  entities,
}) {
  const [now, setNow] = useState(new Date());
  const [mediaTick, setMediaTick] = useState(0);
  const [optimisticLightBrightness, setOptimisticLightBrightness] = useState({});

  // ── Stable ref so the inactivity timer always calls the latest resetToHome
  const resetToHomeRef = useRef(resetToHome);
  useEffect(() => {
    resetToHomeRef.current = resetToHome;
  });

  // ── Clock tick ─────────────────────────────────────────────────────────
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), ENTITY_UPDATE_INTERVAL);
    return () => clearInterval(id);
  }, []);

  // ── Media tick (only while a media modal is open) ──────────────────────
  useEffect(() => {
    if (!activeMediaModal) return;
    setMediaTick(Date.now());
    const id = setInterval(() => setMediaTick(Date.now()), MEDIA_TICK_INTERVAL);
    return () => clearInterval(id);
  }, [activeMediaModal]);

  // ── Clear optimistic brightness when real entity state arrives ─────────
  useEffect(() => {
    const id = setTimeout(() => setOptimisticLightBrightness({}), INITIAL_FETCH_DELAY);
    return () => clearTimeout(id);
  }, [entities]);

  // ── Haptic feedback on touch ───────────────────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      if (e.pointerType !== 'touch' && e.pointerType !== 'pen') return;
      if (!e.target?.closest?.('[data-haptic]')) return;
      if (navigator.vibrate) navigator.vibrate(8);
    };
    document.addEventListener('pointerdown', handler);
    return () => document.removeEventListener('pointerdown', handler);
  }, []);

  // ── Document title, favicon & viewport meta ────────────────────────────
  useEffect(() => {
    const browserTitle = 'Smart Sauna';
    document.title = browserTitle;

    let link = document.querySelector("link[rel~='icon']");
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.type = 'image/png';
    link.href = '/favicon.png';

    let shortcutIcon = document.querySelector("link[rel='shortcut icon']");
    if (!shortcutIcon) {
      shortcutIcon = document.createElement('link');
      shortcutIcon.rel = 'shortcut icon';
      document.head.appendChild(shortcutIcon);
    }
    shortcutIcon.type = 'image/png';
    shortcutIcon.href = '/favicon.png';

    let meta = document.querySelector("meta[name='viewport']");
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'viewport';
      document.head.appendChild(meta);
    }
    meta.content = 'width=device-width, initial-scale=1.0, viewport-fit=cover';
  }, [resolvedHeaderTitle]);

  // ── Inactivity / idle timer ────────────────────────────────────────────
  useEffect(() => {
    let timer;
    const reset = () => {
      clearTimeout(timer);
      if (!inactivityTimeout || inactivityTimeout <= 0) return;
      timer = setTimeout(() => {
        if (resetToHomeRef.current) resetToHomeRef.current();
      }, inactivityTimeout * 1000);
    };
    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];
    events.forEach((e) => document.addEventListener(e, reset));
    reset();
    return () => {
      clearTimeout(timer);
      events.forEach((e) => document.removeEventListener(e, reset));
    };
  }, [inactivityTimeout]);

  return {
    now,
    mediaTick,
    optimisticLightBrightness,
    setOptimisticLightBrightness,
  };
}
