import { parseScopedEntityId } from './haConnections';

const CAMERA_UNAVAILABLE_STATES = new Set(['unavailable', 'unknown']);

const normalizeCameraEntityId = (entityId) => {
  const parsed = parseScopedEntityId(entityId);
  return parsed?.entityId || String(entityId || '').trim();
};

export const appendCameraQueryParam = (url, key, value) => {
  const source = String(url || '').trim();
  if (!source) return '';

  try {
    const parsed = new URL(source);
    parsed.searchParams.set(key, String(value));
    return parsed.toString();
  } catch {
    const separator = source.includes('?') ? '&' : '?';
    return `${source}${separator}${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`;
  }
};

export const getCameraSnapshotUrl = ({
  entityId,
  entity,
  getEntityImageUrl,
  cacheBust,
}) => {
  if (typeof getEntityImageUrl !== 'function') return null;
  const resolvedEntityId = normalizeCameraEntityId(entityId);
  if (!resolvedEntityId) return null;

  const rawPicture = entity?.attributes?.entity_picture
    || `/api/camera_proxy/${encodeURIComponent(resolvedEntityId)}`;
  const absoluteUrl = getEntityImageUrl(rawPicture);
  if (!absoluteUrl) return null;

  return cacheBust ? appendCameraQueryParam(absoluteUrl, '_t', cacheBust) : absoluteUrl;
};

export const getCameraStreamUrl = ({
  entityId,
  getEntityImageUrl,
  cacheBust,
}) => {
  if (typeof getEntityImageUrl !== 'function') return null;
  const resolvedEntityId = normalizeCameraEntityId(entityId);
  if (!resolvedEntityId) return null;

  const absoluteUrl = getEntityImageUrl(`/api/camera_proxy_stream/${encodeURIComponent(resolvedEntityId)}`);
  if (!absoluteUrl) return null;

  return cacheBust ? appendCameraQueryParam(absoluteUrl, '_t', cacheBust) : absoluteUrl;
};

export const isCameraUnavailable = (entity) => {
  const state = String(entity?.state || '').trim().toLowerCase();
  return !entity || CAMERA_UNAVAILABLE_STATES.has(state);
};
