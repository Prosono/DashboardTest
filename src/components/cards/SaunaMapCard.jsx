import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Activity, AlertTriangle, Flame, MapPin, Thermometer } from '../../icons';
import { getIconComponent } from '../../icons';

const ACTIVE_STATES = new Set(['on', 'true', '1', 'yes', 'active', 'booked', 'occupied', 'aktiv', 'heat', 'heating']);
const SERVICE_STATES = new Set(['ja', 'yes', 'service', 'on', 'true', '1']);
const STOP_TOKENS = new Set([
  'badstu',
  'badstue',
  'badstove',
  'sauna',
  'sone',
  'zone',
  'sensor',
  'temperature',
  'temperatur',
  'temp',
  'health',
  'score',
  'kort',
  'card',
]);

const NORWAY_CENTER = [60.472, 8.4689];

const toNum = (value) => {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const roundToOne = (value) => Math.round(Number(value) * 10) / 10;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const normalizeState = (value) => String(value ?? '').trim().toLowerCase();

const isActiveState = (value, fallbackStates = ACTIVE_STATES) => fallbackStates.has(normalizeState(value));

const isServiceState = (value, fallbackStates = SERVICE_STATES) => fallbackStates.has(normalizeState(value));

const parseStateSet = (rawValue, fallback) => {
  if (!Array.isArray(rawValue) || rawValue.length === 0) return fallback;
  const parsed = rawValue.map((item) => normalizeState(item)).filter(Boolean);
  return parsed.length ? new Set(parsed) : fallback;
};

const makeTr = (t) => (key, fallback) => {
  const out = typeof t === 'function' ? t(key) : undefined;
  const str = String(out ?? '').trim();
  if (!str || str === key || str.toLowerCase() === key.toLowerCase() || str.includes('.')) return fallback;
  return str;
};

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}[char]));

const normalizeMatchText = (value) => String(value ?? '')
  .trim()
  .toLowerCase()
  .replace(/æ/g, 'ae')
  .replace(/ø/g, 'o')
  .replace(/å/g, 'a')
  .replace(/[^a-z0-9]+/g, ' ');

const tokenize = (value) => normalizeMatchText(value)
  .split(/\s+/)
  .map((token) => token.trim())
  .filter((token) => token.length > 1 && !STOP_TOKENS.has(token));

const compactTokens = (value) => tokenize(value).join('');

const extractCardId = (settingsKey) => {
  const parts = String(settingsKey || '').split('::');
  return parts[parts.length - 1] || String(settingsKey || '');
};

const getEntityName = (entities, entityId) => {
  if (!entityId) return '';
  return entities?.[entityId]?.attributes?.friendly_name || entityId;
};

const getCardName = ({ cardId, settings, entities, customNames, fallback }) => {
  const tempName = getEntityName(entities, settings?.tempEntityId);
  return customNames?.[cardId]
    || settings?.name
    || settings?.heading
    || settings?.title
    || tempName
    || fallback
    || cardId;
};

const isAbsoluteImageUrl = (value) => /^(https?:|data:|blob:)/i.test(String(value || '').trim());

const shouldResolveWithHaBase = (value) => /^\/(?:api|local|media)\//i.test(String(value || '').trim());

const resolveImageValue = (value, getEntityImageUrl, { forceHaBase = false } = {}) => {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  if (isAbsoluteImageUrl(raw)) return raw;
  if (typeof getEntityImageUrl === 'function' && (forceHaBase || shouldResolveWithHaBase(raw))) {
    return getEntityImageUrl(raw);
  }
  return raw;
};

const resolveImageUrl = (settings, entities, getEntityImageUrl) => {
  const raw = String(settings?.imageUrl ?? '').trim();
  if (raw) return resolveImageValue(raw, getEntityImageUrl);
  if (settings?.imageEntityId) {
    const ent = entities?.[settings.imageEntityId];
    const pic = ent?.attributes?.entity_picture;
    if (pic) return resolveImageValue(pic, getEntityImageUrl, { forceHaBase: true });
    const state = String(ent?.state ?? '');
    if (isAbsoluteImageUrl(state) || state.startsWith('/')) {
      return resolveImageValue(state, getEntityImageUrl, { forceHaBase: state.startsWith('/') });
    }
  }
  return null;
};

const parseSampleTimestamp = (entry) => {
  const raw = entry?.timestamp || entry?.time || entry?.last_changed || entry?.last_updated;
  const timestampMs = Date.parse(String(raw || '').trim());
  return Number.isFinite(timestampMs) ? timestampMs : null;
};

const calcDeviationPct = (temp, target) => {
  const tempNum = toNum(temp);
  const targetNum = toNum(target);
  if (tempNum === null || targetNum === null || Math.abs(targetNum) < 0.001) return null;
  return roundToOne(((tempNum - targetNum) / targetNum) * 100);
};

const calcScoreFromDeviationPct = (deviationPct) => {
  const parsed = toNum(deviationPct);
  if (parsed === null) return null;
  return clamp(Math.round(100 - Math.abs(parsed)), 0, 100);
};

const normalizeSamples = (rawValue) => {
  if (!Array.isArray(rawValue)) return [];
  return rawValue
    .map((entry) => {
      const timestampMs = parseSampleTimestamp(entry);
      const startTemp = toNum(entry?.startTemp ?? entry?.temperature ?? entry?.temp);
      if (!Number.isFinite(timestampMs) || startTemp === null) return null;
      const targetTemp = toNum(entry?.targetTemp);
      const providedDeviationPct = toNum(entry?.deviationPct ?? entry?.deviationPercent);
      return {
        timestampMs,
        startTemp,
        targetTemp,
        deviationPct: providedDeviationPct !== null ? roundToOne(providedDeviationPct) : calcDeviationPct(startTemp, targetTemp),
        bookingType: String(entry?.bookingType || 'regular').toLowerCase(),
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.timestampMs - b.timestampMs);
};

const computeHealthScore = (settings) => {
  const snapshots = normalizeSamples(settings?.healthSnapshots || settings?.bookingSnapshots);
  if (!snapshots.length) return null;

  const summaryHours = clamp(Number(settings?.summaryHours) || 48, 6, 168);
  const windowStart = Date.now() - (summaryHours * 60 * 60 * 1000);
  const recent = snapshots.filter((entry) => entry.timestampMs >= windowStart && entry.bookingType !== 'service');
  const targetSamples = (recent.length ? recent : snapshots)
    .filter((entry) => entry.deviationPct !== null);

  if (!targetSamples.length) return null;

  const scores = targetSamples
    .map((entry) => calcScoreFromDeviationPct(entry.deviationPct))
    .filter((score) => Number.isFinite(Number(score)));

  if (!scores.length) return null;
  return Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length);
};

const getScoreTone = (score) => {
  if (!Number.isFinite(Number(score))) return 'unknown';
  if (Number(score) >= 90) return 'good';
  if (Number(score) >= 70) return 'warn';
  return 'bad';
};

const formatTemp = (value) => {
  const num = toNum(value);
  return num === null ? '--' : `${num.toFixed(1)}°`;
};

const formatScore = (score) => (Number.isFinite(Number(score)) ? `${Math.round(Number(score))}` : '--');

const formatPeopleCount = (value) => {
  const raw = String(value ?? '').trim();
  if (!raw || ['unknown', 'unavailable', 'none', 'null'].includes(raw.toLowerCase())) return '0';
  const parsed = Number.parseFloat(raw.replace(',', '.'));
  if (Number.isFinite(parsed)) return `${Math.max(0, Math.round(parsed))}`;
  return raw.slice(0, 3);
};

const getZoneCoordinates = (zoneEntity) => {
  const attrs = zoneEntity?.attributes || {};
  const lat = toNum(attrs.latitude ?? attrs.lat);
  const lng = toNum(attrs.longitude ?? attrs.lng ?? attrs.lon);
  if (lat === null || lng === null) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
};

const buildTextScore = (zoneTexts, sourceTexts) => {
  const zoneTokens = new Set(zoneTexts.flatMap((value) => tokenize(value)));
  const sourceTokens = new Set(sourceTexts.flatMap((value) => tokenize(value)));
  if (!zoneTokens.size || !sourceTokens.size) return 0;

  let score = 0;
  zoneTokens.forEach((token) => {
    if (sourceTokens.has(token)) score += token.length >= 4 ? 3 : 2;
  });

  const zoneCompact = zoneTexts.map((value) => compactTokens(value)).filter(Boolean);
  const sourceCompact = sourceTexts.map((value) => compactTokens(value)).filter(Boolean);
  zoneCompact.forEach((zoneValue) => {
    sourceCompact.forEach((sourceValue) => {
      if (!zoneValue || !sourceValue) return;
      if (zoneValue === sourceValue) score += 8;
      else if (zoneValue.length >= 4 && sourceValue.includes(zoneValue)) score += 5;
      else if (sourceValue.length >= 4 && zoneValue.includes(sourceValue)) score += 4;
    });
  });

  return score;
};

const chooseBestSource = (zone, sources) => {
  let best = null;
  sources.forEach((source) => {
    if (source.zoneEntityId) {
      if (source.zoneEntityId === zone.zoneId) {
        best = { source, score: 100 };
      }
      return;
    }

    const score = buildTextScore(zone.matchTexts, source.matchTexts);
    if (score <= 0) return;
    if (!best || score > best.score) best = { source, score };
  });

  return best?.score >= 3 ? best.source : null;
};

const chooseTemperatureEntity = (zone, temperatureEntities) => {
  let best = null;
  temperatureEntities.forEach((entry) => {
    const score = buildTextScore(zone.matchTexts, entry.matchTexts);
    if (score <= 0) return;
    if (!best || score > best.score) best = { ...entry, score };
  });
  return best?.score >= 3 ? best : null;
};

const getSourceKind = (cardId, settings) => {
  if (settings?.type === 'sauna') return 'sauna';
  if (settings?.type === 'sauna_health_score') return 'health';
  if (settings?.type === 'sauna_booking_temp') return 'booking';
  if (cardId.startsWith('sauna_card_')) return 'sauna';
  if (cardId.startsWith('sauna_health_score_card_')) return 'health';
  if (cardId.startsWith('sauna_booking_temp_card_')) return 'booking';
  return null;
};

const getSettingsPageId = (settingsKey) => {
  const parts = String(settingsKey || '').split('::');
  return parts.length > 1 ? parts[0] : '';
};

const buildSourceCards = ({ cardSettings, entities, customNames, tr, getEntityImageUrl }) => {
  const byCardId = new Map();
  Object.entries(cardSettings || {}).forEach(([settingsKey, value]) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return;
    const cardId = extractCardId(settingsKey);
    const existing = byCardId.get(cardId);
    byCardId.set(cardId, {
      cardId,
      settingsKey: existing?.settingsKey || settingsKey,
      pageId: existing?.pageId || getSettingsPageId(settingsKey),
      settings: { ...(existing?.settings || {}), ...value },
    });
  });

  return Array.from(byCardId.values())
    .map(({ cardId, settingsKey, pageId, settings }) => {
      const kind = getSourceKind(cardId, settings);
      if (!kind) return null;
      const tempEntityId = settings?.tempEntityId || '';
      const tempEntity = tempEntityId ? entities?.[tempEntityId] : null;
      const activeEntityId = settings?.saunaActiveBooleanEntityId || settings?.bookingActiveEntityId || '';
      const activeEntity = activeEntityId ? entities?.[activeEntityId] : null;
      const serviceEntityId = settings?.serviceEntityId || '';
      const serviceEntity = serviceEntityId ? entities?.[serviceEntityId] : null;
      const peopleNowEntityId = settings?.peopleNowEntityId || '';
      const peopleNowEntity = peopleNowEntityId ? entities?.[peopleNowEntityId] : null;
      const activeStates = parseStateSet(settings?.activeOnStates, ACTIVE_STATES);
      const serviceStates = parseStateSet(settings?.serviceOnStates, SERVICE_STATES);
      const name = getCardName({
        cardId,
        settings,
        entities,
        customNames,
        fallback: kind === 'sauna' ? tr('sauna.name', 'Sauna') : tr('sauna.healthScore.title', 'Sauna health score'),
      });

      return {
        kind,
        cardId,
        settingsKey,
        pageId,
        name,
        imageUrl: resolveImageUrl(settings, entities, getEntityImageUrl),
        zoneEntityId: settings?.zoneEntityId || settings?.locationZoneEntityId || '',
        tempEntityId,
        currentTemp: toNum(tempEntity?.state),
        healthScore: kind === 'health' || kind === 'booking' ? computeHealthScore(settings) : null,
        peopleNow: kind === 'sauna' ? (peopleNowEntity?.state ?? '0') : null,
        active: activeEntity ? isActiveState(activeEntity.state, activeStates) : false,
        service: serviceEntity ? isServiceState(serviceEntity.state, serviceStates) : false,
        matchTexts: [
          cardId,
          name,
          settings?.heading,
          settings?.name,
          getEntityName(entities, tempEntityId),
          getEntityName(entities, activeEntityId),
          getEntityName(entities, peopleNowEntityId),
        ].filter(Boolean),
      };
    })
    .filter(Boolean);
};

const makeMarkerHtml = (location) => {
  const tone = getScoreTone(location.healthScore);
  const score = Number.isFinite(Number(location.healthScore))
    ? clamp(Math.round(Number(location.healthScore)), 0, 100)
    : null;
  const scoreDeg = score !== null ? `${score * 3.6}deg` : '0deg';
  const tempLabel = location.currentTemp !== null ? `${Math.round(location.currentTemp)}°` : '--';
  const peopleLabel = formatPeopleCount(location.peopleNow);
  const imageHtml = location.imageUrl
    ? `<span class="sauna-map-marker__fallback">${escapeHtml(peopleLabel)}</span><img src="${escapeHtml(location.imageUrl)}" alt="" class="sauna-map-marker__image" draggable="false" />`
    : `<span class="sauna-map-marker__fallback">${escapeHtml(peopleLabel)}</span>`;
  return `
    <div class="sauna-map-marker sauna-map-marker--${tone}" title="${escapeHtml(location.name)}" style="--score-deg: ${scoreDeg}">
      <span class="sauna-map-marker__glow"></span>
      <span class="sauna-map-marker__portrait">
        <span class="sauna-map-marker__ring">
          <span class="sauna-map-marker__inner">
            ${imageHtml}
          </span>
        </span>
        <span class="sauna-map-marker__score">${escapeHtml(formatScore(location.healthScore))}</span>
      </span>
      <span class="sauna-map-marker__temp">${escapeHtml(tempLabel)}</span>
    </div>
  `;
};

export default function SaunaMapCard({
  cardId,
  settings,
  entities,
  cardSettings,
  dragProps,
  controls,
  cardStyle,
  editMode,
  customNames,
  customIcons,
  getEntityImageUrl,
  setShowPopupCardModal,
  t,
}) {
  const tr = useMemo(() => makeTr(t), [t]);
  const mapRef = useRef(null);
  const mapElRef = useRef(null);
  const markerLayerRef = useRef(null);
  const resizeObserverRef = useRef(null);
  const lastFitBoundsKeyRef = useRef('');
  const [selectedZoneId, setSelectedZoneId] = useState(null);

  const cardName = customNames?.[cardId] || settings?.name || settings?.heading || tr('saunaMap.title', 'Sauna map');
  const iconName = customIcons?.[cardId] || settings?.icon;
  const HeaderIcon = iconName ? (getIconComponent(iconName) || MapPin) : MapPin;

  const sourceCards = useMemo(() => buildSourceCards({
    cardSettings,
    entities,
    customNames,
    getEntityImageUrl,
    tr,
  }), [cardSettings, customNames, entities, getEntityImageUrl, tr]);

  const saunaSources = useMemo(() => sourceCards.filter((source) => source.kind === 'sauna'), [sourceCards]);
  const healthSources = useMemo(() => sourceCards.filter((source) => source.kind === 'health'), [sourceCards]);
  const bookingSources = useMemo(() => sourceCards.filter((source) => source.kind === 'booking'), [sourceCards]);

  const temperatureEntities = useMemo(() => Object.entries(entities || {})
    .filter(([id, entity]) => {
      if (!id.startsWith('sensor.') && !id.startsWith('number.') && !id.startsWith('input_number.')) return false;
      const deviceClass = String(entity?.attributes?.device_class || '').toLowerCase();
      const lowerId = id.toLowerCase();
      return deviceClass === 'temperature' || lowerId.includes('temperature') || lowerId.includes('temp');
    })
    .map(([id, entity]) => ({
      entityId: id,
      currentTemp: toNum(entity?.state),
      matchTexts: [id, entity?.attributes?.friendly_name].filter(Boolean),
    }))
    .filter((entry) => entry.currentTemp !== null), [entities]);

  const locations = useMemo(() => {
    const selectedZones = Array.isArray(settings?.zoneEntityIds)
      ? settings.zoneEntityIds.map((id) => String(id || '').trim()).filter(Boolean)
      : [];
    const selectedSet = new Set(selectedZones);

    return Object.entries(entities || {})
      .filter(([id]) => id.startsWith('zone.'))
      .map(([zoneId, zoneEntity]) => {
        const coordinates = getZoneCoordinates(zoneEntity);
        if (!coordinates) return null;
        if (selectedSet.size && !selectedSet.has(zoneId)) return null;
        const name = zoneEntity?.attributes?.friendly_name || zoneId.replace(/^zone\./, '');
        const zone = {
          zoneId,
          entity: zoneEntity,
          name,
          lat: coordinates.lat,
          lng: coordinates.lng,
          radius: toNum(zoneEntity?.attributes?.radius),
          matchTexts: [zoneId, name].filter(Boolean),
        };

        const saunaSource = chooseBestSource(zone, saunaSources);
        const healthByTemp = saunaSource?.tempEntityId
          ? healthSources.find((source) => source.tempEntityId && source.tempEntityId === saunaSource.tempEntityId)
          : null;
        const healthSource = healthByTemp || chooseBestSource(zone, healthSources);
        const bookingByTemp = saunaSource?.tempEntityId
          ? bookingSources.find((source) => source.tempEntityId && source.tempEntityId === saunaSource.tempEntityId)
          : null;
        const bookingSource = bookingByTemp || chooseBestSource(zone, bookingSources);
        const tempFallback = chooseTemperatureEntity(zone, temperatureEntities);
        const tempSource = saunaSource || healthSource || bookingSource;
        const currentTemp = tempSource?.currentTemp ?? tempFallback?.currentTemp ?? null;
        const healthScore = healthSource?.healthScore ?? bookingSource?.healthScore ?? null;
        const active = Boolean(saunaSource?.active || healthSource?.active || bookingSource?.active);
        const service = Boolean(saunaSource?.service || healthSource?.service || bookingSource?.service);
        const matchedName = saunaSource?.name || healthSource?.name || bookingSource?.name || tempFallback?.entityId || '';
        const imageUrl = saunaSource?.imageUrl || healthSource?.imageUrl || bookingSource?.imageUrl || null;
        const targetCardId = saunaSource?.cardId || '';
        const targetPageId = saunaSource?.pageId || '';
        const peopleNow = saunaSource?.peopleNow ?? '0';

        return {
          ...zone,
          currentTemp,
          healthScore,
          active,
          service,
          matchedName,
          imageUrl,
          targetCardId,
          targetPageId,
          peopleNow,
          scoreTone: getScoreTone(healthScore),
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [bookingSources, entities, healthSources, saunaSources, settings?.zoneEntityIds, temperatureEntities]);

  const locationBoundsKey = useMemo(() => locations
    .map((location) => `${location.zoneId}:${location.lat.toFixed(5)},${location.lng.toFixed(5)}`)
    .join('|'), [locations]);

  const selectedLocation = locations.find((location) => location.zoneId === selectedZoneId) || locations[0] || null;
  const [brokenImageUrls, setBrokenImageUrls] = useState(() => new Set());
  const isBrokenImage = useCallback((url) => Boolean(url && brokenImageUrls.has(url)), [brokenImageUrls]);
  const markBrokenImage = useCallback((url) => {
    if (!url) return;
    setBrokenImageUrls((prev) => {
      if (prev.has(url)) return prev;
      const next = new Set(prev);
      next.add(url);
      return next;
    });
  }, []);

  const openLocation = useCallback((location) => {
    if (!location) return;
    setSelectedZoneId(location.zoneId);
    if (editMode || !location.targetCardId || typeof setShowPopupCardModal !== 'function') return;
    setShowPopupCardModal({
      targetCardId: location.targetCardId,
      targetPageId: location.targetPageId,
      sourceCardId: cardId,
      buttonLabel: location.matchedName || location.name,
    });
  }, [cardId, editMode, setShowPopupCardModal]);

  const stats = useMemo(() => {
    const temps = locations.map((location) => location.currentTemp).filter((value) => value !== null);
    const scores = locations.map((location) => location.healthScore).filter((value) => value !== null);
    const avgTemp = temps.length ? roundToOne(temps.reduce((sum, value) => sum + value, 0) / temps.length) : null;
    const avgScore = scores.length ? Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length) : null;
    return {
      avgTemp,
      avgScore,
      activeCount: locations.filter((location) => location.active).length,
      serviceCount: locations.filter((location) => location.service).length,
    };
  }, [locations]);

  useEffect(() => {
    if (typeof window === 'undefined' || !mapElRef.current || mapRef.current) return undefined;

    const map = L.map(mapElRef.current, {
      attributionControl: false,
      zoomControl: false,
      scrollWheelZoom: true,
      doubleClickZoom: true,
      dragging: true,
      tap: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap',
    }).addTo(map);

    L.control.zoom({ position: 'bottomleft' }).addTo(map);
    L.control.attribution({ prefix: false, position: 'bottomright' }).addTo(map);
    markerLayerRef.current = L.layerGroup().addTo(map);
    map.setView(NORWAY_CENTER, 5);
    mapRef.current = map;

    if (typeof ResizeObserver !== 'undefined') {
      resizeObserverRef.current = new ResizeObserver(() => {
        window.requestAnimationFrame(() => map.invalidateSize({ pan: false }));
      });
      resizeObserverRef.current.observe(mapElRef.current);
    }

    window.requestAnimationFrame(() => map.invalidateSize({ pan: false }));

    return () => {
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
        resizeObserverRef.current = null;
      }
      map.remove();
      mapRef.current = null;
      markerLayerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (editMode) {
      map.dragging.disable();
      map.touchZoom.disable();
      map.doubleClickZoom.disable();
      map.boxZoom.disable();
      map.keyboard.disable();
      map.scrollWheelZoom.disable();
    } else {
      map.dragging.enable();
      map.touchZoom.enable();
      map.doubleClickZoom.enable();
      map.boxZoom.enable();
      map.keyboard.enable();
      map.scrollWheelZoom.enable();
    }
  }, [editMode]);

  useEffect(() => {
    const map = mapRef.current;
    const layer = markerLayerRef.current;
    if (!map || !layer) return;

    layer.clearLayers();

    const bounds = L.latLngBounds([]);
    locations.forEach((location) => {
      const marker = L.marker([location.lat, location.lng], {
        icon: L.divIcon({
          className: 'sauna-map-marker-shell',
          html: makeMarkerHtml(location),
          iconSize: [88, 96],
          iconAnchor: [44, 38],
        }),
        title: location.name,
      });

      marker.on('click', () => {
        if (!editMode) openLocation(location);
      });
      marker.on('add', () => {
        const image = marker.getElement()?.querySelector?.('.sauna-map-marker__image');
        image?.addEventListener?.('error', () => image.remove(), { once: true });
      });
      marker.addTo(layer);
      bounds.extend([location.lat, location.lng]);
    });

    const shouldAutoFit = locationBoundsKey !== lastFitBoundsKeyRef.current;
    if (bounds.isValid() && shouldAutoFit) {
      map.fitBounds(bounds, { padding: [28, 28], maxZoom: 13 });
      lastFitBoundsKeyRef.current = locationBoundsKey;
    } else if (!bounds.isValid() && shouldAutoFit) {
      map.setView(NORWAY_CENTER, 5);
      lastFitBoundsKeyRef.current = locationBoundsKey;
    }

    window.requestAnimationFrame(() => map.invalidateSize({ pan: false }));
  }, [editMode, locationBoundsKey, locations, openLocation]);

  return (
    <div
      {...dragProps}
      className={`sauna-map-card touch-feedback relative h-full min-h-[320px] rounded-[2.2rem] border bg-[var(--glass-bg)] border-[var(--glass-border)] overflow-hidden transition-all duration-300 ${
        editMode ? 'cursor-move' : 'cursor-default'
      }`}
      style={cardStyle}
    >
      {controls}

      <div className="relative z-10 h-full flex flex-col gap-3 p-4 md:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest font-bold text-[var(--text-secondary)]">
              <HeaderIcon className="w-3.5 h-3.5" />
              {tr('saunaMap.kicker', 'HA zones')}
            </div>
            <h3 className="mt-1 text-base md:text-lg font-semibold text-[var(--text-primary)] truncate">
              {cardName}
            </h3>
          </div>

          <div className="grid grid-cols-2 gap-2 shrink-0 text-right">
            <div>
              <div className="text-[10px] uppercase tracking-widest font-bold text-[var(--text-secondary)]">
                {tr('saunaMap.avgTemp', 'Avg temp')}
              </div>
              <div className="text-lg font-semibold tabular-nums text-[var(--text-primary)]">
                {formatTemp(stats.avgTemp)}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-widest font-bold text-[var(--text-secondary)]">
                {tr('saunaMap.avgScore', 'Avg score')}
              </div>
              <div className={`text-lg font-semibold tabular-nums sauna-map-score sauna-map-score--${getScoreTone(stats.avgScore)}`}>
                {formatScore(stats.avgScore)}
              </div>
            </div>
          </div>
        </div>

        <div className="relative flex-1 min-h-[210px] rounded-2xl overflow-hidden border border-[var(--glass-border)] bg-[var(--glass-bg-hover)]">
          <div ref={mapElRef} className="absolute inset-0" aria-label={tr('saunaMap.mapLabel', 'Sauna locations map')} />

          <div className="absolute top-3 left-3 flex flex-wrap gap-2 pointer-events-none">
            <div className="sauna-map-chip">
              <Flame className="w-3.5 h-3.5 text-orange-300" />
              {locations.length} {tr('saunaMap.locations', 'locations')}
            </div>
            {stats.activeCount > 0 && (
              <div className="sauna-map-chip sauna-map-chip--active">
                <Activity className="w-3.5 h-3.5" />
                {stats.activeCount} {tr('sauna.active', 'Active')}
              </div>
            )}
            {stats.serviceCount > 0 && (
              <div className="sauna-map-chip sauna-map-chip--service">
                <AlertTriangle className="w-3.5 h-3.5" />
                {stats.serviceCount} {tr('sauna.service', 'Service')}
              </div>
            )}
          </div>

          {locations.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center p-6 text-center bg-[rgba(4,10,20,0.78)]">
              <div>
                <MapPin className="w-8 h-8 mx-auto text-[var(--text-secondary)] mb-3" />
                <div className="text-sm font-semibold text-[var(--text-primary)]">
                  {tr('saunaMap.noZones', 'No HA zones with coordinates')}
                </div>
                <div className="text-xs text-[var(--text-secondary)] mt-1 max-w-xs">
                  {tr('saunaMap.noZonesHint', 'Create zones in Home Assistant or select zones in card settings.')}
                </div>
              </div>
            </div>
          )}
        </div>

        {selectedLocation && (
          <button
            type="button"
            disabled={editMode || !selectedLocation.targetCardId}
            onClick={() => openLocation(selectedLocation)}
            className={`grid w-full grid-cols-[auto_1fr_auto_auto] items-center gap-3 rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg-hover)] px-3 py-2.5 text-left transition-colors ${
              !editMode && selectedLocation.targetCardId ? 'hover:bg-[var(--glass-bg)] cursor-pointer' : 'cursor-default'
            }`}
            aria-label={`${tr('popupLauncher.openCard', 'Open card')}: ${selectedLocation.name}`}
          >
            <div className="w-14 h-14 rounded-xl overflow-hidden border border-[var(--glass-border)] bg-[var(--glass-bg)] shrink-0">
              {selectedLocation.imageUrl && !isBrokenImage(selectedLocation.imageUrl) ? (
                <img
                  src={selectedLocation.imageUrl}
                  alt={selectedLocation.name}
                  className="w-full h-full object-cover"
                  draggable={false}
                  onError={() => markBrokenImage(selectedLocation.imageUrl)}
                />
              ) : (
                <div className="w-full h-full grid place-items-center text-xl font-black tabular-nums text-[var(--text-primary)]">
                  {formatPeopleCount(selectedLocation.peopleNow)}
                </div>
              )}
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-[var(--text-primary)] truncate">
                {selectedLocation.name}
              </div>
              <div className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] truncate">
                {selectedLocation.matchedName || selectedLocation.zoneId}
              </div>
            </div>
            <div className="text-right">
              <div className="flex items-center justify-end gap-1 text-[10px] uppercase tracking-widest font-bold text-[var(--text-secondary)]">
                <Thermometer className="w-3 h-3" />
                {tr('sauna.currentTemp', 'Current')}
              </div>
              <div className="text-base font-semibold tabular-nums text-[var(--text-primary)]">
                {formatTemp(selectedLocation.currentTemp)}
              </div>
            </div>
            <div className="text-right">
              <div className="text-[10px] uppercase tracking-widest font-bold text-[var(--text-secondary)]">
                {tr('sauna.healthScore.score', 'Score')}
              </div>
              <div className={`text-base font-semibold tabular-nums sauna-map-score sauna-map-score--${selectedLocation.scoreTone}`}>
                {formatScore(selectedLocation.healthScore)}
              </div>
            </div>
          </button>
        )}

        {locations.length > 1 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2 max-h-28 overflow-y-auto custom-scrollbar pr-1">
            {locations.map((location) => {
              const selected = selectedLocation?.zoneId === location.zoneId;
              return (
                <button
                  key={location.zoneId}
                  type="button"
                  className={`text-left rounded-xl border px-3 py-2 transition-colors ${
                    selected
                      ? 'border-blue-400/45 bg-blue-500/15'
                      : 'border-[var(--glass-border)] bg-[var(--glass-bg)] hover:bg-[var(--glass-bg-hover)]'
                  }`}
                  onClick={() => openLocation(location)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0 inline-flex items-center gap-2">
                      {location.imageUrl && !isBrokenImage(location.imageUrl) ? (
                        <img
                          src={location.imageUrl}
                          alt=""
                          className="w-6 h-6 rounded-md object-cover border border-[var(--glass-border)] shrink-0"
                          draggable={false}
                          onError={() => markBrokenImage(location.imageUrl)}
                        />
                      ) : (
                        <span className="w-6 h-6 rounded-md grid place-items-center border border-[var(--glass-border)] bg-[var(--glass-bg-hover)] text-[10px] font-black text-[var(--text-secondary)] shrink-0">
                          {formatPeopleCount(location.peopleNow)}
                        </span>
                      )}
                      <span className="text-xs font-semibold text-[var(--text-primary)] truncate">{location.name}</span>
                    </span>
                    <span className={`text-xs font-semibold tabular-nums sauna-map-score sauna-map-score--${location.scoreTone}`}>
                      {formatScore(location.healthScore)}
                    </span>
                  </div>
                  <div className="mt-1 text-[10px] uppercase tracking-widest text-[var(--text-secondary)]">
                    {formatTemp(location.currentTemp)}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
