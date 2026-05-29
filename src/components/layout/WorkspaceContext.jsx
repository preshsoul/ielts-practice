import React, { createContext, useContext, useMemo } from "react";
import { useUiStore } from "../../stores/uiStore.js";

const WorkspaceContext = createContext(null);

export function WorkspaceProvider({ children }) {
  const intelPanel = useUiStore((s) => s.intelPanel);
  const commandPaletteOpen = useUiStore((s) => s.commandPaletteOpen);
  const setCommandPaletteOpen = useUiStore((s) => s.setCommandPaletteOpen);
  const openIntelPanel = useUiStore((s) => s.openIntelPanel);
  const closeIntelPanel = useUiStore((s) => s.closeIntelPanel);

  const value = useMemo(() => ({
    intelPanel,
    commandPaletteOpen,
    setCommandPaletteOpen,
    openIntelPanel,
    closeIntelPanel,
  }), [intelPanel, commandPaletteOpen, setCommandPaletteOpen, openIntelPanel, closeIntelPanel]);

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const value = useContext(WorkspaceContext);
  if (!value) {
    throw new Error("useWorkspace must be used within a WorkspaceProvider");
  }
  return value;
}
