# Spec: Sidebar collapse / icon rail (desktop)

**Epic:** 1 — App shell & navigation
**Status when written:** ⬜ (no persistent desktop sidebar exists at all)

Issue [#104](https://github.com/achalagrawal/dhee-app/issues/104).

Before this, `AppDrawer` was the sidebar at every width: a slide-in overlay,
opened from a hamburger, gone the moment you close it. On a desktop window
that's a waste of a permanently free 270px, and it makes navigation modal —
every hop between conversations costs an open and a close.

## Mockup reference

- File: `mockup/project/Dhee.dc.html`, the `<aside data-sidebar>` around
  line 158, plus the `@media (min-width: 821px)` block at line 92.
- The sidebar is an in-flow `<aside>`, 270px, sticky, full height, with a
  hairline right border — not an overlay, and never on top of the content.
- `data-collapsed="true"` narrows it to **66px**. Labels (`data-rail-hide`)
  drop out; every remaining row centres its icon (`data-rail-center`); a
  rail-only History button appears (`data-rail-only`) that opens the sidebar
  back up. Width animates (`transition: width 0.2s ease`).
- Below 821px the aside becomes `position: fixed` and slides in — the drawer
  we already ship.

## Behavioral contract

- **The breakpoint is 821px, and web-only.** Native never gets the persistent
  sidebar: a tablet in landscape is wide enough by pixels, but its navigation
  is the drawer and the collapse control is hover-first.
- **Collapsed is narrow, not absent.** New conversation, search, the four nav
  items, History and the account avatar all survive as centred icons. There is
  no width at which a desktop window has no sidebar.
- **The rail's top slot is the expand control.** It shows the Dhee mark at
  rest and swaps to the sidebar glyph under the pointer — ChatGPT's move, and
  the reason this issue was filed. Hover is decoration: pressing the slot
  expands the sidebar whether or not a pointer ever hovered it, so touch and
  keyboard reach it too. Its accessible name is "Open sidebar" in both states.
- **Expanded gets its own toggle**, the collapse glyph at the trailing edge of
  the brand row, per the mockup.
- **The state is a preference, not session state.** Someone who works in the
  rail expects the rail on the next visit, so it is stored (`dhee.sidebarCollapsed`)
  and hydrated on mount.
- **The header loses its mobile chrome on desktop.** No hamburger — there is
  nothing left for it to open — and no centred mark, because the sidebar
  carries the brand. Screen-supplied trailing actions stay, pinned right.
- **Nothing changes below the breakpoint**, or on iOS/Android: same overlay
  drawer, same hamburger, same centred mark.

## Backend contract

None. This is layout and local preference only — no Convex functions, no
schema, and so no new tests. The sidebar's data (`users.accountSummary`,
`chat.listThreads`) is what the drawer already queried.

## UI wiring

- `src/components/SidebarContent.tsx` (new) — everything inside the sidebar,
  shared by both forms so they can't drift; `collapsed` is what turns it into
  the rail.
- `src/components/AppSidebar.tsx` (new) — the desktop column, animating
  between 270px and 66px.
- `src/components/AppDrawer.tsx` — now just the overlay shell around
  `SidebarContent`.
- `src/lib/useIsDesktop.ts` (new) — the breakpoint, in one place.
- `src/lib/shell.tsx` — `sidebarCollapsed` + `collapseSidebar`/`expandSidebar`.
- `src/lib/prefs.ts` (new) — the load/save helpers lifted out of
  `ThemeContext`, now that two contexts persist a preference.
- `app/(app)/_layout.tsx` — the shell becomes a row: sidebar, then the Stack.
- `src/components/AppShell.tsx` — hamburger and centred mark are mobile-only.

## Out of scope

The mockup's sidebar also carries Starred and Pinned rows, a collapsible
History header, and a "Get the app" button; its desktop header carries a
thread title. All are separate `FEATURES.md` rows and stay untouched here.

## Verification

- [x] `pnpm typecheck`, `pnpm test`, `pnpm format:check` green.
- [ ] Visual check at desktop and mobile widths — on the Vercel preview build.
- [x] Status flipped in `FEATURES.md`.
