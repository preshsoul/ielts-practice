import { create } from "zustand";

export const useUiStore = create((set, get) => ({
  // Command palette
  commandPaletteOpen: false,
  setCommandPaletteOpen(open) {
    set({ commandPaletteOpen: open });
  },

  // Intel drawer
  intelPanel: null,
  openIntelPanel(panel) {
    set({ intelPanel: panel });
  },
  closeIntelPanel() {
    set({ intelPanel: null });
  },

  // Shortlist (client-side cache — server is source of truth)
  shortlistIds: [],
  setShortlistIds(ids) {
    set({ shortlistIds: Array.isArray(ids) ? ids : [] });
  },
  addShortlistId(id) {
    set((state) => ({
      shortlistIds: state.shortlistIds.includes(id)
        ? state.shortlistIds
        : [...state.shortlistIds, id],
    }));
  },
  removeShortlistId(id) {
    set((state) => ({
      shortlistIds: state.shortlistIds.filter((item) => item !== id),
    }));
  },

  // Application tracking (client-side cache)
  trackedApplications: {},
  setTrackedApplications(apps) {
    set({ trackedApplications: apps || {} });
  },
  updateTrackedApplication(scholarshipId, record) {
    set((state) => ({
      trackedApplications: { ...state.trackedApplications, [scholarshipId]: record },
    }));
  },
  removeTrackedApplication(scholarshipId) {
    set((state) => {
      const next = { ...state.trackedApplications };
      delete next[scholarshipId];
      return { trackedApplications: next };
    });
  },

  /** Reset all user-specific state. Called on sign-out to prevent stale data
   *  from leaking to the next user who signs in on the same browser. */
  reset() {
    set({
      shortlistIds: [],
      trackedApplications: {},
      intelPanel: null,
    });
  },
}));
