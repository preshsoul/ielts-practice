import React, { createContext, useContext, useMemo, useState } from "react";

const WorkspaceContext = createContext(null);

export function WorkspaceProvider({ children }) {
  const [intelPanel, setIntelPanel] = useState(null);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);

  const value = useMemo(() => ({
    intelPanel,
    commandPaletteOpen,
    setCommandPaletteOpen,
    openIntelPanel(panel) {
      setIntelPanel(panel);
    },
    closeIntelPanel() {
      setIntelPanel(null);
    },
  }), [intelPanel, commandPaletteOpen]);

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const value = useContext(WorkspaceContext);
  if (!value) {
    throw new Error("useWorkspace must be used within a WorkspaceProvider");
  }
  return value;
}

