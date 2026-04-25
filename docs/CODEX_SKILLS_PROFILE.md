# Codex Skills Profile For LiveRadar

This project does not have project-local installed skills. The active skills come from the global `CODEX_HOME` directory, so physically uninstalling them would affect other projects. For this repository, use the local `AGENTS.md` policy as the project-level skills filter.

## Keep Active For This Project

- Web frontend implementation and UI polish
- Playwright browser verification
- Code review, debugging, hotfixes, performance, and security
- QA planning, smoke checks, regression checks, test setup, and test helper work
- Release notes, changelog, deployment checklist, and technical docs
- Cloudflare only when deployment/runtime work needs it
- GitHub only for repository, PR, issue, or CI tasks

## Ignore Unless Explicitly Requested

- Game Studio and game design skills
- GDD/story/sprint/team orchestration skills
- Godot/game-engine tooling
- Figma, Linear, Zillow, Gmail, Coursera connectors
- Documents, spreadsheets, presentations, and PDF skills
- Long-form writing, magazine, and non-engineering content skills

## If Global Uninstall Is Still Desired

Move unwanted directories from `%CODEX_HOME%/skills` into a backup folder such as `%CODEX_HOME%/skills.disabled/liveradar-YYYYMMDD`, then restart Codex. Do not do this casually because it changes the skills available to every project using that `CODEX_HOME`.
