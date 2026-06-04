// @vitest-environment jsdom

import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import OnboardingForm from "./OnboardingForm.jsx";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const navigateMock = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

vi.mock("../hooks/useDocumentImport.js", () => ({
  useDocumentImport: () => ({
    status: "idle",
    progress: 0,
    phase: null,
    message: "",
    result: null,
    upload: vi.fn(),
  }),
}));

vi.mock("../services/scoringEngine.js", () => ({
  rankScholarships: () => ({
    scored: [],
  }),
}));

function renderComponent(element) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(element);
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

async function click(node) {
  await act(async () => {
    node.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

function baseDraft() {
  return {
    displayName: "Ada",
    dossier: {},
    identity: { nationality: "Nigerian" },
    academic: { degreeClass: "2:1", discipline: "Computer Science" },
    professional: { workExperienceYears: "2" },
    languageTests: { ielts: "7.5", ieltsBands: {} },
    currentLevel: {
      reading: "7",
      listening: "7",
      writing: "6.5",
      speaking: "7",
    },
    targetDegreeLevel: "Master's",
    targetCountries: ["United Kingdom"],
    targetTracks: [],
    targetBand: "7.5",
    testDate: "2026-07-01",
    targetModules: [],
  };
}

function baseResolutionDraft() {
  return {
    resolved: {
      nationality: { state: "confirmed", value: "Nigerian", source: "asserted" },
      discipline: { state: "confirmed", value: "Computer Science", source: "asserted" },
      degreeClass: { state: "confirmed", value: "2:1", source: "asserted" },
      languageTests: { state: "confirmed", value: { ielts: 7.5 }, source: "asserted" },
      workExpYears: { state: "confirmed", value: 2, source: "asserted" },
    },
  };
}

describe("OnboardingForm", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    navigateMock.mockReset();
  });

  it("calls the explicit skip handler from the extraction step", async () => {
    const onSkipUpload = vi.fn();
    const view = renderComponent(
      <OnboardingForm
        profile={{ email: "candidate@example.com" }}
        draft={baseDraft()}
        resolutionDraft={baseResolutionDraft()}
        setDraft={vi.fn()}
        onSave={vi.fn()}
        saving={false}
        message=""
        greeting={{ title: "Welcome back" }}
        scholarshipCatalog={[]}
        onSkipUpload={onSkipUpload}
      />
    );

    const skipButton = Array.from(view.container.querySelectorAll("button"))
      .find((button) => button.textContent.includes("Skip upload"));

    await click(skipButton);

    expect(onSkipUpload).toHaveBeenCalledTimes(1);
    expect(navigateMock).not.toHaveBeenCalled();

    view.unmount();
  });

  it("falls back to navigation when no skip handler is provided", async () => {
    const view = renderComponent(
      <OnboardingForm
        profile={{ email: "candidate@example.com" }}
        draft={baseDraft()}
        resolutionDraft={baseResolutionDraft()}
        setDraft={vi.fn()}
        onSave={vi.fn()}
        saving={false}
        message=""
        greeting={{ title: "Welcome back" }}
        scholarshipCatalog={[]}
      />
    );

    const skipButton = Array.from(view.container.querySelectorAll("button"))
      .find((button) => button.textContent.includes("Skip upload"));

    await click(skipButton);

    expect(navigateMock).toHaveBeenCalledWith("/");

    view.unmount();
  });

  it("invokes onSave from the verdict step", async () => {
    const onSave = vi.fn();
    const view = renderComponent(
      <OnboardingForm
        profile={{ email: "candidate@example.com" }}
        draft={baseDraft()}
        resolutionDraft={baseResolutionDraft()}
        setDraft={vi.fn()}
        onSave={onSave}
        saving={false}
        message=""
        greeting={{ title: "Welcome back" }}
        scholarshipCatalog={[]}
        onSkipUpload={vi.fn()}
      />
    );

    const verdictButton = Array.from(view.container.querySelectorAll("button"))
      .find((button) => button.textContent.includes("Verdict"));
    await click(verdictButton);

    const saveButton = Array.from(view.container.querySelectorAll("button"))
      .find((button) => button.textContent.includes("Save and enter workspace"));
    await click(saveButton);

    expect(onSave).toHaveBeenCalledTimes(1);

    view.unmount();
  });
});
