import { create } from "zustand";

const SIDEBAR_KEY = "loci.sidebarCollapsed";

function readSidebarPref() {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(SIDEBAR_KEY) === "true";
}

function persistSidebar(collapsed) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SIDEBAR_KEY, String(collapsed));
}

export const useUiStore = create((set, get) => ({
  // Sidebar
  sidebarCollapsed: readSidebarPref(),
  toggleSidebar() {
    const next = !get().sidebarCollapsed;
    persistSidebar(next);
    set({ sidebarCollapsed: next });
  },
  setSidebarCollapsed(collapsed) {
    persistSidebar(collapsed);
    set({ sidebarCollapsed: collapsed });
  },

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

  // Scholarship page filters
  scholarshipRegion: "All",
  setScholarshipRegion(region) {
    set({ scholarshipRegion: region });
  },
  scholarshipMaxFee: 999999,
  setScholarshipMaxFee(fee) {
    set({ scholarshipMaxFee: fee });
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
      scholarshipRegion: "All",
      scholarshipMaxFee: 999999,
      intelPanel: null,
    });
  },
}));
