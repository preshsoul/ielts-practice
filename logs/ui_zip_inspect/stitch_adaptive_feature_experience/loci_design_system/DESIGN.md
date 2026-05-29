---
name: Loci Design System
colors:
  surface: '#fcf8fa'
  surface-dim: '#ddd9db'
  surface-bright: '#fcf8fa'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f6f2f4'
  surface-container: '#f1edef'
  surface-container-high: '#ebe7e9'
  surface-container-highest: '#e5e1e3'
  on-surface: '#1c1b1d'
  on-surface-variant: '#47464c'
  inverse-surface: '#313032'
  inverse-on-surface: '#f4f0f2'
  outline: '#78767d'
  outline-variant: '#c8c5cd'
  surface-tint: '#5d5c74'
  primary: '#00000b'
  on-primary: '#ffffff'
  primary-container: '#1a1a2e'
  on-primary-container: '#83829b'
  inverse-primary: '#c6c4df'
  secondary: '#605e58'
  on-secondary: '#ffffff'
  secondary-container: '#e6e2da'
  on-secondary-container: '#66645e'
  tertiary: '#695d3c'
  on-tertiary: '#ffffff'
  tertiary-container: '#b9aa83'
  on-tertiary-container: '#493f20'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#e2e0fc'
  primary-fixed-dim: '#c6c4df'
  on-primary-fixed: '#1a1a2e'
  on-primary-fixed-variant: '#45455b'
  secondary-fixed: '#e6e2da'
  secondary-fixed-dim: '#c9c6bf'
  on-secondary-fixed: '#1c1c17'
  on-secondary-fixed-variant: '#484741'
  tertiary-fixed: '#f2e1b7'
  tertiary-fixed-dim: '#d5c59d'
  on-tertiary-fixed: '#231b02'
  on-tertiary-fixed-variant: '#514627'
  background: '#fcf8fa'
  on-background: '#1c1b1d'
  surface-variant: '#e5e1e3'
  surface-sand: '#F4F0E8'
  ink-navy: '#1A1A2E'
  confidence-high: '#2D6A4F'
  confidence-medium: '#D4A373'
  confidence-low: '#BC4749'
  border-subtle: '#E5E1D9'
typography:
  display-lg:
    fontFamily: Newsreader
    fontSize: 48px
    fontWeight: '600'
    lineHeight: '1.1'
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Newsreader
    fontSize: 32px
    fontWeight: '600'
    lineHeight: '1.2'
  headline-lg-mobile:
    fontFamily: Newsreader
    fontSize: 28px
    fontWeight: '600'
    lineHeight: '1.2'
  headline-md:
    fontFamily: Newsreader
    fontSize: 24px
    fontWeight: '500'
    lineHeight: '1.3'
  body-lg:
    fontFamily: IBM Plex Sans
    fontSize: 18px
    fontWeight: '400'
    lineHeight: '1.6'
  body-md:
    fontFamily: IBM Plex Sans
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.5'
  label-md:
    fontFamily: IBM Plex Sans
    fontSize: 14px
    fontWeight: '600'
    lineHeight: '1.4'
    letterSpacing: 0.05em
  label-sm:
    fontFamily: IBM Plex Sans
    fontSize: 12px
    fontWeight: '500'
    lineHeight: '1.4'
  mono-data:
    fontFamily: IBM Plex Sans
    fontSize: 14px
    fontWeight: '400'
    lineHeight: '1.4'
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  base: 8px
  gutter: 24px
  margin-mobile: 16px
  margin-desktop: 64px
  container-max: 1280px
---

# Loci — Product Requirements Document (PRD)
**Version:** 1.0 (May 2026)  
**Status:** Baseline Specification  
**Product Vision:** A candidate-side intelligence workspace for Nigerian graduates navigating UK postgraduate scholarship funding and English proficiency (IELTS/CELPIP).

---

## 1. Executive Summary
Loci is not an aggregator; it is an **intelligence dashboard**. It solves the "seventeen tabs open" problem for Nigerian scholarship applicants by providing a single coordinate for discovery, preparation, and tracking. The product leverages AI-driven data extraction and personalized scoring to move candidates from "found a list" to "ready to apply."

## 2. Core User Personas
*   **The High-Achiever:** Nigerian graduate with a First Class or 2:1 degree, seeking prestigious UK funding (Chevening, Commonwealth, Gates Cambridge).
*   **The Early-Career Professional:** Working professional seeking mid-career master's funding, balancing work with IELTS preparation.
*   **The Goal-Oriented Candidate:** Highly motivated but overwhelmed by information asymmetry and deadline pressure.

---

## 3. Product Architecture (The Five Surfaces)

### 3.1. Dashboard (The Command Surface)
*   **Objective:** Answer "What is between me and a credible application right now?" in < 5 seconds.
*   **Features:** 
    *   **Readiness Verdict:** High-impact hero message computed from profile state and upcoming deadlines.
    *   **Bento Intelligence Grid:** Dynamic cards for next deadlines, recent practice performance, and high-fit matches.
    *   **Application Tracking Overview:** Real-time pipeline status of saved/submitted applications.

### 3.2. Scholarships (Discovery & Matching)
*   **Objective:** Surface the "best fit" opportunities through personalized intelligence.
*   **Features:**
    *   **Composite Scoring:** Ranked list based on fit score × deadline urgency.
    *   **IELTS-Aware Filtering:** Matches opportunities against the candidate's verified band scores.
    *   **Intelligence Sidebar:** Contextual overlay showing provenance, confidence scores, and eligibility breakdowns.
    *   **Confidence Dots:** Visual indicator (●●●) of data extraction reliability.

### 3.3. Practice (Execution)
*   **Objective:** Dedicated, high-focus training environment for IELTS/CELPIP.
*   **Features:**
    *   **Module-Specific Training:** Reading, Writing, Listening, Speaking.
    *   **Weak-Area Detection:** AI analysis of session results to recommend the next practice task.
    *   **Focus Mode:** Reduced UI chrome to simulate test environments.
    *   **Auto-Sync:** Results immediately update the candidate's eligibility profile.

### 3.4. Readiness (Diagnostic)
*   **Objective:** A prioritized to-do list of application blockers.
*   **Features:**
    *   **Blocker Ranking:** Ranked by impact (e.g., "Missing IELTS score blocks 12 scholarships").
    *   **Actionable Resolutions:** Direct links to Practice or Account fields to clear blockers.

### 3.5. Account (The Mirror)
*   **Objective:** Behavior-driven profile management.
*   **Features:**
    *   **The Account Reform:** Minimized manual entry; most data is inferred from CV uploads and Practice performance.
    *   **CV Parsing:** Structured extraction of education, discipline, and experience.

---

## 4. Operational Specifications

### 4.1. Data Pipeline & Admin Area
*   **Scraping logic:** Container-first extraction targeting UK and international funding bodies.
*   **Review Queue:** Admin surface for validating LLM-extracted data before publication.
*   **Dead-Link Tracking:** Automated monitoring of application URLs.

### 4.2. Design System (Loci Visual Language)
*   **Typography:** Fraunces (Editorial/Authority) paired with IBM Plex Sans (Functional/Precision).
*   **Color Palette:** Warm Sand base (`#F4F0E8`) with Deep Navy (`#1A1A2E`) navigation.
*   **Spatial Mode:** **Ambient Mode** (Discovery) vs. **Active Mode** (Execution).

---

## 5. Success Metrics
*   **Candidate Readiness Score:** Average increase in score over a 30-day period.
*   **Return Visit Frequency:** Driven by the Application Tracking layer and weekly feed updates.
*   **Accuracy Threshold:** Maintenance of >0.85 average confidence score across published scholarship records.

---

## 6. Prohibitions (Non-Negotiables)
*   **No generic placeholders:** Messages must be derived from candidate state.
*   **No hidden provenance:** Confidence scores and verified dates must remain visible.
*   **No launch without tracking:** The application tracking layer is core to the value prop.

---

> *"Find your ground."*
