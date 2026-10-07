import { flushSync } from "react-dom";

export type NavigationDirection = "forward" | "back";

const prefersReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Runs a screen change as a horizontal push/pop slide (see styles.css).
 * Falls back to an instant change where View Transitions are unavailable.
 */
export function navigateWithTransition(direction: NavigationDirection, updateScreen: () => void) {
  if (typeof document.startViewTransition !== "function" || prefersReducedMotion()) {
    updateScreen();
    return;
  }
  document.documentElement.dataset.navigationDirection = direction;
  // flushSync so the new screen is rendered when the transition snapshots it.
  document.startViewTransition(() => flushSync(updateScreen));
}
