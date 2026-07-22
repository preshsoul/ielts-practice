# Loci Architecture & System Interconnection

> Comprehensive overview of every system, how they connect, and optimization opportunities.
> Generated 2026-06-12

---

## 1. System Map

```
┌──────────────────────────────────────────────────────────────────────┐
│                          LOCI PLATFORM                               │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────┐   ┌──────────────┐   ┌───────────────────────────┐ │
│  │  AUTH FLOW  │   │  ONBOARDING   │   │     PRACTICE ENGINE       │ │
│  │             │   │               │   │                           │ │
│  │ Supabase    │──▶│ CV Parser ───▶│──▶│ Reading Quiz (20 Q)       │ │
│  │ Auth JS SDK │   │ Edge Function │   │ Listening Prompts         │ │
│  │ (PKCE +     │   │               │   │ Writing Tasks             │ │
│  │ localStorage)│  │ Profile Save  │   │ Speaking Drills           │ │
│  └─────┬───────┘   └───────┬───────┘   └─────────────┬─────────────┘ │
│        │                   │                         │               │
│        ▼                   ▼                         ▼               │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                    PROFILE (Supabase)                         │   │
│  │  identity │ academic │ professional │ languageTests           │   │
│  │  selfAssessment │ estimatedIelts │ onboarding_completed       │   │
│  └──────────────────────────┬───────────────────────────────────┘   │
│                             │                                       │
│        ┌────────────────────┼────────────────────┐                  │
│        ▼                    ▼                    ▼                  │
│  ┌──────────┐   ┌──────────────────┐   ┌──────────────────┐       │
│  │READINESS │   │   SCHOLARSHIP    │   │    DASHBOARD     │       │
│  │  PAGE    │   │    MATCHING      │   │      HOME        │       │
│  │          │   │                  │   │                  │       │
│  │ Score    │   │ TF-IDF + Rules   │   │ Session stats    │       │
│  │ Blockers │   │ 7-dim scoring    │   │ Band estimates   │       │
│  │ Signals  │   │ 44→500+ records  │   │ Scholarship feed │       │
│  └──────────┘   └────────┬─────────┘   └──────────────────┘       │
│                          │                                         │
│                          ▼                                         │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │              SCHOLARSHIP DATA PIPELINE                        │   │
│  │                                                               │   │
│  │  17 curated sources + 158 UK uni sources                      │   │
│  │       ↓                                                       │   │
│  │  Playwright scraper → JSON-LD + regex extraction              │   │
│  │       ↓                                                       │   │
│  │  Review queue → refresh-content → public/data/scholarships    │   │
│  │       ↓                                                       │   │
│  │  Sync embeddings → Supabase public.scholarships                │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                    DATA STORES                                │   │
│  │                                                               │   │
│  │  Supabase DB          Static JSON           Browser State     │   │
│  │  ├ profiles           ├ scholarships.json   ├ sessions[]      │   │
│  │  ├ practice_sessions  ├ questions.json      ├ profile state   │   │
│  │  ├ scholarships       ├ passages.json       ├ onboardingDraft │   │
│  │  ├ shortlists         ├ content-manifest    ├ content cache   │   │
│  │  ├ scholarship_matches  └ notifications     └ uiStore         │   │
│  │  ├ match_events                                             │   │
│  │  ├ cv_profiles                                               │   │
│  │  └ application_tracking                                      │   │
│  └──────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 2. System-by-System Analysis

### 2.1 Auth Flow
**Files:** `src/services/supabaseClient.js`, `src/services/authBridge.js`, `src/hooks/useAuthSession.js`, `src/components/AuthGate.jsx`, `src/components/AuthCallback.jsx`

**Flow:** Supabase JS SDK handles everything client-side — `signInWithPassword` / `signUpWithPassword` / `signInWithOAuth` (PKCE) → session persisted in `localStorage` by the SDK → `supabase.auth.onAuthStateChange` drives `useAuthSession` → profile hydration. Google OAuth returns to `/auth/callback` (`AuthCallback.jsx`), which calls `supabase.auth.exchangeCodeForSession()`.

**Connects to:** Everything — all authenticated operations depend on this.

**Status:** ✅ Working. This replaced an earlier Vercel serverless cookie bridge (`api/auth.js`, deleted 2026-07-22) that set two `Set-Cookie` values by joining them into one comma-separated header — invalid per RFC 6265, so the browser only ever kept the first cookie and login never actually persisted a session. There is no `netlify/functions/auth.js` in this codebase and never was; an earlier version of this document described one that didn't exist. See CLAUDE.md §5.1 for the current model.

**Optimization:** None outstanding — the redundant-bridge problem this section used to describe no longer applies.

### 2.2 Onboarding Flow
**Files:** `src/components/OnboardingForm.jsx`, `src/lib/onboarding.js`, `src/lib/onboardingJourney.js`, `src/lib/onboardingResolution.js`, `src/App.jsx` (gate logic)

**Flow:** 4-step wizard (Extraction → Verification → Alignment → Verdict) → CV upload triggers Edge Function parser → LLM extracts profile fields → user reviews/corrects → saves to Supabase profiles table → gate dismisses → enters workspace

**Data produced:** `profiles` row with identity, academic, professional, languageTests, selfAssessment, target* fields

**Data consumed:** CV parser response, Supabase profiles (for edit), scholarship catalog (for alignment preview)

**Status:** ✅ Working end-to-end after fixes (PGRST204 column names, onboarding gate dismiss, extractedText display, VerdictStep crash).

**Interconnections:**
- → CV Parser: Uploads document, receives structured profile
- → Scholarship Matcher: Shows ranked matches during Alignment step
- → Profile: Saves resolved fields to Supabase
- → Auth Gate: Determines if onboarding is required

### 2.3 CV Parser (Edge Function)
**Files:** `supabase/functions/cv-parser/index.ts`, `_shared/document-extract.ts`, `_shared/cv-parser.ts`, `_shared/text-preprocess.ts`

**Flow:** Upload PDF/DOCX/TXT → extract text (3-tier: pdfjs → native with CMap → OCR signal) → preprocess (normalize, layout repair, section split, quality gate) → LLM extraction (Anthropic/OpenAI/DeepSeek/Gemini) → hallucination check → structured profile

**Status:** ✅ Deployed v19 with zlib PDF fix, DOCX support, text preprocessing, extraction telemetry.

**Optimization opportunity:** The OCR signal detection works but there's no actual OCR fallback. ~15-20% of CVs are scanned/image-based and silently fail.

### 2.4 Practice Engine
**Files:** `src/components/PracticeView.jsx`, `src/components/ModulePracticeScreen.jsx`, `src/lib/sessionTools.js`, `src/lib/sessionStats.js`, `src/data/qb.js`, `src/data/practiceModules.js`

**Current question types:**
- Reading: 20-question multiple choice from 44-question bank (T/F/NG, Multiple Choice, Grammar)
- Listening: 3 prompts, pass/fail by non-empty submission
- Writing: 3 prompts, pass requires ≥40 chars
- Speaking: 3 prompts with self-rating 1-5

**Scoring:** Raw correct/total. No partial credit. No rubric. No adaptive difficulty within a session.

**Status:** ⚠️ Basic. Reading quiz is functional. Listening/Writing/Speaking are placeholder-level (pass/fail by response length).

**Critical gap:** Writing and Speaking have no real assessment. A user who submits "asdf asdf asdf" (≥40 chars) passes Writing. This undermines the band score estimator's credibility for those skills.

### 2.5 Band Score Estimator (NEW)
**Files:** `src/lib/bandScoreEstimator.js`

**Flow:** After each session → compute per-module accuracy → scale to /40 → look up official IELTS band table → update profile.selfAssessment and profile.languageTests.ieltsBands

**Connects to:**
- ← Practice Engine: Reads all sessions to compute estimates
- → Profile: Writes estimated bands to selfAssessment and languageTests
- → ReadinessPage: Displays estimated band with confidence
- → Scholarship Matcher: Feeds languageTests.ieltsBands into eligibility scoring

**Status:** ✅ Implemented and wired. Uses official IELTS Academic band tables for Reading/Listening. Writing/Speaking estimates are unreliable because the underlying assessment is pass/fail.

### 2.6 Scholarship Matcher
**Files:** `src/services/scoringEngine.js`, `src/features/discovery/ScholarshipPage.jsx`, `src/lib/scholarshipFeed.js`, `src/lib/opportunitySignals.js`, `src/lib/scholarshipContract.js`

**Scoring dimensions (7-factor composite):**
1. Semantic (35%): TF-IDF keyword overlap + vector cosine similarity
2. Eligibility (30%): Nationality, discipline, degree class, language, experience
3. Coverage (15%): Full/partial/tuition-only funding
4. Deadline pressure (10%): <14 days = 100%, decays
5. Provenance confidence (5%): Data staleness
6. Document burden (5%): Negative for heavy requirements
7. Opportunity priority (15%): International signals, Nigeria-only penalty

**Status:** ✅ Solid algorithm. Weakness: only 44 records in catalog. Background scraper running against 158 UK universities will fix this.

### 2.7 Scholarship Data Pipeline
**Files:** `scripts/scrape-scholarships.mjs`, `scripts/scholarship-extractor.mjs`, `scripts/refresh-content.mjs`, `scripts/sync-scholarship-embeddings.mjs`

**Flow:** 17 curated + 158 UK uni sources → Playwright scraper with per-domain CSS profiles → JSON-LD + regex extraction → review queue → refresh-content → public/data/scholarships.json → Supabase sync

**Recent improvements:** Lowered pageScore threshold for university sources, expanded JSON-LD parsing (names, providers, amounts, deadlines), added university funding path bonuses.

**Status:** ⚠️ Background scraper running. Yield was ~0.3% (44 from 175 sources). Improvements should increase this significantly.

### 2.8 Readiness Dashboard
**Files:** `src/features/intelligence/ReadinessPage.jsx`, `src/features/intelligence/DashboardHome.jsx`, `src/lib/profileCompletion.js`

**Flow:** Computes readiness % from: profile completion (42%) + band scores (28%) + top scholarship match (30%). Shows blockers with severity and recommended actions.

**Status:** ✅ Functional but could show richer practice-derived signals.

### 2.9 Account / Profile Management
**Files:** `src/features/identity/AccountPage.jsx`, `src/hooks/useProfileSave.js`

**Status:** ✅ Basic CRUD on profile fields.

---

## 3. Interconnection Map

```
                    ┌──────────────────────────────────┐
                    │         AUTH (gatekeeper)         │
                    └────────────┬─────────────────────┘
                                 │
              ┌──────────────────┼──────────────────┐
              ▼                  ▼                  ▼
        ONBOARDING          PRACTICE           SCHOLARSHIPS
              │                  │                  │
              │    ┌─────────────┘                  │
              │    │                                │
              ▼    ▼                                │
           PROFILE ◀────────────────────────────────┘
              │
              │  languageTests.ieltsBands ← estimated from practice
              │  selfAssessment ← per-module band estimates
              │  academic.* ← from CV parser during onboarding
              │  identity.* ← from CV parser
              │  target* ← from onboarding alignment step
              │
              ├──▶ READINESS (profile completion + bands + matches)
              │
              └──▶ SCHOLARSHIP MATCHER (filters by eligibility from profile)
                         │
                         ▼
                   SHORTLISTS (saved matches)
```

### Well-Connected Systems ✅

| Connection | How |
|-----------|-----|
| Onboarding → Profile | CV parser fills fields, user verifies, saves to Supabase |
| Profile → Scholarship Matcher | Eligibility fields filter/rank opportunities |
| Practice → Band Estimator → Profile | Session scores → estimated bands → language proof |
| Practice → Weak Section Detection | Low-accuracy sections get more questions |
| Auth → Everything | Supabase SDK session (localStorage) gates all authenticated routes |

### Weakly Connected Systems ⚠️

| Gap | Impact | Fix |
|-----|--------|-----|
| Profile ↔ Practice (reverse) | Practice sessions don't see profile's target band | Show "Target: 7.0 | Current: ~6.0" in practice UI |
| Scholarship → Onboarding feedback | Scholarship matches don't inform onboarding field priority | Highlight fields that block the most scholarships |
| Practice → Scholarship ranking | Practice consistency/trend doesn't affect match ranking | Bonus for improving trends, penalty for declining |
| CV Parser → Scholarship catalog | Parser extracts discipline but doesn't check against known taxonomy | Validate extracted discipline against scholarship taxonomy |

### Redundancies 🔄

| Duplication | Recommendation |
|-------------|---------------|
| Python backend + Edge Function parser | Python backend deprecated; remove after verification |
| Multiple data load paths (static JSON + Supabase) | Unify on Supabase for scholarships too |
| Two onboarding draft systems (legacyDraft + resolutionDraft) | Consolidate into single draft model |

---

## 4. Optimization Opportunities (Lean + Effective)

### High Impact, Low Effort

1. **Writing/Speaking prompts → real assessment**
   Currently pass/fail by character count. Add a simple self-assessment rubric (Task Achievement 1-5, Coherence 1-5) that feeds into the band estimator with appropriate weighting. This makes the band estimates meaningful for all 4 skills without needing AI.

2. **Show target vs current band in practice UI**
   When a user sets targetBand=7.0 in onboarding, show "You need ~7.0 | Current estimate: ~6.0" on the practice hub. Creates motivation through gap visualization.

3. **Question bank → 60 questions**
   44 questions for Reading is thin. 60 questions (15 per major question type: T/F/NG, Multiple Choice, Matching Headings, Sentence Completion) would provide enough variety for 3 full practice sessions without repeats.

4. **Deadline urgency in scholarship feed**
   Highlight scholarships closing within 14 days. Add a "Closing soon" filter. Drives action.

### Medium Impact, Medium Effort

5. **Explanation quality upgrade**
   Current explanations are generic ("The answer is B because..."). Upgrade to pattern-based: "This is a T/F/NG question where the key word 'some' in the passage makes the statement True rather than False because..."

6. **Practice streak + consistency tracking**
   Simple streak counter (days with ≥1 session). Consistency is the #1 predictor of IELTS score improvement. Show on dashboard.

7. **Scholarship match explanations in onboarding**
   During Alignment step, when showing ranked matches, explain WHY each match scored well — making the connection between profile completeness and opportunity quality explicit.

---

## 5. Question Format Recommendations

### Current State
- **Reading:** 44 multiple-choice questions. T/F/NG, Multiple Choice, Grammar.
- **Listening:** 3 open-response prompts. Pass/fail.
- **Writing:** 3 prompts. Pass/fail by length ≥40 chars.
- **Speaking:** 3 prompts with 1-5 self-rating.

### Recommended Evolution (Lean Path)

**Phase 1 — Stabilize (now)**
- Reading: Expand to 60 questions. Add Matching Headings and Sentence Completion types.
- Listening: Convert from open-response to form-completion. "Listen to the prompt → fill in the blank." Closer to real IELTS.
- Writing: Add self-assessment rubric (4 criteria × 1-5 scale). Band estimate from rubric average.
- Speaking: Same rubric approach (Fluency, Lexical, Grammar, Pronunciation).

**Phase 2 — Deepen (next)**
- Reading: Add passage-based question sets. One passage → 5 questions (like real IELTS).
- Listening: Add audio-based questions (record short prompts, play them).
- Writing: Add model answer comparison. User writes, then sees model answer, self-rates against it.
- Speaking: Add recording + playback. User records answer, listens back, self-rates.

**Phase 3 — Intelligence (future)**
- AI-powered writing assessment (LLM scores against IELTS rubric)
- AI-powered speaking assessment (speech-to-text → LLM evaluation)
- Adaptive question difficulty within sessions
- Spaced repetition for wrong answers

### The 80/20 Principle
Research consistently shows that the biggest IELTS score gains come from:
1. **Reading:** Mastering T/F/NG questions (they account for ~30% of the reading score and are the most commonly missed type)
2. **Listening:** Form completion and multiple choice (core types)
3. **Writing:** Task structure (the 4-paragraph essay template)
4. **Speaking:** Fluency over accuracy (keep talking, don't self-correct)

A lean platform should focus 80% of its question content on these high-leverage areas.

---

## 6. Ease-of-Use Standards

| Principle | Current State | Target |
|-----------|--------------|--------|
| **Progressive disclosure** | All 4 steps of onboarding shown at once | ✅ Good — step rail shows progress |
| **Immediate feedback** | Reading answers checked one at a time | ✅ Good |
| **Contextual help** | None | Add tooltips explaining why each profile field matters |
| **Error recovery** | Generic "unexpected error" messages | Add specific, actionable error messages |
| **Mobile-first** | CSS uses fixed desktop layouts | Needs responsive breakpoints for practice UI |
| **Offline resilience** | Supabase-dependent | Could cache question bank for offline practice |
| **Empty states** | Some pages show nothing when data is empty | Add "Get started" CTAs for new users |
| **Loading states** | Route-based Suspense fallbacks | ✅ Good |
