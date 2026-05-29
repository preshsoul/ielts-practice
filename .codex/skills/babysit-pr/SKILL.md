---
name: babysit-pr
description: Get a pull request for this repo back to green by inspecting CI failures, fixing only the failing scope, and re-verifying until the branch is stable.
---

# babysit-pr

Get a PR to green CI. Nothing else.

## Workflow

### Step 1: Inspect the full state

Use the PR number or URL and gather:

```powershell
gh pr view <pr-number>
gh pr checks <pr-number>
gh pr diff <pr-number>
```

### Step 2: Classify the failure

- test failure
- build failure
- environment/config failure
- merge conflict
- flaky or unrelated upstream failure

### Step 3: Fix only what blocks green

- reproduce locally when possible
- patch the smallest safe scope
- do not mix in unrelated cleanup

### Step 4: Re-verify locally

Run the targeted verification from `.codex/skills/verify/SKILL.md`.

### Step 5: Report status

Tell the user:

- what failed
- what you changed
- whether CI should now pass
- whether any remaining failure looks flaky or external

## Rules

- Do not turn CI babysitting into broad code review.
- Do not fix unrelated style drift unless it is the actual failing check.
- If the same fix has already been attempted and failed, stop and tell the user instead of looping.
