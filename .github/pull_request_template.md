<!-- Thanks for contributing to Dhee! Keep PRs to one feature/slice. -->

## What & why

<!-- What does this change, and why? Link the tracked feature if there is one. -->

- Feature (from `docs/build/FEATURES.md`):
- Spec (if any): `docs/build/specs/...`
- Closes: <!-- e.g. "Closes #42" — links the issue so merging closes it -->

## Checks

- [ ] `pnpm typecheck` passes
- [ ] `pnpm test` passes
- [ ] `pnpm format:check` passes (or ran `pnpm format`)
- [ ] Updated the status in `docs/build/FEATURES.md` if this completes/advances a feature
- [ ] For backend behavior changes: added/updated `convex/**/*.test.ts`
- [ ] No new secrets, keys, or credentials in the diff (including test fixtures)

## How to test this

<!--
For the tester. Be specific enough that someone who didn't write this can
verify it without reading the diff. If it's not user-visible, say
"backend only — covered by tests" and skip the QA step.
-->

1.
2.

**Expected result:**

**Not covered / known gaps:**

## QA

<!-- The author leaves this alone. -->

- Label `needs-qa` once review is done and a preview is up.
- A tester replies with what they checked, then applies `qa-passed` or `qa-failed`.
- Backend-only, docs, or chore PRs can skip QA — say so above.

## Notes for reviewers

<!-- Screenshots for UI changes, edge cases, follow-ups deliberately left out. -->
