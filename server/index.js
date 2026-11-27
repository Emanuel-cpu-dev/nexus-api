import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { existsSync, mkdirSync, unlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { createRoutes } from './routes.js';
import { setupSocket } from './socket.js';
import { db, now } from './db.js';

const app = express();
const port = Number(process.env.PORT || 3000);
const publicUrl = process.env.PUBLIC_URL || `http://localhost:${port}`;
const uploadDir = resolve(process.env.UPLOAD_DIR || './uploads');
const uiDir = resolve(process.env.UI_DIR || './app/dist');
const dataDir = resolve(process.env.DATA_DIR || './data');
mkdirSync(uploadDir, { recursive: true });

app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '2mb' }));
app.use('/uploads', express.static(uploadDir));
app.use(express.static(uiDir));

app.get('/api/health', (req, res) => res.json({ ok: true, time: now() }));

// Copia consistente de SQLite para guardarla fuera de Render (rama "data").
app.get('/api/backup', (req, res) => {
  const key = process.env.BACKUP_KEY;
  if (key && req.query.key !== key) {
    return res.status(401).json({ error: 'No autorizado.' });
  }
  const file = join(dataDir, 'nexus-backup.db');
  try {
    if (existsSync(file)) unlinkSync(file);
    db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
    return res.sendFile(resolve(file), (error) => {
      if (error && !res.headersSent) res.status(500).json({ error: error.message });
      try { if (existsSync(file)) unlinkSync(file); } catch { /* ignorar */ }
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

app.use('/api', createRoutes(io));
setupSocket(io);

app.get('*', (req, res) => res.sendFile(join(uiDir, 'index.html')));

httpServer.listen(port, '0.0.0.0', () => {
  console.log(`Nexus API lista en http://0.0.0.0:${port} (PUBLIC_URL=${publicUrl})`);
});
