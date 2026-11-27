import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// La base vive en una rama aparte del repo. Render no tiene disco persistente,
// así que al arrancar bajamos la última copia antes de abrir SQLite.
const DATA_DIR = process.env.DATA_DIR || './data';
const DB_URL = process.env.DB_URL
  || 'https://raw.githubusercontent.com/Emanuel-cpu-dev/nexus-api/data/data/nexus.db';

export async function restoreDatabase() {
  mkdirSync(DATA_DIR, { recursive: true });
  const target = join(DATA_DIR, 'nexus.db');
  if (existsSync(target)) return;

  try {
    const response = await fetch(DB_URL, { cache: 'no-store' });
    if (!response.ok) {
      console.log(`Sin copia en GitHub (${response.status}). Se crea una base nueva.`);
      return;
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length < 100) return;
    writeFileSync(target, bytes);
    console.log('Base de Nexus restaurada desde la copia de GitHub.');
  } catch (error) {
    console.log('No se pudo restaurar la base; se crea una nueva:', error.message);
  }
}

await restoreDatabase();
