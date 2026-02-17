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
    role TEXT NOT NULL CHECK (role IN ('admin', 'user', 'inspector')),
    assigned_dashboard_id TEXT NOT NULL DEFAULT 'default',
    ha_url TEXT NOT NULL DEFAULT '',
    ha_token TEXT NOT NULL DEFAULT '',
    full_name TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL DEFAULT '',
    phone TEXT NOT NULL DEFAULT '',
    avatar_url TEXT NOT NULL DEFAULT '',
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

const usersTableSql = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'users'").get()?.sql || '';
const needsUsersRoleMigration = usersTableSql.includes("role TEXT NOT NULL CHECK (role IN ('admin', 'user'))");

if (needsUsersRoleMigration) {
  const existingCols = db.prepare('PRAGMA table_info(users)').all().map((col) => col.name);
  const haUrlExpr = existingCols.includes('ha_url') ? "COALESCE(ha_url, '')" : "''";
  const haTokenExpr = existingCols.includes('ha_token') ? "COALESCE(ha_token, '')" : "''";
  const fullNameExpr = existingCols.includes('full_name') ? "COALESCE(full_name, '')" : "''";
  const emailExpr = existingCols.includes('email') ? "COALESCE(email, '')" : "''";
  const phoneExpr = existingCols.includes('phone') ? "COALESCE(phone, '')" : "''";
  const avatarExpr = existingCols.includes('avatar_url') ? "COALESCE(avatar_url, '')" : "''";

  db.pragma('foreign_keys = OFF');
  try {
    db.exec(`
      BEGIN;
      ALTER TABLE users RENAME TO users_old;
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('admin', 'user', 'inspector')),
        assigned_dashboard_id TEXT NOT NULL DEFAULT 'default',
        ha_url TEXT NOT NULL DEFAULT '',
        ha_token TEXT NOT NULL DEFAULT '',
        full_name TEXT NOT NULL DEFAULT '',
        email TEXT NOT NULL DEFAULT '',
        phone TEXT NOT NULL DEFAULT '',
        avatar_url TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (assigned_dashboard_id) REFERENCES dashboards(id) ON UPDATE CASCADE
      );
      INSERT INTO users (
        id, username, password_hash, role, assigned_dashboard_id,
        ha_url, ha_token, full_name, email, phone, avatar_url,
        created_at, updated_at
      )
      SELECT
        id,
        username,
        password_hash,
        CASE WHEN role = 'admin' THEN 'admin' WHEN role = 'inspector' THEN 'inspector' ELSE 'user' END,
        assigned_dashboard_id,
        ${haUrlExpr},
        ${haTokenExpr},
        ${fullNameExpr},
        ${emailExpr},
        ${phoneExpr},
        ${avatarExpr},
        created_at,
        updated_at
      FROM users_old;
      DROP TABLE users_old;
      CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
      COMMIT;
    `);
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  } finally {
    db.pragma('foreign_keys = ON');
  }
}

const userColumns = db.prepare('PRAGMA table_info(users)').all().map((col) => col.name);
if (!userColumns.includes('ha_url')) {
  db.prepare("ALTER TABLE users ADD COLUMN ha_url TEXT NOT NULL DEFAULT ''").run();
}
if (!userColumns.includes('ha_token')) {
  db.prepare("ALTER TABLE users ADD COLUMN ha_token TEXT NOT NULL DEFAULT ''").run();
}
if (!userColumns.includes('full_name')) {
  db.prepare("ALTER TABLE users ADD COLUMN full_name TEXT NOT NULL DEFAULT ''").run();
}
if (!userColumns.includes('email')) {
  db.prepare("ALTER TABLE users ADD COLUMN email TEXT NOT NULL DEFAULT ''").run();
}
if (!userColumns.includes('phone')) {
  db.prepare("ALTER TABLE users ADD COLUMN phone TEXT NOT NULL DEFAULT ''").run();
}
if (!userColumns.includes('avatar_url')) {
  db.prepare("ALTER TABLE users ADD COLUMN avatar_url TEXT NOT NULL DEFAULT ''").run();
}

const sessionsFk = db.prepare('PRAGMA foreign_key_list(sessions)').all();
const sessionsUserRef = sessionsFk.find((row) => row.from === 'user_id')?.table;
if (sessionsUserRef && sessionsUserRef !== 'users') {
  db.pragma('foreign_keys = OFF');
  try {
    db.exec(`
      BEGIN;
      ALTER TABLE sessions RENAME TO sessions_old;
      CREATE TABLE sessions (
        token TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      INSERT INTO sessions (token, user_id, expires_at, created_at)
      SELECT s.token, s.user_id, s.expires_at, s.created_at
      FROM sessions_old s
      WHERE EXISTS (SELECT 1 FROM users u WHERE u.id = s.user_id);
      DROP TABLE sessions_old;
      CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
      COMMIT;
    `);
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  } finally {
    db.pragma('foreign_keys = ON');
  }
}

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
