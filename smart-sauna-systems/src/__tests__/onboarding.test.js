import { describe, it, expect } from 'vitest';
import { validateUrl } from '../config/onboarding';

describe('validateUrl', () => {
  it('accepts valid http URLs', () => {
    expect(validateUrl('http://homeassistant.local:8123')).toBe(true);
  });

  it('accepts valid https URLs', () => {
    expect(validateUrl('https://ha.example.com')).toBe(true);
  });

  it('rejects empty/null input', () => {
    expect(validateUrl('')).toBe(false);
    expect(validateUrl(null)).toBe(false);
    expect(validateUrl(undefined)).toBe(false);
  });

  it('rejects non-http protocols', () => {
    expect(validateUrl('ftp://example.com')).toBe(false);
  });

  it('rejects malformed URLs', () => {
    expect(validateUrl('not-a-url')).toBe(false);
  });
});
