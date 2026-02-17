import { describe, it, expect } from 'vitest';
import { themes } from '../config/themes';

describe('themes', () => {
  it('exports a non-empty themes object', () => {
    expect(themes).toBeDefined();
    expect(Object.keys(themes).length).toBeGreaterThan(0);
  });

  it('each theme has required CSS variables', () => {
    const requiredVars = ['--bg-primary', '--glass-bg', '--text-primary', '--accent-color'];
    for (const [name, theme] of Object.entries(themes)) {
      for (const v of requiredVars) {
        expect(theme.colors, `${name} missing ${v}`).toHaveProperty(v);
      }
    }
  });
});
