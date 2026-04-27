# Prune to Page (Logseq plugin)

Move one or more selected blocks from the current page (typically a journal)
to a page of your choice. A **block reference** is left behind in the original
location for every block moved, so you keep the provenance — the journal still
"knows" about the content, and the block's inbound references remain intact
(since moveBlock preserves block UUIDs).

## Install

### Option A: Logseq Marketplace (recommended once approved)

1. Open the **Plugins** page in Logseq (puzzle-piece icon).
2. Switch to the **Marketplace** tab.
3. Search for **Prune to Page** and click **Install**.

### Option B: Load unpacked (dev mode)

1. In Logseq, open **Settings → Advanced** and toggle **Developer mode** on.
2. Open a terminal in this folder and run:

   ```bash
   npm install
   npm run build
   ```

3. In Logseq, open the **Plugins** page (puzzle-piece icon), click
   **Load unpacked plugin**, and select this folder (the one containing
   `package.json`).

### Option C: Prebuilt zip from a Release

Download the `logseq_prune_to_page.zip` asset from the latest
[GitHub Release](https://github.com/vincentiliano/logseq_prune_to_page/releases),
unzip it, then "Load unpacked plugin" pointing at the unzipped folder.

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

## Releasing

Releases are produced by the workflow in `.github/workflows/release.yml`.
To cut a new release:

1. Bump the `version` field in `package.json` (e.g. `0.1.0` → `0.1.1`).
2. Commit, then tag the commit with a matching `v` prefix and push the tag:

   ```bash
   git commit -am "Release v0.1.1"
   git tag v0.1.1
   git push origin main --tags
   ```

3. The workflow builds the plugin and publishes a GitHub Release containing
   `logseq_prune_to_page.zip`. The Logseq marketplace installer fetches the
   release zip from this URL pattern.

## Publishing to the Logseq Marketplace

After at least one tagged GitHub Release exists, submit the plugin to the
[`logseq/marketplace`](https://github.com/logseq/marketplace) repository:

1. Fork `logseq/marketplace`.
2. Create a new folder under `packages/` named after the plugin id, e.g.
   `packages/prune-to-page/`.
3. Add a `manifest.json` in that folder:

   ```json
   {
     "title": "Prune to Page",
     "description": "Move selected blocks to a page of your choice, leaving block refs behind so journal provenance is preserved.",
     "author": "vincentiliano",
     "repo": "vincentiliano/logseq_prune_to_page",
     "icon": "./icon.svg",
     "theme": false
   }
   ```

4. Copy `icon.svg` from this repo into the same `packages/prune-to-page/` folder.
5. Open a pull request against `logseq/marketplace`. Once it's reviewed and
   merged, the plugin appears in the Marketplace tab inside Logseq.

A few gotchas to verify before submitting:

- The `repo` field must be exactly `<owner>/<repo>` and must match a public
  GitHub repo with at least one Release whose assets include the plugin zip.
- The release zip must contain `package.json`, `dist/`, `icon.svg`, and
  `README.md` at its top level — the workflow in this repo already does that.
- The `id` inside `package.json`'s `logseq` block (`prune-to-page`) is what
  Logseq uses internally; keep the marketplace folder name in sync with it.
