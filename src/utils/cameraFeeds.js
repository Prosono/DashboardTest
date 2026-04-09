import { parseScopedEntityId } from './haConnections';

const CAMERA_UNAVAILABLE_STATES = new Set(['unavailable', 'unknown']);

const normalizeCameraEntityId = (entityId) => {
  const parsed = parseScopedEntityId(entityId);
  return parsed?.entityId || String(entityId || '').trim();
};

const readTokenFromUrl = (url) => {
  const source = String(url || '').trim();
  if (!source) return '';

  try {
    const parsed = new URL(source, 'http://localhost');
    return String(parsed.searchParams.get('token') || '').trim();
  } catch {
    const match = source.match(/[?&]token=([^&]+)/i);
    return match ? decodeURIComponent(match[1]) : '';
  }
};

export const getCameraAccessToken = (entity) => {
  const explicitToken = String(entity?.attributes?.access_token || entity?.attributes?.accessToken || '').trim();
  if (explicitToken) return explicitToken;
  return readTokenFromUrl(entity?.attributes?.entity_picture);
};

const withCameraToken = (url, entity) => {
  const source = String(url || '').trim();
  if (!source) return '';
  if (readTokenFromUrl(source)) return source;

  const token = getCameraAccessToken(entity);
  if (!token) return source;
  return appendCameraQueryParam(source, 'token', token);
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
  const tokenizedUrl = withCameraToken(absoluteUrl, entity);
  return cacheBust ? appendCameraQueryParam(tokenizedUrl, '_t', cacheBust) : tokenizedUrl;
};

export const getCameraStreamUrl = ({
  entityId,
  entity,
  getEntityImageUrl,
  cacheBust,
}) => {
  if (typeof getEntityImageUrl !== 'function') return null;
  const resolvedEntityId = normalizeCameraEntityId(entityId);
  if (!resolvedEntityId) return null;

  const absoluteUrl = getEntityImageUrl(`/api/camera_proxy_stream/${encodeURIComponent(resolvedEntityId)}`);
  if (!absoluteUrl) return null;
  const tokenizedUrl = withCameraToken(absoluteUrl, entity);
  return cacheBust ? appendCameraQueryParam(tokenizedUrl, '_t', cacheBust) : tokenizedUrl;
};

export const isCameraUnavailable = (entity) => {
  const state = String(entity?.state || '').trim().toLowerCase();
  return !entity || CAMERA_UNAVAILABLE_STATES.has(state);
};
