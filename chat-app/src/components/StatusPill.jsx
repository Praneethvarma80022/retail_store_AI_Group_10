import { formatStatusLabel } from "../lib/formatters";

export default function StatusPill({ value, tone }) {
  const variant = tone || value || "neutral";

  return (
    <span className={`status-pill status-${variant}`}>
      {formatStatusLabel(value || "neutral")}
    </span>
  );
}
