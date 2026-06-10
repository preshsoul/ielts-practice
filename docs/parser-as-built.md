# Parser As-Built Audit

Verdict: `partial`

## Summary

The live CV upload path is wired end to end through the Supabase Edge Function, but it is not using the May redesign as the parser's canonical write path. The Edge Function still imports the older shared parser entrypoint and persists a locally built sparse canonical profile, while the newer `candidateProfile` and `ontologyNormalizer` modules are active on the frontend scoring and profile-resolution side. `eligibilityGate` does not appear to exist as a tracked module in this repo as of 2026-06-03.

## Live path, from upload to persisted draft

1. Frontend upload starts in `parseCvFileWithEdgeFunction()` and calls the Edge Function `/upload` route. Evidence: `src/services/cvParserClient.js:305-319`.
2. `useDocumentImport()` is the active upload hook and calls `parseCvFileWithEdgeFunction(file, notes)`, then polls the returned job until completion. Evidence: `src/hooks/useDocumentImport.js:165-223`.
3. The Edge Function route is `supabase/functions/cv-parser/index.ts`; its only parser import is `parseCvRawText` from `../_shared/cv-parser.ts`, plus document extraction and security helpers. It does not import `candidateProfile`, `ontologyNormalizer`, or `eligibilityGate`. Evidence: `supabase/functions/cv-parser/index.ts:1-15`.
4. The Edge upload route extracts readable text with `extractDocumentIntakeFromFile(file, notes)`, creates a `cv_parse_jobs` row, then parses with `parseCvRawText(extracted.rawText, ...)`. Evidence: `supabase/functions/cv-parser/index.ts:467-517`.
5. `parseCvRawText()` still routes through `parseCvRawTextHardened()` and uses its result as `normalizedCandidateProfile`. Evidence: `supabase/functions/_shared/cv-parser.ts:936-976`.
6. `parseCvRawTextHardened()` hardens only `fullName`, `degreeClass`, `degreeInstitution`, `graduationYear`, plus skills list handling, and computes confidence from four tracked checks. Evidence: `supabase/functions/_shared/cv-parser.ts:518-589`.
7. The saved canonical parser output is built by the local `buildCanonicalProfile()` helper, not by a `ResolvedProfile` merge. Evidence: `supabase/functions/cv-parser/index.ts:264-309`.
8. That local canonical profile is what gets written into both `cv_parse_jobs.parsed_candidate_profile` and `cv_profile_drafts.parsed_candidate_profile`. Evidence: `supabase/functions/cv-parser/index.ts:357-387`.

## Is the redesign integrated?

### (a) Does `cv-parser/index.ts` import the three redesign modules?

No.

- `cv-parser/index.ts` imports `parseCvRawText`, `extractDocumentIntakeFromFile`, and security helpers only. Evidence: `supabase/functions/cv-parser/index.ts:1-15`.
- There is no import from any `candidateProfile` or `ontologyNormalizer` module in the Edge Function entrypoint. Evidence: `supabase/functions/cv-parser/index.ts:1-15`.
- There is no `eligibilityGate` file under `src`, `supabase`, `docs`, or `backend` in the tracked repo paths returned by repo-wide file search on 2026-06-03.

### (b) Is the saved profile built from `ResolvedProfile` or a local builder?

It is built from a local builder.

- `buildCanonicalProfile()` constructs `personal_details`, `academic_history`, `international_exams`, `grade`, and related fields directly from `parsed.profile`. Evidence: `supabase/functions/cv-parser/index.ts:264-309`.
- `finalizeParsedJob()` calls `buildCanonicalProfile(payload.parsed)` and persists that result as `parsed_candidate_profile`. Evidence: `supabase/functions/cv-parser/index.ts:357-387`.
- No `resolveCandidateProfile()` or `buildResolvedCandidateProfile()` call appears anywhere in the Edge parser path. The resolve/merge logic lives in the frontend module instead. Evidence: `src/lib/candidateProfile.js:179-255`.

### (c) Where do the redesign files live, and what imports them?

- `candidateProfile` lives at `src/lib/candidateProfile.js`. Its core merge contract is defined there, including `CONFIDENCE_THRESHOLD`, extracted/asserted/resolved tracks, conflict freezing, and `resolveCandidateProfile()`. Evidence: `src/lib/candidateProfile.js:9-10`, `src/lib/candidateProfile.js:157-177`, `src/lib/candidateProfile.js:179-255`.
- `candidateProfile` is imported by:
  - `src/hooks/useCvImport.js` to create extracted candidate profiles from parser intake. Evidence: `src/hooks/useCvImport.js:1-8`, `src/hooks/useCvImport.js:26-29`, `src/hooks/useCvImport.js:93-121`.
  - `src/services/scoringEngine.js` to resolve candidate signals before scoring. Evidence: `src/services/scoringEngine.js:1-11`, `src/services/scoringEngine.js:325-337`.
  - `src/components/AccountProfileForm.jsx` to surface conflicts and verification gaps in the UI. Evidence: `src/components/AccountProfileForm.jsx:7`, `src/components/AccountProfileForm.jsx:175-182`.
- `ontologyNormalizer` lives at `src/lib/ontologyNormalizer.js`. It provides nationality, country, discipline, degree-class, and language normalization helpers. Evidence: `src/lib/ontologyNormalizer.js:72-131`, `src/lib/ontologyNormalizer.js:176-193`.
- `ontologyNormalizer` is imported by:
  - `src/lib/candidateProfile.js`. Evidence: `src/lib/candidateProfile.js:1-6`.
  - `src/services/scoringEngine.js`. Evidence: `src/services/scoringEngine.js:3-11`.
  - `src/lib/offlineSemanticProfile.js`. Evidence: `src/lib/offlineSemanticProfile.js:5-7`.
- `eligibilityGate` is not present as a tracked module, so there is no live import path to cite.

### (d) Is `normalizeScholarshipRequirements` called on every scholarship ingestion path?

No.

- There is no `normalizeScholarshipRequirements` symbol anywhere in the repo as of the 2026-06-03 search.
- The scraper ingestion path builds raw eligibility and `requirementsSummary` directly in `extractScholarship()`, with no call to a normalizer by that name. Evidence: `scripts/scholarship-extractor.mjs:563-610`, `scripts/scholarship-extractor.mjs:699-726`.
- The public scholarship publishing path maps scraped eligibility fields into output records in `toPublicScholarshipRecord()`, again without calling `normalizeScholarshipRequirements`. Evidence: `scripts/refresh-content.mjs:247-323`.
- The app currently normalizes scholarship-side values ad hoc inside the scoring layer instead of through a dedicated ingestion normalizer:
  - candidate normalization helpers: `normalizeNationality`, `normalizeDisciplineCategory`, `normalizeDegreeClass`, `normalizeLanguageTest`. Evidence: `src/services/scoringEngine.js:97-116`.
  - scholarship-side normalization helpers: `normalizeScholarshipNationalityList()` and `normalizeScholarshipDisciplines()`. Evidence: `src/services/scoringEngine.js:285-297`.

## Final verdict rationale

This is `partial`, not `integrated`, because the redesign concepts are real and active in the frontend resolution/scoring flow, but the deployed Edge parser still persists a local sparse canonical structure produced by `buildCanonicalProfile()` and `parseCvRawTextHardened()`. It is also not fully `unmerged`, because `candidateProfile` and `ontologyNormalizer` are already wired into CV import, account review, and scholarship scoring on the client side.
