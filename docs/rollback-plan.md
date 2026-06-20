# Rollback Plan

## When to roll back

- Production errors spike above baseline within 5 minutes of deploy
- Core user flows (login → onboarding → practice → scholarships) break
- Build-time secret scan starts failing post-deploy
- Database migrations cause data loss or corruption
- CSP headers break JS/CSS loading across all routes

## Rollback methods

### 1. Netlify instant rollback (fastest — ~30s)

```bash
# Via Netlify CLI
netlify deploy --alias <previous-deploy-id>

# Or via dashboard: Deploys → select previous → "Publish deploy"
```

Netlify keeps all deploys. The previous working deploy is one click away.

### 2. Git revert + push (standard — ~5 min)

```bash
git revert <bad-commit> --no-edit
git push origin main
# Netlify auto-deploys on push to main
```

### 3. DNS rollback (last resort — propagation delay)

If the issue is at the DNS/CDN layer:
- Point DNS back to the previous Netlify deploy's IP
- Or disable the CDN and serve directly from origin
- TTL-dependent: can take up to 1 hour

## Supabase-specific rollback

### Database migrations

Supabase does NOT support transaction rollback for applied migrations.
Recovery steps:
1. Identify the bad migration in `supabase/migrations/`
2. Write a new migration that reverses the schema change
3. Deploy the reversal migration
4. For data corruption: restore from Supabase point-in-time backup (if enabled on plan)

### Edge Functions

```bash
# Deploy previous version from git
git checkout <last-good-commit> -- supabase/functions/<name>/
npx supabase functions deploy <name>
```

## Pre-rollback checklist

- [ ] Confirm the issue is deployment-related, not an upstream outage (check Supabase status, OpenAI status)
- [ ] Screenshot or log the error state before rolling back
- [ ] Notify team/ users if downtime exceeds 2 minutes
- [ ] After rollback: verify Phase 1 + Phase 2 pass

## Emergency contacts

| Service | Dashboard | Support |
|---------|-----------|---------|
| Netlify | https://app.netlify.com | support@netlify.com |
| Supabase | https://supabase.com/dashboard | support@supabase.com |
| Domain registrar | TBD | TBD |

## Post-rollback actions

1. Run `npm run verify:phase2` to confirm Supabase is healthy
2. Run `npm run verify:phase1` to confirm local build is clean
3. Check Sentry for any remaining error spikes
4. Document the root cause in the incident log below

---

## Incident log

| Date | Issue | Root cause | Resolution | Duration |
|------|-------|------------|------------|----------|
| — | — | — | — | — |
