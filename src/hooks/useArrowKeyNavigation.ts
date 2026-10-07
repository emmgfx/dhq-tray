import type { RefObject } from "react";
import { useKeyDown } from "./useKeyDown";

const NAVIGABLE_SELECTOR = "[data-nav-item]:not(:disabled)";

/**
 * ↑/↓ move focus between the elements marked with `data-nav-item` inside the
 * container, like keyboard navigation in a native list; ↩︎ then activates the
 * focused button natively.
 */
export function useArrowKeyNavigation(containerRef: RefObject<HTMLElement | null>) {
  useKeyDown((event) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const container = containerRef.current;
    if (!container) return;
    const items = Array.from(container.querySelectorAll<HTMLElement>(NAVIGABLE_SELECTOR));
    if (items.length === 0) return;

    event.preventDefault();
    const currentIndex = items.indexOf(document.activeElement as HTMLElement);
    const nextIndex =
      currentIndex === -1
        ? 0
        : Math.min(
            items.length - 1,
            Math.max(0, currentIndex + (event.key === "ArrowDown" ? 1 : -1)),
          );
    items[nextIndex].focus();
    items[nextIndex].scrollIntoView({ block: "nearest" });
  });
}
