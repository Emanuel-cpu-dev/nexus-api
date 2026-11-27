export default function UpdateBanner({ update, busy, onInstall, onDismiss }) {
  const force = Boolean(update?.force);
  if (!update) return null;
  return (
    <div className={`update-banner${force ? ' force' : ''}`} role="status">
      <span className="update-icon">⬆️</span>
      <div className="grow">
        <strong>{force ? 'Actualización obligatoria' : 'Nueva versión disponible'}</strong>
        <div className="tiny muted">
          {update.notes || `Versión ${update.versionName || update.versionCode}`}
          {' · '}Tocá Actualizar para instalarla.
        </div>
      </div>
      <button type="button" className="primary small" disabled={busy} onClick={onInstall}>
        {busy ? 'Descargando…' : 'Actualizar'}
      </button>
      {!force && (
        <button type="button" className="icon-btn update-close" aria-label="Cerrar aviso" onClick={onDismiss}>
          ×
        </button>
      )}
    </div>
  );
}
