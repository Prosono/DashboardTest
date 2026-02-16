import Database from 'better-sqlite3';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { hashPassword } from './password.js';

const DATA_DIR = process.env.DATA_DIR || join(process.cwd(), 'data');
if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(join(DATA_DIR, 'tunet.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS dashboards (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    data TEXT NOT NULL,
    created_by TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin', 'user')),
    assigned_dashboard_id TEXT NOT NULL DEFAULT 'default',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (assigned_dashboard_id) REFERENCES dashboards(id) ON UPDATE CASCADE
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
  CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
  CREATE INDEX IF NOT EXISTS idx_dashboards_updated_at ON dashboards(updated_at DESC);

  CREATE TABLE IF NOT EXISTS ha_config (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    url TEXT NOT NULL DEFAULT '',
    fallback_url TEXT NOT NULL DEFAULT '',
    auth_method TEXT NOT NULL CHECK (auth_method IN ('oauth', 'token')) DEFAULT 'oauth',
    token TEXT NOT NULL DEFAULT '',
    oauth_tokens TEXT,
    updated_by TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`);

const now = new Date().toISOString();

const hasDefaultDashboard = db.prepare('SELECT id FROM dashboards WHERE id = ?').get('default');
if (!hasDefaultDashboard) {
  db.prepare('INSERT INTO dashboards (id, name, data, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run('default', 'Default dashboard', JSON.stringify({ pagesConfig: { pages: ['home'], header: [], home: [] } }), null, now, now);
}

const hasAdmin = db.prepare('SELECT id FROM users WHERE username = ?').get('admin');
if (!hasAdmin) {
  db.prepare('INSERT INTO users (id, username, password_hash, role, assigned_dashboard_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run('admin-default', 'admin', hashPassword('admin'), 'admin', 'default', now, now);
}

const hasHaConfig = db.prepare('SELECT id FROM ha_config WHERE id = 1').get();
if (!hasHaConfig) {
  db.prepare('INSERT INTO ha_config (id, url, fallback_url, auth_method, token, oauth_tokens, updated_by, created_at, updated_at) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run('', '', 'oauth', '', null, null, now, now);
}

export default db;
