import { ChevronLeft } from "lucide-react";
import { useAppUpdate } from "../appUpdate";
import { ICON_SIZE, ICON_STROKE_WIDTH } from "../icons";
import { releaseNotesSince } from "../releaseNotes";
import { ScrollArea } from "./ScrollArea";

interface WhatsNewViewProps {
  onBack: () => void;
}

/** What changed between the installed version and the available update. */
export function WhatsNewView({ onBack }: WhatsNewViewProps) {
  const { state, installUpdate } = useAppUpdate();
  const update =
    state.status === "available" || state.status === "installing" ? state.update : null;
  const sections = update
    ? releaseNotesSince(update.body, update.version, update.currentVersion)
    : [];

  return (
    <div className="screen">
      <header className="toolbar">
        <button className="icon-button" onClick={onBack} aria-label="Back">
          <ChevronLeft size={ICON_SIZE} strokeWidth={ICON_STROKE_WIDTH} aria-hidden />
        </button>
        <h1 className="toolbar-title">What's new</h1>
      </header>

      <ScrollArea>
        {sections.length === 0 && <p className="empty-message">No release notes.</p>}
        {sections.map((section) => (
          <section key={section.version}>
            <h2 className="section-title">Version {section.version}</h2>
            <ul className="release-notes">
              {section.items.map((item, index) => (
                <li key={index}>{item}</li>
              ))}
            </ul>
          </section>
        ))}
      </ScrollArea>

      {update && (
        <footer className="screen-footer">
          <button
            className="button button-primary button-block"
            onClick={installUpdate}
            disabled={state.status === "installing"}
          >
            {state.status === "installing"
              ? "Installing…"
              : `Install ${update.version} and restart`}
          </button>
        </footer>
      )}
    </div>
  );
}
