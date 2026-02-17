import { describe, it, expect } from 'vitest';
import { en, nn } from '../i18n';

describe('i18n', () => {
  it('exports English and Norwegian translation objects', () => {
    expect(en).toBeDefined();
    expect(nn).toBeDefined();
    expect(typeof en).toBe('object');
    expect(typeof nn).toBe('object');
  });

  it('both languages have the same keys', () => {
    const enKeys = Object.keys(en).sort();
    const nnKeys = Object.keys(nn).sort();
    const missingInNn = enKeys.filter(k => !nnKeys.includes(k));
    const missingInEn = nnKeys.filter(k => !enKeys.includes(k));
    expect(missingInNn, `Keys in en.json missing from nn.json: ${missingInNn.join(', ')}`).toHaveLength(0);
    expect(missingInEn, `Keys in nn.json missing from en.json: ${missingInEn.join(', ')}`).toHaveLength(0);
  });

  it('no empty translation values', () => {
    for (const [key, value] of Object.entries(en)) {
      expect(value, `en.json key "${key}" is empty`).not.toBe('');
    }
    for (const [key, value] of Object.entries(nn)) {
      expect(value, `nn.json key "${key}" is empty`).not.toBe('');
    }
  });
});
