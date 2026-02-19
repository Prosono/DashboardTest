import { Router } from 'express';
import db from '../db.js';
import { adminRequired, authRequired } from '../auth.js';

const router = Router();

const toDashboardMeta = (row) => ({
  id: row.id,
  clientId: row.client_id,
  name: row.name,
  updatedAt: row.updated_at,
  createdAt: row.created_at,
});

const normalizeDashboardId = (value) => String(value || 'default').trim().replace(/\s+/g, '_').toLowerCase();

const canUserAccessDashboard = (user, dashboardId) => {
  if (user.role === 'admin') return true;
  return (user.assignedDashboardId || 'default') === dashboardId;
};

router.use(authRequired);

router.get('/', (req, res) => {
  const clientId = req.auth.user.clientId;
  if (req.auth.user.role === 'admin') {
    const rows = db.prepare('SELECT client_id, id, name, created_at, updated_at FROM dashboards WHERE client_id = ? ORDER BY updated_at DESC').all(clientId);
    return res.json({ dashboards: rows.map(toDashboardMeta) });
  }

  const row = db.prepare('SELECT client_id, id, name, created_at, updated_at FROM dashboards WHERE client_id = ? AND id = ?')
    .get(clientId, req.auth.user.assignedDashboardId || 'default');

  if (!row) return res.json({ dashboards: [] });
  return res.json({ dashboards: [toDashboardMeta(row)] });
});

router.get('/:id', (req, res) => {
  const clientId = req.auth.user.clientId;
  const id = normalizeDashboardId(req.params.id);
  if (!canUserAccessDashboard(req.auth.user, id)) {
    return res.status(403).json({ error: 'You do not have access to this dashboard' });
  }

  const row = db.prepare('SELECT * FROM dashboards WHERE client_id = ? AND id = ?').get(clientId, id);
  if (!row) return res.status(404).json({ error: 'Dashboard not found' });

  return res.json({
    ...toDashboardMeta(row),
    data: JSON.parse(row.data),
  });
});

router.post('/', adminRequired, (req, res) => {
  if (req.auth?.user?.isPlatformAdmin) {
    return res.status(403).json({ error: 'Platform admin cannot edit tenant dashboards' });
  }
  const clientId = req.auth.user.clientId;
  const rawId = req.body?.id || req.body?.name || 'dashboard';
  const id = normalizeDashboardId(rawId);
  const name = String(req.body?.name || id).trim() || id;
  const data = req.body?.data;

  if (!data || typeof data !== 'object') {
    return res.status(400).json({ error: 'Dashboard data is required' });
  }

  const existing = db.prepare('SELECT id FROM dashboards WHERE client_id = ? AND id = ?').get(clientId, id);
  if (existing) return res.status(409).json({ error: 'Dashboard id already exists' });

  const now = new Date().toISOString();
  db.prepare('INSERT INTO dashboards (client_id, id, name, data, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(clientId, id, name, JSON.stringify(data), req.auth.user.id, now, now);

  const row = db.prepare('SELECT client_id, id, name, created_at, updated_at FROM dashboards WHERE client_id = ? AND id = ?').get(clientId, id);
  return res.status(201).json({ dashboard: toDashboardMeta(row) });
});

router.put('/:id', adminRequired, (req, res) => {
  if (req.auth?.user?.isPlatformAdmin) {
    return res.status(403).json({ error: 'Platform admin cannot edit tenant dashboards' });
  }
  const clientId = req.auth.user.clientId;
  const id = normalizeDashboardId(req.params.id);
  const name = req.body?.name !== undefined ? String(req.body.name).trim() : null;
  const data = req.body?.data;

  const existing = db.prepare('SELECT * FROM dashboards WHERE client_id = ? AND id = ?').get(clientId, id);
  if (!existing) return res.status(404).json({ error: 'Dashboard not found' });

  const nextName = name || existing.name;
  const nextData = data && typeof data === 'object' ? data : JSON.parse(existing.data);
  const now = new Date().toISOString();

  db.prepare('UPDATE dashboards SET name = ?, data = ?, updated_at = ? WHERE client_id = ? AND id = ?')
    .run(nextName, JSON.stringify(nextData), now, clientId, id);

  const row = db.prepare('SELECT client_id, id, name, created_at, updated_at FROM dashboards WHERE client_id = ? AND id = ?').get(clientId, id);
  return res.json({ dashboard: toDashboardMeta(row) });
});

export default router;
