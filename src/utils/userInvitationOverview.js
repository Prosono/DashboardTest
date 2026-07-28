export const INVITATION_EXPIRING_SOON_MS = 24 * 60 * 60 * 1000;

const timestampMs = (value) => {
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? parsed : null;
};

export const getPendingInvitationStatus = (user, nowMs = Date.now()) => {
  const sentAtMs = timestampMs(user?.invitationSentAt);
  const expiresAtMs = timestampMs(user?.invitationExpiresAt);

  if (!sentAtMs) return 'notSent';
  if (!expiresAtMs || expiresAtMs <= nowMs) return 'expired';
  if ((expiresAtMs - nowMs) <= INVITATION_EXPIRING_SOON_MS) return 'expiringSoon';
  return 'pending';
};

const invitationStatusPriority = {
  notSent: 0,
  expired: 1,
  expiringSoon: 2,
  pending: 3,
};

export const getPendingInvitationUsers = (users, nowMs = Date.now()) => (
  (Array.isArray(users) ? users : [])
    .filter((user) => user?.accountStatus === 'invited')
    .slice()
    .sort((a, b) => {
      const statusDelta = (
        invitationStatusPriority[getPendingInvitationStatus(a, nowMs)]
        - invitationStatusPriority[getPendingInvitationStatus(b, nowMs)]
      );
      if (statusDelta !== 0) return statusDelta;

      const aSentAt = timestampMs(a?.invitationSentAt) || 0;
      const bSentAt = timestampMs(b?.invitationSentAt) || 0;
      if (aSentAt !== bSentAt) return bSentAt - aSentAt;

      return String(a?.fullName || a?.email || '').localeCompare(String(b?.fullName || b?.email || ''));
    })
);

export const summarizePendingInvitations = (users, nowMs = Date.now()) => {
  const pendingUsers = getPendingInvitationUsers(users, nowMs);
  return pendingUsers.reduce((summary, user) => {
    const status = getPendingInvitationStatus(user, nowMs);
    summary.total += 1;
    summary[status] += 1;
    return summary;
  }, {
    total: 0,
    pending: 0,
    expiringSoon: 0,
    expired: 0,
    notSent: 0,
  });
};

export const formatInvitationDateTime = (value, locale) => {
  const parsed = timestampMs(value);
  if (!parsed) return '—';
  try {
    return new Intl.DateTimeFormat(locale || undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(parsed));
  } catch {
    return new Date(parsed).toLocaleString();
  }
};
