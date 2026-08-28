export function indiaParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hourCycle: 'h23', weekday: 'short',
  }).formatToParts(date);
  const p = Object.fromEntries(parts.map((item) => [item.type, item.value]));
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    time: `${p.hour}:${p.minute}:${p.second}`,
    weekday: p.weekday,
  };
}

export function dateFromEpochIndia(value) {
  const raw = Number(value);
  if (!Number.isFinite(raw)) return null;
  return indiaParts(new Date(raw < 1e12 ? raw * 1000 : raw)).date;
}

export function calendarDaysBetween(startDate, endDate) {
  return Math.max(0, Math.round((new Date(`${endDate}T00:00:00Z`) - new Date(`${startDate}T00:00:00Z`)) / 86_400_000));
}
