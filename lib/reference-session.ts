const marketHolidays: Record<string, Set<string>> = {
  "2026": new Set(["2026-01-01", "2026-01-19", "2026-02-16", "2026-04-03", "2026-05-25", "2026-06-19", "2026-07-03", "2026-09-07", "2026-11-26", "2026-12-25"]),
  "2027": new Set(["2027-01-01", "2027-01-18", "2027-02-15", "2027-03-26", "2027-05-31", "2027-06-18", "2027-07-05", "2027-09-06", "2027-11-25", "2027-12-24"]),
};

const earlyCloses = new Set(["2026-11-27", "2026-12-24", "2027-11-26"]);

export function referenceSession(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  const year = value("year");
  if (!Object.hasOwn(marketHolidays, year)) return { supported: false, isOpen: false };
  const dateKey = `${year}-${value("month")}-${value("day")}`;
  const weekday = value("weekday");
  const minutes = Number(value("hour")) * 60 + Number(value("minute"));
  const closedDay = weekday === "Sat" || weekday === "Sun" || marketHolidays[year].has(dateKey);
  const close = earlyCloses.has(dateKey) ? 13 * 60 : 16 * 60;
  return { supported: true, isOpen: !closedDay && minutes >= 9 * 60 + 30 && minutes < close };
}
