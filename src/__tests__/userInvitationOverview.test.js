import { describe, expect, it } from 'vitest';
import {
  getPendingInvitationStatus,
  getPendingInvitationUsers,
  summarizePendingInvitations,
} from '../utils/userInvitationOverview';

const NOW = Date.parse('2026-07-28T12:00:00.000Z');

const invitedUser = (id, expiresAt, sentAt = '2026-07-28T08:00:00.000Z') => ({
  id,
  fullName: id,
  accountStatus: 'invited',
  invitationSentAt: sentAt,
  invitationExpiresAt: expiresAt,
});

describe('pending invitation overview', () => {
  it('classifies pending, expiring and expired invitations', () => {
    expect(getPendingInvitationStatus(
      invitedUser('pending', '2026-07-30T12:00:00.000Z'),
      NOW,
    )).toBe('pending');
    expect(getPendingInvitationStatus(
      invitedUser('soon', '2026-07-28T18:00:00.000Z'),
      NOW,
    )).toBe('expiringSoon');
    expect(getPendingInvitationStatus(
      invitedUser('expired', '2026-07-28T11:59:59.000Z'),
      NOW,
    )).toBe('expired');
    expect(getPendingInvitationStatus(
      invitedUser('missing', '2026-07-30T12:00:00.000Z', ''),
      NOW,
    )).toBe('notSent');
  });

  it('only includes invited accounts and prioritizes invitations needing attention', () => {
    const users = [
      invitedUser('pending', '2026-07-30T12:00:00.000Z'),
      { id: 'active', accountStatus: 'active' },
      invitedUser('soon', '2026-07-28T18:00:00.000Z'),
      invitedUser('expired', '2026-07-27T12:00:00.000Z'),
      invitedUser('missing', '2026-07-30T12:00:00.000Z', ''),
    ];

    expect(getPendingInvitationUsers(users, NOW).map((user) => user.id))
      .toEqual(['missing', 'expired', 'soon', 'pending']);
    expect(summarizePendingInvitations(users, NOW)).toEqual({
      total: 4,
      pending: 1,
      expiringSoon: 1,
      expired: 1,
      notSent: 1,
    });
  });
});
