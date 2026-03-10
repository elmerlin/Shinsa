# Live UI Guidelines

This file captures the current design language for compact live-session header controls so we can stay consistent as the live surface grows.

## Reference Pattern

Use the compact strip in `client/src/components/LiveHeaderStatusStrip.jsx` as the source of truth for one-line live metadata and lightweight inline editing.

## Design Rules

- Prefer `border-piu-border/60`, `bg-piu-dark/60`, and `bg-piu-card/70` over brighter accent fills for header utilities.
- Keep header controls compact: one label chip, one line of content, one small action button if editing is needed.
- Use accent color sparingly. Let cyan and other bright tones show state feedback, not carry the whole block.
- Match the rest of the live page by using rounded panels, soft borders, muted gray text, and small uppercase utility labels.
- Avoid stacked promo-card layouts for routine session metadata. Header info should read as support UI, not as a featured module.
- Default to single-line content with truncation in viewer mode. Expand only when the information truly needs more room.

## When To Reuse This Pattern

- Stream status
- Short host notes
- Lightweight room metadata
- Inline header settings that need a quick save action

## Avoid

- Large standalone boxes for simple metadata
- Duplicate display and edit panels for the same field
- New color treatments that do not already exist in the live page palette
