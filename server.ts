import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import cookieParser from 'cookie-parser';
import JSZip from 'jszip';
import 'dotenv/config';

import { attachAuth } from './server/services/security.ts';
import { bootstrapInitialState } from './server/services/seed.ts';
import authRoutes from './server/routes/auth.ts';
import dashboardRoutes from './server/routes/dashboard.ts';
import predictionRoutes from './server/routes/prediction.ts';
import datasetRoutes from './server/routes/datasets.ts';
import modelRoutes from './server/routes/models.ts';
import reportRoutes from './server/routes/reports.ts';
import adminRoutes from './server/routes/admin.ts';

export async function createApp(): Promise<express.Express> {
  const app = express();

  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());
  app.use(attachAuth);

  // Health endpoint
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, application: 'DrugEfficacy Insight' });
  });

  // REST API endpoints
  app.use('/api/auth', authRoutes);
  app.use('/api/dashboard', dashboardRoutes);
  app.use('/api', predictionRoutes);
  app.use('/api/datasets', datasetRoutes);
  app.use('/api/models', modelRoutes);
  app.use('/api/reports', reportRoutes);
  app.use('/api/admin', adminRoutes);

  // Download Windows Python/Flask project bundle as ZIP
  app.get('/api/project/download-windows-zip', async (_req, res) => {
    const pyRoot = path.resolve(process.cwd(), 'drug-efficacy-insight');
    if (!fs.existsSync(pyRoot)) {
      res.status(404).json({ error: 'Python Flask project bundle directory not found.' });
      return;
    }

    const zip = new JSZip();
    const walk = (dir: string, relBase: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === '__pycache__' || entry.name === 'venv' || entry.name === '.pytest_cache') {
          continue;
        }
        const full = path.join(dir, entry.name);
        const rel = relBase ? `${relBase}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
          walk(full, rel);
        } else {
          zip.file(rel, fs.readFileSync(full));
        }
      }
    };
    walk(pyRoot, 'drug-efficacy-insight');

    const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="drug-efficacy-insight-windows.zip"');
    res.send(buffer);
  });

  // Error handler for multer / unexpected JSON errors
  app.use(
    (
      err: Error,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction
    ) => {
      res.status(500).json({ error: err.message || 'Internal server error' });
    }
  );

  return app;
}

async function startServer() {
  await bootstrapInitialState();
  const app = await createApp();
  const PORT = Number(process.env.PORT || 3000);

  if (process.env.NODE_ENV === 'production') {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`DrugEfficacy Insight server listening on http://0.0.0.0:${PORT}`);
  });
}

// Start only when executed directly (not when imported by test runner)
const isMainModule =
  process.argv[1] &&
  (process.argv[1].endsWith('server.ts') || process.argv[1].endsWith('server.js'));

if (isMainModule) {
  startServer().catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
}
