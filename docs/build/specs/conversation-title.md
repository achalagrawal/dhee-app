# Spec: conversation title in the chat header

**Epic:** 1 — App shell & navigation
**Status when written:** ⬜ (the header showed only the Dhee mark)

Prompted by [#77](https://github.com/achalagrawal/dhee-app/issues/77): the chat
named nothing, so the ⋯ menu's **Rename** / **Delete** rows had no visible
subject — people read them as acting on the message, the app, or the account.
The menu is fine; what was missing is what it acts on.

## Mockup reference

- File: `mockup/project/Dhee.dc.html`, header at line ~258 (`data-header-title`)
  and `headerTitle()` at ~3865.
- The header runs **menu button · title · actions**. On a chat screen the title
  is the conversation's own name; elsewhere it names the screen. The prototype
  hides it below 820px and centres the logo instead (line 119).

**Deviation, on purpose:** we keep the title at every width and drop the centred
logo whenever a screen supplies one. Hiding it on mobile reproduces the exact
confusion #77 reports, and every comparable app (ChatGPT, Claude) names the
conversation in its mobile header too. Screens with no name of their own — Home,
History, Settings — are unchanged: centred mark, and their own `<h1>` names them.

## Behavioral contract

- The chat header shows the conversation's name, ellipsized to one line, with
  the trailing actions holding their position.
- Until the titling pass names a thread, the header reads **New conversation** —
  the same fallback the History rows use.
- Tapping the title opens the thread menu (a chevron marks it as a button). The
  ⋯ button opens the same sheet; both are entrances to one menu.
- The sheet names the conversation above its rows, in both states, so **Star /
  Pin / Rename / Share / Delete** are read against their subject.
- Choosing Rename heads the editor **Rename conversation** and pre-fills the
  input with the current name.
- A rename is reflected in the header without a reload (live query).

## Backend contract

- `chat.threadInfo({ threadId }) → { title: string | null, starred, pinned }`.
  Authorized like every other thread read. `title` is null while unnamed.
  `listThreads` can't serve this: it is paginated, and a thread opened by deep
  link or from search may not be on the page the client holds.
- Schema changes: none.
- **Tests:** an unnamed thread reports `title: null` and both flags false; after
  `renameThread` + `setStarred` it reports the name and the star; another
  person's thread rejects with "Not your conversation".

## UI wiring

- `src/components/AppShell.tsx` — optional `title` / `onTitlePress`; the centred
  logo renders only when no title is given.
- `app/(app)/chat/[threadId].tsx` — reads `chat.threadInfo`, names the header,
  and passes `currentTitle` / `starred` / `pinned` into the sheet. It previously
  passed none of them, so on this screen Rename opened an empty box and Star
  never read "Unstar".
- `src/components/ThreadMenuSheet.tsx` — heading above the rows; `renameConversation`
  ("Rename conversation") heads the rename step.

## Verification

- [x] Backend tests green (`vitest`).
- [x] Visual check in the preview browser: header names the thread, menu opens
      from it, rename round-trips and updates the header live; mobile width
      ellipsizes without pushing the actions off.
- [x] Status flipped in `FEATURES.md`.
