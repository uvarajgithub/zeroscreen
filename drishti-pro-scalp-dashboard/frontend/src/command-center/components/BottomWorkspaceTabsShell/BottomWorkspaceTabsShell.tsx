import React from "react";
import { Session, BottomWorkspaceTab, BOTTOM_WORKSPACE_TABS } from "../../types/session";
import { BottomWorkspaceContentSlot } from "./BottomWorkspaceContentSlot";

interface BottomWorkspaceTabsShellProps {
  session: Session;
  activeTab: BottomWorkspaceTab;
  onSelectTab: (tab: BottomWorkspaceTab) => void;
}

export function BottomWorkspaceTabsShell({ session, activeTab, onSelectTab }: BottomWorkspaceTabsShellProps) {
  return (
    <section className="cc-bottom-workspace" aria-label="Bottom workspace">
      <div className="cc-bottom-tabs" role="tablist" aria-label="Bottom workspace tabs">
        {BOTTOM_WORKSPACE_TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            className="cc-bottom-tab"
            id={`bottom-tab-${tab}`}
            aria-controls={`bottom-tabpanel-${tab}`}
            aria-selected={tab === activeTab}
            onClick={() => onSelectTab(tab)}
          >
            {tab}
          </button>
        ))}
      </div>
      <BottomWorkspaceContentSlot session={session} activeTab={activeTab} />
    </section>
  );
}
