# Codex Skills

This project borrows the useful pattern from NVIDIA NeMo's `.codex` setup: keep task-specific operating playbooks close to the repo so repeated engineering work is done consistently.

In this repo, `.codex/skills` points to the shared `.claude/skills` folder so both tool ecosystems use the same project-specific instructions.

The skills in this folder are lightweight local instructions for common workflows in this app:

- fix a bug by reproducing it first
- verify changes with targeted checks
- debug production-like logs across the frontend, Netlify auth bridge, Supabase functions, and the Python CV extractor
- babysit CI without mixing in code review work

## Available skills

- `skills/fix-issue/SKILL.md`
- `skills/verify/SKILL.md`
- `skills/debug-runtime-logs/SKILL.md`
- `skills/babysit-pr/SKILL.md`

## Why this exists

This repo spans multiple runtimes:

- React/Vite frontend
- Netlify/Vercel-style auth bridge
- Supabase Edge Functions
- Python CV extraction backend

That makes debugging and verification easy to do inconsistently. These skills reduce that drift and make root-cause analysis, testing, and CI recovery more repeatable.
