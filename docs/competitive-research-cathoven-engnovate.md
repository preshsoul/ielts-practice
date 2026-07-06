# Competitive Intelligence: Cathoven & Engnovate
> Research conducted: June 29, 2026 | For: LOCI Platform Strategy

---

## Executive Summary

**Cathoven** and **Engnovate** are the two dominant AI-powered IELTS preparation platforms in the market. Both have achieved significant traction by offering AI-scored writing and speaking feedback — the exact capability gap in LOCI's current IELTS practice module. This report analyzes both competitors, maps them against LOCI's capabilities, and provides a prioritized integration roadmap to close the gap and leapfrog both.

---

## Part 1: Deep Competitor Profiles

### 1.1 Cathoven AI (cathoven.com)

| Dimension | Detail |
|-----------|--------|
| **Founded** | 2022, by Erdi Tac (CEO), Liang Mingxi, Long Guanjiao |
| **HQ** | US, with offices in Hong Kong, Europe, Turkey |
| **Funding** | Seed stage (Crunchbase-listed) |
| **Recognition** | QS #2 AI in Education (after Duolingo), HKTDC Start-up Express 2024 winner |
| **Institutional Clients** | Columbia University, UC Berkeley, Turkish universities (pilot) |
| **Team Background** | Ex-IELTS examiners and teachers |
| **Trustpilot** | Not prominently listed (smaller consumer footprint) |

#### Feature Matrix

| Category | Feature | Free Tier | Premium (~$13.50/mo) |
|----------|---------|-----------|----------------------|
| **Writing** | AI essay scoring (4 IELTS criteria) | 3/week | Unlimited |
| **Writing** | Sentence-by-sentence feedback | ✓ | ✓ |
| **Writing** | Revision suggestions | ✓ | ✓ |
| **Speaking** | AI speaking assessment | 3/week | Unlimited |
| **Speaking** | Fluency, pronunciation, grammar, vocab analysis | ✓ | ✓ |
| **Reading** | Cambridge-style practice tests | Limited | Unlimited |
| **Reading** | Adaptable difficulty passages | — | ✓ |
| **Listening** | Practice tests | Limited | Unlimited |
| **AI Tutor** | "Catbot" personalized coach | ✓ | ✓ |
| **AI Tutor** | Custom study plans from gap analysis | — | ✓ |
| **Tools** | CEFR Checker, Catile Analyzer, Exercise Creator | Partial | Full |
| **Tools** | Reading Generator, Video Analyzer, Level Adaptor | — | ✓ |
| **Institutional** | White-label licensing | — | Custom pricing |

#### Technology Stack
| Layer | Technology |
|-------|-----------|
| Frontend | Next.js |
| Backend | Django + Daphne (ASGI) + Gunicorn (WSGI) |
| Reverse Proxy | Nginx |
| Databases | MongoDB (user data, content), MySQL (analytics, scoring) |
| Caching | Redis |
| Real-time | WebSockets (AI tutor chat, live scoring) |
| DevOps | Docker, CI/CD, APM |
| Architecture | Clean Architecture + Domain-Driven Design |
| AI/ML | Custom NLP models (10+ years exam data), proprietary Catile readability algorithm, CEFR classification engine |

#### Strategic Roadmap (2025+)
1. **Speaking assessment tools** — expanding beyond current writing focus
2. **Multi-language expansion** — beyond English to new languages
3. **Media-based learning** — extracting learning materials from movies, music, games
4. **Continuous assessment** — integrated toolset for ongoing student evaluation
5. **US market push** — contingent on Turkish university pilot results

---

### 1.2 Engnovate (engnovate.com)

| Dimension | Detail |
|-----------|--------|
| **Positioning** | "The largest website for English & IELTS Resources" |
| **Monthly Learners** | 1M+ |
| **Estimated MRR** | ~$55,200 (range: $41K–$69K) |
| **Top Markets** | India (37%), Uzbekistan (19%), Vietnam (14%), Bangladesh (14%), Nepal (2%) |
| **Partnerships** | Official British Council partner |
| **Trustpilot** | 4.5–4.6 / 5 ("Excellent") |
| **Pricing Model** | One-time payments (NOT subscription) |

#### Feature Matrix

| Category | Feature | Details |
|----------|---------|---------|
| **Mock Tests** | Full Cambridge IELTS tests | Timed, leaderboard-ranked, new daily |
| **Writing** | AI essay evaluation | 75–95% accuracy vs official scores |
| **Speaking** | AI speaking evaluation | Instant IELTS criteria feedback |
| **Speaking** | AI conversation practice | Real-time with improvement suggestions |
| **Listening** | Dictation exercises | Immediate feedback |
| **Speaking** | Shadowing exercises | Pronunciation practice |
| **Writing** | Improvement exercises | Targeted skill drills |
| **Pronunciation** | Pronunciation exercises | Automated feedback |
| **Courses** | Structured roadmap | IELTS/English mastery path |
| **Community** | Daily leaderboards | Competitive ranking |
| **Community** | User-submitted answers | UGC speaking/writing samples |

#### Pricing (One-Time, No Recurring)
| Plan | Price | Effective Monthly |
|------|-------|-------------------|
| 1 month | $5.97 | $5.97 |
| 3 months | $15.97 | $5.32 |
| 6 months | $23.97 | $4.00 |
| 12 months | $27.97 | $2.33 |
| **Free** | $0 | Limited access |

#### Technology (Inferred)
- Web-based, mobile-responsive PWA
- Optimized for Chromium browsers (Chrome, CocCoc)
- Two-device simultaneous login limit
- Likely lightweight stack compared to Cathoven (given MRR/team size)
- No evidence of public API or developer platform

---

## Part 2: Competitive Landscape Map

### 2.1 Positioning Matrix

```
                    AI Scoring Depth
                         ▲
                    High │    ● Cathoven
                         │
                         │         ● Engnovate
                         │
                         │    ○ LOCI (current)
                    Low  │
                         └──────────────────────►
                         Narrow            Broad
                         (IELTS-only)    (IELTS + Career)

                    Feature Breadth
```

### 2.2 Feature Comparison: LOCI vs Competitors

| Feature | LOCI | Cathoven | Engnovate | Gap |
|---------|------|----------|-----------|-----|
| **IELTS Reading Practice** | ✅ (static Q-bank) | ✅ (adaptive) | ✅ (Cambridge-sourced) | MEDIUM |
| **IELTS Listening Practice** | ✅ (basic) | ✅ | ✅ (dictation) | MEDIUM |
| **IELTS Writing Practice** | ✅ (prompts only) | ✅ (AI scoring) | ✅ (AI scoring) | **CRITICAL** |
| **IELTS Speaking Practice** | ✅ (prompts only) | ✅ (AI scoring) | ✅ (AI conversation) | **CRITICAL** |
| **AI Writing Scoring** | ❌ | ✅ (98% accuracy) | ✅ (75-95%) | **CRITICAL** |
| **AI Speaking Scoring** | ❌ | ✅ | ✅ | **CRITICAL** |
| **AI Tutor / Coach** | ❌ | ✅ (Catbot) | ✅ (conversations) | HIGH |
| **Vocabulary (SRS)** | ✅ (SM-2, 150 words) | ❌ | ❌ | **ADVANTAGE** |
| **Daily Challenges** | ✅ (9 rotating) | ❌ | ✅ (daily exams) | PARITY |
| **Mock Tests** | ✅ (engine exists) | ✅ | ✅ (Cambridge-sourced) | MEDIUM |
| **Band Score Estimator** | ✅ (official tables) | ✅ | ✅ | PARITY |
| **Learning Path** | ✅ (12 topics) | ✅ (study plans) | ✅ (courses) | PARITY |
| **Achievements** | ✅ (8 badges) | ❌ | ❌ | **ADVANTAGE** |
| **Progress Tracking** | ✅ (Supabase) | ✅ | ✅ | PARITY |
| **Leaderboards** | ❌ | ❌ | ✅ | LOW |
| **Scholarship Matching** | ✅ (multi-dim) | ❌ | ❌ | **UNIQUE MOAT** |
| **CV Parsing** | ✅ (multi-LLM) | ❌ | ❌ | **UNIQUE MOAT** |
| **Application Tracking** | ✅ | ❌ | ❌ | **UNIQUE MOAT** |
| **Deadline Management** | ✅ | ❌ | ❌ | **UNIQUE MOAT** |
| **Readiness Diagnostic** | ✅ | ❌ | ❌ | **UNIQUE MOAT** |
| **Semantic Search** | ✅ (pgvector) | ❌ | ❌ | **UNIQUE MOAT** |
| **Institutional Licensing** | ❌ | ✅ | ❌ | OPPORTUNITY |
| **Mobile App** | ❌ (PWA-ready) | ❌ (web only) | ❌ (web only) | OPPORTUNITY |
| **Payment/Subscriptions** | ❌ | ✅ | ✅ (one-time) | **BLOCKER** |

### 2.3 SWOT Analysis

#### Cathoven
| Strengths | Weaknesses |
|-----------|------------|
| Highest AI scoring accuracy (98%) | Narrow scope (IELTS-only) |
| Institutional adoption (Columbia, Berkeley) | Higher price point |
| 10+ years exam data moat | No career/scholarship features |
| White-label licensing revenue | Web-only (no mobile app) |
| Multi-language roadmap | Smaller consumer user base |

| Opportunities | Threats |
|---------------|---------|
| US market expansion | LOCI's career+IELTS bundle |
| Media-based learning innovation | Engnovate's price advantage |
| API/platform play | Free AI tools (ChatGPT) commoditizing scoring |

#### Engnovate
| Strengths | Weaknesses |
|-----------|------------|
| Lowest price ($2.33/mo effective) | Lower AI accuracy (75-95%) |
| Largest user base (1M+/mo) | Narrow scope (IELTS-only) |
| British Council partnership | No API or developer platform |
| Community/leaderboard engagement | One-time pricing → churn risk |
| Daily fresh content | Less sophisticated tech stack |

| Opportunities | Threats |
|---------------|---------|
| South/Southeast Asia growth | LOCI's scholarship bundling |
| Institutional sales | Cathoven's accuracy advantage |
| Mobile app launch | AI commoditization |

---

## Part 3: Integration Strategy & Roadmap

### 3.1 Strategic Positioning
LOCI's unique moat is bundling **IELTS prep + scholarship matching + CV/career management** into one platform. Neither competitor touches scholarships or careers. The integration strategy should:

1. **Close the critical gap**: AI-powered writing and speaking scoring
2. **Deepen the moat**: Connect IELTS performance → scholarship eligibility → application readiness
3. **Leapfrog, don't copy**: Integrate features in ways neither competitor can (because they lack the career/scholarship context)

### 3.2 Integration Opportunities — Detailed

#### OPPORTUNITY 1: AI Writing & Speaking Scoring (CRITICAL — Phase 1)

**What to build**: An AI scoring engine that evaluates IELTS writing (Task 1 & 2) and speaking submissions against the official 4-criteria rubric.

**Competitive baseline**:
- Cathoven: 98% accuracy, sentence-level feedback, built on 10+ years examiner data
- Engnovate: 75-95% accuracy, rubric-aligned feedback

**LOCI's advantage**: We already have the LLM infrastructure (Claude, GPT, Gemini, DeepSeek via Edge Functions), the security framework (prompt injection defense, rate limiting, input validation), and the caching layer (Upstash Redis).

**Implementation approach**:
```
User submits essay/speaking recording
  → Edge Function validates input (Content-Length guard, prompt injection check)
  → LLM call with hardened IELTS rubric prompt
  → Structured JSON response: 4 criteria scores + sentence-level feedback
  → Cache result (1-hour TTL, keyed on hash)
  → Store in practice_sessions table
  → Update band trend on dashboard
```

**Scoring prompt design** (the secret sauce):
- Embed the official IELTS public band descriptors for each criterion
- Request per-paragraph/per-sentence annotations, not just a final band
- Require the model to cite specific text evidence for each deduction
- Cross-validate: run two independent evaluations (one Claude, one GPT) and flag discrepancies >0.5 band
- Calibrate against a golden dataset of 50+ human-examiner-scored essays

**Estimated effort**: 3-4 weeks for MVP (writing only), +2 weeks for speaking

---

#### OPPORTUNITY 2: Adaptive Reading Passage Generator (HIGH — Phase 1)

**What to build**: Dynamically generate IELTS reading passages at calibrated CEFR/IELTS difficulty levels with accompanying questions.

**Competitive baseline**:
- Cathoven: Adaptable difficulty reading generator (Catile algorithm)
- Engnovate: Static Cambridge-sourced passages

**LOCI's advantage**: We already have `generate-embedding` and `generate-semantic-profile` Edge Functions. We can extend these to produce reading content.

**Implementation approach**:
- Accept parameters: target band (4.0–9.0), topic, passage type (Academic/GT), question types desired
- LLM generates passage calibrated to CEFR level mapped to IELTS band
- Auto-generate 13-14 questions with answer key and explanations
- Validate: run CEFR checker on output, regenerate if off by >1 CEFR level
- Store generated passages in `passages` table with `generated=true` flag

**Why this beats Cathoven**: Infinite variety vs their finite passage bank. Combined with our vocabulary SRS, we can generate passages that deliberately include words the user is currently learning.

**Estimated effort**: 2-3 weeks

---

#### OPPORTUNITY 3: AI Tutor / Study Coach (HIGH — Phase 2)

**What to build**: A personalized AI coach that analyzes the user's practice history, identifies weak areas, and generates custom study plans.

**Competitive baseline**:
- Cathoven: "Catbot" — personalized guidance, custom study plans
- Engnovate: AI conversation practice, improvement suggestions

**LOCI's advantage**: We have more data signals than either competitor:
- Practice session history (all 4 skills)
- Vocabulary SRS progress (150 words, spaced repetition)
- Scholarship matches and eligibility gaps
- CV/profile completeness
- Readiness diagnostic scores

**Implementation approach**:
- Aggregate all user signals into a `student_profile` summary
- Generate a weekly study plan: "Your Writing Task 2 is at Band 6.0; to reach 7.0, focus on lexical resource. Here are 3 exercises targeting advanced vocabulary for opinion essays..."
- Connect to scholarship requirements: "The Chevening Scholarship requires IELTS 7.0 overall with 6.5 in each band. You're at 6.5 overall with 6.0 in Writing — here's a 4-week plan to close the gap."
- Deliver via a chat interface (Edge Function + Supabase Realtime)

**The killer feature neither competitor can replicate**:
> "Based on your IELTS practice (currently Band 6.5) and CV profile (First Class in Engineering, 2 years experience), here are 12 scholarships you're eligible for. To unlock 8 more, you need Band 7.0. Here's exactly what to work on."

**Estimated effort**: 4-6 weeks

---

#### OPPORTUNITY 4: Speaking AI with Pronunciation Feedback (HIGH — Phase 2)

**What to build**: Real-time AI speaking practice with fluency analysis, pronunciation feedback, and rubric-aligned scoring.

**Competitive baseline**:
- Cathoven: AI speaking assessment, fluency/pronunciation/grammar/vocab analysis
- Engnovate: AI conversation practice, shadowing exercises

**LOCI's advantage**: Multi-LLM infrastructure. We can use specialized models for different aspects of speaking evaluation.

**Implementation approach**:
- Browser MediaRecorder API → capture audio → send to Edge Function
- Edge Function: transcribe (Whisper API or Gemini), then score transcript against IELTS rubric
- For pronunciation: use a phoneme-level analysis library or pass audio through a TTS evaluation model
- Store recordings in Supabase Storage (user-scoped, auto-expire after 30 days)
- Build a "speaking journal" — track pronunciation improvements over time

**Estimated effort**: 4-6 weeks (heavy on audio processing infrastructure)

---

#### OPPORTUNITY 5: IELTS ← → Scholarship Bridge (UNIQUE MOAT — Phase 2)

**What to build**: A bidirectional integration where IELTS practice performance directly informs scholarship eligibility, and scholarship requirements drive IELTS study priorities.

**This doesn't exist anywhere in the market.** Neither Cathoven nor Engnovate has scholarships.

**Flow A — IELTS → Scholarships**:
```
User completes IELTS mock test → Band 7.0 estimated
  → Scoring engine recalculates eligibility for all scholarships
  → "Great news! Your estimated Band 7.0 now qualifies you for 23 more scholarships"
  → Scholarship feed re-ranks based on new eligibility
  → Match alerts fire for newly eligible scholarships
```

**Flow B — Scholarships → IELTS**:
```
User shortlists 5 scholarships requiring Band 7.5 overall, 7.0 in Writing
  → AI coach reads requirements
  → Study plan prioritizes Writing (user's weakest at 6.0)
  → Daily challenges skew toward Writing Task 2
  → Vocabulary engine prioritizes academic words common in scholarship application essays
  → Dashboard shows: "Your Chevening target: Band 7.5. Current: 6.5. Gap: 1.0. Focus: Writing."
```

**Implementation approach**:
- Extend `scoringEngine.js` to accept estimated IELTS bands as input to eligibility calculation
- Add `target_bands` field to `shortlists` table
- Add a `gap_analysis` view that joins practice_sessions with scholarship requirements
- Dashboard widget: "Scholarship readiness tracker"

**Estimated effort**: 2-3 weeks (mostly wiring existing systems together)

---

#### OPPORTUNITY 6: Community & Leaderboards (MEDIUM — Phase 3)

**What to build**: Daily leaderboards for mock test scores, speaking challenges, and vocabulary streaks.

**Competitive baseline**:
- Engnovate: Daily exams with leaderboards (key engagement driver for 1M+ users)
- Cathoven: No community features

**Implementation approach**:
- Add a `leaderboard_entries` table (anonymized, opt-in)
- Daily mock test → auto-post score to leaderboard
- Weekly "scholarship readiness" leaderboard (unique to LOCI)
- Streak-based badges displayed on leaderboard

**Estimated effort**: 2-3 weeks

---

#### OPPORTUNITY 7: Institutional/Partner Portal (MEDIUM — Phase 3)

**What to build**: Allow IELTS training centers, universities, and scholarship bodies to create partner accounts with dashboards for their students.

**Competitive baseline**:
- Cathoven: White-label licensing, institutional adoption at Columbia/Berkeley
- Engnovate: British Council partnership

**LOCI's advantage**: Scholarship providers and universities are natural partners. An IELTS training center that sends students to LOCI gets:
- Their students matched to scholarships (value-add for the center)
- Aggregated performance analytics across their student cohort
- White-labeled practice portal

**Implementation approach**:
- Partner role in `profiles` table with `partner_id` grouping
- Partner dashboard: cohort analytics, student progress, scholarship match rates
- API for partners to embed LOCI practice widgets
- Revenue: per-student SaaS pricing for training centers

**Estimated effort**: 6-8 weeks

---

#### OPPORTUNITY 8: Mobile App (LOW/MEDIUM — Phase 3)

**What to build**: A React Native (or PWA-enhanced) mobile app.

**Competitive baseline**: Neither Cathoven nor Engnovate has a native mobile app. Both are mobile-responsive web.

**LOCI's advantage**: First-mover advantage in mobile. Speaking practice on mobile (with microphone) is more natural than desktop.

**Implementation approach**:
- Start with PWA enhancements (offline vocabulary, push notifications for daily challenges)
- Evaluate React Native vs Capacitor for native app
- Prioritize: speaking practice, daily challenges, vocabulary (features best suited for mobile)

**Estimated effort**: 8-12 weeks for MVP

---

#### OPPORTUNITY 9: Content Marketplace (LOW — Phase 4)

**What to build**: Allow third-party IELTS tutors and content creators to publish practice materials, graded by AI, with revenue sharing.

**Neither competitor has this.**

**Estimated effort**: 8-12 weeks

---

## Part 4: Prioritized Implementation Roadmap

### Phase 1: Close the Critical Gap (Weeks 1-6)
**Goal**: Match Cathoven/Engnovate on AI writing scoring. This is table stakes.

| # | Feature | Effort | Impact | Dependencies |
|---|---------|--------|--------|--------------|
| 1.1 | AI Writing Scoring Engine | 3-4 weeks | ⭐⭐⭐⭐⭐ | Edge Function, LLM keys |
| 1.2 | IELTS Rubric Prompt Engineering | 1 week | ⭐⭐⭐⭐⭐ | Golden dataset of scored essays |
| 1.3 | Adaptive Reading Generator | 2-3 weeks | ⭐⭐⭐⭐ | `generate-embedding` fn |
| 1.4 | Payment/Subscription System | 2-3 weeks | ⭐⭐⭐⭐⭐ | Stripe integration |

**Phase 1 Deliverable**: LOCI can score IELTS essays with accuracy competitive with Cathoven. Users can pay for premium access.

---

### Phase 2: Build the Moat (Weeks 7-14)
**Goal**: Integrate IELTS + Scholarships + CV in ways neither competitor can replicate.

| # | Feature | Effort | Impact | Dependencies |
|---|---------|--------|--------|--------------|
| 2.1 | IELTS ↔ Scholarship Bridge | 2-3 weeks | ⭐⭐⭐⭐⭐ | Phase 1 scoring, scoring engine |
| 2.2 | AI Study Coach | 4-6 weeks | ⭐⭐⭐⭐⭐ | Phase 1 scoring, practice history |
| 2.3 | AI Speaking Scoring | 4-6 weeks | ⭐⭐⭐⭐ | Audio infra, Whisper/Gemini |
| 2.4 | Scholarship Readiness Tracker | 1-2 weeks | ⭐⭐⭐⭐ | Phase 2.1 |

**Phase 2 Deliverable**: LOCI is the only platform where "practice IELTS → find scholarships → track applications" is a seamless workflow.

---

### Phase 3: Scale & Differentiate (Weeks 15-24)
**Goal**: Community, institutional sales, mobile presence.

| # | Feature | Effort | Impact | Dependencies |
|---|---------|--------|--------|--------------|
| 3.1 | Leaderboards & Community | 2-3 weeks | ⭐⭐⭐ | `leaderboard_entries` table |
| 3.2 | Institutional Partner Portal | 6-8 weeks | ⭐⭐⭐⭐ | Partner role, billing |
| 3.3 | PWA / Mobile App MVP | 8-12 weeks | ⭐⭐⭐⭐ | Phase 1-2 features |

---

### Phase 4: Category Leadership (Week 25+)
**Goal**: Features that define a new category — "Career-Ready IELTS Preparation."

| # | Feature | Effort | Impact |
|---|---------|--------|--------|
| 4.1 | Content Marketplace | 8-12 weeks | ⭐⭐⭐ |
| 4.2 | Multi-language Expansion | 12-16 weeks | ⭐⭐⭐⭐⭐ |
| 4.3 | API for EdTech Partners | 6-8 weeks | ⭐⭐⭐ |

---

## Part 5: Technical Architecture for AI Scoring

### 5.1 Recommended Architecture

```
┌─────────────────────────────────────────────────┐
│               FRONTEND (React)                    │
│  WritingPractice.jsx, SpeakingPractice.jsx        │
│  MediaRecorder API (speaking), TextArea (writing) │
│  TanStack Query mutations → Edge Functions        │
└────────────────────┬────────────────────────────┘
                     │ HTTPS POST
┌────────────────────▼────────────────────────────┐
│        EDGE FUNCTION: score-ielts-response        │
│                                                    │
│  1. Input validation (rejectUnexpectedFields)     │
│  2. Content-Length guard (max 10KB text)          │
│  3. Prompt injection defense (prompt-guard.ts)    │
│  4. LLM call with hardened IELTS rubric prompt    │
│  5. Dual-model cross-validation (optional)        │
│  6. Response parsing & validation                 │
│  7. Cache write (Upstash Redis, 1hr TTL)          │
│  8. DB write (practice_sessions)                  │
│  9. Return structured scoring result              │
└────────────────────┬────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────┐
│              SCORING PROMPT DESIGN                 │
│                                                    │
│  System: "You are an IELTS examiner with 15+      │
│  years experience. Score this {task_type} essay   │
│  against the official IELTS Writing Task {1|2}    │
│  public band descriptors."                        │
│                                                    │
│  Required JSON output:                            │
│  {                                                │
│    "taskAchievement": { "band": 7.0, ... },       │
│    "coherenceAndCohesion": { "band": 6.5, ... },  │
│    "lexicalResource": { "band": 7.0, ... },       │
│    "grammaticalRangeAndAccuracy": { "band": 6.5 },│
│    "overallBand": 6.5,                            │
│    "feedback": [                                   │
│      { "criterion": "LR", "paragraph": 2,         │
│        "issue": "...", "suggestion": "...",       │
│        "example": "..." }                          │
│    ],                                             │
│    "strengths": [...],                            │
│    "nextSteps": [...]                             │
│  }                                                │
└─────────────────────────────────────────────────┘
```

### 5.2 Calibration Strategy

1. **Source a golden dataset**: 50+ essays scored by real IELTS examiners, covering Bands 4.0–9.0 across both Task 1 and Task 2
2. **Run all LLM providers** (Claude, GPT, Gemini, DeepSeek) against the golden set
3. **Select the most accurate provider** per task type
4. **Implement dual-scoring** for scores where discrepancy between two models >0.5 band → flag for human review
5. **Continuous calibration**: every user-submitted essay that gets a score is a data point; periodically re-benchmark against the golden set

### 5.3 Accuracy Targets

| Criterion | Target Accuracy | Cathoven Claim | Engnovate Claim |
|-----------|----------------|----------------|-----------------|
| Overall Band | ±0.5 band, 90% of essays | 98% (unclear methodology) | 75-95% |
| Task Achievement | ±0.5 band | — | — |
| Coherence & Cohesion | ±0.5 band | — | — |
| Lexical Resource | ±0.5 band | — | — |
| Grammatical Range | ±0.5 band | — | — |

---

## Part 6: Pricing Strategy Recommendations

### 6.1 Competitive Pricing Analysis

| Platform | Monthly (effective) | Model |
|----------|---------------------|-------|
| Engnovate | $2.33–$5.97 | One-time payment |
| Cathoven | ~$13.50 | Subscription |
| **LOCI (proposed)** | — | — |

### 6.2 Recommended Pricing

| Tier | Price | Key Features |
|------|-------|--------------|
| **Free** | $0 | 3 AI essay scores/month, 3 speaking scores/month, basic practice, 50 scholarships, 3 tracked applications |
| **Pro** | $7.99/mo | 15 AI scores/month, adaptive reading, full scholarship catalog, unlimited tracked apps, deadline alerts, export |
| **Premium** | $14.99/mo | Unlimited AI scoring, AI study coach, speaking practice with pronunciation feedback, priority matching, CV parsing (unlimited), institutional discounts |

**Rationale**:
- Free tier is competitive with Engnovate's free offering (which is limited but generous)
- Pro tier undercuts Cathoven (~$13.50) while offering more value (scholarships + career)
- Premium matches Cathoven pricing but bundles the entire career pipeline they can't match
- One-time payment option (like Engnovate) for 6/12 months with 15-25% discount

---

## Part 7: Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| LLM scoring inaccuracy damages trust | Medium | High | Golden dataset calibration, dual-model cross-check, "estimated band" disclaimer, human review for high-stakes |
| Cathoven/Engnovate add scholarship features | Low | High | Move fast on Phase 2 (IELTS↔Scholarship bridge), build data moat |
| AI commoditization (ChatGPT can score essays for free) | High | Medium | Bundle value (scholarships, CV, apps), convenience premium, structured feedback superior to raw ChatGPT |
| Rate limiting constrains AI scoring usage | Medium | Medium | Upstash Redis is already integrated; add per-tier rate limits |
| Prompt injection in user essays | Medium | High | Existing `prompt-guard.ts` infrastructure; add essay-specific sanitization |
| Speaking audio storage costs | Low | Medium | Auto-expire after 30 days; compress before storage; use Supabase Storage free tier initially |

---

## Part 8: Key Takeaways

1. **Cathoven is the competitor to beat.** They have the best AI accuracy, institutional adoption, and a strong tech stack. But they're IELTS-only — they can't touch our scholarship/career moat.

2. **Engnovate is the volume leader.** 1M+ users, ultra-low pricing, daily engagement loops. But their AI is weaker and they have no scholarship/career features.

3. **LOCI's winning strategy: Category creation.** Don't compete on "better AI scoring" alone. Create the category of "Career-Ready IELTS Preparation" where IELTS practice, scholarship matching, CV parsing, and application tracking are one integrated workflow. Neither competitor can follow without building everything we already have.

4. **Immediate priority: AI writing scoring.** This is table stakes. Every week without it, users who need essay feedback go to Cathoven or Engnovate. Build it in Phase 1.

5. **The scholarship bridge is the killer feature.** "Your estimated Band 7.0 unlocks 23 more scholarships — here's what to work on to get there." This feedback loop doesn't exist anywhere in the market.

6. **Mobile is a blue ocean.** Neither competitor has a native app. Speaking practice is inherently mobile. Be first.

---

## Sources
- [Cathoven Official Website](https://www.cathoven.com)
- [Cathoven IELTS Reading Practice](https://www.cathoven.com/ielts/reading/)
- [Cathoven Blog — IELTS Writing](https://www.cathoven.com/blog/get-prepared-for-ielts-writing-for-free/)
- [Cathoven AI — EdTech Marketplace Asia](https://www.edtechmarketplace-asia.com/solution/cathoven-ai)
- [Cathoven — Crunchbase](https://www.crunchbase.com/organization/cathoven)
- [Cathoven AI on AgentsPointee](https://agentspointee.com/listing/cathoven-ai/)
- [Engnovate Official Website](https://engnovate.com)
- [Engnovate FAQs](https://engnovate.com/faqs/)
- [Engnovate About Us](https://engnovate.com/about-us/)
- [Engnovate Trustpilot](https://nz.trustpilot.com/review/engnovate.com)
- [Engnovate MRR Analysis — Grok](https://grok.com/share/bGVnYWN5_63a33951-e51b-43f7-b70e-e8a484aef6e7)
