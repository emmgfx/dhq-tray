import type { ReactNode } from "react";
import { ScrollHint } from "@emmgfx/scroll-hint";

interface ScrollAreaProps {
  children: ReactNode;
}

/** Scrollable screen body; the separator lines only show when content is scrolled past them. */
export function ScrollArea({ children }: ScrollAreaProps) {
  return (
    <ScrollHint
      className="scroll-area"
      shadowColor=""
      lineColor="var(--color-border)"
      scrollerProps={{ className: "scroll-area-content" }}
    >
      {children}
    </ScrollHint>
  );
}
