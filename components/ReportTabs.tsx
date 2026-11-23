"use client";

import { useRef, useState } from "react";

export type ReportTab = { id: string; label: string; count?: number; content: React.ReactNode };

/** Splits the long report into tabs. Every panel stays in the page (hidden, not removed), so printing and
 *  find-in-page still see everything; arrow keys move between tabs as in a standard ARIA tab list. */
export function ReportTabs({ tabs }: { tabs: ReportTab[] }) {
  const [active, setActive] = useState(tabs[0]?.id);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);

  function onKeyDown(event: React.KeyboardEvent, index: number) {
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    const jump = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : null;
    if (!step && jump === null) return;
    event.preventDefault();
    const next = jump ?? (index + step + tabs.length) % tabs.length;
    setActive(tabs[next].id);
    buttons.current[next]?.focus();
  }

  return (
    <div className="report-tabs">
      <div role="tablist" aria-label="Report sections" className="report-tablist">
        {tabs.map((tab, index) => (
          <button key={tab.id} ref={(el) => { buttons.current[index] = el; }} type="button" role="tab" id={`tab-${tab.id}`}
            aria-selected={active === tab.id} aria-controls={`panel-${tab.id}`} tabIndex={active === tab.id ? 0 : -1}
            onClick={() => setActive(tab.id)} onKeyDown={(event) => onKeyDown(event, index)} className="report-tab">
            {tab.label}
            {tab.count !== undefined && <span className="report-tab-count">{tab.count}</span>}
          </button>
        ))}
      </div>
      {tabs.map((tab) => (
        <div key={tab.id} role="tabpanel" id={`panel-${tab.id}`} aria-labelledby={`tab-${tab.id}`} hidden={active !== tab.id}
          className="report-tabpanel space-y-6">
          {tab.content}
        </div>
      ))}
    </div>
  );
}
