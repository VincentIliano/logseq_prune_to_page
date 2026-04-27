# Prune to Page (Logseq plugin)

Move one or more selected blocks from the current page (typically a journal)
to a page of your choice. A **block reference** is left behind in the original
location for every block moved, so you keep the provenance — the journal still
"knows" about the content, and the block's inbound references remain intact
(since moveBlock preserves block UUIDs).

## Install

### Option A: Load unpacked (dev mode)

1. In Logseq, open **Settings → Advanced** and toggle **Developer mode** on.
2. Open a terminal in this folder and run:

   ```bash
   npm install
   npm run build
   ```

3. In Logseq, open the **Plugins** page (puzzle-piece icon), click
   **Load unpacked plugin**, and select this folder (the one containing
   `package.json`).

### Option B: Prebuilt

If a `dist/` folder is already present, you can skip the build step — just
toggle Developer mode and "Load unpacked plugin" pointing at this folder.

## Usage

1. Select one or more blocks (click, or shift/cmd-click for multi-select).
   Or just place the cursor in a single block.
2. Press **Cmd/Ctrl + Shift + M**.
3. Type the target page name — matching pages appear as you type. If no page
   matches, the top item becomes "Create new page ...".
4. Press **Enter** to move.

Each selected block is moved to the **top** of the target page (prepended,
preserving your selection order), and a `((block-ref))` is left in its
original spot.

## Rebinding the shortcut

Open **Settings → Keyboard shortcuts** in Logseq and search for
"Prune to Page". You can rebind or clear the default there.

## How it works (briefly)

For each selected block the plugin:

1. Inserts a new sibling block immediately before the original, whose content
   is `((<original-uuid>))` — a block reference.
2. Calls `logseq.Editor.moveBlock` to move the original to the target page.
   This API preserves the block's UUID, so the ref just created (and any
   other inbound refs anywhere in your graph) continue to point at the
   same block.

Because refs resolve by UUID, you'll also see the journal date appear under
the block's **Linked References** on the target page — that's your
auto-generated provenance trail.

## Caveats

- The plugin skips **journal pages** in the picker (you're pruning *out of*
  journals, not into them). Adjust in `src/index.ts` if you disagree.
- If a moved block has children, the children come with it (this is the
  default `moveBlock` behavior).
- If the target page didn't exist, it's created automatically. If Logseq's
  auto-created "first empty block" ends up unused, the plugin removes it.
