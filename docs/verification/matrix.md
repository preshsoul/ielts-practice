# Verification Matrix

| Phase | Surface | Check | Risk | Safety | Evidence |
|------|---------|-------|------|--------|----------|
| 1 | frontend | route and workflow tests | high | read-only | test |
| 1 | parser | parser contract checks | high | read-only | test |
| 1 | parser | parser faker stress | high | read-only | stress |
| 1 | parser | parser repeatability checks | high | read-only | stress |
| 1 | matcher | matcher scenario sweeps | high | read-only | stress |
| 1 | pipeline | pipeline scripts | medium | read-only | test |
| 1 | build | production build and secret scan | high | read-only | build |
| 2 | hosted | Supabase auth bootstrap invariant | critical | controlled-live-write | smoke |
| 2 | hosted | Edge function runtime health | critical | read-only | health |
| 2 | hosted | Parser upload/parse/job/draft routes | high | controlled-live-write | smoke |
| 2 | hosted | Database table sanity and RLS inventory | high | read-only | database |
| 2 | hosted | Endpoint smoke checks | medium | read-only | smoke |
| 3 | automation | Full phase 1 + phase 2 orchestration | high | safe-write | report |

## Safety Legend

- `read-only`: query or inspect only
- `safe-write`: local temp files only
- `destructive/manual-review-required`: never part of default verification
