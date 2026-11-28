export default function UpdateBanner({ update, busy, ready, onInstall, onDismiss }) {
  const force = Boolean(update?.force);
  if (!update) return null;
  const label = ready ? 'Instalar' : busy ? 'Descargando…' : 'Actualizar';
  return (
    <div className={`update-banner${force ? ' force' : ''}`} role="status">
      <span className="update-icon">⬆️</span>
      <div className="grow">
        <strong>{force ? 'Actualización obligatoria' : 'Nueva versión disponible'}</strong>
        <div className="tiny muted">
          {update.notes || `Versión ${update.versionName || update.versionCode}`}
          {' · '}
          {ready
            ? 'Ya está descargada. Un toque y se instala.'
            : busy
              ? 'Se está descargando en segundo plano. Te avisamos al terminar.'
              : 'Tocá Actualizar para empezar.'}
        </div>
      </div>
      <button type="button" className="primary small" disabled={busy} onClick={onInstall}>
        {label}
      </button>
      {!force && (
        <button type="button" className="icon-btn update-close" aria-label="Cerrar aviso" onClick={onDismiss}>
          ×
        </button>
      )}
    </div>
  );
}
