# LiveRadar brandTest - Future Art Plan

Date: 2026-04-25
Branch: `brandTest`
Scope: design planning only. No app content, data model, refresh logic, or production UI code is changed by this plan.

## Brand Direction

LiveRadar should feel like a modern live-signal instrument: deep black space, precise panels, LED red as the brand signal, and restrained supporting status colors. The product is not a generic entertainment dashboard. It is a single-user monitoring surface for quickly discovering whether selected streamers are live.

## Logo Concept

Core mark: radar arc + live LED dot + compact `LR` monogram.

Rules:

- The red dot represents a live broadcast signal, not decoration.
- The radar arc represents detection, polling, and streamer discovery.
- The mark must work as favicon, app icon, header mark, and monochrome stamp.
- Avoid mascot, camera, play button, or overly gaming-style marks.

## Palette Foundation

- Ink black: `#020303` to `#050506`
- Panel black: `#0c0d0f` to `#12100f`
- LED red: `#ff2334` to `#ff3142`
- Live confirmation: green, mint, or pale white depending on theme
- Warning/favorite: restrained yellow or amber
- Borders: low-opacity white or red, never full neon everywhere

## 8 Main Page Color Directions

1. Signal Core - recommended default candidate. Balanced black, LED red, and green live state. Strongest fit for current product.
2. LED Noir - premium black-field interface. Mature and restrained, but slightly less energetic.
3. Infrared Glass - translucent modern surface. Good for a future polished app feel, but needs performance discipline.
4. Radar Command - utilitarian monitoring console. Strong product fit, but avoid becoming too tactical.
5. Carbon Pulse - warm carbon black and orange-red bridge from the current visual language. Useful transition style.
6. Minimal LED - strict black/red minimal system. Most timeless, but needs motion and status design to avoid feeling flat.
7. Crimson Studio - softer creator-tool direction. Better if the product expands into creator management workflows.
8. Red Terminal - hard technical terminal direction. Strong scanner identity, but can feel noisy if overused.

## Recommended Path

Use `Signal Core` as the primary direction, then borrow:

- LED Noir's restraint for production polish.
- Minimal LED's typography and spacing discipline.
- Infrared Glass only for selective overlays, not every card.
- Radar Command's precision for refresh/status modules.

## Implementation Notes For Later

1. Move production colors into named design tokens before restyling.
2. Replace the favicon and app icon with the final radar-dot monogram.
3. Keep platform brand colors secondary to the LiveRadar brand red.
4. Use LED red for brand, live scanning, primary actions, and active borders only.
5. Keep refresh visuals quiet and factual.
6. Preserve the current monitoring layout unless there is a separate UX redesign.

## Deliverables

- `docs/brandTest/brand-directions.html` - static design board with 8 directions.
- `docs/brandTest/exports/brandTest-01-signal-core.png`
- `docs/brandTest/exports/brandTest-02-led-noir.png`
- `docs/brandTest/exports/brandTest-03-infrared-glass.png`
- `docs/brandTest/exports/brandTest-04-radar-command.png`
- `docs/brandTest/exports/brandTest-05-carbon-pulse.png`
- `docs/brandTest/exports/brandTest-06-minimal-led.png`
- `docs/brandTest/exports/brandTest-07-crimson-studio.png`
- `docs/brandTest/exports/brandTest-08-red-terminal.png`
