# OCR for Scanned PDFs — Implementation Guidance

**Status:** OCR signal detection is implemented. Full OCR fallback is pending infrastructure.

## What's already done

The Edge Function now detects scanned/image-based PDFs:

1. When PDF text extraction produces < 100 characters, the `ExtractionDiagnostics` object sets:
   - `isScannedPdf: true`
   - `ocrRecommended: true`
2. This is surfaced in the API response as `intake.diagnostics`
3. The user gets a clear error message: "This appears to be a scanned document. Please run OCR on it before uploading."

## What's needed for full OCR support

### Option A: Tesseract.js WASM (Edge Function)
- Add `tesseract.js` npm dependency
- WASM binary is ~10 MB — will impact cold-start time
- Trained data (eng) adds ~4 MB
- Each page takes 2-5 seconds to OCR
- Best for: low-volume, self-contained deployment

### Option B: Cloud OCR Service
- Google Document AI, AWS Textract, or Azure Form Recognizer
- Higher accuracy than Tesseract
- Per-page cost (~$0.01-0.05)
- No cold-start impact on Edge Function
- Best for: production with budget for cloud services

### Option C: Python Backend with LiteParse
- The legacy Python backend supports `CV_ENABLE_LITEPARSE_FALLBACK=true`
- LiteParse provides on-device OCR
- Requires running the Python service alongside Edge Functions
- Route scanned PDFs to Python backend for OCR, then back to Edge Function for LLM parsing

## Recommendation

For production: **Option B** (Google Document AI) — highest accuracy, no cold-start penalty, pay-per-use.

For development: **Option A** (Tesseract.js) — free, self-contained, works offline.

## Integration Point

The OCR hook should go in `document-extract.ts`, after the native extractor:

```typescript
// In extractPdfText():
if (result.length < OCR_SIGNAL_THRESHOLD && shouldAttemptOcr()) {
  const ocrText = await performOcr(bytes);
  if (ocrText.length > result.length) {
    diag.method = "ocr";
    diag.warnings.push(`ocr_fallback_used=${ocrText.length}chars`);
    return ocrText;
  }
}
```
