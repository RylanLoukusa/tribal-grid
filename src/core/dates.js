// Daily grids roll over at midnight US Eastern, when most of the audience is.
export const LAUNCH_DATE = "2026-10-11";
export const TIME_ZONE = "America/New_York";

export function todayId(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
export function addDays(id, n) {
  const d = new Date(id + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export function gridNumber(id) {
  return Math.round((Date.parse(id + "T12:00:00Z") - Date.parse(LAUNCH_DATE + "T12:00:00Z")) / 864e5) + 1;
}
export const isDateId = s => /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s + "T12:00:00Z"));
