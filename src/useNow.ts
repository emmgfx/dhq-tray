import { useEffect, useState } from "react";

/** Current timestamp, refreshed every second while `isTicking` is true. */
export function useNow(isTicking: boolean): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!isTicking) return;
    setNow(Date.now());
    const intervalId = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(intervalId);
  }, [isTicking]);

  return now;
}
