import express from 'express';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import authRouter from './routes/auth.js';
import usersRouter from './routes/users.js';
import dashboardsRouter from './routes/dashboards.js';
import iconsRouter from './routes/icons.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.PORT || '3002', 10);
const isProduction = process.env.NODE_ENV === 'production';

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

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', version: process.env.npm_package_version || 'unknown' });
});

if (isProduction) {
  const distPath = join(__dirname, '..', 'dist');
  if (existsSync(distPath)) {
    const assetsPath = join(distPath, 'assets');
    if (existsSync(assetsPath)) {
      app.use('/assets', express.static(assetsPath, {
        fallthrough: false,
        maxAge: '1y',
        immutable: true,
        setHeaders: (res) => {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        },
      }));
    }

    app.use(express.static(distPath, {
      index: false,
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html')) {
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
          res.setHeader('Pragma', 'no-cache');
          res.setHeader('Expires', '0');
        }
      },
    }));

    app.get('*', (req, res) => {
      if (req.path.startsWith('/api/')) {
        return res.status(404).json({ error: 'Not found' });
      }
      if (req.path.startsWith('/assets/')) {
        return res.status(404).type('text/plain').send('Asset not found');
      }
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      return res.sendFile(join(distPath, 'index.html'));
    });
  }
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[server] Dashboard backend running on port ${PORT}`);
});

export default app;
