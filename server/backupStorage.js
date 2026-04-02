import { createReadStream, promises as fs } from 'fs';
import { basename, isAbsolute, join, relative, resolve } from 'path';
import { normalizeClientId } from './db.js';

const PRODUCTION_BACKUP_ROOT = '/srv/ha-backups';
const DEVELOPMENT_BACKUP_ROOT = join(process.cwd(), 'data', 'ha-backups');

const toPosixPath = (value) => String(value || '').replace(/\\/g, '/');
const normalizeBackupLocationId = (value) => String(value ?? '')
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9_-]+/g, '-')
  .replace(/^-+|-+$/g, '');

const pathExists = async (targetPath) => {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
};

export const getBackupRootDirectory = () => {
  const configured = String(process.env.HA_BACKUP_ROOT || '').trim();
  if (configured) return resolve(configured);
  if (process.env.NODE_ENV === 'production') return PRODUCTION_BACKUP_ROOT;
  return resolve(DEVELOPMENT_BACKUP_ROOT);
};

export const resolveClientBackupDirectory = (clientIdRaw, locationIdRaw = '') => {
  const clientId = normalizeClientId(clientIdRaw);
  if (!clientId) {
    const error = new Error('Valid clientId is required');
    error.statusCode = 400;
    throw error;
  }

  const locationId = normalizeBackupLocationId(locationIdRaw);
  const rootDirectory = getBackupRootDirectory();
  const clientDirectoryPath = resolve(rootDirectory, clientId);
  const directoryPath = locationId
    ? resolve(clientDirectoryPath, locationId)
    : clientDirectoryPath;

  return {
    clientId,
    locationId,
    rootDirectory,
    clientDirectoryPath,
    directoryPath,
    displayRootPath: toPosixPath(rootDirectory),
    displayClientDirectoryPath: toPosixPath(clientDirectoryPath),
    displayDirectoryPath: toPosixPath(directoryPath),
  };
};

const toBackupFileEntry = async (directoryPath, dirent) => {
  if (!dirent?.isFile?.()) return null;

  const absolutePath = join(directoryPath, dirent.name);
  const stats = await fs.stat(absolutePath);
  if (!stats.isFile()) return null;

  return {
    name: dirent.name,
    sizeBytes: Number(stats.size || 0),
    modifiedAt: stats.mtime?.toISOString?.() || null,
    createdAt: stats.birthtime?.toISOString?.() || stats.ctime?.toISOString?.() || null,
    extension: dirent.name.includes('.') ? dirent.name.split('.').pop()?.toLowerCase() || '' : '',
  };
};

export const listClientBackupFiles = async (clientIdRaw, locationIdRaw = '') => {
  const resolved = resolveClientBackupDirectory(clientIdRaw, locationIdRaw);
  const exists = await pathExists(resolved.directoryPath);

  if (!exists) {
    return {
      ...resolved,
      exists: false,
      fileCount: 0,
      totalBytes: 0,
      latestBackupAt: null,
      files: [],
    };
  }

  const entries = await fs.readdir(resolved.directoryPath, { withFileTypes: true });
  const files = (await Promise.all(entries.map((entry) => toBackupFileEntry(resolved.directoryPath, entry))))
    .filter(Boolean)
    .sort((a, b) => {
      const aTs = Date.parse(String(a?.modifiedAt || ''));
      const bTs = Date.parse(String(b?.modifiedAt || ''));
      return (Number.isFinite(bTs) ? bTs : 0) - (Number.isFinite(aTs) ? aTs : 0);
    });

  return {
    ...resolved,
    exists: true,
    fileCount: files.length,
    totalBytes: files.reduce((sum, file) => sum + Number(file?.sizeBytes || 0), 0),
    latestBackupAt: files[0]?.modifiedAt || null,
    files,
  };
};

export const ensureClientBackupDirectory = async (clientIdRaw, locationIdRaw = '') => {
  const resolved = resolveClientBackupDirectory(clientIdRaw, locationIdRaw);
  await fs.mkdir(resolved.directoryPath, { recursive: true });
  return listClientBackupFiles(resolved.clientId, resolved.locationId);
};

const assertSafeBackupFileName = (fileNameRaw) => {
  const fileName = String(fileNameRaw || '').trim();
  if (!fileName) {
    const error = new Error('Backup file name is required');
    error.statusCode = 400;
    throw error;
  }

  if (basename(fileName) !== fileName || fileName.includes('/') || fileName.includes('\\')) {
    const error = new Error('Invalid backup file name');
    error.statusCode = 400;
    throw error;
  }

  return fileName;
};

export const resolveClientBackupFile = async (clientIdRaw, fileNameRaw, locationIdRaw = '') => {
  const resolved = resolveClientBackupDirectory(clientIdRaw, locationIdRaw);
  const fileName = assertSafeBackupFileName(fileNameRaw);
  const absolutePath = resolve(resolved.directoryPath, fileName);
  const relativePath = relative(resolved.directoryPath, absolutePath);

  if (relativePath.startsWith('..') || isAbsolute(relativePath)) {
    const error = new Error('Invalid backup file path');
    error.statusCode = 400;
    throw error;
  }

  const stats = await fs.stat(absolutePath).catch(() => null);
  if (!stats?.isFile?.()) {
    const error = new Error('Backup file not found');
    error.statusCode = 404;
    throw error;
  }

  return {
    ...resolved,
    fileName,
    absolutePath,
    sizeBytes: Number(stats.size || 0),
    modifiedAt: stats.mtime?.toISOString?.() || null,
  };
};

export const deleteClientBackupFile = async (clientIdRaw, fileNameRaw, locationIdRaw = '') => {
  const resolved = await resolveClientBackupFile(clientIdRaw, fileNameRaw, locationIdRaw);
  await fs.unlink(resolved.absolutePath);
  return {
    fileName: resolved.fileName,
    clientId: resolved.clientId,
    locationId: resolved.locationId,
  };
};

export const createClientBackupReadStream = async (clientIdRaw, fileNameRaw, locationIdRaw = '') => {
  const resolved = await resolveClientBackupFile(clientIdRaw, fileNameRaw, locationIdRaw);
  return {
    ...resolved,
    stream: createReadStream(resolved.absolutePath),
  };
};
