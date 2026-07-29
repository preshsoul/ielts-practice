import { describe, expect, it } from "vitest";
import {
  MAX_DOCUMENT_UPLOAD_BYTES,
  getDocumentUploadError,
  inferDocumentType,
} from "./documentIntake.js";

describe("documentIntake", () => {
  it("detects supported document types used by the Edge parser", () => {
    expect(inferDocumentType(new File(["pdf"], "cv.pdf", { type: "application/pdf" }))).toBe("pdf");
    expect(inferDocumentType(new File(["docx"], "cv.docx", { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }))).toBe("docx");
    expect(inferDocumentType(new File(["doc"], "cv.doc", { type: "application/msword" }))).toBe("doc");
    expect(inferDocumentType(new File(["txt"], "cv.txt", { type: "text/plain" }))).toBe("text");
    expect(inferDocumentType(new File(["rtf"], "cv.rtf", { type: "application/rtf" }))).toBe("rtf");
  });

  it("rejects unsupported formats and oversized uploads before parsing", () => {
    expect(getDocumentUploadError(new File(["image"], "scan.png", { type: "image/png" }))).toContain("supported document");

    const largeFile = new File(["x"], "cv.pdf", { type: "application/pdf" });
    Object.defineProperty(largeFile, "size", {
      configurable: true,
      value: MAX_DOCUMENT_UPLOAD_BYTES + 1,
    });

    expect(getDocumentUploadError(largeFile)).toContain("under 5 MB");
  });
});
