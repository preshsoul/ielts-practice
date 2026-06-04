// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { useDocumentImport } from "./useDocumentImport.js";
import {
  getCvParseJob,
  getCvParserJobSnapshot,
  parseCvFileWithEdgeFunction,
  waitForCvParseJob,
} from "../services/cvParserClient.js";

vi.mock("../services/cvParserClient.js", () => ({
  getCvParseJob: vi.fn(),
  getCvParserJobSnapshot: vi.fn(),
  parseCvFileWithEdgeFunction: vi.fn(),
  waitForCvParseJob: vi.fn(),
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function renderTestHook(callback) {
  const container = document.createElement("div");
  const root = createRoot(container);
  const current = { value: null };

  function TestComponent() {
    current.value = callback();
    return null;
  }

  act(() => {
    root.render(<TestComponent />);
  });

  return {
    result: current,
    unmount() {
      act(() => {
        root.unmount();
      });
    },
  };
}

async function waitFor(assertion, { timeout = 1000, interval = 20 } = {}) {
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

describe("useDocumentImport", () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.clearAllMocks();
  });

  it("transitions from upload to completed when the parser job finishes", async () => {
    parseCvFileWithEdgeFunction.mockResolvedValue({ job_id: "job-123" });
    getCvParserJobSnapshot
      .mockReturnValueOnce({
        jobId: "job-123",
        state: "processing",
        phase: "queued",
        progress: 20,
        message: "Queued",
      })
      .mockReturnValueOnce({
        jobId: "job-123",
        state: "completed",
        phase: "complete",
        progress: 100,
        message: "Done",
      });
    waitForCvParseJob.mockResolvedValue({
      job_id: "job-123",
      parsed_candidate_profile: { personal_details: {} },
      provenance: { method: "edge-parser" },
      profile: {},
    });

    const { result, unmount } = renderTestHook(() => useDocumentImport());
    const file = new File(["resume"], "resume.pdf", { type: "application/pdf" });

    await act(async () => {
      await result.value.upload(file, "notes");
    });

    await waitFor(() => expect(result.value.status).toBe("completed"));
    expect(result.value.progress).toBe(100);
    expect(result.value.phase).toBe("complete");
    expect(result.value.jobId).toBe("job-123");
    expect(result.value.result?.canonical).toEqual({ personal_details: {} });
    expect(waitForCvParseJob).toHaveBeenCalledWith(
      "job-123",
      expect.objectContaining({ onProgress: expect.any(Function) })
    );
    expect(sessionStorage.getItem("loci.cvDocumentImport")).toBeNull();
    unmount();
  });

  it("resumes a persisted parser job on mount", async () => {
    sessionStorage.setItem(
      "loci.cvDocumentImport",
      JSON.stringify({ jobId: "job-resume", at: Date.now() })
    );
    getCvParseJob.mockResolvedValue({ job_id: "job-resume", profile: {} });
    getCvParserJobSnapshot
      .mockReturnValueOnce({
        jobId: "job-resume",
        state: "processing",
        phase: "extracting",
        progress: 35,
        message: "Working",
      })
      .mockReturnValueOnce({
        jobId: "job-resume",
        state: "completed",
        phase: "complete",
        progress: 100,
        message: "Done",
      });
    waitForCvParseJob.mockResolvedValue({
      job_id: "job-resume",
      parsed_candidate_profile: { personal_details: { name: "Ada" } },
      provenance: { method: "edge-parser" },
      profile: {},
    });

    const onComplete = vi.fn();
    const { result, unmount } = renderTestHook(() => useDocumentImport({ onComplete }));

    await waitFor(() => expect(result.value.status).toBe("completed"));
    expect(getCvParseJob).toHaveBeenCalledWith("job-resume");
    expect(result.value.jobId).toBe("job-resume");
    expect(result.value.result?.canonical).toEqual({ personal_details: { name: "Ada" } });
    expect(onComplete).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ job_id: "job-resume" })
    );
    expect(sessionStorage.getItem("loci.cvDocumentImport")).toBeNull();
    unmount();
  });

  it("surfaces parser failure messages without leaving stale job state behind", async () => {
    sessionStorage.setItem(
      "loci.cvDocumentImport",
      JSON.stringify({ jobId: "job-stale", at: Date.now() })
    );
    parseCvFileWithEdgeFunction.mockRejectedValue(
      Object.assign(new Error("Bad file"), {
        details: { message: "The parser could not read this document." },
      })
    );

    const { result, unmount } = renderTestHook(() => useDocumentImport());
    const file = new File(["broken"], "broken.pdf", { type: "application/pdf" });

    await act(async () => {
      await result.value.upload(file, "bad notes");
    });

    await waitFor(() => expect(result.value.status).toBe("failed"));
    expect(result.value.error).toBe("The parser could not read this document.");
    expect(result.value.message).toBe("The parser could not read this document.");
    expect(result.value.jobId).toBeNull();
    expect(sessionStorage.getItem("loci.cvDocumentImport")).toBeNull();
    unmount();
  });
});
