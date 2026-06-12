# Loci — Complete System Architecture & User Experience

> A comprehensive illustration of every system, connection, and user journey.
> Generated 2026-06-12

---

## The Big Picture

Loci is an IELTS preparation and scholarship discovery platform. It ingests a user's academic CV, estimates their English proficiency through practice, matches them to postgraduate scholarships, and tracks their readiness over time — all in a single-page application backed by Supabase and Netlify.

```
                         ┌──────────────────────────┐
                         │       THE USER           │
                         │  Nigerian graduate       │
                         │  targeting UK MSc        │
                         │  needs IELTS + funding   │
                         └───────────┬──────────────┘
                                     │
                    ┌────────────────┼────────────────┐
                    ▼                ▼                 ▼
             ┌──────────┐   ┌──────────────┐   ┌──────────────┐
             │ UPLOAD   │   │  PRACTICE    │   │  DISCOVER    │
             │ CV/Resume│   │  IELTS Prep  │   │ Scholarships │
             └────┬─────┘   └──────┬───────┘   └──────┬───────┘
                  │                 │                   │
                  ▼                 ▼                   ▼
             ┌──────────────────────────────────────────────────┐
             │              THE PROFILE (Central State)         │
             │  identity │ academic │ professional │ language   │
             │  targets  │ estimatedIelts │ selfAssessment      │
             └──────────────────────┬───────────────────────────┘
                                    │
        ┌───────────────────────────┼───────────────────────────┐
        ▼                           ▼                           ▼
 ┌──────────────┐          ┌──────────────┐           ┌──────────────┐
 │  READINESS   │          │  SCHOLARSHIP │           │  DASHBOARD   │
 │  Score +     │          │  Matching    │           │  Home        │
 │  Blockers    │          │  + Shortlist │           │  Overview    │
 └──────────────┘          └──────────────┘           └──────────────┘
```

---

## The User Journey

### Act 1 — First Visit (Onboarding)

The user arrives at Loci for the first time. They're greeted by a 4-step onboarding wizard.

```
┌─────────────────────────────────────────────────────────────┐
│ STEP 1: EXTRACTION           STEP RAIL: ● ○ ○ ○            │
│                                                             │
│  ┌─ Drop Intelligence Dossier ──────────────────────────┐  │
│  │  [ Upload PDF / DOCX / TXT ]                         │  │
│  │  "We'll extract your academic identity automatically" │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  After upload:                                              │
│  ┌─ Upload status: Received ── cv.pdf ──────────────────┐  │
│  │  Readable text: 1,847 chars                           │  │
│  │  Detected fields: 5                                   │  │
│  │                                                       │  │
│  │  Full legal name: [ Precious Ajayi ]                  │  │
│  │  Nationality:     [ Nigerian          ]               │  │
│  │  Degree class:    [ Second Class Upper ▼]             │  │
│  │  Discipline:      [ Computer Science  ]               │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  [ Skip upload ]              [ Continue to verification →]│
└─────────────────────────────────────────────────────────────┘
```

**What happens technically:**
1. Browser sends file → Netlify → `netlify/functions/auth.js` verifies session → Supabase Edge Function `cv-parser`
2. `document-extract.ts` detects PDF, extracts text via native parser with CMap/ToUnicode support, computes SHA-256 hash
3. `text-preprocess.ts` normalizes whitespace, repairs hyphenation, splits into sections (contact/summary/education/skills/experience), quality-gates (≥250 chars, ≥55% alpha, education signal present)
4. `cv-parser.ts` sends preprocessed text to Claude/GPT-4/DeepSeek with structured JSON schema
5. LLM returns `{personal_details, academic_history, international_exams, raw_profile_map}` with exact quotes
6. Hallucination checker verifies each `exactQuote` appears in source text
7. Job created in `cv_parse_jobs`, draft in `cv_profile_drafts`

```
┌─────────────────────────────────────────────────────────────┐
│ STEP 2: VERIFICATION          STEP RAIL: ● ● ○ ○           │
│                                                             │
│  ┌─ Verification Cards ─────────────────────────────────┐  │
│  │  Nationality     [Confirmed]  Nigerian                │  │
│  │  Degree class    [Detected]   Second Class Upper      │  │
│  │  Discipline      [Detected]   Computer Science        │  │
│  │  Work experience [Missing]    Not added yet           │  │
│  │  IELTS overall   [Detected]   7.5                     │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  [ Back to extraction ]       [ Continue to alignment →]    │
└─────────────────────────────────────────────────────────────┘
```

**What happens technically:**
- `buildVerificationRows()` compares extracted values against user edits
- `summarizeResolvedField()` tags each as "confirmed", "detected", "edited", or "missing"
- `getVerificationIssues()` surfaces high-priority problems (low confidence, missing nationality)

```
┌─────────────────────────────────────────────────────────────┐
│ STEP 3: ALIGNMENT             STEP RAIL: ● ● ● ○           │
│                                                             │
│  ┌─ Extracted discipline ────────────────────────────────┐ │
│  │  Computer Science                         [ Modify  ]  │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                             │
│  ┌─ Top Scholarship Matches (preview) ────────────────────┐ │
│  │  ┌──────────────────────────────────────────────────┐  │ │
│  │  │ Clarendon Scholarship · Oxford         82% fit   │  │ │
│  │  │ Field / language / degree                        │  │ │
│  │  └──────────────────────────────────────────────────┘  │ │
│  │  ┌──────────────────────────────────────────────────┐  │ │
│  │  │ Gates Cambridge · Cambridge             78% fit   │  │ │
│  │  └──────────────────────────────────────────────────┘  │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                             │
│  Target degree: [ Master's ▼ ]   Target country: [ UK ]    │
│  Application cycle: [ 2026 ]     Target band: [ 7.0 ▼ ]   │
│                                                             │
│  [ Back to verification ]       [ Generate verdict →]       │
└─────────────────────────────────────────────────────────────┘
```

**What happens technically:**
- `rankScholarships()` runs 2-pass scoring on the scholarship catalog against the profile
- Pass 1 (retrieval): TF-IDF + title match + embedding cosine similarity on ALL scholarships
- Pass 2 (scoring): 7-dimension composite score on top-150
- `buildProfileForScoring()` assembles profile from draft for the scoring engine

```
┌─────────────────────────────────────────────────────────────┐
│ STEP 4: VERDICT               STEP RAIL: ● ● ● ●           │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │          ┌─────────────┐                              │  │
│  │          │    78%      │   High Potential             │  │
│  │          │  Readiness  │                              │  │
│  │          └─────────────┘                              │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  Academic Strength: Second Class Upper · Computer Science   │
│  IELTS Baseline: R[7.0] L[7.5] W[6.5] S[7.0]              │
│  Focus modules: [Reading] [Writing]                         │
│  Test date: [ 2026-08-15 ]                                  │
│                                                             │
│  ┌─ Blockers ───────────────────────────────────────────┐  │
│  │  • Work experience is still unverified               │  │
│  │  • Speaking still needs a baseline                   │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  [ Back to alignment ]    [ Save and enter workspace →]     │
└─────────────────────────────────────────────────────────────┘
```

**What happens technically:**
- `getReadinessPercent()` computes composite: 34% skill average + 28% confidence + 38% profile signals
- `getVerdict()` maps readiness to label: ≥78 = "High Potential", ≥56 = "Promising", <56 = "Foundation Needed"
- `getVerdictBlockers()` checks 11 fields and surfaces top 4 missing/conflict items
- On save: `serializeOnboardingResolutionDraft()` → `cleanProfilePatch()` (renames camelCase→lowercase for PostgREST) → Supabase `profiles` PATCH
- `onboardingGateDismissed = true` → user enters workspace

---

### Act 2 — Daily Practice (The Core Loop)

The user returns to improve their IELTS score. They visit the Practice Hub.

```
┌─────────────────────────────────────────────────────────────┐
│ PRACTICE HUB                                                │
│                                                             │
│  ┌─ Sessions: 12 ── Est. Band: 6.0 ── Target → 1.0 to go┐ │
│  │  Complete more sessions for reliable band estimates.   │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                             │
│  ┌─ Reading ────────────────────────────────────────────┐  │
│  │  Answer one question at a time and keep your pace.    │  │
│  │                                          [ Open → ]   │  │
│  └──────────────────────────────────────────────────────┘  │
│  ┌─ Listening ──────────────────────────────────────────┐  │
│  │  Catch the correction, then write the answer.         │  │
│  └──────────────────────────────────────────────────────┘  │
│  ┌─ Writing ────────────────────────────────────────────┐  │
│  │  Plan fast, write clearly, stay on task.              │  │
│  └──────────────────────────────────────────────────────┘  │
│  ┌─ Speaking ───────────────────────────────────────────┐  │
│  │  Answer clearly, keep moving, finish cleanly.         │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

**The Reading Session (most developed):**

```
┌─────────────────────────────────────────────────────────────┐
│ READING PRACTICE                    ████████░░ 65% complete  │
│                                                             │
│  Passage: Urban Farming                                     │
│                                                             │
│  Q8/20: "Urban farming consistently produces more food      │
│  per square metre than conventional agriculture."           │
│                                                             │
│  ○ True    ● False    ○ Not Given                          │
│                                                             │
│  [ Check answer ]                              ⏱ 0:32      │
└─────────────────────────────────────────────────────────────┘
```

After answering:
```
┌─────────────────────────────────────────────────────────────┐
│ ✓ Correct!                                                  │
│                                                             │
│ ❌ FALSE — T/F/NG Strategy: When the passage states the     │
│ OPPOSITE of the claim, the answer is False.                │
│                                                             │
│ 🔍 Evidence: The passage says yields are 'typically lower   │
│ than in conventional agriculture.' The question says        │
│ 'produces more' — direct contradiction.                    │
│                                                             │
│ ⚠️ Trap: Don't assume 'urban farming' = 'more efficient'.  │
│ Read what the passage actually says about yields.           │
│                                                             │
│ 💡 Key skill: Words like 'consistently', 'more', 'always'   │
│ in the question are T/F/NG red flags. Verify against the    │
│ passage's exact language.                                   │
│                                                             │
│ [ Next question → ]                                         │
└─────────────────────────────────────────────────────────────┘
```

**The Writing Session (with rubric self-assessment):**

```
┌─────────────────────────────────────────────────────────────┐
│ WRITING PRACTICE                                            │
│                                                             │
│  Prompt: "Some people believe that universities should      │
│  focus on academic subjects rather than vocational skills.  │
│  To what extent do you agree or disagree?"                 │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ [ Your response...                         120 words ] │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  Self-assessment rubric (1=Needs work, 3=Adequate, 5=Strong)│
│  Task Achievement:  [1][2][3●][4][5]  Fully answered?      │
│  Coherence:         [1][2][3][4●][5]  Logical flow?        │
│  Lexical Resource:  [1][2][3●][4][5]  Varied vocabulary?   │
│  Grammar:           [1][2][3●][4][5]  Accurate sentences?  │
│                                                             │
│  Avg: 3.3/5 — Adequate                                      │
│                                                             │
│  [ Submit and continue → ]                                  │
└─────────────────────────────────────────────────────────────┘
```

**What happens technically after each session:**
1. `onSessionComplete(sess)` fires in App.jsx
2. Session merged into local state via `mergeSessions()`
3. `estimateOverallBand(sessions)` runs: 
   - Per-module accuracy → scaled to /40 → looked up in official IELTS band table
   - Trend computed (improving/stable/declining from last 3 vs earlier sessions)
   - Confidence assigned (high ≥5 sessions, medium ≥2, low <2)
4. Profile updated: `selfAssessment`, `languageTests.ieltsBands`, `estimatedIelts`, `estimatedIeltsConfidence`
5. Session persisted to Supabase `practice_sessions` table

---

### Act 3 — Scholarship Discovery

The user explores funding opportunities matched to their profile.

```
┌─────────────────────────────────────────────────────────────┐
│ SCHOLARSHIP WORKSPACE                    Updated 12 Jun 2026 │
│                                                             │
│  Content refreshed: 12 Jun  │  Deadline changes: 2          │
│  Coverage: 44 tracked      │  Sources: 17 curated + 158 UK  │
│                                                             │
│  ┌─ Filters ────────────────────────────────────────────┐  │
│  │  Region: [ All ▼ ]    Max tuition: [ 999999 ]         │  │
│  │  [ Closing soon ]                                     │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌─ PRIMARY MATCH ──────────────────────────────────────┐  │
│  │  ★ 82% FIT                                           │  │
│  │  Clarendon Scholarship                                │  │
│  │  University of Oxford                                 │  │
│  │  Full Funding · £15,000 stipend                       │  │
│  │  Deadline: 23 Jan 2027 (225 days)                     │  │
│  │                                                       │  │
│  │  Why this matched:                                    │  │
│  │  • Open to international applicants                   │  │
│  │  • Your field (Computer Science) lines up             │  │
│  │  • Your degree class meets the requirement            │  │
│  │  • IELTS 7.5 meets the minimum (7.0)                  │  │
│  │                                                       │  │
│  │  [ Save to shortlist ]  [ Track application ]         │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌─ MORE MATCHES ───────────────────────────────────────┐  │
│  │  Gates Cambridge · 78%  │  Edinburgh Global · 71%     │  │
│  │  DAAD Scholarship · 68%  │  Chevening · 65%           │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

**What happens technically:**
1. `ScholarshipPage` loads catalog from `public/data/scholarships.json` (or Supabase)
2. `buildCorpusIdf(catalog)` computes TF-IDF weights from all scholarship text
3. `rankScholarships(catalog, profile, {idfWeights, engagementMap})`:
   - Retrieval pass: TF-IDF keyword overlap + title match + vector cosine similarity
   - Scoring pass (7 dimensions): semantic (33%) + eligibility (28%) + coverage (13%) + deadline (9%) + provenance (5%) + burden (4%) + priority (13%) + engagement bonus
4. Engagement map from user's shortlists/applications feeds into scoring (Opt 9)
5. "Closing soon" toggle filters to ≤14 day deadlines (Opt 6)

---

### Act 4 — The Dashboard (Daily Check-in)

```
┌─────────────────────────────────────────────────────────────┐
│ DASHBOARD                                                   │
│                                                             │
│  ┌─ Readiness Score ────────────────────────────────────┐  │
│  │  ████████████████████░░░░░░░░  78%                   │  │
│  │  High Potential                                       │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌─ Active Signals ─────────────────────────────────────┐  │
│  │  Practice sessions:  12         Est. IELTS: 6.5       │  │
│  │  Top match:          82%        Streak: 4 days 🔥     │  │
│  │  Days until test:    64                                │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌─ Band Snapshot ──────────────────────────────────────┐  │
│  │  Reading:   6.5 ████████░░░░    Listening: 7.0 █████  │  │
│  │  Writing:   5.5 ██████░░░░░░    Speaking:  6.0 ████   │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌─ Daily Drill ────────────────────────────────────────┐  │
│  │  "Work on writing for 20 minutes"                     │  │
│  │  Your writing band (5.5) is your weakest. Target 7.0. │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌─ Latest Opportunities ───────────────────────────────┐  │
│  │  Clarendon Scholarship · Oxford     Deadline: Jan 2027 │  │
│  │  Gates Cambridge · Cambridge        Deadline: Dec 2026 │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

**What happens technically:**
- `buildDashboardSnapshot(profile, sessions)` computes streak, days until test, weakest skill, next task
- Dashboard now imports from `bandScoreEstimator.js` (Opt 1) — single source of truth
- Band snapshot shows per-module estimates with progress bars
- `getLatestScholarshipFeed()` shows recent additions

---

## Complete System Architecture

```
┌────────────────────────────────────────────────────────────────────────────┐
│                          LOCI — FULL SYSTEM MAP                            │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│  NETLIFY EDGE                        SUPABASE CLOUD                        │
│  ┌──────────────────┐               ┌──────────────────────────────────┐  │
│  │ netlify/functions│               │  EDGE FUNCTIONS                  │  │
│  │   auth.js        │               │  ┌────────────────────────────┐  │  │
│  │ (OAuth bridge)   │               │  │ cv-parser (v19)            │  │  │
│  └──────┬───────────┘               │  │  document-extract.ts       │  │  │
│         │                           │  │  text-preprocess.ts        │  │  │
│         ▼                           │  │  cv-parser.ts (LLM)        │  │  │
│  ┌──────────────────┐               │  └────────────────────────────┘  │  │
│  │  STATIC ASSETS   │               │  ┌────────────────────────────┐  │  │
│  │  /data/*.json    │               │  │ generate-embedding (v10)   │  │  │
│  │  scholarships    │               │  │  openai.ts → text-embed-3  │  │  │
│  │  questions       │               │  └────────────────────────────┘  │  │
│  │  passages        │               │  ┌────────────────────────────┐  │  │
│  │  content-manifest│               │  │ generate-semantic-profile  │  │  │
│  └──────────────────┘               │  │  anthropic.ts → Claude     │  │  │
│                                     │  └────────────────────────────┘  │  │
│                                     │  ┌────────────────────────────┐  │  │
│                                     │  │ document-intake            │  │  │
│                                     │  │  json-parser.js            │  │  │
│                                     │  └────────────────────────────┘  │  │
│                                     └──────────────────────────────────┘  │
│                                                     │                     │
│                                     ┌───────────────┴───────────────┐     │
│                                     │       POSTGRES DATABASE        │     │
│                                     │                                │     │
│                                     │  profiles          (RLS auth)  │     │
│                                     │  practice_sessions (RLS auth)  │     │
│                                     │  scholarships      (public r)  │     │
│                                     │  shortlists        (RLS auth)  │     │
│                                     │  cv_profiles       (RLS auth)  │     │
│                                     │  candidate_profiles(RLS auth)  │     │
│                                     │  scholarship_matches(RLS auth) │     │
│                                     │  match_events      (RLS auth)  │     │
│                                     │  application_tracking(RLS auth)│     │
│                                     │  cv_parse_jobs     (RLS auth)  │     │
│                                     │  cv_profile_drafts (RLS auth)  │     │
│                                     └────────────────────────────────┘     │
│                                                                            │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                    BROWSER (Single-Page App)                          │  │
│  │                                                                       │  │
│  │  ┌─ App.jsx (Orchestrator) ─────────────────────────────────────────┐ │  │
│  │  │  State: authUser, profile, sessions, content, drafts             │  │  │
│  │  │  Routes: / /onboarding /practice/* /scholarships/* /account      │  │  │
│  │  │  Gate: onboardingStatus.shouldRedirect → /onboarding              │  │  │
│  │  └──────────────────────────────────────────────────────────────────┘ │  │
│  │                                                                       │  │
│  │  ┌─ useAuthSession ──────┐  ┌─ useDocumentImport ──┐                 │  │
│  │  │ bootstrap + refresh   │  │ upload + poll + CV   │                 │  │
│  │  │ profile enrichment    │  │ parser integration   │                 │  │
│  │  └───────────────────────┘  └──────────────────────┘                 │  │
│  │                                                                       │  │
│  │  ┌─ OnboardingForm ───────────────────────────────────────────────┐  │  │
│  │  │  4 steps: Extraction → Verification → Alignment → Verdict      │  │  │
│  │  │  Dual draft: legacyDraft (UI) + resolutionDraft (conflicts)    │  │  │
│  │  └────────────────────────────────────────────────────────────────┘  │  │
│  │                                                                       │  │
│  │  ┌─ Practice Engine ──────────────────────────────────────────────┐  │  │
│  │  │  PracticeView (Reading quiz: 20 Q from 44+ bank)               │  │  │
│  │  │  ModulePracticeScreen (Listening/Writing/Speaking + rubric)    │  │  │
│  │  │  sessionTools: selectQueue, computeWeakSections, mergeSessions │  │  │
│  │  │  sessionStats: collectSectionStats, collectModuleStats         │  │  │
│  │  └────────────────────────────────────────────────────────────────┘  │  │
│  │                                                                       │  │
│  │  ┌─ Band Score Estimator (NEW) ────────────────────────────────────┐  │  │
│  │  │  estimateOverallBand(sessions) → per-module + overall band      │  │  │
│  │  │  Official IELTS tables (2025-2026) with .25/.75 rounding        │  │  │
│  │  │  Feeds: profile.selfAssessment, profile.languageTests.ieltsBands│  │  │
│  │  └────────────────────────────────────────────────────────────────┘  │  │
│  │                                                                       │  │
│  │  ┌─ Scholarship Matcher ───────────────────────────────────────────┐  │  │
│  │  │  scoringEngine.js (1288 lines)                                  │  │  │
│  │  │  2-pass: TF-IDF retrieval → 7-dimension scoring                 │  │  │
│  │  │  engagementMap: shortlisted +5%, applied +8%, dismissed -5%     │  │  │
│  │  │  buildCorpusIdf, rankScholarships, scoreScholarship             │  │  │
│  │  └────────────────────────────────────────────────────────────────┘  │  │
│  │                                                                       │  │
│  │  ┌─ Dashboard ─────────────────────────────────────────────────────┐  │  │
│  │  │  dashboard.js: buildDashboardSnapshot → readiness, streak, etc  │  │  │
│  │  │  opportunitySignals.js: classifyOpportunityFocus, formatIelts   │  │  │
│  │  │  scholarshipFeed.js: getLatestScholarshipFeed (time-based)      │  │  │
│  │  │  notifications.js: buildNotificationFeed (deadline changes)     │  │  │
│  │  └────────────────────────────────────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                            │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                    DATA PIPELINE (Node.js scripts)                    │  │
│  │                                                                       │  │
│  │  scrape-scholarships.mjs (Playwright + fetch)                         │  │
│  │    → 17 curated + 158 UK university sources                           │  │
│  │    → JSON-LD enrichment + regex extraction                            │  │
│  │    → review queue → refresh-content.mjs                               │  │
│  │    → public/data/scholarships.json                                    │  │
│  │    → sync-scholarship-embeddings.mjs → Supabase                       │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────────┘
```

---

## Data Flow Diagram

```
USER ACTION              FRONTEND                    BACKEND/DB
───────────              ────────                    ──────────

Uploads CV ──→ OnboardingForm.handleFile()
                   │
                   ├──→ useDocumentImport.upload()
                   │       │
                   │       ├──→ cvParserClient.parseCvFileWithEdgeFunction()
                   │       │       │
                   │       │       └──→ POST /functions/v1/cv-parser/upload
                   │       │               │
                   │       │               ├── extractDocumentIntakeFromFile()
                   │       │               ├── preprocessCvText()
                   │       │               ├── parseCvRawText() → LLM
                   │       │               └── finalizeParsedJob() → Supabase
                   │       │
                   │       └──→ setResult({ canonical, profile, ... })
                   │
                   └──→ setDraft({ dossier: intake, ... })
                           │
Completes session ──→ PracticeView.next()
                   │
                   └──→ onSessionComplete(sess)
                           │
                           ├──→ mergeSessions(current, [session])
                           ├──→ estimateOverallBand(allSessions)
                           │       │
                           │       ├── per-module accuracy → scale/40
                           │       ├── IELTS band table lookup
                           │       └── .25/.75 rounding
                           │
                           ├──→ setProfile({ selfAssessment, estimatedIelts })
                           └──→ savePracticeSession(profileId, sess) → Supabase

Saves onboarding ──→ VerdictStep.onSave()
                   │
                   └──→ saveOnboarding()
                           │
                           ├──→ serializeOnboardingResolutionDraft()
                           ├──→ cleanProfilePatch() (camelCase→lowercase)
                           ├──→ updateProfileRecord() → Supabase PATCH
                           ├──→ handleCvImport() → saveCvProfile()
                           └──→ navigate("/")

Views matches ──→ ScholarshipPage
                   │
                   ├──→ buildCorpusIdf(catalog)
                   ├──→ rankScholarships(catalog, profile, {engagementMap})
                   │       │
                   │       ├── Pass 1: TF-IDF + title + cosine
                   │       ├── Pass 2: 7-dim composite
                   │       └── Sort by score → deadline → confidence
                   │
                   └──→ Renders: primary match + result cards + shortlist
```

---

## Key Design Decisions

| Decision | Why |
|----------|-----|
| **Client-side scoring** | TF-IDF + rules run in-browser. No server cost per match. Scales to ~500 scholarships before needing server-side. |
| **Dual draft system** | `legacyDraft` (flat) for UI simplicity. `resolutionDraft` (layered) for conflict detection between extracted and asserted values. |
| **PostgreSQL lowercase columns** | `applicationCycle` in DDL becomes `applicationcycle` in PostgREST. `cleanProfilePatch` handles the translation. |
| **Official IELTS tables** | Band estimator uses 2025-2026 official conversion tables, not heuristics. Proper .25/.75 rounding. |
| **Edge Function parser (not Python)** | Python backend deprecated. Edge Function is the single path: document-extract → text-preprocess → LLM → hallucination check. |
| **Band estimates not stored in DB** | Practice-derived bands live in React state (`profile.estimatedIelts`). Explicit IELTS scores stored in `profiles.languageTests`. |
| **Engagement weighting is mild** | ±5-8% so it doesn't create a filter bubble. Shortlisted scholarships get a nudge, not dominance. |

---

## What the User Never Sees

```
They don't see:
  • The 3-tier PDF extraction fallback chain (pdfjs → native CMap → OCR signal)
  • The zlib vs raw deflate distinction that makes PDF decompression work
  • The PostgREST column name translation (applicationCycle → applicationcycle)
  • The hallucination checker verifying every LLM claim against source text
  • The 1795 junk files removed from the repository
  • The 158 UK university sources being scraped in the background
  • The 7-dimension composite scoring formula
  • The migration history repair that fixed PGRST204 errors
  • The NOTIFY pgrst command that reloads the schema cache
  • The .25/.75 IELTS rounding rules

They experience:
  • Upload a CV → fields appear
  • Practice → band score improves
  • Browse scholarships → see ranked matches
  • Save → everything syncs
  • Return tomorrow → streak continues
```
