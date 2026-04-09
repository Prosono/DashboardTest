import { describe, expect, it } from 'vitest';
import {
  appendCameraQueryParam,
  getCameraAccessToken,
  getCameraSnapshotUrl,
  getCameraStreamUrl,
} from '../utils/cameraFeeds';

const getEntityImageUrl = (rawUrl) => `http://homeassistant.local:8123${rawUrl}`;

describe('cameraFeeds', () => {
  it('extracts camera token from access_token attribute', () => {
    expect(getCameraAccessToken({
      attributes: {
        access_token: 'abc123',
      },
    })).toBe('abc123');
  });

  it('falls back to token embedded in entity_picture', () => {
    expect(getCameraAccessToken({
      attributes: {
        entity_picture: '/api/camera_proxy/camera.front?token=xyz987',
      },
    })).toBe('xyz987');
  });

  it('adds camera token to live stream URL', () => {
    expect(getCameraStreamUrl({
      entityId: 'camera.front',
      entity: {
        attributes: {
          access_token: 'stream-token',
        },
      },
      getEntityImageUrl,
    })).toBe('http://homeassistant.local:8123/api/camera_proxy_stream/camera.front?token=stream-token');
  });

  it('reuses existing snapshot token and adds cache busting', () => {
    expect(getCameraSnapshotUrl({
      entityId: 'camera.front',
      entity: {
        attributes: {
          entity_picture: '/api/camera_proxy/camera.front?token=snapshot-token',
        },
      },
      getEntityImageUrl,
      cacheBust: 12345,
    })).toBe('http://homeassistant.local:8123/api/camera_proxy/camera.front?token=snapshot-token&_t=12345');
  });

  it('adds query params to absolute urls', () => {
    expect(appendCameraQueryParam('https://example.com/live.mjpg', '_t', 77)).toBe('https://example.com/live.mjpg?_t=77');
  });
});
