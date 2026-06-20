# Uptime Monitoring Setup

## Existing health endpoints

| Endpoint | URL | Type |
|----------|-----|------|
| Python backend | `GET /healthz` | Returns 200 + `{"ok":true}` |
| Edge Functions | `GET /functions/v1/<slug>/health` | Returns config status per function |
| Netlify static | `GET /` | Static HTML (200 = alive) |

## Recommended: UptimeRobot (free tier)

1. Create account at https://uptimerobot.com
2. Add monitors:

| Monitor | URL | Check interval | Type |
|---------|-----|---------------|------|
| Frontend | `https://loci.app` | 5 min | HTTP(s) |
| Python API | `https://loci-api.example.com/healthz` | 5 min | HTTP(s) |
| Supabase REST | `https://<project>.supabase.co/rest/v1/` | 5 min | HTTP(s) — expect 401 |

3. Alert contacts: Email + Slack/Discord webhook
4. Set `alert_when_not_checked_after: 10` (minutes)

## Alternative: Self-hosted health check via cron

The `scripts/verification/check-endpoints.mjs` script can be repurposed:

```bash
# Add to crontab (runs every 5 min)
*/5 * * * * node scripts/verification/check-endpoints.mjs || curl -X POST <webhook-url>
```

## Current monitoring gaps

- Sentry is configured for error tracking (already in instrument.js)
- PostHog is configured for analytics (already in analytics.js)
- No external uptime monitor is currently active
- No SLI/SLO dashboard exists (Future: consider Grafana or Datadog)
