import { useEffect, useRef } from "react";

const FOCUSABLE = 'a[href], button:not([disabled]), select:not([disabled]), input:not([disabled]), textarea, [tabindex]:not([tabindex="-1"])';

interface Props {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}

/** Modal side drawer: focus moves in, Tab stays inside, Escape closes, focus returns to the opener. */
export function Drawer({ title, onClose, children }: Props) {
  const panelRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;
      const items = [...panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !panelRef.current.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !panelRef.current.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      opener?.focus?.();
    };
  }, []);

  return (
    <div className="no-print fixed inset-0 z-50 flex justify-end bg-black/50" onClick={onClose}>
      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-h"
        className="h-full w-full max-w-xl overflow-y-auto border-l border-line bg-ink-900 p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id="drawer-h" className="text-lg font-semibold">
            {title}
          </h2>
          <button ref={closeRef} type="button" className="btn" onClick={onClose} aria-label={`Close ${title.toLowerCase()}`}>
            Close (Esc)
          </button>
        </div>
        {children}
      </aside>
    </div>
  );
}
