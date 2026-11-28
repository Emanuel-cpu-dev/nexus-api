export default function UiUpdateBanner({ update, onInstall }) {
  if (!update) return null;
  return (
    <div className="update-banner force" role="status">
      <span className="update-icon">🖥️</span>
      <div className="grow">
        <strong>Nueva versión de Heph para la PC</strong>
        <div className="tiny muted">
          {update.notes || `Interfaz ${update.uiVersion || update.uiCode}`}
          {' · '}Tocá Actualizar para cargarla. No hay que descargar nada.
        </div>
      </div>
      <button type="button" className="primary small" onClick={onInstall}>Actualizar</button>
    </div>
  );
}
