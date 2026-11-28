import { useEffect, useState } from 'react';
import { timeAgo } from '../utils.js';
import Avatar from './Avatar.jsx';

function mapUrl(point) {
  const delta = 0.008;
  const bbox = [
    point.lng - delta,
    point.lat - delta,
    point.lng + delta,
    point.lat + delta
  ].join(',');
  return `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}`
    + `&layer=mapnik&marker=${encodeURIComponent(`${point.lat},${point.lng}`)}`;
}

export default function Location({
  friends, location = {}, locating = false, onRequest, onRevoke, onStopAll, onBack
}) {
  const [selectedId, setSelectedId] = useState('');
  const sharedWith = location.sharedWith || [];
  const sharedBy = location.sharedBy || [];
  const positions = location.positions || {};

  const myViewers = friends.filter((friend) => sharedWith.includes(friend.id));
  const sharingWithMe = friends.filter((friend) => sharedBy.includes(friend.id));
  const canAsk = friends.filter((friend) => !sharedBy.includes(friend.id));
  const selected = friends.find((friend) => friend.id === selectedId) || null;
  const point = selected ? positions[selected.id] : null;

  useEffect(() => {
    if (selectedId && !sharedBy.includes(selectedId)) setSelectedId('');
  }, [selectedId, sharedBy.join(',')]);

  return (
    <div className="page location-page">
      <div className="page-heading">
        <button type="button" className="ghost" onClick={onBack}>← Volver</button>
        <h2>📍 Ubicación</h2>
      </div>

      <div className="card location-intro">
        <strong>Nadie ve dónde estás si vos no lo permitís.</strong>
        <p className="tiny muted">
          Pedí permiso a un amigo para ver su ubicación en tiempo real, o decidí con quién
          compartir la tuya. Podés revocar el permiso cuando quieras.
        </p>
        {sharedWith.length > 0 && (
          <div className="location-sharing-status">
            <span className={`presence-dot inline ${locating ? 'online' : ''}`} />
            <span className="tiny muted">
              {locating ? 'Compartiendo tu posición ahora' : 'Permiso activo · esperando señal'}
            </span>
            <button type="button" className="danger small" onClick={onStopAll}>
              Dejar de compartir con todos
            </button>
          </div>
        )}
      </div>

      {selected && point && (
        <section className="card location-map-card">
          <div className="row">
            <Avatar user={selected} size="xs" />
            <div className="grow">
              <strong>{selected.displayName}</strong>
              <div className="tiny muted">Actualizado {timeAgo(point.at)}</div>
            </div>
            <button type="button" className="ghost small" onClick={() => setSelectedId('')}>× Cerrar mapa</button>
          </div>
          <iframe
            className="location-map"
            title={`Mapa de ${selected.displayName}`}
            src={mapUrl(point)}
            loading="lazy"
            referrerPolicy="no-referrer"
          />
          <div className="location-coords tiny muted">
            {point.lat.toFixed(5)}, {point.lng.toFixed(5)}
            {point.accuracy ? ` · precisión ${Math.round(point.accuracy)} m` : ''}
          </div>
          <a
            className="ghost small location-link"
            href={`https://www.google.com/maps?q=${point.lat},${point.lng}`}
            target="_blank"
            rel="noreferrer"
          >
            Abrir en Google Maps
          </a>
        </section>
      )}

      {selected && !point && (
        <div className="ok-box">
          {selected.displayName} compartió su ubicación, pero todavía no mandó una posición.
          Esperá a que abra Heph con el GPS activado.
        </div>
      )}

      <section className="card">
        <h3>Amigos que ven tu ubicación ({myViewers.length})</h3>
        {myViewers.length === 0 && <p className="muted">Todavía no diste permiso a nadie.</p>}
        {myViewers.map((friend) => (
          <div className="row" key={friend.id}>
            <Avatar user={friend} size="xs" />
            <span className="grow">{friend.displayName}</span>
            <button type="button" className="ghost small" onClick={() => onRevoke(friend.id)}>Quitar permiso</button>
          </div>
        ))}
      </section>

      <section className="card">
        <h3>Comparten con vos ({sharingWithMe.length})</h3>
        {sharingWithMe.length === 0 && <p className="muted">Ningún amigo te está compartiendo su ubicación.</p>}
        {sharingWithMe.map((friend) => (
          <div className="row" key={friend.id}>
            <Avatar user={friend} size="xs" />
            <div className="grow">
              <strong>{friend.displayName}</strong>
              <div className="tiny muted">
                {positions[friend.id] ? `Visto ${timeAgo(positions[friend.id].at)}` : 'Sin posición todavía'}
              </div>
            </div>
            <button
              type="button"
              className="primary small"
              onClick={() => setSelectedId(friend.id)}
            >
              Ver mapa
            </button>
          </div>
        ))}
      </section>

      <section className="card">
        <h3>Pedir ubicación</h3>
        {canAsk.length === 0 && <p className="muted">Ya pediste permiso a todos tus amigos.</p>}
        {canAsk.map((friend) => (
          <div className="row" key={friend.id}>
            <Avatar user={friend} size="xs" />
            <span className="grow">{friend.displayName}</span>
            <button type="button" className="ghost small" onClick={() => onRequest(friend.id)}>Pedir permiso</button>
          </div>
        ))}
      </section>
    </div>
  );
}
