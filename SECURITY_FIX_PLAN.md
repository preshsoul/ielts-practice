# IELTS App Security Fix Plan
**Date**: April 20, 2026  
**Priority**: CRITICAL - Execute immediately  
**Status**: Active  

## Executive Summary
This plan addresses 25 security vulnerabilities identified in the IELTS practice application. The most critical issues involve exposed production credentials and missing database security policies that could lead to complete system compromise.

## Phase 1: EMERGENCY RESPONSE (Complete Today - 4 hours)

### 1.1 Credential Rotation (30 minutes)
**Status**: ✅ COMPLETED - Credentials replaced in .env.example  
**Responsible**: Developer  
**Steps**:
- [x] Replace real credentials in .env.example with placeholders
- [ ] Create new Supabase project (recommended for production)
- [ ] Generate new ANON_KEY and SERVICE_ROLE_KEY
- [ ] Update .env file with new credentials
- [ ] Test authentication still works
- [ ] Delete old Supabase project after migration

### 1.2 Database Security Policies (1 hour)
**Status**: PENDING  
**Responsible**: Developer  
**Location**: Supabase SQL Editor  
**SQL Commands**:
```sql
-- Add missing DELETE policies for practice_sessions
drop policy if exists "Users can only delete their own sessions" on public.practice_sessions;
create policy "Users can only delete their own sessions"
  on public.practice_sessions
  for delete
  using (auth.uid() = profile_id);

-- Add missing UPDATE policies for practice_sessions
drop policy if exists "Users can only update their own sessions" on public.practice_sessions;
create policy "Users can only update their own sessions"
  on public.practice_sessions
  for update
  using (auth.uid() = profile_id);

-- Add missing DELETE policies for shortlists
drop policy if exists "Users can only delete their own shortlists" on public.shortlists;
create policy "Users can only delete their own shortlists"
  on public.shortlists
  for delete
  using (auth.uid() = profile_id);

-- Add missing UPDATE policies for shortlists
drop policy if exists "Users can only update their own shortlists" on public.shortlists;
create policy "Users can only update their own shortlists"
  on public.shortlists
  for update
  using (auth.uid() = profile_id);
```

### 1.3 Admin Route Protection (15 minutes)
**Status**: PENDING  
**Responsible**: Developer  
**Location**: src/App.jsx  
**Changes**:
```javascript
// Add authentication check to admin route
function ProtectedRoute({ component: Component, authUser, requiredRole = 'admin' }) {
  if (!authUser) return <Navigate to="/" replace />;
  // TODO: Add role checking when role system is implemented
  return <Component />;
}

// Update route definition
<Route path="/admin" element={<ProtectedRoute component={AdminPage} authUser={authUser} />} />
```

### 1.4 Git History Cleanup (30 minutes)
**Status**: PENDING  
**Responsible**: Developer  
**Commands**:
```bash
# Remove .env.example from git history
git filter-branch --tree-filter 'rm -f .env.example' --prune-empty HEAD
git for-each-ref --format="%(refname)" refs/original | xargs -n 1 git update-ref -d
git reflog expire --expire=now --all
git gc --prune=now

# Or use BFG Repo Cleaner (recommended)
# Download from https://rtyley.github.io/bfg-repo-cleaner/
# java -jar bfg.jar --delete-files .env.example
```

## Phase 2: CRITICAL FIXES (Complete This Week - 2 days)

### 2.1 Safe JSON Deserialization (2 hours)
**Status**: PENDING  
**Responsible**: Developer  
**Location**: src/App.jsx  
**Changes**:
```javascript
function safeLoadSessions() {
  try {
    const raw = localStorage.getItem('precious_sessions');
    if (!raw) return [];
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return [];

    return data.filter(session =>
      typeof session === 'object' &&
      session !== null &&
      !Object.prototype.hasOwnProperty.call(session, '__proto__') &&
      !Object.prototype.hasOwnProperty.call(session, 'constructor')
    ).map(session => ({
      id: String(session.id || ''),
      date: String(session.date || new Date().toISOString()),
      score: Number(session.score) || 0,
      total: Number(session.total) || 0,
      exam: String(session.exam || 'IELTS'),
      results: Array.isArray(session.results) ? session.results : []
    }));
  } catch {
    return [];
  }
}
```

### 2.2 Email OTP Rate Limiting (4 hours)
**Status**: PENDING  
**Responsible**: Developer  
**Location**: src/App.jsx  
**Implementation**:
```javascript
// Add rate limiting state
const [otpAttempts, setOtpAttempts] = useState(() => {
  const stored = localStorage.getItem('otp_attempts');
  return stored ? JSON.parse(stored) : {};
});

// Rate limiting function
function canSendOTP(email) {
  const now = Date.now();
  const attempts = otpAttempts[email] || [];
  const recent = attempts.filter(time => now - time < 3600000); // 1 hour
  return recent.length < 3; // Max 3 per hour
}

function recordOTPAttempt(email) {
  const now = Date.now();
  setOtpAttempts(prev => ({
    ...prev,
    [email]: [...(prev[email] || []).filter(time => now - time < 3600000), now]
  }));
  localStorage.setItem('otp_attempts', JSON.stringify(otpAttempts));
}

// Update signInWithEmail function
const signInWithEmail = async () => {
  if (!supabase || !authEmail.trim()) return;

  if (!canSendOTP(authEmail.trim())) {
    setAuthMessage("Too many attempts. Please wait before trying again.");
    return;
  }

  // ... rest of function
  recordOTPAttempt(authEmail.trim());
};
```

### 2.3 Remove Hardcoded PII (15 minutes)
**Status**: PENDING  
**Responsible**: Developer  
**Location**: src/App.jsx  
**Changes**:
```javascript
// Replace hardcoded name
const APP_OWNER = import.meta.env.VITE_APP_OWNER || 'User';

// Update JSX
<div className="app-brand-title">{APP_OWNER}</div>
```

### 2.4 Input Validation for Scholarship Filters (1 hour)
**Status**: PENDING  
**Responsible**: Developer  
**Location**: src/components/ScholarshipPage.jsx  
**Changes**:
```javascript
function parseMaxFee(value) {
  const num = parseInt(value, 10);
  return isNaN(num) || num < 0 ? 999999 : num;
}

const filtered = INSTITUTIONS.filter(inst => {
  const maxFeeNum = parseMaxFee(maxFee);
  return (region === 'All' || inst.country === region || inst.city === region) &&
         inst.tuition_international_yearly <= maxFeeNum &&
         (keywords.length === 0 || keywords.some(k =>
           inst.research_areas.join(' ').toLowerCase().includes(k.toLowerCase()) ||
           inst.name.toLowerCase().includes(k.toLowerCase())
         ));
});
```

## Phase 3: MEDIUM PRIORITY FIXES (Complete This Month - 2 weeks)

### 3.1 Audit Logging Implementation (1 day)
**Status**: PENDING  
**Responsible**: Developer  
**Location**: Supabase SQL Editor + src/services/supabaseData.js  
**SQL**:
```sql
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  table_name text,
  record_id uuid,
  user_id uuid,
  old_values jsonb,
  new_values jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now()
);

-- Enable RLS
alter table public.audit_logs enable row level security;

-- Only service role can insert audit logs
create policy "Only service role can insert audit logs"
  on public.audit_logs
  for insert
  with check (auth.role() = 'service_role');
```

### 3.2 XSS Protection for Question Explanations (2 hours)
**Status**: PENDING  
**Responsible**: Developer  
**Steps**:
```bash
npm install dompurify
```

**Location**: src/components/PracticeView.jsx  
**Changes**:
```javascript
import DOMPurify from 'dompurify';

<div style={{fontSize:13,lineHeight:1.85,color:C.muted}}>
  {DOMPurify.sanitize(q.explanation, {ALLOWED_TAGS: ['b', 'i', 'em', 'strong']})}
</div>
```

### 3.3 Security Headers Implementation (30 minutes)
**Status**: PENDING  
**Responsible**: Developer  
**Location**: netlify.toml  
**Changes**:
```toml
[[headers]]
  for = "/*"
  [headers.values]
  Content-Security-Policy = "default-src 'self'; script-src 'self' 'unsafe-inline' https://fonts.googleapis.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: https:; connect-src 'self' https://*.supabase.co;"
  X-Content-Type-Options = "nosniff"
  X-Frame-Options = "DENY"
  X-XSS-Protection = "1; mode=block"
  Referrer-Policy = "strict-origin-when-cross-origin"
```

### 3.4 localStorage Cleanup on Logout (30 minutes)
**Status**: PENDING  
**Responsible**: Developer  
**Location**: src/App.jsx  
**Changes**:
```javascript
const signOut = async () => {
  // Clear all local data
  localStorage.removeItem('precious_sessions');
  localStorage.removeItem('scholarship_shortlist');
  localStorage.removeItem('scholarship_consent');
  localStorage.removeItem('otp_attempts');

  if (!supabase) return;
  await supabase.auth.signOut();
  setAuthUser(null);
  setProfile(null);
};
```

### 3.5 CSV Processing Security (1 hour)
**Status**: PENDING  
**Responsible**: Developer  
**Location**: src/components/ScholarshipPage.jsx  
**Changes**:
```javascript
function parseKeywords(text, maxSize = 10000) {
  if (!text) return [];

  // Limit text size to prevent DoS
  if (text.length > maxSize) {
    text = text.substring(0, maxSize);
  }

  const stop = new Set(['and','the','of','in','to','a','for','with','on','by','is','are','that','this','as','an','be','from','it','its']);

  try {
    const toks = text
      .toLowerCase()
      .split(/\s+/)
      .filter(t => t && t.length > 2 && t.length < 100 && !stop.has(t))
      .slice(0, 20);  // Max 20 keywords

    return toks;
  } catch (e) {
    console.error('Keyword parsing failed:', e);
    return [];
  }
}
```

## Phase 4: LONG-TERM ARCHITECTURE (Complete This Quarter - 3 months)

### 4.1 Backend API Implementation (2 months)
**Status**: PENDING  
**Responsible**: Developer  
**Technology**: Node.js + Express or Next.js API Routes  
**Benefits**:
- Service role key never exposed to frontend
- Centralized rate limiting and validation
- Audit logging at API layer
- Better error handling and monitoring

### 4.2 Role-Based Access Control (RBAC) (1 month)
**Status**: PENDING  
**Responsible**: Developer  
**Implementation**:
- Add roles table (admin, user, moderator)
- Implement role checking in ProtectedRoute
- Add admin panel with proper authorization

### 4.3 Two-Factor Authentication (2FA) (1 month)
**Status**: PENDING  
**Responsible**: Developer  
**Implementation**:
- Integrate with Supabase Auth 2FA
- Add TOTP/SMS verification
- Require 2FA for admin accounts

### 4.4 Encrypted Data Export (1 week)
**Status**: PENDING  
**Responsible**: Developer  
**Implementation**:
```javascript
// Add password protection to exports
function exportSessionsData(sessions) {
  const password = prompt('Enter password to encrypt export:');
  if (!password) return;

  // Use Web Crypto API to encrypt
  const encrypted = await encryptData(JSON.stringify({
    exported_at: new Date().toISOString(),
    sessions,
  }), password);

  downloadJson(`ielts-sessions-encrypted-${new Date().toISOString().slice(0, 10)}.json`, encrypted);
}
```

## TESTING & VERIFICATION PLAN

### Security Testing Checklist
- [ ] All Supabase policies tested with different user roles
- [ ] Authentication flows tested (login, logout, session persistence)
- [ ] Input validation tested with malicious payloads
- [ ] XSS attempts blocked by CSP and sanitization
- [ ] Rate limiting prevents abuse
- [ ] No sensitive data in browser console or network requests
- [ ] Admin routes properly protected
- [ ] localStorage data cleared on logout

### Penetration Testing
- [ ] Hire external security firm for black-box testing
- [ ] Test for SQL injection through Supabase queries
- [ ] Test for IDOR vulnerabilities
- [ ] Test for privilege escalation
- [ ] Test for session fixation attacks

### Monitoring & Alerting
- [ ] Set up Supabase monitoring for unusual activity
- [ ] Implement error tracking (Sentry, LogRocket)
- [ ] Set up alerts for failed authentication attempts
- [ ] Monitor for suspicious database queries

## RISK ASSESSMENT

### Current Risk Level: CRITICAL
- Exposed credentials allow immediate system compromise
- Missing RLS policies allow unauthorized data access
- No audit trail for security incidents

### Post-Fix Risk Level: LOW-MEDIUM
- After Phase 1-2 completion: Most critical attack vectors closed
- After Phase 3 completion: Industry-standard security implemented
- After Phase 4 completion: Enterprise-grade security posture

## DEPENDENCIES & RESOURCES

### Required Skills
- SQL (Supabase/PostgreSQL)
- React security patterns
- Web security fundamentals
- API design and security

### Tools Needed
- Supabase dashboard access
- Git repository management
- Node.js development environment
- Security testing tools (OWASP ZAP, Burp Suite)

### Budget Considerations
- External security audit: $2,000-5,000
- Security monitoring tools: $50-200/month
- Backend hosting: $10-50/month

## SUCCESS METRICS

### Phase 1 Success Criteria
- [ ] No real credentials in version control
- [ ] All RLS policies implemented and tested
- [ ] Admin routes require authentication
- [ ] Git history cleaned of sensitive data

### Phase 2 Success Criteria
- [ ] All critical vulnerabilities patched
- [ ] Authentication flows secure
- [ ] Input validation prevents common attacks
- [ ] No PII exposure in frontend

### Overall Success Criteria
- [ ] Security audit passes with LOW risk rating
- [ ] No critical or high-severity vulnerabilities
- [ ] Compliance with OWASP Top 10
- [ ] Secure deployment ready for production

## COMMUNICATION PLAN

### Internal Communication
- Daily progress updates during Phase 1
- Weekly status reports during Phase 2-3
- Monthly architecture reviews during Phase 4

### External Communication
- Notify users of security improvements
- Be transparent about past issues (if discovered)
- Communicate security best practices

## CONTINGENCY PLAN

### If Credentials Already Compromised
1. Immediately disable old Supabase project
2. Create new project with new credentials
3. Notify all users to change passwords
4. Implement additional security measures
5. Consider legal notification requirements

### If Data Breach Occurs
1. Isolate affected systems
2. Preserve evidence for investigation
3. Notify affected users within 72 hours
4. Engage legal counsel
5. Implement breach response plan

---

**Next Steps**: Execute Phase 1 immediately. Do not deploy to production until Phase 1 is complete and tested.