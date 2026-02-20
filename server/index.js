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
app.use('/api/clients', clientsRouter);
app.use('/api/branding', brandingRouter);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', version: process.env.npm_package_version || 'unknown' });
});

if (isProduction) {
  const distPath = join(__dirname, '..', 'dist');
  if (existsSync(distPath)) {
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      if (req.path.startsWith('/api/')) {
        return res.status(404).json({ error: 'Not found' });
      }
      return res.sendFile(join(distPath, 'index.html'));
    });
  }
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[server] Dashboard backend running on port ${PORT}`);
});

export default app;
