const PART_KEYS = ["year", "month", "day", "hour", "minute", "second"];

const formatterCache = new Map();
function getFormatter(tz) {
  let f = formatterCache.get(tz);
  if (f) return f;
  f = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });
  formatterCache.set(tz, f);
  return f;
}

export function formatEpoch(epoch, tz) {
  const date = new Date(epoch * 1000);
  const parts = getFormatter(tz).formatToParts(date);
  const map = {};
  for (const { type, value } of parts) {
    if (PART_KEYS.includes(type)) map[type] = parseInt(value, 10);
  }
  // Intl returns hour=24 for midnight in some locales/zones; normalize.
  if (map.hour === 24) map.hour = 0;
  return map;
}

export function epochFromParts({ year, month, day, hour = 0, minute = 0, second = 0 }, tz) {
  // Initial guess: treat parts as UTC
  let utc = Date.UTC(year, month - 1, day, hour, minute, second) / 1000;
  // Find offset by formatting that UTC instant in the TZ and computing difference
  for (let i = 0; i < 3; i++) {
    const p = formatEpoch(utc, tz);
    const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) / 1000;
    const desiredAsUtc = Date.UTC(year, month - 1, day, hour, minute, second) / 1000;
    const diff = desiredAsUtc - asUtc;
    if (diff === 0) break;
    utc += diff;
  }
  return utc;
}

export function startOf(epoch, unit, tz) {
  const p = formatEpoch(epoch, tz);
  switch (unit) {
    case "minute": return epochFromParts({ ...p, second: 0 }, tz);
    case "hour":   return epochFromParts({ ...p, minute: 0, second: 0 }, tz);
    case "day":    return epochFromParts({ ...p, hour: 0, minute: 0, second: 0 }, tz);
    case "week": {
      // Week starts Monday in ISO; compute weekday via UTC of the day's local-midnight
      const dayStart = epochFromParts({ ...p, hour: 0, minute: 0, second: 0 }, tz);
      const weekday = new Date(dayStart * 1000).getUTCDay(); // 0=Sun..6=Sat
      const back = weekday === 0 ? 6 : weekday - 1;
      return dayStart - back * 86400;
    }
    case "month":  return epochFromParts({ ...p, day: 1, hour: 0, minute: 0, second: 0 }, tz);
    case "year":   return epochFromParts({ ...p, month: 1, day: 1, hour: 0, minute: 0, second: 0 }, tz);
    default: throw new Error(`Unknown unit: ${unit}`);
  }
}

export function endOf(epoch, unit, tz) {
  const start = startOf(epoch, unit, tz);
  switch (unit) {
    case "minute": return start + 59;
    case "hour":   return start + 3599;
    case "day":    return start + 86399;
    case "week":   return start + 7 * 86400 - 1;
    case "month": {
      const p = formatEpoch(start, tz);
      const nextMonth = epochFromParts({ year: p.year + (p.month === 12 ? 1 : 0), month: p.month === 12 ? 1 : p.month + 1, day: 1, hour: 0, minute: 0, second: 0 }, tz);
      return nextMonth - 1;
    }
    case "year": {
      const p = formatEpoch(start, tz);
      const nextYear = epochFromParts({ year: p.year + 1, month: 1, day: 1, hour: 0, minute: 0, second: 0 }, tz);
      return nextYear - 1;
    }
    default: throw new Error(`Unknown unit: ${unit}`);
  }
}

const pad2 = (n) => String(n).padStart(2, "0");

export function formatSmokeping(epoch, tz) {
  const p = formatEpoch(epoch, tz);
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}+${pad2(p.hour)}:${pad2(p.minute)}`;
}

export function formatIsoLocal(epoch, tz) {
  const p = formatEpoch(epoch, tz);
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}T${pad2(p.hour)}:${pad2(p.minute)}:${pad2(p.second)}`;
}
