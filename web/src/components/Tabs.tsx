import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { formatCount } from "../lib/format";

export interface TabItem {
  id: string;
  label: string;
  count?: number;
  content: ReactNode;
}

/**
 * WAI-ARIA tabs. Every panel stays mounted (hidden when inactive) so paging and filters survive
 * switching views; only the active one is shown or printed.
 */
export function Tabs({ items, label }: { items: TabItem[]; label: string }) {
  const base = useId();
  const [active, setActive] = useState(items[0]?.id ?? "");
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const current = items.some((i) => i.id === active) ? active : items[0]?.id;

  const onKey = (e: KeyboardEvent, index: number) => {
    const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!step && e.key !== "Home" && e.key !== "End") return;
    e.preventDefault();
    const next = e.key === "Home" ? 0 : e.key === "End" ? items.length - 1 : (index + step + items.length) % items.length;
    setActive(items[next].id);
    refs.current[items[next].id]?.focus();
  };

  return (
    <div>
      <div role="tablist" aria-label={label} className="tabs no-print">
        {items.map((item, index) => {
          const selected = item.id === current;
          return (
            <button
              key={item.id}
              ref={(el) => {
                refs.current[item.id] = el;
              }}
              type="button"
              role="tab"
              id={`${base}-tab-${item.id}`}
              aria-controls={`${base}-panel-${item.id}`}
              aria-selected={selected}
              tabIndex={selected ? 0 : -1}
              className="tab"
              onClick={() => setActive(item.id)}
              onKeyDown={(e) => onKey(e, index)}
            >
              {item.label}
              {item.count !== undefined && <span className="tab-count">{formatCount(item.count)}</span>}
            </button>
          );
        })}
      </div>
      {items.map((item) => (
        <div
          key={item.id}
          role="tabpanel"
          id={`${base}-panel-${item.id}`}
          aria-labelledby={`${base}-tab-${item.id}`}
          hidden={item.id !== current}
          className="mt-3"
        >
          {item.content}
        </div>
      ))}
    </div>
  );
}
