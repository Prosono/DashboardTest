import { describe, expect, it } from 'vitest';
import {
  createInvitationToken,
  hashInvitationToken,
  isInvitationExpired,
  isValidInvitationEmail,
  validateInvitationPassword,
  validateInvitationUsername,
} from '../../server/userInvitations.js';

describe('user invitation security helpers', () => {
  it('creates opaque tokens and only persists deterministic hashes', () => {
    const token = createInvitationToken();
    expect(token.length).toBeGreaterThanOrEqual(40);
    expect(hashInvitationToken(token)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashInvitationToken(token)).not.toContain(token);
    expect(hashInvitationToken(token)).toBe(hashInvitationToken(token));
  });

  it('validates invitation identity fields', () => {
    expect(isValidInvitationEmail('bruker@example.no')).toBe(true);
    expect(isValidInvitationEmail('not-an-email')).toBe(false);
    expect(validateInvitationUsername('kari.nordmann').ok).toBe(true);
    expect(validateInvitationUsername('no spaces allowed').ok).toBe(false);
    expect(validateInvitationPassword('trygtpassord9').ok).toBe(true);
    expect(validateInvitationPassword('barebokstaver').ok).toBe(false);
  });

  it('treats invalid and elapsed timestamps as expired', () => {
    expect(isInvitationExpired('invalid', 1000)).toBe(true);
    expect(isInvitationExpired(new Date(999).toISOString(), 1000)).toBe(true);
    expect(isInvitationExpired(new Date(1001).toISOString(), 1000)).toBe(false);
  });
});

