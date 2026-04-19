import React, { useMemo, useState } from 'react';
import { BarChart3, Download, Flame, TrendingUp } from '../../icons';

const PERIOD_OPTIONS = [14, 7, 3, 1];
const STOP_TOKENS = new Set([
  'badstu',
  'badstue',
  'badstove',
  'sauna',
  'sensor',
  'temperature',
  'temperatur',
  'temp',
  'health',
  'score',
  'booking',
  'kort',
  'card',
]);

const toNum = (value) => {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const roundToOne = (value) => Math.round(Number(value) * 10) / 10;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const cleanDisplayText = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
const firstDisplayText = (...values) => values.map(cleanDisplayText).find(Boolean) || '';

const makeTr = (t) => (key, fallback) => {
  const out = typeof t === 'function' ? t(key) : undefined;
  const str = String(out ?? '').trim();
  if (!str || str === key || str.toLowerCase() === key.toLowerCase() || str.includes('.')) return fallback;
  return str;
};

const normalizeMatchText = (value) => String(value ?? '')
  .trim()
  .toLowerCase()
  .replace(/\u00e6/g, 'ae')
  .replace(/\u00f8/g, 'o')
  .replace(/\u00e5/g, 'a')
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

const getSettingsPageId = (settingsKey) => {
  const parts = String(settingsKey || '').split('::');
  return parts.length > 1 ? parts[0] : '';
};

const getEntityName = (entities, entityId) => {
  if (!entityId) return '';
  return entities?.[entityId]?.attributes?.friendly_name || entityId;
};

const getCardName = ({ cardId, settings, entities, customNames, fallback }) => {
  const tempName = getEntityName(entities, settings?.tempEntityId);
  return firstDisplayText(
    customNames?.[cardId],
    settings?.name,
    settings?.heading,
    settings?.title,
    tempName,
    fallback,
    cardId,
  );
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

const chooseBestSource = (baseSource, candidates, usedIds = new Set()) => {
  let best = null;
  candidates.forEach((candidate) => {
    if (usedIds.has(candidate.cardId)) return;
    if (baseSource.zoneEntityId && candidate.zoneEntityId && baseSource.zoneEntityId === candidate.zoneEntityId) {
      best = { source: candidate, score: 100 };
      return;
    }
    if (baseSource.tempEntityId && candidate.tempEntityId && baseSource.tempEntityId === candidate.tempEntityId) {
      best = { source: candidate, score: 90 };
      return;
    }
    const score = buildTextScore(baseSource.matchTexts, candidate.matchTexts);
    if (score <= 0) return;
    if (!best || score > best.score) best = { source: candidate, score };
  });
  return best?.score >= 3 ? best.source : null;
};

const parseTimestampMs = (entry) => {
  const raw = entry?.timestamp || entry?.time || entry?.last_changed || entry?.last_updated;
  const parsed = Date.parse(String(raw || '').trim());
  return Number.isFinite(parsed) ? parsed : null;
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

const normalizeHealthSamples = (rawValue) => {
  if (!Array.isArray(rawValue)) return [];
  return rawValue
    .map((entry, index) => {
      const timestamp = String(entry?.timestamp || entry?.time || '').trim();
      const timestampMs = Number.isFinite(Date.parse(timestamp)) ? Date.parse(timestamp) : parseTimestampMs(entry);
      const startTemp = toNum(entry?.startTemp ?? entry?.temperature ?? entry?.temp);
      if (!Number.isFinite(timestampMs) || startTemp === null) return null;
      const targetTemp = toNum(entry?.targetTemp);
      const deviationPct = toNum(entry?.deviationPct);
      return {
        id: String(entry?.id || `${timestamp}_${index}`),
        timestamp,
        timestampMs,
        startTemp: roundToOne(startTemp),
        targetTemp,
        deviationPct: deviationPct !== null ? roundToOne(deviationPct) : calcDeviationPct(startTemp, targetTemp),
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.timestampMs - b.timestampMs);
};

const normalizeBookingSamples = (rawValue) => {
  if (!Array.isArray(rawValue)) return [];
  return rawValue
    .map((entry, index) => {
      const timestamp = String(entry?.timestamp || entry?.time || '').trim();
      const timestampMs = Date.parse(timestamp);
      const startTemp = toNum(entry?.startTemp ?? entry?.temperature ?? entry?.temp);
      if (!Number.isFinite(timestampMs) || startTemp === null) return null;
      const targetTemp = toNum(entry?.targetTemp);
      const deviationPct = toNum(entry?.deviationPct ?? entry?.deviationPercent);
      return {
        id: String(entry?.id || `${timestamp}_${index}`),
        timestamp,
        timestampMs,
        startTemp: roundToOne(startTemp),
        targetTemp,
        deviationPct: deviationPct !== null ? roundToOne(deviationPct) : calcDeviationPct(startTemp, targetTemp),
        bookingType: String(entry?.bookingType || 'regular').toLowerCase() === 'service' ? 'service' : 'regular',
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.timestampMs - b.timestampMs);
};

const isTargetReached = (startTemp, targetTemp, toleranceC = 0) => {
  const start = toNum(startTemp);
  const target = toNum(targetTemp);
  if (start === null || target === null) return null;
  return start >= (target - Math.max(0, Number(toleranceC) || 0));
};

const computeScoreFromTargetSamples = (samples) => {
  const targetSamples = Array.isArray(samples)
    ? samples.filter((entry) => entry.targetTemp !== null && entry.deviationPct !== null)
    : [];
  if (!targetSamples.length) return null;
  const avgDeviation = roundToOne(
    targetSamples.reduce((sum, entry) => sum + (entry.deviationPct ?? 0), 0) / targetSamples.length
  );
  return calcScoreFromDeviationPct(avgDeviation);
};

const formatTemp = (value) => {
  const num = toNum(value);
  return num === null ? '--' : `${num.toFixed(1)}\u00B0`;
};

const formatPct = (value) => {
  if (!Number.isFinite(Number(value))) return '--';
  const num = Number(value);
  return `${num > 0 ? '+' : ''}${num.toFixed(1)}%`;
};

const formatScore = (value) => (Number.isFinite(Number(value)) ? `${Math.round(Number(value))}` : '--');

const formatNumber = (value) => (Number.isFinite(Number(value)) ? `${Math.round(Number(value))}` : '--');

const formatDate = (timestampMs) => {
  if (!Number.isFinite(timestampMs)) return '--';
  return new Date(timestampMs).toLocaleDateString([], { day: '2-digit', month: '2-digit', year: 'numeric' });
};

const formatDateTime = (timestampMs) => {
  if (!Number.isFinite(timestampMs)) return '--';
  return new Date(timestampMs).toLocaleString([], {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const getScoreToneClass = (score) => {
  if (!Number.isFinite(Number(score))) return 'text-[var(--text-secondary)]';
  if (Number(score) > 90) return 'text-emerald-300';
  if (Number(score) >= 70) return 'text-amber-300';
  return 'text-rose-300';
};

const buildSourceCards = ({ cardSettings, entities, customNames, tr }) => {
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
      const peopleNowEntityId = settings?.peopleNowEntityId || '';
      const activeEntityId = settings?.saunaActiveBooleanEntityId || settings?.bookingActiveEntityId || '';
      const name = getCardName({
        cardId,
        settings,
        entities,
        customNames,
        fallback: kind === 'sauna' ? tr('sauna.name', 'Sauna') : tr('reports.title', 'Reports'),
      });
      return {
        kind,
        cardId,
        settingsKey,
        pageId,
        settings,
        name,
        zoneEntityId: settings?.zoneEntityId || settings?.locationZoneEntityId || '',
        tempEntityId,
        currentTemp: toNum(entities?.[tempEntityId]?.state),
        peopleNow: peopleNowEntityId ? entities?.[peopleNowEntityId]?.state : null,
        healthSamples: normalizeHealthSamples(settings?.healthSnapshots),
        bookingSamples: normalizeBookingSamples(settings?.bookingSnapshots),
        targetToleranceC: Number.isFinite(Number(settings?.targetToleranceC)) ? Math.max(0, Number(settings.targetToleranceC)) : 0,
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

const buildSaunaRecords = ({ cardSettings, entities, customNames, tr }) => {
  const sources = buildSourceCards({ cardSettings, entities, customNames, tr });
  const saunaSources = sources.filter((source) => source.kind === 'sauna');
  const healthSources = sources.filter((source) => source.kind === 'health');
  const bookingSources = sources.filter((source) => source.kind === 'booking');
  const usedHealth = new Set();
  const usedBooking = new Set();
  const records = [];

  saunaSources.forEach((saunaSource) => {
    const healthSource = chooseBestSource(saunaSource, healthSources, usedHealth);
    const bookingSource = chooseBestSource(saunaSource, bookingSources, usedBooking);
    if (healthSource) usedHealth.add(healthSource.cardId);
    if (bookingSource) usedBooking.add(bookingSource.cardId);
    records.push({
      id: saunaSource.cardId,
      name: saunaSource.name,
      saunaSource,
      healthSource,
      bookingSource,
      currentTemp: saunaSource.currentTemp ?? healthSource?.currentTemp ?? bookingSource?.currentTemp ?? null,
      peopleNow: saunaSource.peopleNow,
      targetToleranceC: healthSource?.targetToleranceC ?? bookingSource?.targetToleranceC ?? 0,
    });
  });

  healthSources.forEach((healthSource) => {
    if (usedHealth.has(healthSource.cardId)) return;
    const bookingSource = chooseBestSource(healthSource, bookingSources, usedBooking);
    if (bookingSource) usedBooking.add(bookingSource.cardId);
    records.push({
      id: healthSource.cardId,
      name: healthSource.name,
      saunaSource: null,
      healthSource,
      bookingSource,
      currentTemp: healthSource.currentTemp ?? bookingSource?.currentTemp ?? null,
      peopleNow: null,
      targetToleranceC: healthSource.targetToleranceC ?? bookingSource?.targetToleranceC ?? 0,
    });
  });

  bookingSources.forEach((bookingSource) => {
    if (usedBooking.has(bookingSource.cardId)) return;
    records.push({
      id: bookingSource.cardId,
      name: bookingSource.name,
      saunaSource: null,
      healthSource: null,
      bookingSource,
      currentTemp: bookingSource.currentTemp ?? null,
      peopleNow: null,
      targetToleranceC: bookingSource.targetToleranceC ?? 0,
    });
  });

  return records
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((record, index) => ({
      ...record,
      name: cleanDisplayText(record.name) || `${tr('sauna.name', 'Sauna')} ${index + 1}`,
    }));
};

const countSessions = (samples) => {
  const sorted = samples.slice().sort((a, b) => a.timestampMs - b.timestampMs);
  if (!sorted.length) return 0;
  let sessions = 1;
  for (let index = 1; index < sorted.length; index += 1) {
    if ((sorted[index].timestampMs - sorted[index - 1].timestampMs) > (90 * 60 * 1000)) {
      sessions += 1;
    }
  }
  return sessions;
};

const analyzeRecord = (record, periodDays) => {
  const windowStart = Date.now() - (periodDays * 24 * 60 * 60 * 1000);
  const healthSamples = (record.healthSource?.healthSamples || []).filter((entry) => entry.timestampMs >= windowStart);
  const healthTargetSamples = healthSamples.filter((entry) => entry.targetTemp !== null && entry.deviationPct !== null);
  const avgDeviationPct = healthTargetSamples.length
    ? roundToOne(healthTargetSamples.reduce((sum, entry) => sum + (entry.deviationPct ?? 0), 0) / healthTargetSamples.length)
    : null;
  const healthScore = computeScoreFromTargetSamples(healthSamples);

  const bookingSamples = (record.bookingSource?.bookingSamples || [])
    .filter((entry) => entry.timestampMs >= windowStart && entry.bookingType !== 'service');
  const bookingTargetSamples = bookingSamples.filter((entry) => entry.targetTemp !== null);
  const bookingTargetSamplesWithPct = bookingTargetSamples.filter((entry) => entry.deviationPct !== null);
  const reachedCount = bookingTargetSamples.filter((entry) => isTargetReached(entry.startTemp, entry.targetTemp, record.targetToleranceC)).length;
  const hitRate = bookingTargetSamples.length ? Math.round((reachedCount / bookingTargetSamples.length) * 100) : null;
  const avgBookingDeviationPct = bookingTargetSamplesWithPct.length
    ? roundToOne(bookingTargetSamplesWithPct.reduce((sum, entry) => sum + (entry.deviationPct ?? 0), 0) / bookingTargetSamplesWithPct.length)
    : null;
  const tempValues = bookingSamples.map((entry) => toNum(entry.startTemp)).filter((value) => value !== null);
  const avgBookingTemp = tempValues.length ? roundToOne(tempValues.reduce((sum, value) => sum + value, 0) / tempValues.length) : null;
  const latestBooking = bookingSamples.length ? bookingSamples[bookingSamples.length - 1] : null;
  const bookingHours = bookingSamples.length;
  const sessions = countSessions(bookingSamples);
  const midpoint = windowStart + ((Date.now() - windowStart) / 2);
  const firstHalfScore = computeScoreFromTargetSamples(healthSamples.filter((entry) => entry.timestampMs < midpoint));
  const secondHalfScore = computeScoreFromTargetSamples(healthSamples.filter((entry) => entry.timestampMs >= midpoint));
  const scoreDelta = firstHalfScore !== null && secondHalfScore !== null
    ? roundToOne(secondHalfScore - firstHalfScore)
    : null;

  return {
    ...record,
    windowStart,
    healthSamples,
    healthTargetSamples,
    healthScore,
    avgDeviationPct,
    bookingSamples,
    bookingTargetSamples,
    bookingTargetSamplesWithPct,
    reachedCount,
    hitRate,
    avgBookingDeviationPct,
    avgBookingTemp,
    latestBooking,
    bookingHours,
    sessions,
    firstHalfScore,
    secondHalfScore,
    scoreDelta,
  };
};

const buildDailyTrend = (records, periodDays) => {
  const now = new Date();
  const days = [];
  for (let offset = periodDays - 1; offset >= 0; offset -= 1) {
    const day = new Date(now);
    day.setDate(now.getDate() - offset);
    day.setHours(0, 0, 0, 0);
    const start = day.getTime();
    const end = start + (24 * 60 * 60 * 1000);
    const samples = records.flatMap((record) => record.healthTargetSamples
      .filter((entry) => entry.timestampMs >= start && entry.timestampMs < end));
    const avgDeviation = samples.length
      ? roundToOne(samples.reduce((sum, entry) => sum + (entry.deviationPct ?? 0), 0) / samples.length)
      : null;
    days.push({
      key: day.toISOString().slice(0, 10),
      label: day.toLocaleDateString([], { day: '2-digit', month: '2-digit' }),
      score: avgDeviation !== null ? calcScoreFromDeviationPct(avgDeviation) : null,
      bookingHours: records.reduce((sum, record) => sum + record.bookingSamples
        .filter((entry) => entry.timestampMs >= start && entry.timestampMs < end).length, 0),
    });
  }
  return days;
};

const buildSummary = (records, periodDays, tr) => {
  const scoreRecords = records.filter((record) => record.healthScore !== null);
  const avgScore = scoreRecords.length
    ? Math.round(scoreRecords.reduce((sum, record) => sum + record.healthScore, 0) / scoreRecords.length)
    : null;
  const allBookingTargetSamples = records.flatMap((record) => record.bookingTargetSamples);
  const reachedCount = records.reduce((sum, record) => sum + record.reachedCount, 0);
  const hitRate = allBookingTargetSamples.length
    ? Math.round((reachedCount / allBookingTargetSamples.length) * 100)
    : null;
  const allHealthTargetSamples = records.flatMap((record) => record.healthTargetSamples);
  const avgDeviationPct = allHealthTargetSamples.length
    ? roundToOne(allHealthTargetSamples.reduce((sum, entry) => sum + (entry.deviationPct ?? 0), 0) / allHealthTargetSamples.length)
    : null;
  const bookingHours = records.reduce((sum, record) => sum + record.bookingHours, 0);
  const sessions = records.reduce((sum, record) => sum + record.sessions, 0);
  const best = scoreRecords.slice().sort((a, b) => b.healthScore - a.healthScore)[0] || null;
  const weakest = scoreRecords.slice().sort((a, b) => a.healthScore - b.healthScore)[0] || null;
  const trend = buildDailyTrend(records, periodDays);
  const deltas = records
    .map((record) => record.scoreDelta)
    .filter((value) => Number.isFinite(Number(value)));
  const avgScoreDelta = deltas.length
    ? roundToOne(deltas.reduce((sum, value) => sum + value, 0) / deltas.length)
    : null;
  const improving = records
    .filter((record) => Number.isFinite(Number(record.scoreDelta)) && record.scoreDelta > 0)
    .sort((a, b) => b.scoreDelta - a.scoreDelta)[0] || null;
  const declining = records
    .filter((record) => Number.isFinite(Number(record.scoreDelta)) && record.scoreDelta < 0)
    .sort((a, b) => a.scoreDelta - b.scoreDelta)[0] || null;
  const maxBookingHours = records.reduce((max, record) => Math.max(max, record.bookingHours), 0);
  const totalHealthSamples = allHealthTargetSamples.length;
  const totalBookingSamples = records.reduce((sum, record) => sum + record.bookingSamples.length, 0);

  const textBlocks = [
    {
      _type: 'block',
      style: 'h1',
      children: [{ _type: 'span', text: tr('reports.saunaReportTitle', 'Sauna operations report') }],
    },
    {
      _type: 'metricGrid',
      metrics: [
        { label: tr('reports.avgScore', 'Average score'), value: formatScore(avgScore) },
        { label: tr('reports.bookingHours', 'Booking hours'), value: formatNumber(bookingHours) },
        { label: tr('reports.estimatedSessions', 'Estimated sessions'), value: formatNumber(sessions) },
        { label: tr('reports.hitRate', 'Hit rate'), value: hitRate !== null ? `${hitRate}%` : '--' },
      ],
    },
    {
      _type: 'block',
      style: 'normal',
      children: [{
        _type: 'span',
        text: best && weakest
          ? `${tr('reports.bestSauna', 'Best sauna')}: ${best.name} (${formatScore(best.healthScore)}). ${tr('reports.needsAttention', 'Needs attention')}: ${weakest.name} (${formatScore(weakest.healthScore)}).`
          : tr('reports.noTrend', 'No trend data in selected range'),
      }],
    },
  ];

  return {
    periodDays,
    records,
    avgScore,
    hitRate,
    avgDeviationPct,
    bookingHours,
    sessions,
    best,
    weakest,
    trend,
    avgScoreDelta,
    improving,
    declining,
    maxBookingHours,
    totalHealthSamples,
    totalBookingSamples,
    textBlocks,
  };
};

const downloadBlob = (content, fileName, mimeType) => {
  const blob = typeof window !== 'undefined' && content instanceof window.Blob
    ? content
    : new window.Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
};

const toPdfHex = (value) => {
  const codes = [];
  for (const char of String(value ?? '')) {
    const point = char.codePointAt(0);
    if (point > 0xffff) {
      const adjusted = point - 0x10000;
      codes.push(0xd800 + (adjusted >> 10), 0xdc00 + (adjusted & 0x3ff));
    } else {
      codes.push(point);
    }
  }
  return `<FEFF${codes.map((code) => code.toString(16).padStart(4, '0')).join('').toUpperCase()}>`;
};

const wrapText = (text, maxWidth, fontSize) => {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const maxChars = Math.max(10, Math.floor(maxWidth / (fontSize * 0.52)));
  const lines = [];
  let current = '';
  words.forEach((word) => {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  });
  if (current) lines.push(current);
  return lines.length ? lines : [''];
};

const truncateText = (value, maxChars) => {
  const str = String(value ?? '').trim();
  if (str.length <= maxChars) return str;
  return `${str.slice(0, Math.max(0, maxChars - 1))}\u2026`;
};

const getScoreHex = (score) => {
  if (!Number.isFinite(Number(score))) return '#94a3b8';
  if (Number(score) > 90) return '#10b981';
  if (Number(score) >= 70) return '#f59e0b';
  return '#ef4444';
};

const getDeltaText = (value) => {
  if (!Number.isFinite(Number(value))) return '--';
  const num = Number(value);
  return `${num > 0 ? '+' : ''}${num.toFixed(1)}`;
};

const createPdfBlob = ({ report, title, subtitle, tr }) => {
  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const margin = 36;
  const contentWidth = pageWidth - (margin * 2);
  const palette = {
    page: '#07111d',
    panel: '#0d1b2a',
    panelAlt: '#102235',
    panelRaised: '#14283d',
    border: '#244057',
    borderSoft: '#1c3348',
    text: '#edf5ff',
    muted: '#9fb1c4',
    subtle: '#6f8298',
    accent: '#5ee3a1',
    blue: '#5b9cff',
    amber: '#f7c948',
    rose: '#fb7185',
  };
  const pages = [];
  let ops = [];
  let y = pageHeight - margin;

  const color = (hex) => {
    const clean = String(hex || '#000000').replace('#', '');
    const r = parseInt(clean.slice(0, 2), 16) / 255;
    const g = parseInt(clean.slice(2, 4), 16) / 255;
    const b = parseInt(clean.slice(4, 6), 16) / 255;
    return `${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)}`;
  };

  const text = (value, x, yy, size = 10, font = 'F1', hex = palette.text) => {
    ops.push(`BT /${font} ${size} Tf ${color(hex)} rg 1 0 0 1 ${x.toFixed(2)} ${yy.toFixed(2)} Tm ${toPdfHex(value)} Tj ET`);
  };

  const rect = (x, yy, w, h, fill = palette.panel) => {
    ops.push(`${color(fill)} rg ${x.toFixed(2)} ${yy.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f`);
  };

  const line = (x1, y1, x2, y2, stroke = palette.borderSoft) => {
    ops.push(`${color(stroke)} RG 0.75 w ${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S`);
  };

  const strokeRect = (x, yy, w, h, stroke = palette.border) => {
    line(x, yy, x + w, yy, stroke);
    line(x + w, yy, x + w, yy + h, stroke);
    line(x + w, yy + h, x, yy + h, stroke);
    line(x, yy + h, x, yy, stroke);
  };

  const panel = (x, yy, w, h, fill = palette.panel, stroke = palette.borderSoft) => {
    rect(x, yy, w, h, fill);
    strokeRect(x, yy, w, h, stroke);
  };

  const paintPage = () => {
    rect(0, 0, pageWidth, pageHeight, palette.page);
    rect(0, pageHeight - 7, pageWidth, 7, '#0d3f35');
    rect(0, pageHeight - 7, pageWidth * 0.28, 7, palette.blue);
  };

  const drawFooter = () => {
    line(margin, 28, pageWidth - margin, 28, palette.borderSoft);
    text(`Tunet / ${tr('reports.saunaReportTitle', 'Sauna operations report')}`, margin, 16, 7, 'F1', palette.subtle);
    text(`${tr('reports.page', 'Page')} ${pages.length + 1}`, pageWidth - margin - 34, 16, 7, 'F1', palette.subtle);
  };

  const finishPage = () => {
    drawFooter();
    pages.push(ops.join('\n'));
  };

  const newPage = () => {
    if (ops.length) finishPage();
    ops = [];
    y = pageHeight - margin;
    paintPage();
  };

  const ensureSpace = (height) => {
    if (y - height < margin + 30) newPage();
  };

  const paragraph = (value, x, width, size = 10, gap = 13, hex = palette.muted) => {
    const lines = wrapText(value, width, size);
    ensureSpace(lines.length * gap + 4);
    lines.forEach((entry) => {
      text(entry, x, y, size, 'F1', hex);
      y -= gap;
    });
    y -= 4;
  };

  const sectionTitle = (value) => {
    ensureSpace(34);
    text(value, margin, y, 12, 'F2', palette.text);
    y -= 20;
    line(margin, y + 7, pageWidth - margin, y + 7, palette.border);
  };

  const pill = (value, x, yy, w, fill = palette.panelRaised, textColor = palette.text) => {
    rect(x, yy, w, 18, fill);
    strokeRect(x, yy, w, 18, palette.borderSoft);
    text(value, x + 8, yy + 6, 7, 'F2', textColor);
  };

  const metricBox = ({ label, value, x, yy, w, tone = palette.text }) => {
    panel(x, yy, w, 56, palette.panelAlt, palette.borderSoft);
    text(label, x + 10, yy + 36, 7, 'F2', palette.muted);
    text(value, x + 10, yy + 14, 17, 'F2', tone);
  };

  const callout = ({ title: calloutTitle, body, tone = palette.accent }) => {
    const lines = wrapText(body, contentWidth - 30, 9.5);
    const height = Math.max(76, 36 + (lines.length * 13));
    ensureSpace(height + 16);
    const boxY = y - height;
    panel(margin, boxY, contentWidth, height, palette.panelAlt, palette.border);
    rect(margin, boxY, 4, height, tone);
    text(calloutTitle, margin + 16, y - 22, 10, 'F2', palette.text);
    lines.forEach((entry, index) => {
      text(entry, margin + 16, y - 42 - (index * 13), 9.5, 'F1', palette.muted);
    });
    y = boxY - 18;
  };

  const valueBarChart = ({ title: chartTitle, entries, valueAccessor, labelAccessor, maxValue = 100, valueFormatter = formatNumber, colorAccessor = () => '#2563eb', height = 118 }) => {
    const containerH = height + 52;
    ensureSpace(containerH + 12);
    const chartX = margin;
    const chartY = y - containerH;
    const chartW = pageWidth - (margin * 2);
    panel(chartX, chartY, chartW, containerH, palette.panelAlt, palette.border);
    text(chartTitle, chartX + 14, y - 22, 10, 'F2', palette.text);
    const safeEntries = Array.isArray(entries) ? entries : [];
    const hasValues = safeEntries.some((entry) => Number.isFinite(Number(valueAccessor(entry))));
    const plotX = chartX + 14;
    const plotY = chartY + 34;
    const plotW = chartW - 28;
    const plotH = height - 6;
    line(plotX, plotY + 14, plotX + plotW, plotY + 14, palette.borderSoft);
    line(plotX, plotY + plotH - 18, plotX + plotW, plotY + plotH - 18, palette.borderSoft);
    if (!hasValues) {
      text(tr('reports.noChartData', 'No chart data in selected period'), plotX, plotY + Math.round(plotH / 2), 9, 'F1', palette.muted);
      y = chartY - 16;
      return;
    }
    const gap = safeEntries.length > 12 ? 3 : 6;
    const barW = safeEntries.length
      ? Math.max(6, (plotW - (gap * (safeEntries.length - 1))) / safeEntries.length)
      : 0;
    safeEntries.forEach((entry, index) => {
      const value = Number(valueAccessor(entry));
      const x = plotX + (index * (barW + gap));
      const normalized = Number.isFinite(value) ? Math.max(0, Math.min(1, value / Math.max(1, maxValue))) : 0;
      const barH = Math.max(Number.isFinite(value) ? 5 : 2, normalized * (plotH - 38));
      const barY = plotY + 14;
      rect(x, barY, barW, barH, Number.isFinite(value) ? colorAccessor(entry) : '#31465c');
      if (safeEntries.length <= 14) {
        text(labelAccessor(entry), x - 1, chartY + 14, 6.5, 'F1', palette.subtle);
      }
    });
    const latest = safeEntries.slice().reverse().find((entry) => Number.isFinite(Number(valueAccessor(entry))));
    if (latest) {
      text(`${tr('reports.latest', 'Latest')}: ${valueFormatter(valueAccessor(latest))}`, chartX + chartW - 128, y - 22, 8, 'F2', palette.muted);
    }
    y = chartY - 16;
  };

  const horizontalBars = ({ title: chartTitle, entries, valueAccessor, labelAccessor, maxValue = 100, valueFormatter = formatNumber, colorAccessor = () => '#2563eb' }) => {
    const safeEntries = Array.isArray(entries) ? entries : [];
    if (!safeEntries.length) {
      callout({ title: chartTitle, body: tr('reports.noChartData', 'No chart data in selected period'), tone: palette.blue });
      return;
    }

    const rowH = 20;
    const rowsPerPanel = 10;
    const labelW = 132;
    const barW = pageWidth - (margin * 2) - labelW - 78;
    for (let start = 0; start < safeEntries.length; start += rowsPerPanel) {
      const rows = safeEntries.slice(start, start + rowsPerPanel);
      const containerH = 46 + (rows.length * rowH);
      ensureSpace(containerH + 12);
      const boxY = y - containerH;
      panel(margin, boxY, contentWidth, containerH, palette.panelAlt, palette.border);
      text(start === 0 ? chartTitle : `${chartTitle} (${start + 1})`, margin + 14, y - 22, 10, 'F2', palette.text);
      rows.forEach((entry, index) => {
        const value = Number(valueAccessor(entry));
        const rowY = y - 46 - (index * rowH);
        text(truncateText(labelAccessor(entry), 24), margin + 14, rowY + 2, 8, 'F2', palette.text);
        rect(margin + 14 + labelW, rowY - 2, barW, 8, '#263b51');
        const normalized = Number.isFinite(value) ? Math.max(0, Math.min(1, value / Math.max(1, maxValue))) : 0;
        rect(margin + 14 + labelW, rowY - 2, Math.max(2, barW * normalized), 8, Number.isFinite(value) ? colorAccessor(entry) : '#31465c');
        text(valueFormatter(value), margin + 14 + labelW + barW + 12, rowY, 8, 'F2', palette.muted);
      });
      y = boxY - 16;
    }
  };

  const renderTableHeader = (columns, tableWidth) => {
    ensureSpace(28);
    rect(margin, y - 17, tableWidth, 22, palette.panelRaised);
    strokeRect(margin, y - 17, tableWidth, 22, palette.border);
    let cursor = margin + 8;
    columns.forEach(([label, width]) => {
      text(label, cursor, y - 8, 7, 'F2', palette.muted);
      cursor += width;
    });
    y -= 25;
  };

  paintPage();

  panel(margin, y - 64, contentWidth, 64, '#0a1a2a', palette.border);
  text('TUNET', margin + 16, y - 22, 10, 'F2', palette.text);
  text(tr('reports.analysisReport', 'ANALYSIS REPORT'), margin + 16, y - 42, 8, 'F2', palette.muted);
  text(`${tr('reports.generated', 'Generated')}: ${formatDateTime(Date.now())}`, pageWidth - margin - 178, y - 22, 8, 'F1', palette.muted);
  text(subtitle, pageWidth - margin - 178, y - 42, 7.5, 'F1', palette.subtle);
  y -= 82;

  const heroH = 116;
  panel(margin, y - heroH, contentWidth, heroH, palette.panel, palette.border);
  text(tr('reports.reportScope', 'REPORT SCOPE'), margin + 16, y - 24, 8, 'F2', palette.muted);
  wrapText(title, contentWidth - 32, 21).slice(0, 2).forEach((entry, index) => {
    text(entry, margin + 16, y - 50 - (index * 23), 21, 'F2', palette.text);
  });
  const healthBasis = report.totalHealthSamples > 0
    ? `${formatNumber(report.totalHealthSamples)} ${tr('reports.healthSamples', 'Health samples').toLowerCase()}`
    : tr('reports.healthDataMissing', 'Health data missing');
  pill(`${report.periodDays} ${tr('reports.days', 'days')}`, margin + 16, y - 101, 62, '#183450', palette.text);
  pill(`${formatNumber(report.records.length)} ${tr('reports.selectedSaunas', 'selected saunas')}`, margin + 84, y - 101, 118, '#183029', palette.text);
  pill(healthBasis, margin + 208, y - 101, 150, report.totalHealthSamples > 0 ? '#183029' : '#3d2b17', report.totalHealthSamples > 0 ? palette.text : palette.amber);
  y -= heroH + 22;

  const metricY = y - 56;
  const metricWidth = (contentWidth - 18) / 4;
  [
    [tr('reports.avgScore', 'Average score'), report.totalHealthSamples > 0 ? formatScore(report.avgScore) : '--', report.totalHealthSamples > 0 ? getScoreHex(report.avgScore) : palette.subtle],
    [tr('reports.bookingHours', 'Booking hours'), formatNumber(report.bookingHours), palette.text],
    [tr('reports.estimatedSessions', 'Estimated sessions'), formatNumber(report.sessions), palette.text],
    [tr('reports.hitRate', 'Hit rate'), report.hitRate !== null ? `${report.hitRate}%` : '--', palette.accent],
  ].forEach(([label, value, tone], index) => {
    const x = margin + (index * (metricWidth + 6));
    metricBox({ label, value, x, yy: metricY, w: metricWidth, tone });
  });
  y = metricY - 26;

  sectionTitle(tr('reports.executiveSummary', 'Executive summary'));
  const summaryText = report.best && report.weakest
    ? `${tr('reports.bestSauna', 'Best sauna')}: ${report.best.name} (${formatScore(report.best.healthScore)}). ${tr('reports.needsAttention', 'Needs attention')}: ${report.weakest.name} (${formatScore(report.weakest.healthScore)}). ${tr('reports.avgTrend', 'Average trend')}: ${getDeltaText(report.avgScoreDelta)}.`
    : `${tr('reports.bookingHours', 'Booking hours')}: ${formatNumber(report.bookingHours)}. ${tr('reports.healthDataMissing', 'Health data missing')}.`;
  callout({
    title: tr('reports.executiveSummary', 'Executive summary'),
    body: summaryText,
    tone: report.totalHealthSamples > 0 ? palette.accent : palette.amber,
  });

  const basisY = y - 48;
  const basisW = (contentWidth - 12) / 3;
  [
    [tr('reports.dataFoundation', 'Data foundation'), healthBasis],
    [tr('reports.bookingSamples', 'Booking samples'), formatNumber(report.totalBookingSamples)],
    [tr('reports.trend', 'Trend'), getDeltaText(report.avgScoreDelta)],
  ].forEach(([label, value], index) => {
    metricBox({ label, value, x: margin + (index * (basisW + 6)), yy: basisY, w: basisW, tone: index === 2 ? palette.accent : palette.text });
  });
  y = basisY - 24;

  sectionTitle(tr('reports.trendDevelopment', 'Trend development'));
  valueBarChart({
    title: tr('reports.scoreDevelopment', 'Score development'),
    entries: report.trend,
    valueAccessor: (entry) => entry.score,
    labelAccessor: (entry) => entry.label,
    maxValue: 100,
    valueFormatter: formatScore,
    colorAccessor: (entry) => getScoreHex(entry.score),
  });
  valueBarChart({
    title: tr('reports.bookingDevelopment', 'Booking development'),
    entries: report.trend,
    valueAccessor: (entry) => entry.bookingHours,
    labelAccessor: (entry) => entry.label,
    maxValue: Math.max(1, ...report.trend.map((entry) => entry.bookingHours)),
    valueFormatter: (value) => `${formatNumber(value)}h`,
    colorAccessor: () => '#2563eb',
    height: 88,
  });

  sectionTitle(tr('reports.comparison', 'Comparison'));
  horizontalBars({
    title: tr('reports.scoreBySauna', 'Score by sauna'),
    entries: report.records.slice().sort((a, b) => (b.healthScore ?? -1) - (a.healthScore ?? -1)),
    valueAccessor: (record) => record.healthScore,
    labelAccessor: (record) => record.name,
    maxValue: 100,
    valueFormatter: formatScore,
    colorAccessor: (record) => getScoreHex(record.healthScore),
  });
  horizontalBars({
    title: tr('reports.bookingHoursBySauna', 'Booking hours by sauna'),
    entries: report.records.slice().sort((a, b) => b.bookingHours - a.bookingHours),
    valueAccessor: (record) => record.bookingHours,
    labelAccessor: (record) => record.name,
    maxValue: Math.max(1, report.maxBookingHours),
    valueFormatter: (value) => `${formatNumber(value)}h`,
    colorAccessor: () => '#0f766e',
  });

  sectionTitle(tr('reports.saunaPerformance', 'Sauna performance'));
  const columns = [
    [tr('sauna.name', 'Sauna'), 116],
    [tr('reports.score', 'Score'), 48],
    [tr('reports.trend', 'Trend'), 52],
    [tr('reports.bookingHours', 'Hours'), 42],
    [tr('reports.estimatedSessions', 'Sessions'), 52],
    [tr('reports.hitRate', 'Hit rate'), 52],
    [tr('reports.avgTemp', 'Avg temp'), 58],
    [tr('reports.avgDeviation', 'Avg deviation'), 70],
  ];
  const tableWidth = columns.reduce((sum, [, width]) => sum + width, 0);
  renderTableHeader(columns, tableWidth);

  report.records.forEach((record, index) => {
    if (y - 22 < margin + 30) {
      newPage();
      sectionTitle(tr('reports.saunaPerformance', 'Sauna performance'));
      renderTableHeader(columns, tableWidth);
    }
    rect(margin, y - 14, tableWidth, 18, index % 2 === 0 ? '#0a1724' : '#0f2031');
    let cursor = margin + 8;
    [
      truncateText(record.name, 24),
      formatScore(record.healthScore),
      getDeltaText(record.scoreDelta),
      formatNumber(record.bookingHours),
      formatNumber(record.sessions),
      record.hitRate !== null ? `${record.hitRate}%` : '--',
      formatTemp(record.avgBookingTemp),
      formatPct(record.avgDeviationPct ?? record.avgBookingDeviationPct),
    ].forEach((value, colIndex) => {
      text(value, cursor, y - 6, colIndex === 0 ? 8 : 7.5, colIndex === 0 ? 'F2' : 'F1', colIndex === 1 ? getScoreHex(record.healthScore) : palette.text);
      cursor += columns[colIndex][1];
    });
    y -= 18;
  });

  sectionTitle(tr('reports.recentBookings', 'Recent booking samples'));
  const recentRows = report.records
    .flatMap((record) => record.bookingSamples.slice(-4).map((entry) => ({ record, entry })))
    .sort((a, b) => b.entry.timestampMs - a.entry.timestampMs)
    .slice(0, 24);
  if (!recentRows.length) {
    paragraph(tr('reports.noBookingData', 'No booking data in selected period'), margin, contentWidth, 10);
  } else {
    recentRows.forEach(({ record, entry }) => {
      ensureSpace(24);
      rect(margin, y - 15, contentWidth, 19, palette.panelAlt);
      strokeRect(margin, y - 15, contentWidth, 19, palette.borderSoft);
      text(`${formatDateTime(entry.timestampMs)} / ${truncateText(record.name, 28)}`, margin + 10, y - 7, 8, 'F2', palette.text);
      text(`${formatTemp(entry.startTemp)} / ${formatTemp(entry.targetTemp)} / ${formatPct(entry.deviationPct)}`, margin + 328, y - 7, 8, 'F1', palette.muted);
      y -= 22;
    });
  }

  if (ops.length) finishPage();

  const objects = [];
  const font1Id = 3;
  const font2Id = 4;
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
  objects[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>';
  const kids = [];
  pages.forEach((content, index) => {
    const pageId = 5 + (index * 2);
    const contentId = pageId + 1;
    kids.push(`${pageId} 0 R`);
    objects[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 ${font1Id} 0 R /F2 ${font2Id} 0 R >> >> /Contents ${contentId} 0 R >>`;
    objects[contentId] = `<< /Length ${byteLength(content)} >>\nstream\n${content}\nendstream`;
  });
  objects[2] = `<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${pages.length} >>`;

  let pdf = '%PDF-1.7\n%\u00E2\u00E3\u00CF\u00D3\n';
  const offsets = [0];
  for (let id = 1; id < objects.length; id += 1) {
    if (!objects[id]) continue;
    offsets[id] = byteLength(pdf);
    pdf += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xrefOffset = byteLength(pdf);
  pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objects.length; id += 1) {
    pdf += `${String(offsets[id] || 0).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return new window.Blob([pdf], { type: 'application/pdf' });
};

const sanitizeFilePart = (value) => String(value || '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 60) || 'rapport';

const byteLength = (value) => {
  if (typeof window !== 'undefined' && typeof window.TextEncoder === 'function') {
    return new window.TextEncoder().encode(value).length;
  }
  return String(value || '').length;
};

const MetricTile = ({ label, value, subLabel, tone = '' }) => (
  <div className="min-h-[76px] rounded-lg border border-[var(--glass-border)] bg-[var(--glass-bg-hover)] px-3 py-3">
    <div className="text-[10px] uppercase tracking-widest font-bold text-[var(--text-secondary)]">{label}</div>
    <div className={`mt-1 text-2xl font-semibold tabular-nums ${tone || 'text-[var(--text-primary)]'}`}>{value}</div>
    {subLabel && <div className="mt-1 text-[10px] text-[var(--text-muted)] truncate">{subLabel}</div>}
  </div>
);

export default function SaunaReportsCard({
  cardId,
  settings,
  cardSettings,
  entities,
  dragProps,
  controls,
  cardStyle,
  editMode,
  customNames,
  t,
}) {
  const tr = useMemo(() => makeTr(t), [t]);
  const [periodDays, setPeriodDays] = useState(() => (
    PERIOD_OPTIONS.includes(Number(settings?.periodDays)) ? Number(settings.periodDays) : 14
  ));
  const [selectedIds, setSelectedIds] = useState([]);

  const allRecords = useMemo(() => buildSaunaRecords({
    cardSettings,
    entities,
    customNames,
    tr,
  }), [cardSettings, customNames, entities, tr]);

  const activeRecords = useMemo(() => {
    const selectedSet = new Set(selectedIds);
    const base = selectedSet.size
      ? allRecords.filter((record) => selectedSet.has(record.id))
      : allRecords;
    return base.map((record) => analyzeRecord(record, periodDays));
  }, [allRecords, periodDays, selectedIds]);

  const report = useMemo(() => buildSummary(activeRecords, periodDays, tr), [activeRecords, periodDays, tr]);
  const cardName = firstDisplayText(customNames?.[cardId], settings?.name, tr('reports.saunaReportTitle', 'Sauna operations report'));
  const rangeLabel = `${formatDate(Date.now() - (periodDays * 24 * 60 * 60 * 1000))} - ${formatDate(Date.now())}`;
  const selectedLabel = selectedIds.length
    ? `${selectedIds.length} ${tr('reports.selectedSaunas', 'selected saunas')}`
    : tr('reports.allSaunas', 'All saunas');
  const scoreValue = report.totalHealthSamples > 0 ? formatScore(report.avgScore) : '--';
  const scoreTone = report.totalHealthSamples > 0 ? getScoreToneClass(report.avgScore) : 'text-[var(--text-muted)]';
  const trendTone = Number(report.avgScoreDelta) > 0
    ? 'text-emerald-300'
    : (Number(report.avgScoreDelta) < 0 ? 'text-amber-300' : 'text-[var(--text-primary)]');
  const healthBasis = report.totalHealthSamples > 0
    ? `${formatNumber(report.totalHealthSamples)} ${tr('reports.healthSamples', 'Health samples').toLowerCase()}`
    : tr('reports.healthDataMissing', 'Health data missing');
  const pdfSections = [
    tr('reports.executiveSummary', 'Executive summary'),
    tr('reports.scoreDevelopment', 'Score development'),
    tr('reports.bookingDevelopment', 'Booking development'),
    tr('reports.comparison', 'Comparison'),
    tr('reports.saunaPerformance', 'Sauna performance'),
    tr('reports.recentBookings', 'Recent booking samples'),
  ];

  const toggleRecord = (recordId) => {
    setSelectedIds((prev) => {
      if (!prev.length) return [recordId];
      if (prev.includes(recordId)) {
        const next = prev.filter((id) => id !== recordId);
        return next.length ? next : [];
      }
      return [...prev, recordId];
    });
  };

  const handleDownloadPdf = () => {
    const title = cardName;
    const subtitle = `${selectedLabel} - ${periodDays} ${tr('reports.days', 'days')} - ${rangeLabel}`;
    const pdf = createPdfBlob({ report, title, subtitle, tr });
    downloadBlob(
      pdf,
      `badstu-rapport-${periodDays}d-${sanitizeFilePart(selectedLabel)}-${Date.now()}.pdf`,
      'application/pdf',
    );
  };

  return (
    <div
      {...dragProps}
      className={`touch-feedback relative h-full min-h-[390px] rounded-[1.75rem] border bg-[var(--glass-bg)] border-[var(--glass-border)] overflow-hidden transition-all duration-300 ${
        editMode ? 'cursor-move' : 'cursor-default'
      }`}
      style={cardStyle}
    >
      {controls}
      <div className="absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,#5ee3a1,#5b9cff)]" />
      <div className="relative z-10 h-full flex flex-col gap-4 p-4 md:p-5">
        <div className="flex flex-col xl:flex-row xl:items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest font-bold text-[var(--text-secondary)]">
              <BarChart3 className="w-3.5 h-3.5" />
              {tr('reports.subtitle', 'Operations reports')}
            </div>
            <h3 className="mt-1 text-lg md:text-xl font-semibold text-[var(--text-primary)] truncate">{cardName}</h3>
            <div className="mt-1 text-xs text-[var(--text-secondary)]">
              {selectedLabel} {'\u00B7'} {rangeLabel}
            </div>
          </div>

          <button
            type="button"
            onClick={handleDownloadPdf}
            disabled={!activeRecords.length}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-emerald-400/35 bg-emerald-500/16 px-4 py-2.5 text-xs font-bold uppercase tracking-widest text-emerald-100 transition-colors hover:bg-emerald-500/24 disabled:opacity-45 disabled:cursor-not-allowed"
          >
            <Download className="w-4 h-4" />
            {tr('reports.downloadPdf', 'Download PDF')}
          </button>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[auto_minmax(0,1fr)] gap-3">
          <div className="flex flex-wrap gap-2 content-start">
            {PERIOD_OPTIONS.map((days) => (
              <button
                key={days}
                type="button"
                onClick={() => setPeriodDays(days)}
                className={`rounded-lg border px-3 py-2 text-[11px] font-bold uppercase tracking-widest transition-colors ${
                  periodDays === days
                    ? 'border-blue-400/50 bg-blue-500/18 text-blue-100'
                    : 'border-[var(--glass-border)] bg-[var(--glass-bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                {days} {tr('reports.days', 'days')}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-2 content-start max-h-24 overflow-y-auto custom-scrollbar pr-1">
            <button
              type="button"
              onClick={() => setSelectedIds([])}
              className={`rounded-lg border px-3 py-2 text-[11px] font-bold uppercase tracking-widest transition-colors ${
                selectedIds.length === 0
                  ? 'border-emerald-400/45 bg-emerald-500/16 text-emerald-100'
                  : 'border-[var(--glass-border)] bg-[var(--glass-bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              {tr('reports.allSaunas', 'All saunas')}
            </button>
            {allRecords.map((record) => {
              const active = selectedIds.length === 0 || selectedIds.includes(record.id);
              return (
                <button
                  key={record.id}
                  type="button"
                  onClick={() => toggleRecord(record.id)}
                  className={`rounded-lg border px-3 py-2 text-[11px] font-bold uppercase tracking-widest transition-colors ${
                    active
                      ? 'border-white/18 bg-white/10 text-[var(--text-primary)]'
                      : 'border-[var(--glass-border)] bg-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                  }`}
                >
                  {record.name}
                </button>
              );
            })}
          </div>
        </div>

        {activeRecords.length === 0 ? (
          <div className="rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg-hover)] grid place-items-center p-6 text-center">
            <div>
              <Flame className="w-9 h-9 mx-auto text-[var(--text-secondary)] mb-3" />
              <div className="text-sm font-semibold text-[var(--text-primary)]">{tr('reports.noSaunaData', 'No sauna health data found')}</div>
              <div className="text-xs text-[var(--text-secondary)] mt-1 max-w-sm">
                {tr('reports.optionalSaunaData', 'Includes sauna-health snapshots when those cards are configured.')}
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.05fr)_minmax(280px,0.95fr)] gap-3 auto-rows-min">
            <div className="rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg-hover)] p-4 md:p-5">
              <div className="flex items-start justify-between gap-5">
                <div className="min-w-0">
                  <div className="text-[10px] uppercase tracking-widest font-bold text-[var(--text-secondary)]">
                    {tr('reports.reportReady', 'Report ready')}
                  </div>
                  <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--text-primary)]">
                    {tr('reports.reportReadyHint', 'The card keeps the workspace clean. The downloaded PDF contains the full analysis with charts, trends and sauna comparisons.')}
                  </p>
                </div>
                <div className="shrink-0 rounded-lg border border-[var(--glass-border)] bg-[var(--glass-bg)] px-3 py-2 text-right">
                  <div className="text-[9px] uppercase tracking-widest text-[var(--text-muted)]">{tr('reports.avgScore', 'Average score')}</div>
                  <div className={`mt-1 text-3xl font-semibold tabular-nums ${scoreTone}`}>{scoreValue}</div>
                </div>
              </div>

              <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div className="rounded-lg border border-[var(--glass-border)] bg-[var(--glass-bg)] px-3 py-3">
                  <div className="text-[10px] uppercase tracking-widest text-[var(--text-muted)]">{tr('reports.bookingHours', 'Booking hours')}</div>
                  <div className="mt-1 text-2xl font-semibold tabular-nums text-[var(--text-primary)]">{formatNumber(report.bookingHours)}</div>
                  <div className="mt-1 text-[10px] text-[var(--text-muted)]">{formatNumber(report.sessions)} {tr('reports.estimatedSessions', 'estimated sessions')}</div>
                </div>
                <div className="rounded-lg border border-[var(--glass-border)] bg-[var(--glass-bg)] px-3 py-3">
                  <div className="text-[10px] uppercase tracking-widest text-[var(--text-muted)]">{tr('reports.dataFoundation', 'Data foundation')}</div>
                  <div className="mt-1 text-sm font-semibold text-[var(--text-primary)] truncate">{healthBasis}</div>
                  <div className="mt-1 text-[10px] text-[var(--text-muted)]">{formatNumber(report.totalBookingSamples)} {tr('reports.bookingSamples', 'booking samples').toLowerCase()}</div>
                </div>
                <div className="rounded-lg border border-[var(--glass-border)] bg-[var(--glass-bg)] px-3 py-3">
                  <div className="text-[10px] uppercase tracking-widest text-[var(--text-muted)]">{tr('reports.trend', 'Trend')}</div>
                  <div className={`mt-1 text-2xl font-semibold tabular-nums ${trendTone}`}>
                    {getDeltaText(report.avgScoreDelta)}
                  </div>
                  <div className="mt-1 text-[10px] text-[var(--text-muted)]">{rangeLabel}</div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg-hover)] p-4 md:p-5">
              <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest font-bold text-[var(--text-secondary)]">
                <TrendingUp className="w-3.5 h-3.5" />
                {tr('reports.pdfContains', 'PDF contains')}
              </div>
              <div className="mt-4 space-y-3">
                {pdfSections.map((label, index) => (
                  <div key={label} className="grid grid-cols-[28px_minmax(0,1fr)] items-center gap-3">
                    <span className="grid h-7 w-7 place-items-center rounded-lg border border-[var(--glass-border)] bg-[var(--glass-bg)] text-[10px] font-bold tabular-nums text-[var(--text-secondary)]">
                      {index + 1}
                    </span>
                    <span className="text-xs font-semibold text-[var(--text-primary)] truncate">{label}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="xl:col-span-2 grid grid-cols-2 md:grid-cols-4 gap-2">
              <MetricTile label={tr('reports.selectedSaunas', 'selected saunas')} value={formatNumber(activeRecords.length)} />
              <MetricTile label={tr('reports.healthSamples', 'Health samples')} value={formatNumber(report.totalHealthSamples)} subLabel={report.totalHealthSamples > 0 ? tr('reports.healthDataReady', 'Health data ready') : tr('reports.healthDataMissing', 'Health data missing')} />
              <MetricTile label={tr('reports.bookingSamples', 'Booking samples')} value={formatNumber(report.totalBookingSamples)} />
              <MetricTile label={tr('reports.hitRate', 'Hit rate')} value={report.hitRate !== null ? `${report.hitRate}%` : '--'} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
