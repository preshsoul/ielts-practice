# Scholarship Matching Migration Plan

## Goal

Move scholarship matching from a single rule-based pass to a safe hybrid pipeline that can use structured profile data, CV evidence, and future semantic retrieval without breaking the current live experience.

## Safety Rules

- Keep existing `profiles`, `cv_profiles`, `scholarships`, and shortlist flows intact.
- Add new tables and columns first.
- Write new candidate snapshots in a best-effort way so old profile saves still succeed if the new tables are not ready.
- Keep the current matcher as fallback until shadow comparison is stable.
- Do not drop or rename existing public tables in the first rollout.

## Phase 1: Foundation

- Add `candidate_profiles` as the canonical live candidate snapshot.
- Add `scholarship_matches` as the cached ranking table.
- Add `match_events` for click and application feedback.
- Add vector-ready columns to `scholarships`.

## Phase 2: Dual Write

- On CV import, save the parsed CV to `cv_profiles` and update `candidate_profiles`.
- On profile save, update `profiles` and `candidate_profiles`.
- Keep the visible scholarship list on the existing path until the new path is validated.

## Phase 3: Retrieval

- Precompute embeddings for scholarship records and candidate snapshots.
- Retrieve top candidates with semantic search.
- Apply hard eligibility filters after retrieval.

## Phase 4: Ranking

- Rank with separate scores for semantic fit, eligibility, coverage, deadline urgency, source confidence, and document burden.
- Store the result in `scholarship_matches`.

## Phase 5: Shadow Mode

- Compare the new ranking against the current ranking for the same profile.
- Check top-result overlap, blocked reasons, and user interaction signals.

## Phase 6: Cutover

- Enable the new matcher behind a feature flag.
- Roll out gradually after shadow comparison is stable.

## Rollback

- Disable the feature flag.
- Keep the legacy matcher and legacy scholarship list in place.
- Leave the new tables intact so we can inspect the data without recovery work.
