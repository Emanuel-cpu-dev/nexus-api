import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { existsSync, mkdirSync, readFileSync, unlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { createRoutes } from './routes.js';
import { setupSocket } from './socket.js';
import { db, now, blobBuffer, fileDataByFilename, migrateUploadsFromDisk } from './db.js';

const app = express();
const port = Number(process.env.PORT || 3000);
const publicUrl = process.env.PUBLIC_URL || `http://localhost:${port}`;
const uploadDir = resolve(process.env.UPLOAD_DIR || './uploads');
const uiDir = resolve(process.env.UI_DIR || './app/dist');
const dataDir = resolve(process.env.DATA_DIR || './data');
const releaseFile = resolve(process.env.RELEASE_FILE || './mobile-release.json');
const uiReleaseFile = resolve(process.env.UI_RELEASE_FILE || './ui-release.json');
mkdirSync(uploadDir, { recursive: true });
migrateUploadsFromDisk(uploadDir);

app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '2mb' }));

// Las imágenes y archivos se sirven desde SQLite, que sobrevive a los deploys de Render.
app.get('/uploads/:filename', (req, res) => {
  const row = fileDataByFilename(req.params.filename);
  const data = blobBuffer(row?.data);
  if (data?.length) {
    res.setHeader('Content-Type', row.mime || 'application/octet-stream');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    return res.send(data);
  }
  return res.sendFile(join(uploadDir, req.params.filename), (error) => {
    if (error && !res.headersSent) res.status(404).end();
  });
});
app.use(express.static(uiDir));

// APK de Android: se sirve con el MIME correcto para que el celular la descargue
// como aplicación y no como un archivo sin tipo desde WhatsApp.
app.get(['/Nexus.apk', '/apk'], (req, res) => {
  const file = resolve(process.env.APK_PATH || './Nexus.apk');
  if (!existsSync(file)) return res.status(404).send('APK no disponible.');
  res.setHeader('Content-Type', 'application/vnd.android.package-archive');
  res.setHeader('Content-Disposition', 'attachment; filename="Nexus.apk"');
  return res.sendFile(file);
});

app.get('/api/health', (req, res) => res.json({ ok: true, time: now() }));

// Versión de la APK publicada. La app Android la consulta para avisar
// cuando hay una actualización nueva, sin tener que pasar links manualmente.
function readRelease() {
  const fallback = {
    versionCode: 0,
    versionName: '',
    notes: '',
    force: false,
    apkUrl: '/Nexus.apk'
  };
  if (!existsSync(releaseFile)) return fallback;
  try {
    const release = JSON.parse(readFileSync(releaseFile, 'utf8'));
    return {
      ...fallback,
      versionCode: Number(release.versionCode) || 0,
      versionName: String(release.versionName || ''),
      notes: String(release.notes || ''),
      force: Boolean(release.force),
      apkUrl: String(release.apkUrl || '/Nexus.apk')
    };
  } catch (error) {
    return { ...fallback, error: error.message };
  }
}

app.get('/api/app-version', (req, res) => res.json(readRelease()));

// Versión de la interfaz web. Electron abre esta misma UI desde Render, así que
// las mejoras llegan a la PC sin reenviar el .exe; la app avisa y recarga.
function readUiRelease() {
  const fallback = { uiCode: 0, uiVersion: '', notes: '' };
  if (!existsSync(uiReleaseFile)) return fallback;
  try {
    const release = JSON.parse(readFileSync(uiReleaseFile, 'utf8'));
    return {
      ...fallback,
      uiCode: Number(release.uiCode) || 0,
      uiVersion: String(release.uiVersion || ''),
      notes: String(release.notes || '')
    };
  } catch (error) {
    return { ...fallback, error: error.message };
  }
}

app.get('/api/ui-version', (req, res) => res.json(readUiRelease()));

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
setupSocket(io, readRelease());

app.get('*', (req, res) => res.sendFile(join(uiDir, 'index.html')));

httpServer.listen(port, '0.0.0.0', () => {
  console.log(`Nexus API lista en http://0.0.0.0:${port} (PUBLIC_URL=${publicUrl})`);
});
