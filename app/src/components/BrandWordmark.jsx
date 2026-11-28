export default function BrandWordmark({ compact = false }) {
  return (
    <div className={`brand-wordmark${compact ? ' compact' : ''}`} aria-label="HEPH ·conectandos·">
      <span className="brand-wordmark-name">HEPH</span>
      <span className="brand-wordmark-tag">·conectandos·</span>
    </div>
  );
}
