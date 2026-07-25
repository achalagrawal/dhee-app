# Spec: <feature name>

> Copy this file to `specs/<feature>.md` right before implementing the feature.
> Keep it short — it's a contract, not a design doc.

**Epic:** <n — name from FEATURES.md>
**Status when written:** <🟡 / ⬜>

## Mockup reference

- File: `mockup/project/Dhee.dc.html` (web-shell variant:
  `mockup/project/Dhee Web.dc.html`)
- Section: `<!-- ===== ... ===== -->` around line <n>.
- What it looks like: <one or two sentences; note dimensions/colors only if the
  CSS vars don't already cover it>

## Behavioral contract (the ChatGPT/Claude conventions, made explicit)

- <e.g. tokens stream in; a Stop button replaces Send while generating>
- <e.g. optimistic: user bubble appears immediately on send>
- <edge cases: empty input disabled, error state, offline>

## Backend contract

- Functions touched/added (Convex): `<file.fn>` — args → return.
- Schema changes: <tables/fields, or "none">.
- **Tests (write first):** list the `convex-test` assertions that define "done".

## UI wiring

- Component(s): `<path>`.
- Replaces stub: <e.g. `Composer` `soon()` call for model picker — yes/no>.

## Verification

- [ ] Backend tests green (`vitest`).
- [ ] Visual check in preview browser matches mockup (screenshot attached to PR).
- [ ] Flip status in `FEATURES.md`.
