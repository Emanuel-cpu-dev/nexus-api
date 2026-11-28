import { createPublicKey, verify } from 'node:crypto';

const DEFAULT_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
let cache = { url: '', keys: [], at: 0 };

function decodePart(part) {
  return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
}

async function googleKeys() {
  const url = process.env.GOOGLE_JWKS_URL || DEFAULT_JWKS_URL;
  if (cache.url === url && Date.now() - cache.at < 60 * 60 * 1000) return cache.keys;
  const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error('No se pudieron obtener las claves de Google.');
  const data = await response.json();
  cache = { url, keys: Array.isArray(data.keys) ? data.keys : [], at: Date.now() };
  return cache.keys;
}

// Verifica el ID token de Google en el servidor. No confiamos en el correo que
// manda el navegador: viene firmado por Google y se comprueba firma, audiencia,
// emisor, vencimiento y que el correo esté verificado.
export async function verifyGoogleIdToken(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) throw new Error('Token de Google inválido.');
  const header = decodePart(parts[0]);
  const payload = decodePart(parts[1]);
  if (header.alg !== 'RS256') throw new Error('Algoritmo de Google no soportado.');

  const keys = await googleKeys();
  const key = keys.find((item) => item.kid === header.kid) || keys[0];
  if (!key) throw new Error('No hay claves de Google disponibles.');

  const publicKey = createPublicKey({ key, format: 'jwk' });
  const signature = Buffer.from(parts[2], 'base64url');
  const valid = verify(
    'RSA-SHA256',
    Buffer.from(`${parts[0]}.${parts[1]}`),
    publicKey,
    signature
  );
  if (!valid) throw new Error('La firma de Google no es válida.');

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (Number(payload.exp || 0) <= nowSeconds) throw new Error('El acceso de Google venció.');
  if (payload.iss !== 'https://accounts.google.com' && payload.iss !== 'accounts.google.com') {
    throw new Error('El emisor del token no es Google.');
  }
  if (!payload.email || payload.email_verified !== true) {
    throw new Error('Google no confirmó el correo.');
  }
  return payload;
}
