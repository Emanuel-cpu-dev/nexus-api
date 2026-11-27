import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// Render no tiene disco persistente: al arrancar bajamos la última copia de la
// base desde la rama "data" del repo, antes de que SQLite abra el archivo.
const DATA_DIR = process.env.DATA_DIR || './data';
const DB_URL = process.env.DB_URL
  || 'https://raw.githubusercontent.com/Emanuel-cpu-dev/nexus-api/data/data/nexus.db';
const API_URL = 'https://api.github.com/repos/Emanuel-cpu-dev/nexus-api/contents/data/nexus.db?ref=data';
const MAGIC = Buffer.from('SQLite format 3\0');

function isSqlite(bytes) {
  return bytes.length > 1000 && bytes.subarray(0, 16).equals(MAGIC);
}

export async function restoreDatabase() {
  mkdirSync(DATA_DIR, { recursive: true });
  const target = join(DATA_DIR, 'nexus.db');

  if (existsSync(target)) {
    if (isSqlite(readFileSync(target))) return;
    console.log('La copia local no es SQLite; se descarga de nuevo.');
    unlinkSync(target);
  }

  // El parámetro con la hora evita que GitHub Raw sirva una versión vieja en caché.
  const sources = [
    `${DB_URL}?t=${Date.now()}`,
    `${API_URL}&t=${Date.now()}`
  ];

  for (const url of sources) {
    try {
      const response = await fetch(url, {
        cache: 'no-store',
        headers: { Accept: 'application/vnd.github.raw+json' }
      });
      if (!response.ok) {
        console.log(`Sin copia válida en GitHub (${response.status}).`);
        continue;
      }
      let bytes = Buffer.from(await response.arrayBuffer());
      if (!isSqlite(bytes)) {
        // La API puede responder JSON con el contenido en base64.
        try {
          const json = JSON.parse(bytes.toString('utf8'));
          if (json.content) bytes = Buffer.from(json.content.replace(/\s/g, ''), 'base64');
        } catch { /* no era JSON */ }
      }
      if (!isSqlite(bytes)) {
        console.log('La copia descargada no es una base SQLite; se descarta.');
        continue;
      }
      writeFileSync(target, bytes);
      console.log('Base de Nexus restaurada desde la copia de GitHub.');
      return;
    } catch (error) {
      console.log('No se pudo restaurar la base:', error.message);
    }
  }

  console.log('No hay copia válida; se crea una base nueva.');
}

await restoreDatabase();
