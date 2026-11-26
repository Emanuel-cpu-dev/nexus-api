import { getUserByToken } from './db.js';

export function authRequired(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null;
  const user = getUserByToken(token);
  if (!user) return res.status(401).json({ error: 'No autorizado. Inicia sesión de nuevo.' });
  req.user = user;
  req.token = token;
  return next();
}
