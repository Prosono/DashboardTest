import express from 'express';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import authRouter from './routes/auth.js';
import usersRouter from './routes/users.js';
import dashboardsRouter from './routes/dashboards.js';
import iconsRouter from './routes/icons.js';
import clientsRouter from './routes/clients.js';
import brandingRouter from './routes/branding.js';
import imageProxyRouter from './routes/imageProxy.js';
import { startRemoteInstanceHealthMonitor } from './remoteInstanceHealthMonitor.js';
import { appendRawLogEntry } from './rawLog.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(globalThis.process?.env?.PORT || '3002', 10);
const isProduction = globalThis.process?.env?.NODE_ENV === 'production';
const appBuildId = globalThis.process?.env?.APP_BUILD_ID
  || globalThis.process?.env?.SOURCE_VERSION
  || globalThis.process?.env?.npm_package_version
  || 'unknown';
const iosCacheRecoveryEnabled = ['1', 'true', 'yes', 'on'].includes(
  String(globalThis.process?.env?.IOS_CACHE_RECOVERY || '').trim().toLowerCase(),
);

const isIOSUserAgent = (userAgent = '') => {
  const ua = String(userAgent || '');
  return /iPad|iPhone|iPod/i.test(ua) || (/Macintosh/i.test(ua) && /Mobile/i.test(ua));
};

const toSafeLogString = (value, max = 512) => String(value || '').trim().slice(0, max);

const getRequestIp = (req) => {
  const forwardedFor = toSafeLogString(req?.get?.('x-forwarded-for') || req?.headers?.['x-forwarded-for'], 512);
  const firstForwarded = forwardedFor
    .split(',')
    .map((part) => part.trim())
    .find(Boolean);
  return (firstForwarded || toSafeLogString(req?.ip || req?.socket?.remoteAddress || '', 256)).replace(/^::ffff:/i, '');
};

const getRequestUserAgent = (req) => toSafeLogString(req?.get?.('user-agent') || req?.headers?.['user-agent'], 512);

const writeServerRawLog = (level, event, req, details = {}) => {
  try {
    appendRawLogEntry({
      level,
      event,
      details: {
        method: req?.method || '',
        path: req?.originalUrl || req?.url || '',
        ip: getRequestIp(req),
        userAgent: getRequestUserAgent(req),
        ...details,
      },
    });
  } catch {
    // Diagnostic logging is best effort only.
  }
};

const setAppShellHeaders = (res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('X-Smart-Sauna-Build', appBuildId);
};

const setIOSCacheRecoveryHeaders = (req, res) => {
  if (!iosCacheRecoveryEnabled || !isIOSUserAgent(req.headers['user-agent'])) return;
  // Clears WKWebView/Safari HTTP cache for this origin without deleting localStorage or auth tokens.
  res.setHeader('Clear-Site-Data', '"cache"');
  res.setHeader('X-Smart-Sauna-Cache-Recovery', 'cache');
};

const sendMissingAssetRecovery = (req, res) => {
  const path = String(req.path || '');
  if (!/\.(?:js|mjs)$/i.test(path)) {
    return res.status(404).type('text/plain').send('Asset not found');
  }

  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('X-Smart-Sauna-Missing-Asset-Recovery', 'reload');
  res.type('application/javascript');
  return res.send(`
const key = '__smart_sauna_missing_asset_reload_ts__';
const now = Date.now();
try {
  const last = Number(window.sessionStorage.getItem(key) || 0);
  if (!Number.isFinite(last) || now - last > 15000) {
    window.sessionStorage.setItem(key, String(now));
    const url = new URL(window.location.href);
    url.searchParams.set('_ss_recover', String(now));
    window.location.replace(url.toString());
  } else {
    window.location.reload();
  }
} catch {
  window.location.reload();
}
export const smartSaunaMissingAssetRecovery = true;
export default null;
`);
};

const app = express();
app.use(express.json({ limit: '3mb' }));

app.use((req, _res, next) => {
  const ingressPath = req.headers['x-ingress-path'];
  if (ingressPath && req.url.startsWith(ingressPath)) {
    req.url = req.url.slice(ingressPath.length) || '/';
  }
  next();
});

app.use('/api/auth', authRouter);
app.use('/api/users', usersRouter);
app.use('/api/dashboards', dashboardsRouter);
app.use('/api/icons', iconsRouter);
app.use('/api/clients', clientsRouter);
app.use('/api/branding', brandingRouter);
app.use('/api/image-proxy', imageProxyRouter);

app.post('/api/client-log', (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const event = toSafeLogString(body.event || 'event', 140).replace(/[^a-z0-9_.:-]+/gi, '_') || 'event';
  const details = body.details && typeof body.details === 'object' ? body.details : {};
  writeServerRawLog(body.level === 'warn' || body.level === 'error' ? body.level : 'info', `client.${event}`, req, {
    href: toSafeLogString(body.href, 500),
    page: toSafeLogString(body.page, 160),
    visibilityState: toSafeLogString(body.visibilityState, 40),
    isStandalone: body.isStandalone === undefined ? undefined : Boolean(body.isStandalone),
    hasAuthToken: body.hasAuthToken === undefined ? undefined : Boolean(body.hasAuthToken),
    clientId: toSafeLogString(body.clientId, 120),
    theme: toSafeLogString(body.theme, 80),
    details,
  });
  res.setHeader('Cache-Control', 'no-store');
  return res.json({ success: true });
});

app.get('/api/health', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ status: 'ok', version: globalThis.process?.env?.npm_package_version || 'unknown', buildId: appBuildId });
});

if (isProduction) {
  const distPath = join(__dirname, '..', 'dist');
  if (existsSync(distPath)) {
    const sendAppShell = (req, res) => {
      if (isIOSUserAgent(req.headers['user-agent']) || req.query?._ss_recover) {
        writeServerRawLog('info', 'http.app_shell', req, {
          buildId: appBuildId,
          iosCacheRecovery: iosCacheRecoveryEnabled,
          recover: toSafeLogString(req.query?._ss_recover, 80),
        });
      }
      setAppShellHeaders(res);
      setIOSCacheRecoveryHeaders(req, res);
      return res.sendFile(join(distPath, 'index.html'));
    };

    app.get(['/', '/index.html'], sendAppShell);

    const assetsPath = join(distPath, 'assets');
    if (existsSync(assetsPath)) {
      app.use('/assets', express.static(assetsPath, {
        fallthrough: true,
        maxAge: '1y',
        immutable: true,
        setHeaders: (res) => {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        },
      }));
    }
    app.get('/assets/*', sendMissingAssetRecovery);

    app.use(express.static(distPath, {
      index: false,
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html')) {
          setAppShellHeaders(res);
        }
      },
    }));

    app.get('*', (req, res) => {
      if (req.path.startsWith('/api/')) {
        return res.status(404).json({ error: 'Not found' });
      }
      if (req.path.startsWith('/assets/')) {
        return sendMissingAssetRecovery(req, res);
      }
      return sendAppShell(req, res);
    });
  }
}

app.listen(PORT, '0.0.0.0', () => {
  globalThis.console?.log(`[server] Dashboard backend running on port ${PORT}`);
});

startRemoteInstanceHealthMonitor();

export default app;
