import { describe, expect, it } from 'vitest';
import { isMixedContentBlockedHaUrl, normalizeHaConfig, normalizeHaUrlInput } from '../utils/haConnections';

describe('normalizeHaUrlInput', () => {
  it('normalizes bare local IP addresses to the default HA HTTP endpoint', () => {
    expect(normalizeHaUrlInput('192.168.105.120')).toBe('http://192.168.105.120:8123');
    expect(normalizeHaUrlInput('192.168.105.120:8123')).toBe('http://192.168.105.120:8123');
  });

  it('normalizes local hostnames to HTTP and keeps explicit ports', () => {
    expect(normalizeHaUrlInput('smarti.local')).toBe('http://smarti.local:8123');
    expect(normalizeHaUrlInput('smarti.local:8124')).toBe('http://smarti.local:8124');
  });

  it('normalizes public hostnames to HTTPS without forcing the HA port', () => {
    expect(normalizeHaUrlInput('kur.example.com')).toBe('https://kur.example.com');
  });

  it('preserves explicit http and https URLs', () => {
    expect(normalizeHaUrlInput('http://192.168.105.120')).toBe('http://192.168.105.120:8123');
    expect(normalizeHaUrlInput('http://192.168.105.120:8123')).toBe('http://192.168.105.120:8123');
    expect(normalizeHaUrlInput('https://demo.ui.nabu.casa')).toBe('https://demo.ui.nabu.casa');
  });
});

describe('normalizeHaConfig', () => {
  it('normalizes primary and fallback URLs inside connection config', () => {
    const config = normalizeHaConfig({
      url: '192.168.105.120',
      fallbackUrl: 'demo.ui.nabu.casa',
      authMethod: 'token',
      token: 'tok',
    });

    expect(config.url).toBe('http://192.168.105.120:8123');
    expect(config.fallbackUrl).toBe('https://demo.ui.nabu.casa');
    expect(config.connections[0]).toEqual(expect.objectContaining({
      url: 'http://192.168.105.120:8123',
      fallbackUrl: 'https://demo.ui.nabu.casa',
    }));
  });
});

describe('isMixedContentBlockedHaUrl', () => {
  it('flags local HTTP HA URLs when the app runs over HTTPS', () => {
    expect(isMixedContentBlockedHaUrl('192.168.105.120', 'https:')).toBe(true);
    expect(isMixedContentBlockedHaUrl('http://192.168.105.120:8123', 'https:')).toBe(true);
  });

  it('allows loopback and HTTPS targets', () => {
    expect(isMixedContentBlockedHaUrl('127.0.0.1:8123', 'https:')).toBe(false);
    expect(isMixedContentBlockedHaUrl('https://demo.ui.nabu.casa', 'https:')).toBe(false);
    expect(isMixedContentBlockedHaUrl('192.168.105.120', 'http:')).toBe(false);
  });
});
