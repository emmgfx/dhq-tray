const relativeTimeFormat = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

const TIME_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 24 * 60 * 60],
  ["month", 30 * 24 * 60 * 60],
  ["day", 24 * 60 * 60],
  ["hour", 60 * 60],
  ["minute", 60],
];

export function formatRelativeTime(isoDate: string): string {
  const elapsedSeconds = (new Date(isoDate).getTime() - Date.now()) / 1000;
  for (const [unit, secondsInUnit] of TIME_UNITS) {
    if (Math.abs(elapsedSeconds) >= secondsInUnit) {
      return relativeTimeFormat.format(Math.round(elapsedSeconds / secondsInUnit), unit);
    }
  }
  return "just now";
}

/** Elapsed time as m:ss, or h:mm:ss past one hour. */
export function formatElapsedTime(sinceIsoDate: string, now: number): string {
  return formatDuration((now - new Date(sinceIsoDate).getTime()) / 1000);
}

/** Seconds as m:ss, or h:mm:ss past one hour. */
export function formatDuration(durationSeconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(durationSeconds));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}`
    : `${minutes}:${seconds}`;
}

export const shortRevision = (revision: string | null) => revision?.slice(0, 7) ?? "—";
