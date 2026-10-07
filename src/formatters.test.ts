import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatDuration, formatElapsedTime, formatRelativeTime, shortRevision } from "./formatters";

describe("formatDuration", () => {
  it("formats minutes and hours", () => {
    expect(formatDuration(0)).toBe("0:00");
    expect(formatDuration(147)).toBe("2:27");
    expect(formatDuration(3723)).toBe("1:02:03");
  });

  it("never goes negative", () => {
    expect(formatDuration(-5)).toBe("0:00");
  });
});

describe("formatElapsedTime", () => {
  it("measures from a date to now", () => {
    const now = Date.parse("2026-10-07T10:02:30Z");
    expect(formatElapsedTime("2026-10-07T10:00:00Z", now)).toBe("2:30");
  });
});

describe("formatRelativeTime", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-07T12:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("describes recent and older dates", () => {
    expect(formatRelativeTime("2026-10-07T11:59:40Z")).toBe("just now");
    expect(formatRelativeTime("2026-10-07T09:00:00Z")).toBe("3 hours ago");
    expect(formatRelativeTime("2026-10-06T12:00:00Z")).toBe("yesterday");
  });
});

describe("shortRevision", () => {
  it("shortens refs and handles missing ones", () => {
    expect(shortRevision("f00ba12345678")).toBe("f00ba12");
    expect(shortRevision(null)).toBe("—");
  });
});
