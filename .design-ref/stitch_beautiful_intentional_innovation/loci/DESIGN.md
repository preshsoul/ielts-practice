---
name: Loci
colors:
  surface: '#faf8ff'
  surface-dim: '#d9d9e5'
  surface-bright: '#faf8ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f3f2ff'
  surface-container: '#ededf9'
  surface-container-high: '#e7e7f4'
  surface-container-highest: '#e2e1ee'
  on-surface: '#191b24'
  on-surface-variant: '#434655'
  inverse-surface: '#2e3039'
  inverse-on-surface: '#f0f0fc'
  outline: '#747687'
  outline-variant: '#c4c5d8'
  surface-tint: '#1c4fe1'
  primary: '#0d47db'
  on-primary: '#ffffff'
  primary-container: '#3863f4'
  on-primary-container: '#f6f4ff'
  inverse-primary: '#b7c4ff'
  secondary: '#4b5b98'
  on-secondary: '#ffffff'
  secondary-container: '#abbbff'
  on-secondary-container: '#394985'
  tertiary: '#993900'
  on-tertiary: '#ffffff'
  tertiary-container: '#c14a00'
  on-tertiary-container: '#fff3ef'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#dde1ff'
  primary-fixed-dim: '#b7c4ff'
  on-primary-fixed: '#001452'
  on-primary-fixed-variant: '#0038b7'
  secondary-fixed: '#dce1ff'
  secondary-fixed-dim: '#b7c4ff'
  on-secondary-fixed: '#001551'
  on-secondary-fixed-variant: '#33437f'
  tertiary-fixed: '#ffdbcd'
  tertiary-fixed-dim: '#ffb596'
  on-tertiary-fixed: '#360f00'
  on-tertiary-fixed-variant: '#7d2d00'
  background: '#faf8ff'
  on-background: '#191b24'
  surface-variant: '#e2e1ee'
typography:
  hero-display:
    fontFamily: JetBrains Mono
    fontSize: 56px
    fontWeight: '500'
    lineHeight: '1.1'
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: JetBrains Mono
    fontSize: 32px
    fontWeight: '500'
    lineHeight: '1.2'
  headline-sm:
    fontFamily: JetBrains Mono
    fontSize: 16px
    fontWeight: '600'
    lineHeight: '1.4'
  body-base:
    fontFamily: IBM Plex Sans
    fontSize: 14px
    fontWeight: '400'
    lineHeight: '1.6'
  label-caps:
    fontFamily: Domine
    fontSize: 12px
    fontWeight: '700'
    lineHeight: '1'
    letterSpacing: 0.08em
  data-mono:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '500'
    lineHeight: '1'
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 8px
  container-padding-desktop: 32px
  container-padding-mobile: 16px
  gutter: 24px
  sidebar-width: 240px
  sidebar-collapsed: 64px
  intel-sidebar-width: 270px
---

# DESIGN.md — Loci
### The Complete Design Intelligence Document

> *Last consolidated: May 2026. Every decision in this document traces directly to a product conversation, a design critique, or an architectural constraint. Nothing here is aspirational decoration — it is the operating spec for the visual and spatial layer of the product.*

---

## Part One: The Name and What It Carries

### Loci

The word is Latin. *Loci* is the plural of *locus* — a place, a position, a point. In classical rhetoric, the *method of loci* is the mnemonic technique of placing memories inside imagined physical spaces so they can be retrieved by moving through them. In mathematics, a locus is the set of all positions satisfying a given condition. In biology, a locus is the fixed position of a gene on a chromosome — the coordinate that defines what something is and where it belongs in the larger system.

The product is called Loci for all three of these reasons simultaneously.

It gives candidates a **place** in a landscape that has always treated them as placeless. UK postgraduate funding circles do not route opportunity to Nigerian candidates — opportunity has to be found, assembled, and pursued against friction. Before Loci, that candidate had no stable position in that landscape. Loci creates one.

It gives candidates a **coordinate** — a specific point from which everything else is calculated. Your degree class, your nationality, your discipline, your IELTS score, your available funding windows: these are the fixed parameters. The product computes every scholarship in the catalogue against that coordinate and returns a ranked, scored, personalised view. The coordinate is the candidate. The map is Loci.

It gives candidates a **method** — the memory palace logic of moving through a structured space and knowing where everything is. Not seventeen tabs. Not a WhatsApp group that scrolls past the signal. A place you return to because you know what is there and where to find it.

The product's tagline in candidate-facing copy should never be a feature description. It should be an experience description. The working direction:

> *"Find your ground."*

Or more specifically, depending on the context:

> *"You've been looking everywhere. Here's where to stand."*

The name is short, academic without being sterile, international without being alienating, and meaningfully connected to the act of finding one's position. It does not sound like a Nigerian startup. It does not sound like a British institution. It sounds like neither, and that is deliberate — it belongs to the candidate, not to any of the systems they are trying to navigate.

---

## Part Two: The Product This Design Must Serve

### What Loci Is

Loci is a candidate-side intelligence dashboard. It serves Nigerian graduates navigating two parallel opportunity tracks simultaneously: UK postgraduate scholarship funding and English language proficiency test preparation (IELTS, CELPIP). It is not a scholarship aggregator. It is not a question bank. It is a content pipeline with a rendering layer — a tool that ingests, normalises, scores, and surfaces opportunities against a candidate profile, then prepares that candidate for the assessments those opportunities require.

The design must always serve this thesis. Every layout decision, every spacing choice, every typographic hierarchy is in service of one question: does this help a candidate who is in the middle of an application cycle right now?

### The Four Surfaces

**Home (Dashboard)** — The opinionated command surface. Not an information summary. A diagnostic. It answers one question in the first five seconds: *What is between me and a credible application right now?* Everything else is subordinate to that question.

**Scholarships** — Discovery and awareness. A searchable, filterable catalogue of UK postgraduate funding opportunities, ranked by deadline urgency and candidate fit score. The confidence and freshness layer is always visible, because accuracy is the product's core promise.

**Practice** — Execution. The IELTS and CELPIP preparation module. Reading, Writing, Listening, Speaking — four components with timed sessions, AI feedback, and a progress layer that flows backward into the candidate profile automatically. Not a question bank you browse. A training environment you enter.

**Account (Verification Surface)** — Not a form. A mirror. The product shows the candidate what it knows about them — inferred from their practice behaviour, their saved scholarships, their uploaded CV — and the candidate confirms or corrects it. Manual data entry is minimised to the three things that cannot be inferred: name, degree class, nationality.

### The Fifth Surface (Required Before Public Launch)

**Readiness** — A dedicated diagnostic surface answering one question: *What is blocking me from a credible scholarship application right now?* Blockers surfaced in ranked priority. Every blocker is actionable — it links directly to the Practice session, Account field, or Scholarship record that resolves it. This is not a feature. It is the difference between a tool someone opens during deadline panic and one that becomes part of their weekly review.

### The Two Broken Surfaces (As of May 2026)

**CV-to-university matching** is architecturally broken. Universities are hardcoded into the matching framework. This is a structural problem, not a data gap. The fix requires rebuilding university data as a content layer — the same pattern as the scholarship catalogue — and migrating CV parsing from copy-paste to structured extraction (file upload with text extraction, or a structured form mapped to the scoring schema). This surface cannot be presented as functional to users until it has been rebuilt and stress-tested against real profile variance.

**The IELTS practice module** exists conceptually but not functionally in the current build. The solution is a dedicated scraper pipeline targeting IELTS preparation resources, past paper repositories, and official Cambridge English sample materials. Not hardcoded content. The two-file pattern (`questions.base.json` / `questions.extra.json`) extends to a separate IELTS content source. The scraper normalises output into the existing question schema with confidence scoring and freshness enforcement.

These two surfaces are the highest priority fixes before any public-facing version.

---

## Part Three: Design Philosophy

### The Central Tension This Design Must Resolve

The product's user is a candidate who has seventeen tabs open. Three of them have the wrong deadline. They are managing scholarship applications, language test preparation, document gathering, and personal statement drafting — simultaneously, in real time, under deadline pressure, on a mobile device in Lagos or Ibadan, with inconsistent connectivity.

That user does not need more information. They need the right information, arranged so that the most urgent thing is impossible to miss.

Every design decision must be tested against this scenario. If a feature adds cognitive load to a candidate in that situation, it is wrong regardless of how elegant it looks in isolation.

### Verifiable Accuracy Over Comprehensiveness

This principle has direct design consequences. A scholarship record that is clearly marked with its last-verified date and confidence level is more trustworthy — and therefore more useful — than ten records with no provenance information. The confidence score, the freshness timestamp, and the flagged uncertain fields are not metadata to be hidden in a drawer. They are the product's proof of quality and they need to be designed into the surface as first-class elements, not footnotes.

Five things a candidate can act on are worth more than fifty things they have to audit. The design hierarchy must reflect this: ranked, scored, surfaced by urgency, with the quality signals visible.

### The Application Tracking Layer Is Not Optional

The product's value proposition does not end at discovery. A candidate who finds a scholarship they're eligible for, clicks through to the application URL, and then loses track of where they are in the process has been failed by the product. Application tracking — the ability to mark something as applied, log a stage, record a rejection, note an interview date — closes the gap between "this tool helped me find an opportunity" and "this tool helped me get funded."

Every conversation about design priorities is oriented toward closing this gap. The tracking layer must be designed in, not added on.

---

## Part Four: The Visual Identity System

### The Tone

Loci sits at the intersection of two registers that are almost never in the same product: **technical authority** and **academic heritage**. In its current Light Mode evolution, it is clinical, crisp, and empowering. It moves away from the "intelligence briefing" aesthetic of dark mode towards a high-performance research environment—clear, bright, and focused.

The candidate using Loci is serious about their future. The visual identity navigates this by pairing a high-performance monospaced typographic voice with a clean, light palette—the feeling of a modern academic platform or a sophisticated data tool, softened by editorial serif accents.

### Typography

#### Display Typeface: JetBrains Mono

JetBrains Mono is the authority voice of the product. It communicates precision, algorithmic clarity, and technical reliability. It is the typeface of "Intelligence."

**Usage rules:**
- Hero moments. Page titles. Numeric metrics. Headline anchors.
- Use `wght` (weight) — 500 for most headlines, 600 for small labels requiring high emphasis.
- It is the primary signal of the "Action" mode of the product.

#### Body Typeface: IBM Plex Sans

IBM Plex Sans remains the workhorse of the product. It is neutral, legible, and carries the engineering credibility required for high-density information.

**Usage rules:**
- All body copy, long-form scholarship descriptions, and secondary UI chrome.
- Never use below 11px.

#### Label Typeface: Domine

Domine is the editorial accent. It provides the "Academic" warmth that prevents the monospaced system from feeling too sterile.

**Usage rules:**
- Section labels (caps). Small editorial hints. Authoritative metadata in the Intelligence Sidebar.
- Used sparingly to create "Moments of Heritage" within the technical flow.

### The Color System

#### Foundation

The system is built on a **High-Contrast Light Mode**. It prioritizes focus and visual hierarchy through tonal stacking and crisp, purposeful brand colors.

```css
/* ─── Core Surface Colors ─── */
--color-bg-page:       #FDFBFF;   /* Crisp white base — ambient base */
--color-bg-active:     #F5F3F9;   /* Subtle grey-lavender — active/execution */
--color-bg-card:       #FFFFFF;   /* Pure white — card face */
--color-bg-sidebar:    #EFEDF3;   /* Soft grey — persistent navigation */

/* ─── Brand Colors ─── */
--color-brand-primary:   #406AFB;  /* High-fidelity blue — primary actions */
--color-brand-secondary: #6474B3;  /* Muted indigo-grey — auxiliary UI */
--color-brand-tertiary:  #C14A00;  /* Burnt orange — highlights and urgency */
--color-brand-subtle:    #DDE1FF;  /* Light blue for active states/containers */

/* ─── Text Colors ─── */
--color-text-primary:   #1B1B1F;  /* Near-black for high contrast */
--color-text-secondary: #434655;  /* Muted grey for secondary copy */
--color-text-tertiary:  #757681;  /* Muted metadata/hints */

/* ─── Semantic Status Colors ─── */
--color-status-urgent:   #C14A00;  /* Burnt Orange — deadlines within 14 days */
--color-status-soon:     #E67E22;  /* Amber — deadlines 15–45 days */
--color-status-open:     #27AE60;  /* Green — applications open */
```

### Elevation & Depth

Depth in Loci is created through **Value Stacking** and soft shadows.
- **Level 0 (Base):** `#FDFBFF` (Page Background)
- **Level 1 (Cards):** `#FFFFFF` (Elevated Surface) with subtle shadow
- **Level 2 (Modals):** `#FFFFFF` (Highest Elevation) with diffuse shadow

Shadows use a neutral, low-opacity tint: `rgba(117, 122, 131, 0.08)`.

### Spacing System

8px base unit. All spacing values are multiples of 4.

### Border Radius

```css
--radius-sm:   4px;   /* Badges, tags */
--radius-md:   8px;   /* Standard UI inputs */
--radius-lg:   16px;  /* Cards and primary containers */
--radius-full: 9999px; /* Pills */
```

---

## Part Five: Layout Architecture

### The Three-Plane System

**Plane 1 — Navigation**: Left sidebar (`240px`). Always `--color-bg-sidebar` (`#EFEDF3`).
**Plane 2 — Action**: The main content area. Background is the crisp white `--color-bg-page`.
**Plane 3 — Intelligence**: The right-side Intelligence Sidebar (`270px`). A drawer using a secondary surface color to reveal metadata.

---

## Part Six: Surface-by-Surface Design Specification

### Dashboard (Home)

**Design principle:** A declaration of the one thing the candidate should do today.
- **Hero zone:** Features a monospaced "Status Verdict" using JetBrains Mono. Large numeric metrics (Readiness Score) dominate in primary blue.
- **Bento grid:** Editorial arrangement of white cards against the off-white page background. Urgency is highlighted using burnt orange.

### Scholarships

**Design principle:** Ranked and scannable.
- **Scholarship card anatomy:** White cards with subtle borders. Monospaced titles for fit/deadline. Serif (Domine) labels for funder names.
- **Confidence indicator:** Three dots at the card footer. Green (High), Yellow (Medium), Red (Low).

### Practice

**Design principle:** High-focus execution mode.
- Sidebar collapses. Main content background remains clean for maximum focus.
- UI elements like timers use `JetBrains Mono` for absolute character stability.

---

## Part Seven: Component Design Specifications

### The `.loci-card` System

```css
.loci-card {
  background:    var(--color-bg-card);
  border-radius: var(--radius-lg);
  border:        1px solid rgba(117, 118, 129, 0.15); /* Light Neutral border */
  padding:       var(--space-6);
  transition:    all 200ms ease;
  box-shadow:    0 2px 4px rgba(117, 122, 131, 0.05);
}

.loci-card:hover {
  border-color:  var(--color-brand-primary);
  box-shadow:    0 4px 12px rgba(117, 122, 131, 0.1);
}
```

### The Command Palette

Triggered by `⌘K`. Clean, light overlay with deep primary blue accents for selected items. Functions as an action dispatcher.

---

## Part Eight: Data Provenance Display

Confidence scores and last-verified timestamps are first-class information.
- **Card Level:** Dot system (●●●).
- **Intelligence Sidebar Level:** Detailed breakdown of "Flagged Fields" and "Extraction Mode" using high-contrast metadata styles.

---

## Part Nine: What This Design Must Never Become

- **Never use dark backgrounds for main surfaces.** The Light Mode is the strategic choice for a clean research environment.
- **Never hide the data provenance.** Accuracy is the brand’s promise.
- **Never use generic fonts.** The monospaced-serif pairing is the product's unique visual signature.

---

## Appendix A: Token Reference

*(See JSON variables in sections above for complete technical values)*

---

*Last consolidated: May 2026.*