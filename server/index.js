import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { createRoutes } from './routes.js';
import { setupSocket } from './socket.js';
import { now } from './db.js';

const app = express();
const port = Number(process.env.PORT || 3000);
const publicUrl = process.env.PUBLIC_URL || `http://localhost:${port}`;
const uploadDir = resolve(process.env.UPLOAD_DIR || './uploads');
mkdirSync(uploadDir, { recursive: true });

app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '2mb' }));
app.use('/uploads', express.static(uploadDir));

app.get('/', (req, res) => res.json({ name: 'Nexus API', ok: true, publicUrl }));
app.get('/api/health', (req, res) => res.json({ ok: true, time: now() }));

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

app.use('/api', createRoutes(io));
setupSocket(io);

httpServer.listen(port, '0.0.0.0', () => {
  console.log(`Nexus API lista en http://0.0.0.0:${port} (PUBLIC_URL=${publicUrl})`);
});
