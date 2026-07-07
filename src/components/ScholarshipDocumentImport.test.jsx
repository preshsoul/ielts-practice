// @vitest-environment jsdom

import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import ScholarshipDocumentImport from "./ScholarshipDocumentImport.jsx";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const uploadMock = vi.fn();
const resetMock = vi.fn();

vi.mock("../hooks/useDocumentImport.js", () => ({
  useDocumentImport: () => ({
    status: "idle",
    progress: 0,
    phase: null,
    message: "",
    result: null,
    error: null,
    isBusy: false,
    upload: uploadMock,
    reset: resetMock,
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

async function change(node, value) {
  await act(async () => {
    const descriptor = Object.getOwnPropertyDescriptor(node.constructor.prototype, "value");
    descriptor?.set?.call(node, value);
    node.dispatchEvent(new Event("input", { bubbles: true }));
    node.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

async function selectFile(input, file) {
  await act(async () => {
    Object.defineProperty(input, "files", {
      configurable: true,
      value: [file],
    });
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

describe("ScholarshipDocumentImport", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    uploadMock.mockReset();
    resetMock.mockReset();
  });

  it("disables saving when the user is signed out", () => {
    const view = renderComponent(
      <ScholarshipDocumentImport
        authUser={null}
        profile={null}
        onImport={vi.fn()}
        busy={false}
        message=""
      />
    );

    const button = view.container.querySelector("button.primary-btn");
    expect(button.disabled).toBe(true);
    expect(view.container.textContent).toContain("Sign in first");

    view.unmount();
  });

  it("uploads a file and sends a normalized intake payload to onImport", async () => {
    uploadMock.mockResolvedValue({
      metadata: {
        source_document_hash: "hash-123",
        extracted_text_preview: "Preview text",
      },
      parsed_candidate_profile: {
        keywords: ["ai", "ml"],
      },
      provenance: { method: "edge-parser" },
      profile: {
        personal_details: {
          full_legal_name: "Ada Lovelace",
        },
      },
      confidence_score: 0.87,
    });

    const onImport = vi.fn().mockResolvedValue({ ok: true });
    const view = renderComponent(
      <ScholarshipDocumentImport
        authUser={{ id: "user-1" }}
        profile={{ id: "profile-1" }}
        onImport={onImport}
        busy={false}
        message=""
      />
    );

    const fileInput = view.container.querySelector('input[type="file"]');
    const notesInput = view.container.querySelector("textarea");
    const button = view.container.querySelector("button.primary-btn");
    const file = new File(["resume"], "resume.docx", { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });

    await selectFile(fileInput, file);
    await change(notesInput, "Master's application CV");
    await click(button);

    expect(uploadMock).toHaveBeenCalledWith(file, "Master's application CV");
    expect(onImport).toHaveBeenCalledWith({
      intake: {
        label: "Master's application CV",
        sourceFilename: "resume.docx",
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        documentType: "docx",
        rawTextHash: "hash-123",
        extractedExcerpt: "Preview text",
        extractedText: "",
        keywords: ["ai", "ml"],
        parsedProfile: {
          personal_details: {
            full_legal_name: "Ada Lovelace",
          },
        },
        parsedCandidateProfile: {
          keywords: ["ai", "ml"],
        },
        provenance: { method: "edge-parser" },
        confidence: 0.87,
      },
    });
    expect(resetMock).toHaveBeenCalled();

    view.unmount();
  });
});
