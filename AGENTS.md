# LiveRadar Agent Profile

This repository is a Vite/Tailwind/vanilla JavaScript web app for live-stream monitoring.

## Use These Skills First

- Frontend/UI: `build-web-apps:frontend-app-builder`, `ux-review`, `ux-design`, `quick-design`
- Browser verification: `playwright`
- Code quality: `code-review`, `perf-profile`, `security-audit`, `tech-debt`
- Testing/QA: `qa-plan`, `regression-suite`, `smoke-check`, `test-setup`, `test-helpers`, `test-flakiness`, `test-evidence-review`
- Delivery: `bug-report`, `bug-triage`, `hotfix`, `changelog`, `patch-notes`, `release-checklist`
- Project docs: `doc`, `architecture-review`, `architecture-decision`
- Use `cloudflare:*` only for deployment/runtime work related to Cloudflare or Workers.
- Use GitHub skills only for repository, PR, issue, or CI work.

## Avoid By Default

Do not use game/GDD/story/team/asset skills in this repository unless the user explicitly asks for game design or game production work.

Avoid these categories by default:

- Game production: `game-studio:*`, `game-architect`, `gameplay-design-review`, `setup-engine`, `balance-check`, `playtest-report`
- GDD/story workflows: `create-*`, `story-*`, `review-all-gdds`, `design-system`, `design-review`, `gate-check`
- Team orchestration: `team-*`
- Non-web content production: `khazix-writer`, `hv-analysis`, `magazine-web-ppt`
- Office document work: `documents:*`, `spreadsheets:*`, `presentations:*`, `pdf` unless the user provides an actual document/spreadsheet/deck/PDF task
- Figma/Linear/Zillow/Gmail/Coursera connectors unless explicitly requested or directly referenced

## Project Defaults

- Read existing JS/CSS structure before editing.
- Keep visual changes in `src/styles/alyx-theme.css` unless a component-level style is clearly the right owner.
- Verify UI changes with Playwright at desktop, iPhone, and intermediate drag/resize widths around responsive breakpoints.
- For header, toolbar, card grid, or sticky/floating UI changes, sweep at least `390`, `640`, `900`, `1100`, `1280`, `1440`, and `1920` widths and check for overlap, horizontal overflow, and controls escaping their container.
- Run `npm run lint` and `npm run build` after code or CSS changes. If esbuild hits sandbox `spawn EPERM`, rerun the same command with escalation.
- Do not delete user data, imported backup data, generated output, or unrelated dirty files.
