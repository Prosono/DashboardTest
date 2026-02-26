import Database from 'better-sqlite3';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';

const DATA_DIR = process.env.DATA_DIR || join(process.cwd(), 'data');
if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

export const normalizeClientId = (value) => String(value || '')
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9_-]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 64);

export const DEFAULT_CLIENT_ID = normalizeClientId(process.env.DEFAULT_CLIENT_ID || 'smeigedag') || 'smeigedag';

const db = new Database(join(DATA_DIR, 'tunet.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const nowIso = () => new Date().toISOString();

const ensureClientsTable = () => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS clients (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
};

const ensureDashboardsTable = () => {
  const sql = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'dashboards'").get()?.sql || '';
  if (!sql) {
    db.exec(`
      CREATE TABLE dashboards (
        client_id TEXT NOT NULL,
        id TEXT NOT NULL,
        name TEXT NOT NULL,
        data TEXT NOT NULL,
        created_by TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (client_id, id)
      );
      CREATE INDEX IF NOT EXISTS idx_dashboards_updated_at ON dashboards(client_id, updated_at DESC);
    `);
    return;
  }

  const needsRebuild = sql.includes('id TEXT PRIMARY KEY') || !sql.includes('client_id');

  if (needsRebuild) {
    db.pragma('foreign_keys = OFF');
    try {
      db.exec(`
        BEGIN;
        ALTER TABLE dashboards RENAME TO dashboards_old;
        CREATE TABLE dashboards (
          client_id TEXT NOT NULL,
          id TEXT NOT NULL,
          name TEXT NOT NULL,
          data TEXT NOT NULL,
          created_by TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          PRIMARY KEY (client_id, id)
        );
        INSERT INTO dashboards (client_id, id, name, data, created_by, created_at, updated_at)
        SELECT '${DEFAULT_CLIENT_ID}', id, name, data, created_by, created_at, updated_at
        FROM dashboards_old;
        DROP TABLE dashboards_old;
        CREATE INDEX IF NOT EXISTS idx_dashboards_updated_at ON dashboards(client_id, updated_at DESC);
        COMMIT;
      `);
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    } finally {
      db.pragma('foreign_keys = ON');
    }
  } else {
    db.exec('CREATE INDEX IF NOT EXISTS idx_dashboards_updated_at ON dashboards(client_id, updated_at DESC)');
  }
};

const ensureDashboardVersionsTable = () => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS dashboard_versions (
      version_id TEXT PRIMARY KEY,
      client_id TEXT NOT NULL,
      dashboard_id TEXT NOT NULL,
      name TEXT NOT NULL,
      data TEXT NOT NULL,
      source_updated_at TEXT,
      created_by TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (client_id, dashboard_id) REFERENCES dashboards(client_id, id) ON DELETE CASCADE ON UPDATE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_dashboard_versions_lookup
      ON dashboard_versions(client_id, dashboard_id, created_at DESC);
  `);

  const columns = db.prepare('PRAGMA table_info(dashboard_versions)').all().map((col) => col.name);
  if (!columns.includes('source_updated_at')) {
    db.prepare('ALTER TABLE dashboard_versions ADD COLUMN source_updated_at TEXT').run();
  }
  db.exec('CREATE INDEX IF NOT EXISTS idx_dashboard_versions_lookup ON dashboard_versions(client_id, dashboard_id, created_at DESC)');
};

const ensureUsersTable = () => {
  const sql = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'users'").get()?.sql || '';
  if (!sql) {
    db.exec(`
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        client_id TEXT NOT NULL,
        username TEXT NOT NULL,
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
        FOREIGN KEY (client_id, assigned_dashboard_id) REFERENCES dashboards(client_id, id) ON UPDATE CASCADE,
        UNIQUE (client_id, username)
      );
      CREATE INDEX IF NOT EXISTS idx_users_username ON users(client_id, username);
    `);
    return;
  }

  const needsRebuild = (
    !sql.includes('client_id')
    || sql.includes('username TEXT NOT NULL UNIQUE')
    || sql.includes("role TEXT NOT NULL CHECK (role IN ('admin', 'user'))")
    || !sql.includes("role IN ('admin', 'user', 'inspector')")
  );

  if (needsRebuild) {
    const existingCols = db.prepare('PRAGMA table_info(users)').all().map((col) => col.name);
    const hasClientId = existingCols.includes('client_id');
    const clientExpr = hasClientId ? `COALESCE(NULLIF(client_id, ''), '${DEFAULT_CLIENT_ID}')` : `'${DEFAULT_CLIENT_ID}'`;
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
          client_id TEXT NOT NULL,
          username TEXT NOT NULL,
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
          FOREIGN KEY (client_id, assigned_dashboard_id) REFERENCES dashboards(client_id, id) ON UPDATE CASCADE,
          UNIQUE (client_id, username)
        );
        INSERT INTO users (
          id, client_id, username, password_hash, role, assigned_dashboard_id,
          ha_url, ha_token, full_name, email, phone, avatar_url,
          created_at, updated_at
        )
        SELECT
          id,
          ${clientExpr},
          username,
          password_hash,
          CASE WHEN role = 'admin' THEN 'admin' WHEN role = 'inspector' THEN 'inspector' ELSE 'user' END,
          COALESCE(NULLIF(assigned_dashboard_id, ''), 'default'),
          ${haUrlExpr},
          ${haTokenExpr},
          ${fullNameExpr},
          ${emailExpr},
          ${phoneExpr},
          ${avatarExpr},
          COALESCE(created_at, '${nowIso()}'),
          COALESCE(updated_at, '${nowIso()}')
        FROM users_old;
        DROP TABLE users_old;
        CREATE INDEX IF NOT EXISTS idx_users_username ON users(client_id, username);
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
  if (!userColumns.includes('client_id')) {
    db.prepare(`ALTER TABLE users ADD COLUMN client_id TEXT NOT NULL DEFAULT '${DEFAULT_CLIENT_ID}'`).run();
  }
  if (!userColumns.includes('ha_url')) db.prepare("ALTER TABLE users ADD COLUMN ha_url TEXT NOT NULL DEFAULT ''").run();
  if (!userColumns.includes('ha_token')) db.prepare("ALTER TABLE users ADD COLUMN ha_token TEXT NOT NULL DEFAULT ''").run();
  if (!userColumns.includes('full_name')) db.prepare("ALTER TABLE users ADD COLUMN full_name TEXT NOT NULL DEFAULT ''").run();
  if (!userColumns.includes('email')) db.prepare("ALTER TABLE users ADD COLUMN email TEXT NOT NULL DEFAULT ''").run();
  if (!userColumns.includes('phone')) db.prepare("ALTER TABLE users ADD COLUMN phone TEXT NOT NULL DEFAULT ''").run();
  if (!userColumns.includes('avatar_url')) db.prepare("ALTER TABLE users ADD COLUMN avatar_url TEXT NOT NULL DEFAULT ''").run();

  db.exec('CREATE INDEX IF NOT EXISTS idx_users_username ON users(client_id, username)');
};

const ensureSessionsTable = () => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      scope_client_id TEXT,
      is_super_admin INTEGER NOT NULL DEFAULT 0,
      session_username TEXT,
      last_seen_at TEXT,
      last_activity_at TEXT,
      last_activity_path TEXT,
      last_activity_label TEXT,
      last_activity_data TEXT,
      ip_address TEXT,
      user_agent TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

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
          scope_client_id TEXT,
          is_super_admin INTEGER NOT NULL DEFAULT 0,
          session_username TEXT,
          last_seen_at TEXT,
          last_activity_at TEXT,
          last_activity_path TEXT,
          last_activity_label TEXT,
          last_activity_data TEXT,
          ip_address TEXT,
          user_agent TEXT,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
        INSERT INTO sessions (
          token, user_id, expires_at, created_at, scope_client_id, is_super_admin, session_username,
          last_seen_at, last_activity_at, last_activity_path, last_activity_label, last_activity_data, ip_address, user_agent
        )
        SELECT
          s.token, s.user_id, s.expires_at, s.created_at, NULL, 0, NULL,
          s.created_at, s.created_at, '', 'login', '', '', ''
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

  const sessionColumns = db.prepare('PRAGMA table_info(sessions)').all().map((col) => col.name);
  if (!sessionColumns.includes('scope_client_id')) db.prepare('ALTER TABLE sessions ADD COLUMN scope_client_id TEXT').run();
  if (!sessionColumns.includes('is_super_admin')) db.prepare('ALTER TABLE sessions ADD COLUMN is_super_admin INTEGER NOT NULL DEFAULT 0').run();
  if (!sessionColumns.includes('session_username')) db.prepare('ALTER TABLE sessions ADD COLUMN session_username TEXT').run();
  if (!sessionColumns.includes('last_seen_at')) db.prepare('ALTER TABLE sessions ADD COLUMN last_seen_at TEXT').run();
  if (!sessionColumns.includes('last_activity_at')) db.prepare('ALTER TABLE sessions ADD COLUMN last_activity_at TEXT').run();
  if (!sessionColumns.includes('last_activity_path')) db.prepare('ALTER TABLE sessions ADD COLUMN last_activity_path TEXT').run();
  if (!sessionColumns.includes('last_activity_label')) db.prepare('ALTER TABLE sessions ADD COLUMN last_activity_label TEXT').run();
  if (!sessionColumns.includes('last_activity_data')) db.prepare('ALTER TABLE sessions ADD COLUMN last_activity_data TEXT').run();
  if (!sessionColumns.includes('ip_address')) db.prepare('ALTER TABLE sessions ADD COLUMN ip_address TEXT').run();
  if (!sessionColumns.includes('user_agent')) db.prepare('ALTER TABLE sessions ADD COLUMN user_agent TEXT').run();

  db.exec('CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_sessions_scope_client ON sessions(scope_client_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_sessions_last_seen ON sessions(last_seen_at DESC)');
};

const ensureHaConfigTable = () => {
  const sql = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'ha_config'").get()?.sql || '';
  const needsRebuild = !sql || sql.includes('id INTEGER PRIMARY KEY CHECK (id = 1)') || !sql.includes('client_id');

  if (needsRebuild) {
    const tableExists = Boolean(sql);
    db.pragma('foreign_keys = OFF');
    try {
      db.exec('BEGIN;');
      if (tableExists) {
        db.exec('ALTER TABLE ha_config RENAME TO ha_config_old;');
      }

      db.exec(`
        CREATE TABLE ha_config (
          client_id TEXT PRIMARY KEY,
          url TEXT NOT NULL DEFAULT '',
          fallback_url TEXT NOT NULL DEFAULT '',
          auth_method TEXT NOT NULL CHECK (auth_method IN ('oauth', 'token')) DEFAULT 'oauth',
          token TEXT NOT NULL DEFAULT '',
          oauth_tokens TEXT,
          connections_json TEXT,
          updated_by TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `);

      if (tableExists) {
        db.exec(`
          INSERT INTO ha_config (
            client_id, url, fallback_url, auth_method, token, oauth_tokens, connections_json, updated_by, created_at, updated_at
          )
          SELECT
            '${DEFAULT_CLIENT_ID}',
            COALESCE(url, ''),
            COALESCE(fallback_url, ''),
            CASE WHEN auth_method = 'token' THEN 'token' ELSE 'oauth' END,
            COALESCE(token, ''),
            oauth_tokens,
            NULL,
            updated_by,
            COALESCE(created_at, '${nowIso()}'),
            COALESCE(updated_at, '${nowIso()}')
          FROM ha_config_old
          LIMIT 1
        `);
        db.exec('DROP TABLE ha_config_old;');
      }

      db.exec('COMMIT;');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    } finally {
      db.pragma('foreign_keys = ON');
    }
  }

  const haConfigColumns = db.prepare('PRAGMA table_info(ha_config)').all().map((col) => col.name);
  if (!haConfigColumns.includes('connections_json')) {
    db.prepare('ALTER TABLE ha_config ADD COLUMN connections_json TEXT').run();
  }
};

const ensureProfilesTable = () => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS profiles (
      id TEXT PRIMARY KEY,
      ha_user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      device_label TEXT,
      data TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_profiles_ha_user_id ON profiles(ha_user_id);
  `);
};

const ensureSystemSettingsTable = () => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS system_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
};

const ensureClientRecord = (clientId, displayName = '') => {
  const normalized = normalizeClientId(clientId);
  if (!normalized) return null;
  const now = nowIso();
  const existing = db.prepare('SELECT id FROM clients WHERE id = ?').get(normalized);
  if (!existing) {
    db.prepare('INSERT INTO clients (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)')
      .run(normalized, displayName || normalized, now, now);
  }
  return normalized;
};

const ensureDefaultDashboard = (clientId) => {
  const existing = db.prepare('SELECT id FROM dashboards WHERE client_id = ? AND id = ?').get(clientId, 'default');
  if (existing) return;
  const now = nowIso();
  db.prepare('INSERT INTO dashboards (client_id, id, name, data, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(clientId, 'default', 'Default dashboard', JSON.stringify({ pagesConfig: { pages: ['home'], header: [], home: [] } }), null, now, now);
};

const ensureHaConfig = (clientId) => {
  const existing = db.prepare('SELECT client_id FROM ha_config WHERE client_id = ?').get(clientId);
  if (existing) return;
  const now = nowIso();
  db.prepare('INSERT INTO ha_config (client_id, url, fallback_url, auth_method, token, oauth_tokens, connections_json, updated_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(clientId, '', '', 'oauth', '', null, null, null, now, now);
};

export const provisionClientDefaults = (clientId, name = '') => {
  const normalized = ensureClientRecord(clientId, name);
  if (!normalized) return null;
  ensureDefaultDashboard(normalized);
  ensureHaConfig(normalized);
  return normalized;
};

ensureClientsTable();
ensureDashboardsTable();
ensureDashboardVersionsTable();
ensureUsersTable();
ensureSessionsTable();
ensureHaConfigTable();
ensureProfilesTable();
ensureSystemSettingsTable();

const distinctClients = new Set();
for (const row of db.prepare('SELECT DISTINCT client_id FROM users WHERE client_id IS NOT NULL AND client_id != ?').all('')) {
  if (row?.client_id) distinctClients.add(row.client_id);
}
for (const row of db.prepare('SELECT DISTINCT client_id FROM dashboards WHERE client_id IS NOT NULL AND client_id != ?').all('')) {
  if (row?.client_id) distinctClients.add(row.client_id);
}
for (const row of db.prepare('SELECT DISTINCT client_id FROM ha_config WHERE client_id IS NOT NULL AND client_id != ?').all('')) {
  if (row?.client_id) distinctClients.add(row.client_id);
}

if (distinctClients.size === 0) distinctClients.add(DEFAULT_CLIENT_ID);
for (const clientId of distinctClients) {
  provisionClientDefaults(clientId, clientId);
}

export default db;
