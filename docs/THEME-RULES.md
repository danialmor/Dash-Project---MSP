# Theme rules (dashboard `msp-bi`, since v3.46.0)

These rules exist so that changing a theme never requires fixing individual boxes again.
The single source is the **THEME CONTRACT** block at the end of the `<style>` in `msp-bi/index.html`.

## 1. Tokens — the only allowed source of colour and shape
| token | used for |
|---|---|
| `--tf-bg`, `--tf-line`, `--tf-rad`, `--tf-pad` | **frames**: the large boxes that hold a page's content (`.dframe`, `#plBody`, `.fitc` boxes, info cards frame) |
| `--tc-bg`, `--tc-line`, `--tc-rad` | **cards inside frames** (info cards, project list, efficiency cards, planning cards) |
| `--sb-thumb`, `--sb-thumb-h` | scrollbars (thumb, hover); the track is always transparent |
Each theme pack only sets the base variables (`--glass2`, `--line2`, `--r-xl`, `--rad`, `--card-border`, `--ink`…); the contract derives the tokens from them. Never write a literal colour, border or radius on a frame, card or scrollbar.

## 2. Scrolling
1. A page never scrolls as a whole on tablet/desktop (width ≥ 900 px). Each page fits the screen.
2. Content that is longer than the screen scrolls **inside a fixed frame**, like the dashboard: the frame stays, only its content moves.
   - Frames built by JS: add the selector to `fitBoxes()` (gets class `.fitc` and its height from `VHs()`, the stable small viewport height).
   - Frames with their own wrapper: outer box `overflow:hidden`, inner element scrolls (`#plBody > .plsc`, `.dframe > .dsc`).
3. Every renderer that changes a frame's content calls `fitBoxes()` at the end.
4. Heights use `VHs()` / `svh`, never `dvh`, so the Safari toolbar showing/hiding does not shrink a frame (the home frame uses `homeFix()`).
5. Sticky headers inside a frame use `top:0` (the scroller is the inner box, it has no padding offset).
6. `overscroll-behavior:contain` on scrollers; `html, body` have `overscroll-behavior-y:none`.

## 3. Content
1. Lists of projects are rows, not buttons: a row is `role="row"` with `tabindex="0"`; only real actions look like buttons.
2. Filters inside a frame are tabs (`.pvtab`), not filled chips.
3. With many items, charts switch to a dense layout (`.efx.many`) and scroll inside their card; with one item they show detail views (`efOne`).
4. Do not duplicate an action on the same page (e.g. the delay form is opened only by "گزارش تأخیر" in the header).
5. The simulation ("ghost") mode must show **15 projects** on every page so layouts are checked at full load.
