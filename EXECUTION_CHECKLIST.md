# Execution Checklist

## Immediate Fixes
- [x] Fix session export so it always receives the active user id safely.
- [x] Clear the correct persisted session keys on sign-out.
- [x] Make `securityLogger` work without `window`/`sessionStorage`.
- [x] Make `inputSanitizer` degrade safely when DOMPurify is unavailable.
- [x] Re-run the security test script until it passes in Node.

## Foundation Cleanup
- [x] Update the README status section to reflect Supabase auth and sync.
- [x] Remove or quarantine any legacy code paths that no longer ship.
- [x] Confirm the current schema matches the app’s actual reads and writes.
- [x] Verify RLS policies against the tables the UI really uses.

## Loci Phase 1
- [x] Audit for exposed secrets in generated bundles and logs.
- [x] Confirm every user-writable table has RLS enabled.
- [x] Finalize the scholarship and profile schema shape for Loci.
- [x] Add migration steps for any missing production tables or indexes.
- [x] Validate scraper output and persist failures for manual review.

## Loci Phase 2
- [x] Replace CV/keyword intake with structured profile fields.
- [x] Build a pure scholarship scoring engine.
- [x] Re-score scholarships immediately after profile edits.
- [ ] Add premium gating only after the core scoring is stable.

## Loci Phase 3
- [x] Add backend document intake parser with strict validation and normalization.
- [x] Add `application_tracking` entry creation and read-back.
- [x] Enforce allowed state transitions.
- [x] Add checklist and referee tracking.
- [x] Implement urgency scoring and sorting.

## Loci Phase 4
- [ ] Expand the practice bank into component-based IELTS coverage.
- [ ] Extend practice sessions with component metadata.
- [ ] Add progress/history views for the expanded practice model.

## Loci Phase 5
- [ ] Add content refresh automation.
- [ ] Add deadline-change detection and notifications.
- [ ] Split the app cleanly into Home, Scholarships, Practice, and Account.
- [ ] Add freemium checks and analytics only after the core flows are stable.
