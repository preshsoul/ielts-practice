// @vitest-environment jsdom

import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { MemoryRouter } from "react-router-dom";
import App from "./App.jsx";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let authState = null;

vi.mock("./hooks/useAuthSession.js", () => ({
  normalizeProfileRecord: (value) => value,
  useAuthSession: () => authState,
}));

vi.mock("./hooks/useCvImport.js", () => ({
  useCvImport: () => ({
    cvImportBusy: false,
    cvImportMessage: "",
    handleCvImport: vi.fn(),
  }),
}));

vi.mock("./hooks/useProfileSave.js", () => ({
  useProfileSave: () => ({
    profileBusy: false,
    profileMessage: "",
    saveProfileDraft: vi.fn(),
  }),
}));

vi.mock("./components/layout/AppShell.jsx", () => ({
  Shell: ({ children }) => <div data-testid="shell">{children}</div>,
}));

vi.mock("./components/routes/AppRoutes.jsx", () => ({
  PracticeRoutes: () => <div>Practice Routes</div>,
  ScholarshipRoutes: () => <div>Scholarship Routes</div>,
}));

vi.mock("./components/ErrorBoundary.jsx", () => ({
  ErrorBoundary: ({ children }) => <>{children}</>,
}));

vi.mock("./components/AuthGate.jsx", () => ({
  default: () => <div>Auth Gate</div>,
}));

vi.mock("./components/OnboardingForm.jsx", () => ({
  default: () => <div>Onboarding Screen</div>,
}));

vi.mock("./features/intelligence/DashboardHome.jsx", () => ({
  default: () => <div>Dashboard Screen</div>,
}));

vi.mock("./features/intelligence/ReadinessPage.jsx", () => ({
  default: () => <div>Readiness Screen</div>,
}));

vi.mock("./features/identity/AccountPage.jsx", () => ({
  default: () => <div>Account Screen</div>,
}));

vi.mock("./services/supabaseData.js", () => ({
  ensureProfile: vi.fn(),
  loadPublicContent: vi.fn().mockResolvedValue({
    questions: [],
    passages: {},
    scholarships: [],
    institutions: [],
    scholarshipRecords: [],
    scholarshipCatalog: [],
    notifications: [],
    contentManifest: null,
  }),
  loadPracticeContent: vi.fn().mockResolvedValue({ questions: [], passages: {} }),
  loadScholarshipContent: vi.fn().mockResolvedValue({
    scholarships: [],
    scholarshipRecords: [],
    scholarshipCatalog: [],
    notifications: [],
    contentManifest: null,
  }),
  savePracticeSession: vi.fn(),
  saveOnboardingProfile: vi.fn(),
  loadPracticeSessions: vi.fn().mockResolvedValue([]),
}));

function renderAt(pathname) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(
      <MemoryRouter initialEntries={[pathname]}>
        <App />
      </MemoryRouter>
    );
  });

  return {
    container,
    unmount() {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
}

async function waitFor(assertion, { timeout = 1500, interval = 20 } = {}) {
  const deadline = Date.now() + timeout;
  let lastError = null;

  while (Date.now() < deadline) {
    try {
      await act(async () => {
        await Promise.resolve();
      });
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, interval));
      });
    }
  }

  throw lastError || new Error("waitFor timed out");
}

describe("App onboarding gating", () => {
  beforeEach(() => {
    authState = {
      authReady: true,
      authUser: { id: "user-1", email: "candidate@example.com" },
      profile: {},
      setProfile: vi.fn(),
      sessions: [],
      setSessions: vi.fn(),
      signOut: vi.fn(),
    };
    document.body.innerHTML = "";
    sessionStorage.clear();
    vi.clearAllMocks();
  });

  it("redirects incomplete users to onboarding", async () => {
    const view = renderAt("/");

    await waitFor(() => {
      expect(view.container.textContent).toContain("Onboarding Screen");
    });

    view.unmount();
  });

  it("allows complete users to stay on dashboard routes", async () => {
    authState = {
      ...authState,
      profile: {
        identity: { nationality: "Nigerian" },
        academic: { degreeClass: "2:1", discipline: "Computer Science" },
        targetDegreeLevel: "Master's",
        targetCountries: ["United Kingdom"],
        target_band: "7.5",
        test_date: "2026-07-01",
        self_assessment: {
          reading: "7",
          listening: "7",
          writing: "6.5",
          speaking: "7",
        },
      },
    };

    const view = renderAt("/");

    await waitFor(() => {
      expect(view.container.textContent).toContain("Dashboard Screen");
      expect(view.container.textContent).not.toContain("Onboarding Screen");
    });

    view.unmount();
  });
});
