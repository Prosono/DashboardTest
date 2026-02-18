import { randomUUID } from 'crypto';
import db, { normalizeClientId, provisionClientDefaults } from '../db.js';
import { hashPassword } from '../password.js';

const usage = () => {
  console.log(`
Usage:
  node server/cli/manage-users.js list-clients
  node server/cli/manage-users.js create-client <clientId> [displayName]
  node server/cli/manage-users.js list-users <clientId>
  node server/cli/manage-users.js create-user <clientId> <username> <role>
  node server/cli/manage-users.js set-password <clientId> <username>

Roles:
  admin | user | inspector
`);
};

const parseRole = (role) => {
  const value = String(role || '').trim().toLowerCase();
  if (value === 'admin' || value === 'inspector') return value;
  return 'user';
};

const promptHidden = async (question) => {
  const stdin = process.stdin;
  const stdout = process.stdout;

  return await new Promise((resolve) => {
    let value = '';
    stdout.write(question);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');

    const onData = (char) => {
      if (char === '\r' || char === '\n') {
        stdout.write('\n');
        stdin.setRawMode(false);
        stdin.pause();
        stdin.removeListener('data', onData);
        resolve(value);
        return;
      }
      if (char === '\u0003') {
        stdout.write('\n');
        process.exit(130);
      }
      if (char === '\u007f') {
        value = value.slice(0, -1);
        return;
      }
      value += char;
    };

    stdin.on('data', onData);
  });
};

const ensureClient = (clientId, displayName = '') => {
  const normalized = normalizeClientId(clientId);
  if (!normalized) throw new Error('Invalid clientId');
  provisionClientDefaults(normalized, displayName || normalized);
  return normalized;
};

const listClients = () => {
  const rows = db.prepare('SELECT id, name, created_at, updated_at FROM clients ORDER BY id ASC').all();
  if (rows.length === 0) {
    console.log('No clients found.');
    return;
  }
  rows.forEach((row) => {
    console.log(`${row.id}\t${row.name}\tupdated=${row.updated_at}`);
  });
};

const listUsers = (clientId) => {
  const normalized = ensureClient(clientId);
  const rows = db.prepare(`
    SELECT id, username, role, assigned_dashboard_id, created_at, updated_at
    FROM users
    WHERE client_id = ?
    ORDER BY username ASC
  `).all(normalized);
  if (rows.length === 0) {
    console.log(`No users found for client "${normalized}".`);
    return;
  }
  rows.forEach((row) => {
    console.log(`${row.username}\trole=${row.role}\tdashboard=${row.assigned_dashboard_id}\tid=${row.id}`);
  });
};

const createUser = async (clientId, username, roleInput) => {
  const normalizedClientId = ensureClient(clientId);
  const normalizedUsername = String(username || '').trim();
  if (!normalizedUsername) throw new Error('Username is required');
  const role = parseRole(roleInput);

  const existing = db.prepare('SELECT id FROM users WHERE client_id = ? AND username = ?').get(normalizedClientId, normalizedUsername);
  if (existing) throw new Error(`User "${normalizedUsername}" already exists in client "${normalizedClientId}"`);

  const password = await promptHidden(`Password for ${normalizedUsername}@${normalizedClientId}: `);
  const passwordConfirm = await promptHidden('Confirm password: ');
  if (!password) throw new Error('Password cannot be empty');
  if (password !== passwordConfirm) throw new Error('Passwords do not match');

  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO users (
      id, client_id, username, password_hash, role, assigned_dashboard_id,
      ha_url, ha_token, full_name, email, phone, avatar_url,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, '', '', '', '', '', '', ?, ?)
  `).run(
    randomUUID(),
    normalizedClientId,
    normalizedUsername,
    hashPassword(password),
    role,
    'default',
    now,
    now,
  );

  console.log(`Created ${role} user "${normalizedUsername}" for client "${normalizedClientId}".`);
};

const setPassword = async (clientId, username) => {
  const normalizedClientId = normalizeClientId(clientId);
  const normalizedUsername = String(username || '').trim();
  if (!normalizedClientId || !normalizedUsername) throw new Error('clientId and username are required');

  const user = db.prepare('SELECT id FROM users WHERE client_id = ? AND username = ?').get(normalizedClientId, normalizedUsername);
  if (!user) throw new Error(`User "${normalizedUsername}" not found in client "${normalizedClientId}"`);

  const password = await promptHidden(`New password for ${normalizedUsername}@${normalizedClientId}: `);
  const passwordConfirm = await promptHidden('Confirm password: ');
  if (!password) throw new Error('Password cannot be empty');
  if (password !== passwordConfirm) throw new Error('Passwords do not match');

  db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?')
    .run(hashPassword(password), new Date().toISOString(), user.id);

  console.log(`Password updated for "${normalizedUsername}" in client "${normalizedClientId}".`);
};

const run = async () => {
  const [, , cmd, ...args] = process.argv;

  try {
    switch (cmd) {
      case 'list-clients':
        listClients();
        break;
      case 'create-client': {
        const [clientId, ...nameParts] = args;
        if (!clientId) throw new Error('clientId is required');
        const normalized = ensureClient(clientId, nameParts.join(' ').trim());
        console.log(`Client ready: ${normalized}`);
        break;
      }
      case 'list-users': {
        const [clientId] = args;
        if (!clientId) throw new Error('clientId is required');
        listUsers(clientId);
        break;
      }
      case 'create-user': {
        const [clientId, username, role] = args;
        if (!clientId || !username) throw new Error('clientId and username are required');
        await createUser(clientId, username, role || 'user');
        break;
      }
      case 'set-password': {
        const [clientId, username] = args;
        if (!clientId || !username) throw new Error('clientId and username are required');
        await setPassword(clientId, username);
        break;
      }
      default:
        usage();
        process.exitCode = 1;
    }
  } catch (error) {
    console.error(`Error: ${error.message || error}`);
    process.exitCode = 1;
  }
};

run();
