// Invitaciones de llamada que esperan a que el celular abra la app.
// Viven en memoria: si el servidor se reinicia, la llamada ya no es válida.
const invites = new Map();
const TTL = 3 * 60 * 1000;

function alive(entry) {
  return Date.now() - entry.at < TTL;
}

export function addInvite(userId, invite) {
  const nowMs = Date.now();
  const current = (invites.get(userId) || []).filter(
    (item) => item.callId !== invite.callId && nowMs - item.at < TTL
  );
  current.push({ ...invite, at: nowMs });
  invites.set(userId, current);
}

export function getInvites(userId) {
  const current = (invites.get(userId) || []).filter(alive);
  invites.set(userId, current);
  return current.map(({ at, ...invite }) => invite);
}

export function removeInvite(callId, userId) {
  if (!callId) return;
  if (userId) {
    const current = (invites.get(userId) || []).filter((item) => item.callId !== callId);
    invites.set(userId, current);
    return;
  }
  for (const [id, current] of invites) {
    invites.set(id, current.filter((item) => item.callId !== callId));
  }
}
