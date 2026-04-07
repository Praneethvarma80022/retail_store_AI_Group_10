export default function MetricCard({ label, value, caption, tone = "default" }) {
  return (
    <article className={`metric-card metric-${tone}`}>
      <p className="metric-label">{label}</p>
      <strong className="metric-value">{value}</strong>
      <p className="metric-caption">{caption}</p>
    </article>
  );
}
