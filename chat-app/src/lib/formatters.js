export const currencyFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

export const dateFormatter = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
});

export function formatCurrency(value) {
  return currencyFormatter.format(Number(value) || 0);
}

export function formatDate(value) {
  if (!value) return "Unknown";

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unknown" : dateFormatter.format(date);
}

export function formatNumber(value) {
  return new Intl.NumberFormat("en-IN").format(Number(value) || 0);
}

export function formatPercent(value) {
  return `${Math.round(Number(value) || 0)}%`;
}

export function formatStatusLabel(value) {
  if (!value) return "Unknown";
  return value.replace(/-/g, " ");
}
