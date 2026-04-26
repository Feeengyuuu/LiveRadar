# LiveRadar Art Direction Guide - Signal Core

Date: 2026-04-25
Branch: `brandTest`
Status: working art direction for future design and implementation.

## Purpose

This guide defines the visual rules for LiveRadar after adopting the Signal Core direction. Future artists and UI contributors should use it as the baseline before creating icons, mockups, promotional images, UI variants, or new product surfaces.

LiveRadar is a live-stream monitoring instrument. It should feel precise, modern, calm, and fast. It is not a generic gaming skin and it should not become a neon cyberpunk dashboard.

## Brand Keywords

- Live signal
- Radar detection
- Stream status truth
- Single-user control room
- Deep black interface
- LED red attention
- Quiet operational precision

## Core Palette

| Role | Hex | Usage |
| --- | --- | --- |
| Signal Black | `#020303` | Page background, empty space, deep surfaces |
| Panel Black | `#0c0d0f` | Header, cards, controls, panels |
| Control Black | `#040506` | Inputs, dropdowns, compact controls |
| LED Red | `#ff2738` | Brand mark, primary action, active borders, live scan accents |
| Hot Red | `#ff4d5c` | Hover highlights, short glow, button top light |
| Deep Red | `#a60f1d` | Button depth, pressed states, shadows |
| Live Green | `#17e899` | Confirmed live state only |
| Favorite Yellow | `#ffe45e` | Favorite count, starred emphasis only |
| Primary Text | `#f6f3f3` | Main readable content |
| Muted Text | `#9b9b9b` | Secondary labels, metadata |

## Color Rules

- Use black as the dominant visual mass. The page should read black first, red second.
- Use LED Red for identity and decisive actions, not every border.
- Live Green is reserved for verified online/live status. Do not use it as decoration.
- Favorite Yellow is rare. It should only indicate favorite/star states or strongest secondary priority.
- Platform colors may appear on platform badges, but they should not overpower the LiveRadar red system.
- Avoid purple/blue gradients, orange-brown console tones, and full neon backgrounds.

## Logo Direction

Core mark: radar arc + live LED dot + compact `LR` monogram.

Rules:

- The red dot means "live signal detected".
- The arc means "radar scan / polling / discovery".
- The `LR` monogram must stay readable at favicon size.
- Use the mark in a simple black or dark panel container.
- Do not add mascots, camera lenses, play buttons, lightning bolts, flames, or esports shapes.

## Surface Rules

### Page Background

- Deep black base with very low-opacity red grid or signal field.
- Background texture must stay behind the interface and never compete with content.
- Avoid large decorative orbs, bokeh, and busy animated backdrops.

### Header

- Header is the command bridge of the product.
- Keep it compact, dense, and operational.
- Primary action uses LED Red.
- Inputs and utility buttons should stay nearly black with red focus/hover feedback.

### Cards

- Cards should feel like monitored signal tiles.
- Use dark panels, thin red-tinted borders, and restrained hover lift.
- Thumbnail treatment may use subtle scanning/grid texture, but no aggressive light sweep.
- Live state sits on top of the card as a factual chip, not a decorative badge.

### Refresh State

- Refresh visuals must be factual and calm.
- Preferred treatment: small live dot + short status text + static green or red border.
- Avoid title sweeps, rotating button backgrounds, flashing full-panel overlays, or anything that makes reading harder.

## Motion Rules

- Motion should clarify state, not show off.
- Hover lift and 3D card push are acceptable when subtle and disabled under reduced motion.
- Loading/refresh motion should be short, quiet, and local to the control.
- No constant large glows, full-page scans, or repeated light sweeps over every card.

## Typography

- Use system sans-serif for primary UI.
- Use monospace only for small technical labels, counters, hashes, or status details.
- Keep letter spacing at `0` for normal text.
- Avoid novelty display fonts.
- Chinese and English wordmarks should align on baseline and stay compact.

## Iconography

- Icons should be line-based, compact, and functional.
- Prefer clear symbols for refresh, import, export, favorite, delete, and platform actions.
- Icons should not introduce extra colors beyond the role palette.

## Do

- Keep the product surface useful and readable.
- Make red feel like a live LED signal.
- Preserve the current monitoring information architecture unless a separate UX redesign is approved.
- Design for long-term consistency across app icon, favicon, header, docs, and future pages.
- Use the 1号 Signal Core board as the primary visual reference.

## Do Not

- Do not turn every component red.
- Do not add decorative cyberpunk clutter.
- Do not use orange as the primary brand color after this direction.
- Do not hide real data behind heavy effects.
- Do not use live green for anything except confirmed live or successful refresh states.
- Do not create a new page layout without checking the monitoring workflow first.

## Implementation Token Mapping

| Art Token | CSS Token |
| --- | --- |
| Signal Black | `--signal-black`, `--alyx-bg` |
| Panel Black | `--signal-panel`, `--alyx-panel` |
| LED Red | `--signal-red`, `--alyx-orange` |
| Hot Red | `--signal-red-hot`, `--alyx-orange-hot` |
| Deep Red | `--signal-red-deep`, `--alyx-orange-deep` |
| Live Green | `--signal-live`, `--live` |
| Favorite Yellow | `--signal-favorite`, `--weak` when used as favorite emphasis |

## Reference Files

- `docs/brandTest/brand-directions.html`
- `docs/brandTest/brand-plan.md`
- `docs/brandTest/exports/brandTest-01-signal-core.png`
- `src/styles/variables.css`
- `src/styles/alyx-theme.css`
