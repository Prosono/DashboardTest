import { Router } from 'express';
import db from '../db.js';
import { adminRequired, authRequired } from '../auth.js';

const router = Router();

const SETTINGS_KEYS = [
  'global_branding_title',
  'global_branding_logo_url',
  'global_branding_logo_url_light',
  'global_branding_logo_url_dark',
  'global_branding_updated_at',
];

const readGlobalBranding = () => {
  const rows = db.prepare(
    `SELECT key, value FROM system_settings WHERE key IN (${SETTINGS_KEYS.map(() => '?').join(',')})`,
  ).all(...SETTINGS_KEYS);

  const map = Object.fromEntries(rows.map((row) => [row.key, row.value]));
  return {
    title: String(map.global_branding_title || '').trim(),
    logoUrl: String(map.global_branding_logo_url || '').trim(),
    logoUrlLight: String(map.global_branding_logo_url_light || '').trim(),
    logoUrlDark: String(map.global_branding_logo_url_dark || '').trim(),
    updatedAt: String(map.global_branding_updated_at || '').trim() || null,
  };
};

const upsertSetting = db.prepare(`
  INSERT INTO system_settings (key, value, updated_at)
  VALUES (?, ?, ?)
  ON CONFLICT(key) DO UPDATE SET
    value = excluded.value,
    updated_at = excluded.updated_at
`);

router.get('/', (_req, res) => {
  return res.json({ branding: readGlobalBranding() });
});

router.put('/', authRequired, adminRequired, (req, res) => {
  if (!req.auth?.user?.isPlatformAdmin) {
    return res.status(403).json({ error: 'Only platform admin can update global branding' });
  }

  const title = String(req.body?.title || '').trim();
  const logoUrl = String(req.body?.logoUrl || '').trim();
  const logoUrlLight = String(req.body?.logoUrlLight || '').trim();
  const logoUrlDark = String(req.body?.logoUrlDark || '').trim();
  const now = new Date().toISOString();

  upsertSetting.run('global_branding_title', title, now);
  upsertSetting.run('global_branding_logo_url', logoUrl, now);
  upsertSetting.run('global_branding_logo_url_light', logoUrlLight, now);
  upsertSetting.run('global_branding_logo_url_dark', logoUrlDark, now);
  upsertSetting.run('global_branding_updated_at', now, now);

  return res.json({
    branding: {
      title,
      logoUrl,
      logoUrlLight,
      logoUrlDark,
      updatedAt: now,
    },
  });
});

export default router;
