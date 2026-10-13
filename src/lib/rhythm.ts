export const frequencies = {
  once: "חד־פעמית",
  daily: "כל יום",
  weekly: "פעם בשבוע",
  fortnightly: "פעם בשבועיים",
  monthly: "פעם בחודש",
  quarterly: "פעם ברבעון",
  semiannual: "פעם בחצי שנה",
  annual: "פעם בשנה",
} as const;
export type Frequency = keyof typeof frequencies;
export function addDays(date: string, days: number) {
  const value = new Date(date + "T12:00:00Z");
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
export function monthEnd(month: string) {
  const [year, number] = month.split("-").map(Number);
  return new Date(Date.UTC(year, number, 0, 12)).toISOString().slice(0, 10);
}
/** Always calculate from the original anchor, so February never shifts a 31st schedule. */
export function occurrenceDates(
  start: string,
  frequency: Frequency,
  through: string,
  end: string | null = null,
) {
  const dates: string[] = [];
  const limit = end && end < through ? end : through;
  const anchor = new Date(start + "T12:00:00Z");
  for (let index = 0; index < 4000; index++) {
    let value = start;
    if (frequency === "once" && index > 0) break;
    if (["daily", "weekly", "fortnightly"].includes(frequency))
      value = addDays(
        start,
        index *
          { daily: 1, weekly: 7, fortnightly: 14 }[
            frequency as "daily" | "weekly" | "fortnightly"
          ],
      );
    else if (frequency !== "once") {
      const step = { monthly: 1, quarterly: 3, semiannual: 6, annual: 12 }[
        frequency as "monthly" | "quarterly" | "semiannual" | "annual"
      ];
      const month = anchor.getUTCMonth() + index * step;
      const last = new Date(
        Date.UTC(anchor.getUTCFullYear(), month + 1, 0, 12),
      );
      value = new Date(
        Date.UTC(
          anchor.getUTCFullYear(),
          month,
          Math.min(anchor.getUTCDate(), last.getUTCDate()),
          12,
        ),
      )
        .toISOString()
        .slice(0, 10);
    }
    if (value > limit) break;
    dates.push(value);
  }
  return dates;
}
export function rhythmUrgent(
  item: { manualUrgent: boolean; frequency: string },
  dueDate: string,
  completed: boolean,
  today: string,
) {
  if (completed) return false;
  if (item.manualUrgent || dueDate <= addDays(today, 1)) return true;
  // The month-end review starts exactly seven days before its final date.
  return (
    item.frequency !== "once" &&
    today >= addDays(monthEnd(today.slice(0, 7)), -7) &&
    dueDate <= today
  );
}
