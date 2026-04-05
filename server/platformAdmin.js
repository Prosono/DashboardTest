import { DEFAULT_CLIENT_ID, normalizeClientId } from './db.js';

export const SUPER_ADMIN_CLIENT_ID = normalizeClientId(
  globalThis.process?.env?.SUPER_ADMIN_CLIENT_ID || 'AdministratorClient',
) || 'administratorclient';

export const PLATFORM_ADMIN_CLIENT_ID = normalizeClientId(
  globalThis.process?.env?.PLATFORM_ADMIN_CLIENT_ID || SUPER_ADMIN_CLIENT_ID,
) || SUPER_ADMIN_CLIENT_ID;

export const isPlatformAdminClientId = (value) => (
  (normalizeClientId(value) || DEFAULT_CLIENT_ID) === PLATFORM_ADMIN_CLIENT_ID
);
