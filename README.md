# Scholarship & Graduate Trainee Intelligence Dashboard
A personal application-pipeline tool for navigating UK postgraduate funding and Nigerian graduate trainee programmes. Built to replace the usual candidate workflow — a tab graveyard of scholarship portals, a notebook of half-remembered deadlines, a spreadsheet that goes stale within a week — with a single dashboard that ingests content from structured files, refreshes itself from the open web, and presents opportunities in a form that maps cleanly onto decisions.

---

## Why this exists
Most application-tracking tools are built for recruiters, not candidates. The candidate's problem is different in shape: dozens of fragmented sources, inconsistent deadline formats, eligibility rules buried in PDFs, and no way to tell at a glance whether an opportunity is worth the six hours it will take to apply. The existing answer — bookmarks and a Notion page — collapses under its own weight within a month.

This project treats that problem the way it should be treated: as a content pipeline with a rendering layer on top. Opportunities come in from curated sources and scraped ones, get normalised into a single schema, get scored against a candidate profile, and render into a dashboard that surfaces what is time-sensitive and filters out what is not.

---
## What the app does
The application has four primary surfaces, each solving a specific part of the candidate workflow:

**Scholarships.** A searchable, filterable catalogue of UK postgraduate funding opportunities. Each record carries coverage detail, eligibility rules, a direct application URL, deadline urgency, and a confidence score indicating how sure the pipeline is that the record is accurate. Records are sorted by urgency then confidence, so the entries closest to closing and most likely to be correct surface first.

**Practice.** A question bank for aptitude test preparation — currently seeded with 72 items across numerical, verbal, and logical reasoning — covering the formats used by the Nigerian graduate trainee programmes in the target pipeline (Unilever, Access Bank, Stanbic IBTC, British Council, among others). The bank is extensible through a content file; the app reads from the generated JSON, not from hardwired UI code.

**Account.** Candidate profile state — degree class, nationality, discipline, language test status — used by the scoring layer to compute fit scores per scholarship. Editing this file re-scores the entire catalogue on the next content refresh.

**Home.** A landing view that aggregates the highest-urgency items across the two tracks and flags blockers (missing IELTS, expired visa documents, unclaimed transcript evaluations) that gate the rest of the pipeline.

---

## Architecture

The core design decision is that **content is decoupled from UI**. The React application reads pre-generated JSON files from `public/data/`. It does not fetch from external APIs at runtime, and it does not bake content into component source. This means three things: the app loads fast, content updates don't require code changes, and the scraping and scoring logic can evolve independently of the rendering logic.

```
┌──────────────────────────┐      ┌──────────────────────────┐
│  content/*.json          │      │  scripts/                │
│  (curated, hand-edited)  │      │  scrape-scholarships.mjs │
└────────────┬─────────────┘      └────────────┬─────────────┘
             │                                 │
             │                                 ▼
             │                    ┌──────────────────────────┐
             │                    │  content/                │
             │                    │  scraped-scholarships    │
             │                    │  (generated, overwrites) │
             │                    └────────────┬─────────────┘
             │                                 │
             ▼                                 ▼
        ┌─────────────────────────────────────────────┐
        │  scripts/refresh-content.mjs                │
        │  merges curated + scraped, applies scoring, │
        │  writes public/data/*.json                  │
        └────────────────────┬────────────────────────┘
                             │
                             ▼
                   ┌──────────────────┐
                   │  public/data/    │
                   │  questions.json  │
                   │  scholarships.json│
                   └────────┬─────────┘
                            │
                            ▼
                   ┌──────────────────┐
                   │  React app       │
                   │  (Vite + RRv6)   │
                   └──────────────────┘
```

### The content pipeline

Three file locations matter:

`content/` holds the **authoritative hand-curated source**. This is what a human has verified. Records here are trusted implicitly and override anything that conflicts with them downstream. Editing a file in this directory is how you add a scholarship you know about but the scraper has not found, or correct an error in a scraped record.

`content/scraped-*.json` holds **machine-generated candidates** from the scraper. These records are tagged with a confidence score and a list of fields that could not be reliably extracted. They are not trusted by default — they are suggestions.

`public/data/` holds the **final merged output** that the React app reads. This is generated, never hand-edited; any manual change here will be overwritten on the next refresh.

The merge logic in `refresh-content.mjs` follows a simple precedence rule: curated records win on collision, scraped records fill the gaps.

### The scholarship schema

Every scholarship record — whether curated or scraped — conforms to a single schema designed around the five questions a candidate actually asks when evaluating an opportunity: *Can I apply? What do I get? When is it due? What do I need to submit? Where exactly do I apply?*

The schema carries identity fields (name, awarding body), a coverage block (tuition, living, flights, numeric amount, raw amount string), an eligibility block (nationalities, degree class, disciplines, age limit, language-test requirements), an application block (direct URL, deadline, portal, required documents, essay prompts), and a provenance block (source URL, scraped timestamp, confidence score, list of fields flagged for verification).

The provenance block is the unusual piece. Most scraping pipelines drop their uncertainty once they write the output. This one preserves it: every record knows how sure the pipeline is about itself, and the UI uses that signal to show confidence pills and verification chips next to entries that need a human eye before the candidate acts on them.

### The scraper

The scraper is a same-domain crawler. Each entry in `content/scholarship-sources.json` is a root URL; the crawler fetches it, parses links that match scholarship-adjacent patterns (`/scholarship`, `/funding`, `/bursary`, `/award`), and recurses within the same domain up to a configurable depth.

For each fetched page, the extractor runs a set of targeted regexes and heuristics against the visible text: money extraction recognises GBP figures with thousand and million suffixes, date extraction prefers dates that appear within eighty characters of a deadline cue word, eligibility extraction matches degree class phrases against a normalised vocabulary, and confidence scoring aggregates whether each of the five key fields was extractable.

Pages that score below a confidence floor are dropped. Pages that score above it are written as candidate records with their uncertainties explicitly marked.

### The question bank

The practice question bank lives in two files. `content/questions.base.json` is the seed set that ships with the repository; `content/questions.extra.json` is the extension file that candidates add to without touching the base. `refresh-content.mjs` concatenates the two and writes them to `public/data/questions.json`.

This two-file pattern exists because the base set evolves slowly and the extension set evolves per-candidate. Keeping them separate means a pull from the upstream repository does not overwrite personal additions.

---

## Running it locally

```bash
# install
npm install

# refresh content (reads content/*.json → writes public/data/*.json)
npm run content:refresh

# scrape new scholarship candidates (writes content/scraped-*.json)
npm run content:scrape-scholarships

# start the dev server
npm run dev

# build for production
npm run build
```

The content commands are idempotent. Running them repeatedly does not duplicate records — scholarship records are keyed by a deterministic slug derived from the awarding body and scholarship name, so a re-scrape overwrites rather than appends.

---

## Project layout

```
content/
  questions.base.json          # seed question set (don't edit unless updating upstream)
  questions.extra.json         # personal question additions
  scholarship-sources.json     # crawl roots for the scraper
  scholarships.curated.json    # hand-verified scholarship records (authoritative)
  scraped-scholarships.json    # scraper output (generated)

public/
  data/
    questions.json             # generated — consumed by the app
    scholarships.json          # generated — consumed by the app

scripts/
  refresh-content.mjs          # merges curated + scraped, runs scoring, writes public/data
  scrape-scholarships.mjs      # crawler entry point
  scholarship-extractor.mjs    # regex/heuristic extraction from HTML

src/
  App.jsx                      # routes
  components/
    ScholarshipPage.jsx        # catalogue view
    PracticePage.jsx           # question bank
    AccountPage.jsx            # profile
    HomePage.jsx               # dashboard landing
```

---

## Design decisions worth naming

**Scraper stays dumb; scorer stays smart.** The scraper does not compute fit scores. Scoring is a separate step inside `refresh-content.mjs` that takes the merged catalogue plus the candidate profile and annotates each record. This separation means the candidate profile can be tweaked without re-scraping the web, and the scraping logic can be rewritten without touching the scoring rubric.

**Confidence is a float, not a boolean.** Scraped records do not divide cleanly into "trustworthy" and "untrustworthy." A scholarship page that yields a clean name, amount, and deadline scores differently from one that only mentions "funding available." Storing a continuous confidence value lets the UI filter and sort on it rather than showing everything or nothing.

**Rolling deadlines are null, not strings.** A deadline field that reads `"rolling"` or `"TBD"` as text breaks every date-based sort and filter the app wants to run. Deadlines in this schema are ISO dates or null, and a separate `deadlineType` field carries the classification (`fixed`, `rolling`, `annual-cycle`, `estimated`).

**The base question set is not editable.** Candidates who want to add questions add them to `questions.extra.json`. This preserves a clean upstream-diff story — pulling updates from the repository does not clobber personal work.

---

## Status

The application is in active personal use. It is not a product. There is no hosted instance, no signup flow, no multi-user storage, and no intention to add any of those. The schema is stable; the scraper extraction heuristics are being tuned against new sources as they are added; the question bank grows weekly.

If you have found this repository and want to adapt it for your own pipeline, the two files you will want to change are `content/scholarship-sources.json` (the crawl roots) and whatever file holds the candidate profile used by the scorer. The rest should work unchanged.

---

## Deploy

- Vercel: build command `npm run build`, output directory `dist`
- Netlify: build command `npm run build`, publish directory `dist`

## Content updates

- `npm run content:refresh` regenerates the public `/data/*.json` files from the source content files.
- `content/questions.extra.json` holds additional question bank entries without touching app code.
- `npm run content:scrape-scholarships` crawls the scholarship source registry in `content/scholarship-sources.json` and writes candidate results to `content/scholarships.scraped.json`.

---

## License

MIT.
