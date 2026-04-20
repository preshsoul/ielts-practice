# 🔐 GitHub Credential Cleanup Guide

**⚠️ ONLY USE IF REAL CREDENTIALS WERE EVER COMMITTED**

---

## Quick Status Check

**Current Status:** ✅ SAFE - No credentials detected in:
- .env.example (placeholder values only)
- Git history (clean)
- Source code (no hardcoded keys)
- Recent commits (verified)

---

## IF Credentials Were Committed (Emergency Protocol)

### Phase 1: Immediate Damage Control (5 minutes)

**Step 1: Rotate All Supabase Keys**
```
1. Go to: https://supabase.com/dashboard
2. Select your project → Settings → API
3. For "anon" key: Click three dots → Rotate Key
4. For "service_role" key: Click three dots → Rotate Key
5. Update your local .env file with new keys
6. Test locally: npm run dev
```

**Step 2: Check GitHub Secret Scanning**
```
GitHub Repo → Settings → Security & Analysis
↳ Secret Scanning: Ensure enabled
↳ Push Protection: Enable to prevent future commits
```

---

### Phase 2: Clean Git History (30 minutes)

**Prerequisites:**
```powershell
# Install BFG Repo-Cleaner
npm install -g bfg

# Ensure you're in your repo directory
cd C:\Users\Preshsoul\OneDrive\Desktop\IELTS
```

**Remove Credentials from History:**
```powershell
# Step 1: Create mirror clone
git clone --mirror https://github.com/YOUR-USERNAME/IELTS.git
cd IELTS.git

# Step 2: Remove .env files from entire history
bfg --delete-files '.env'
bfg --delete-files '.env.local'
bfg --delete-files '.env.*.local'

# Step 3: Clean up repository
git reflog expire --expire=now --all
git gc --prune=now --aggressive

# Step 4: Force push cleaned history
git push --mirror https://github.com/YOUR-USERNAME/IELTS.git

# Step 5: Clean up local mirror
cd ..
Remove-Item -Recurse -Force IELTS.git
```

**Verify Cleanup:**
```powershell
# Check that no .env files remain
git log --all --name-status | findstr ".env"
# Should return: (no results)

# Check entire history for JWT patterns
git log -p --all -S "eyJhbGciOi"
# Should return: (no results)

# Verify repository is clean
git log --oneline -n 5
```

---

### Phase 3: Team Communication

**Notify team members:**
```
Subject: Repository Security Update - Action Required

We detected credential exposure in the Git history and have:
1. ✅ Rotated all Supabase API keys
2. ✅ Cleaned Git history using BFG Repo-Cleaner
3. ✅ Force-pushed cleaned repository

Required team actions:
- Re-clone the repository: git clone https://github.com/...
- Update local .env with new Supabase keys
- Run: npm install && npm run build
- Test locally: npm run dev

New keys are in internal documentation (not in repo).
```

---

### Phase 4: Enable Future Protection

**Add git hooks to prevent commits:**
```powershell
# Create pre-commit hook
$hookContent = @'
#!/bin/bash
# Prevent commits that contain .env files
if git rev-parse --verify HEAD >/dev/null 2>&1; then
  against=HEAD
else
  against=4b825dc642cb6eb9a060e54bf8d69288fbee4904
fi

files=$(git diff --cached --name-only --diff-filter=ACM)
for file in $files; do
  if [[ $file =~ \.env ]]; then
    echo "ERROR: Attempting to commit $file (contains secrets)"
    echo "Commit rejected. Use: git reset $file"
    exit 1
  fi
done
'@

# Note: Windows git uses bash, so this works
New-Item -ItemType Directory -Force -Path .git/hooks
Set-Content -Path .git/hooks/pre-commit -Value $hookContent
```

**Add GitHub Secret Scanning Alert Rule:**
```
Settings → Security & Analysis → Secret scanning → Custom patterns

Pattern Name: Supabase_Keys
Pattern: (VITE_SUPABASE|SUPABASE_SERVICE_ROLE_KEY)
Secret: [a-zA-Z0-9_\-]{40,}
```

---

## Verification Commands

### Quick Check (Run these to verify clean state)
```powershell
# 1. Check .env not in repo
git log --all --name-status | findstr ".env"

# 2. Check for JWT tokens
git log -p --all -S "eyJhbGciOi" | wc -l

# 3. Check git status
git status
# Should show: working tree clean

# 4. Verify .gitignore is correct
cat .gitignore | Select-String "\.env"
```

### If Any Issues Found
```powershell
# Search for specific patterns
git log --all --grep="env"
git log --all --grep="secret"
git log --all --grep="credential"

# Show commits affecting specific files
git log --follow -- .env.example
git log --follow -- package.json
```

---

## Prevention Checklist

- [ ] .gitignore includes: `.env`, `.env.local`, `.env.*.local`
- [ ] .env.example contains ONLY placeholders
- [ ] GitHub Secret Scanning enabled
- [ ] GitHub Push Protection enabled
- [ ] Pre-commit git hook installed
- [ ] Team members notified
- [ ] New keys rotated and shared securely
- [ ] Local .env updated with new keys
- [ ] All tests pass: `npm run build`

---

## Emergency Contact

**If security issue is discovered:**
1. Immediately rotate Supabase keys
2. Run BFG cleanup (see above)
3. Force push to GitHub
4. Notify team via secure channel
5. Update all deployed instances

**Timeline:**
- 0-5 min: Rotate keys
- 5-30 min: Clean history
- 30-45 min: Force push and verify
- 45-60 min: Team communication and testing

---

## Current Status: ✅ SAFE

**As of April 20, 2026:**
- No real credentials in repository ✅
- .env properly excluded ✅
- .env.example uses placeholders ✅
- Git history clean ✅
- Ready for production deployment ✅

---

**Last Updated:** April 20, 2026  
**Status:** No action required - repository is secure
