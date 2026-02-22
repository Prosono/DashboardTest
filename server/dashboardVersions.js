import { randomUUID } from 'crypto';
import db from './db.js';

const DEFAULT_VERSION_LIMIT = Number.parseInt(process.env.DASHBOARD_VERSION_LIMIT || '100', 10);
const DASHBOARD_VERSION_LIMIT = Number.isFinite(DEFAULT_VERSION_LIMIT) && DEFAULT_VERSION_LIMIT > 0
  ? DEFAULT_VERSION_LIMIT
  : 100;

const pruneVersions = db.prepare(`
  DELETE FROM dashboard_versions
  WHERE version_id IN (
    SELECT version_id FROM dashboard_versions
    WHERE client_id = ? AND dashboard_id = ?
    ORDER BY created_at DESC
    LIMIT -1 OFFSET ?
  )
`);

export const toDashboardVersionMeta = (row) => ({
  id: row.version_id,
  clientId: row.client_id,
  dashboardId: row.dashboard_id,
  name: row.name,
  createdBy: row.created_by || null,
  createdAt: row.created_at,
  sourceUpdatedAt: row.source_updated_at || null,
});

export const listDashboardVersions = (clientId, dashboardId, limit = 30) => {
  const safeLimit = Math.max(1, Math.min(200, Number.parseInt(limit, 10) || 30));
  const rows = db.prepare(`
    SELECT version_id, client_id, dashboard_id, name, created_by, created_at, source_updated_at
    FROM dashboard_versions
    WHERE client_id = ? AND dashboard_id = ?
    ORDER BY created_at DESC
    LIMIT ?
  `).all(clientId, dashboardId, safeLimit);
  return rows.map(toDashboardVersionMeta);
};

export const saveDashboardVersionSnapshot = ({ clientId, dashboardId, name, data, createdBy, sourceUpdatedAt }) => {
  const now = new Date().toISOString();
  const payload = typeof data === 'string' ? data : JSON.stringify(data || {});
  const versionId = randomUUID();

  db.prepare(`
    INSERT INTO dashboard_versions (
      version_id, client_id, dashboard_id, name, data, source_updated_at, created_by, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    versionId,
    clientId,
    dashboardId,
    String(name || dashboardId || 'dashboard').trim() || String(dashboardId || 'dashboard'),
    payload,
    sourceUpdatedAt || null,
    createdBy || null,
    now,
  );

  pruneVersions.run(clientId, dashboardId, DASHBOARD_VERSION_LIMIT);
  return versionId;
};

export const fetchDashboardVersionRow = (clientId, dashboardId, versionId) => db.prepare(`
  SELECT version_id, client_id, dashboard_id, name, data, created_by, created_at, source_updated_at
  FROM dashboard_versions
  WHERE client_id = ? AND dashboard_id = ? AND version_id = ?
`).get(clientId, dashboardId, versionId);

