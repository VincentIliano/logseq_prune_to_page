import "@logseq/libs";
import type { BlockEntity } from "@logseq/libs/dist/LSPlugin.user";

// ---- Page picker state ---------------------------------------------------

let allPages: string[] = [];
let filteredPages: string[] = [];
let selectedIndex = 0;
let resolvePicker: ((name: string | null) => void) | null = null;

async function refreshPages() {
  const pages = await logseq.Editor.getAllPages();
  if (!pages) {
    allPages = [];
    return;
  }
  allPages = pages
    // skip journal pages — we're pruning FROM journals, not into them
    .filter((p: any) => !p["journal?"])
    .map((p: any) => (p.originalName || p.name) as string)
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
}

function fuzzyFilter(query: string, items: string[]): string[] {
  if (!query) return items.slice(0, 100);
  const q = query.toLowerCase();
  const scored: { name: string; score: number }[] = [];
  for (const name of items) {
    const lower = name.toLowerCase();
    let score = -1;
    if (lower === q) score = 1000;
    else if (lower.startsWith(q)) score = 500 - lower.length;
    else if (lower.includes(q)) score = 100 - lower.length;
    if (score >= 0) scored.push({ name, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 100).map((s) => s.name);
}

function hasExactMatch(query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return allPages.some((p) => p.toLowerCase() === q);
}

function renderResults() {
  const container = document.getElementById("results")!;
  const input = document.getElementById("search") as HTMLInputElement;
  const query = input.value.trim();

  container.innerHTML = "";

  const showCreate = query.length > 0 && !hasExactMatch(query);
  const items: { label: string; value: string; isCreate?: boolean }[] = [];
  if (showCreate) {
    items.push({ label: `+ Create new page "${query}"`, value: query, isCreate: true });
  }
  for (const p of filteredPages) {
    items.push({ label: p, value: p });
  }

  if (items.length === 0) {
    const empty = document.createElement("div");
    empty.className = "result";
    empty.style.opacity = "0.6";
    empty.textContent = "No matches. Type to create a new page.";
    container.appendChild(empty);
    return;
  }

  selectedIndex = Math.max(0, Math.min(selectedIndex, items.length - 1));

  items.forEach((item, i) => {
    const div = document.createElement("div");
    div.className = "result" + (i === selectedIndex ? " selected" : "");
    div.textContent = item.label;
    if (item.isCreate) {
      const badge = document.createElement("span");
      badge.className = "badge";
      badge.textContent = "new page";
      div.appendChild(badge);
    }
    div.addEventListener("click", () => choosePage(item.value));
    div.addEventListener("mouseenter", () => {
      selectedIndex = i;
      updateSelectionClass();
    });
    container.appendChild(div);
  });
}

function updateSelectionClass() {
  const container = document.getElementById("results")!;
  const children = container.querySelectorAll(".result");
  children.forEach((el, i) => {
    el.classList.toggle("selected", i === selectedIndex);
  });
}

function currentItems(): { value: string; isCreate?: boolean }[] {
  const input = document.getElementById("search") as HTMLInputElement;
  const query = input.value.trim();
  const out: { value: string; isCreate?: boolean }[] = [];
  if (query && !hasExactMatch(query)) out.push({ value: query, isCreate: true });
  for (const p of filteredPages) out.push({ value: p });
  return out;
}

function choosePage(name: string) {
  if (resolvePicker) {
    const r = resolvePicker;
    resolvePicker = null;
    logseq.hideMainUI();
    r(name);
  }
}

function cancelPicker() {
  if (resolvePicker) {
    const r = resolvePicker;
    resolvePicker = null;
    logseq.hideMainUI();
    r(null);
  }
}

async function pickPage(headerText: string): Promise<string | null> {
  if (resolvePicker) {
    // Already open — close it
    cancelPicker();
    return null;
  }

  await refreshPages();
  filteredPages = allPages.slice(0, 100);
  selectedIndex = 0;

  const header = document.getElementById("header")!;
  header.textContent = headerText;

  const input = document.getElementById("search") as HTMLInputElement;
  input.value = "";
  renderResults();

  logseq.showMainUI();
  setTimeout(() => input.focus(), 60);

  return new Promise<string | null>((resolve) => {
    resolvePicker = resolve;
  });
}

// ---- Core move logic -----------------------------------------------------

async function getBlocksToMove(): Promise<BlockEntity[]> {
  const selected = await logseq.Editor.getSelectedBlocks();
  if (selected && selected.length > 0) return selected;
  const current = await logseq.Editor.getCurrentBlock();
  if (current) return [current];
  return [];
}

/**
 * Given a selection of blocks, return only those whose ancestors are NOT
 * also in the selection. This lets the user highlight a parent + all its
 * descendants and still get a single ref left behind (on the parent), with
 * moveBlock carrying the descendants along automatically.
 *
 * Preserves document order.
 */
async function filterToTopLevelSelection(
  blocks: BlockEntity[]
): Promise<BlockEntity[]> {
  if (blocks.length <= 1) return blocks;

  const selectedIds = new Set(blocks.map((b) => (b as any).id));
  const kept: BlockEntity[] = [];

  for (const block of blocks) {
    const pageId = (block as any).page?.id;
    let parentId = (block as any).parent?.id;
    let isDescendantOfSelection = false;

    // Walk up the parent chain. Stop when we hit the page
    // (block.parent.id === block.page.id means it's a top-level page block).
    while (parentId && parentId !== pageId) {
      if (selectedIds.has(parentId)) {
        isDescendantOfSelection = true;
        break;
      }
      const parent = await logseq.Editor.getBlock(parentId);
      if (!parent) break;
      parentId = (parent as any).parent?.id;
    }

    if (!isDescendantOfSelection) kept.push(block);
  }

  return kept;
}

async function pruneToPage() {
  const rawBlocks = await getBlocksToMove();
  if (rawBlocks.length === 0) {
    (logseq.UI as any).showMsg("Select a block (or put the cursor in one) first.", "warning");
    return;
  }

  // If the selection includes both a parent and some of its descendants,
  // keep only the parent — moveBlock will carry the descendants along, and
  // we only want one ref left behind per top-level item.
  const blocks = await filterToTopLevelSelection(rawBlocks);
  const skipped = rawBlocks.length - blocks.length;

  const label = blocks.length === 1 ? "block" : `${blocks.length} blocks`;
  const targetPageName = await pickPage(`Move ${label} to page`);
  if (!targetPageName) return;

  // Ensure target page exists
  let targetPage = await logseq.Editor.getPage(targetPageName);
  if (!targetPage) {
    targetPage = await logseq.Editor.createPage(
      targetPageName,
      {},
      { createFirstBlock: true, redirect: false }
    );
    if (!targetPage) {
      (logseq.UI as any).showMsg(`Could not create page "${targetPageName}".`, "error");
      return;
    }
  }

  // We prepend: we want the first moved block to end up at the top, and the
  // overall order of selection to be preserved. To do that we iterate the
  // selected blocks in REVERSE and always move each one to be the first
  // top-level block on the target page.

  const tree = await logseq.Editor.getPageBlocksTree(targetPageName);
  let anchorUuid: string | null = null;
  let ownEmptyPlaceholder: string | null = null; // a placeholder we created

  if (tree && tree.length > 0) {
    anchorUuid = tree[0].uuid;
    // If the page was just auto-created with a single empty first block,
    // track it so we can clean it up after moving.
    const first = tree[0] as any;
    const isEmpty = !first.content || String(first.content).trim() === "";
    if (tree.length === 1 && isEmpty) {
      ownEmptyPlaceholder = first.uuid;
    }
  } else {
    // Fully empty page — create a temporary placeholder we can move relative to
    const placeholder = await logseq.Editor.appendBlockInPage(targetPageName, "");
    if (!placeholder) {
      (logseq.UI as any).showMsg("Could not prepare target page.", "error");
      return;
    }
    anchorUuid = placeholder.uuid;
    ownEmptyPlaceholder = placeholder.uuid;
  }

  let moved = 0;
  // Iterate REVERSED: each block becomes the new first child on target,
  // pushing the previous first-moved block down. Net effect: order preserved.
  for (let i = blocks.length - 1; i >= 0; i--) {
    const block = blocks[i];
    try {
      // Leave a ref block where the original lived (as sibling before it).
      await logseq.Editor.insertBlock(block.uuid, `((${block.uuid}))`, {
        before: true,
        sibling: true,
      });

      // Move the original block to the TOP of the target page,
      // i.e. as previous sibling of the current anchor.
      if (anchorUuid) {
        await logseq.Editor.moveBlock(block.uuid, anchorUuid, {
          before: true,
          children: false,
        });
      }

      // The newly moved block is now the top — next iteration anchors to it.
      anchorUuid = block.uuid;
      moved++;
    } catch (err) {
      console.error("[prune-to-page] failed to move", block.uuid, err);
    }
  }

  // Clean up the placeholder if it's still empty
  if (ownEmptyPlaceholder) {
    try {
      const ph = await logseq.Editor.getBlock(ownEmptyPlaceholder);
      if (ph && (!ph.content || String(ph.content).trim() === "")) {
        await logseq.Editor.removeBlock(ownEmptyPlaceholder);
      }
    } catch {
      /* ignore */
    }
  }

  const suffix = skipped > 0 ? ` (with ${skipped} descendant${skipped === 1 ? "" : "s"})` : "";
  (logseq.UI as any).showMsg(
    `Moved ${moved} block${moved === 1 ? "" : "s"}${suffix} → [[${targetPageName}]]`,
    "success"
  );
}

// ---- Registration --------------------------------------------------------

function main() {
  // Keyboard handling inside the picker modal
  const input = document.getElementById("search") as HTMLInputElement;

  input.addEventListener("input", () => {
    filteredPages = fuzzyFilter(input.value.trim(), allPages);
    selectedIndex = 0;
    renderResults();
  });

  input.addEventListener("keydown", (e) => {
    const items = currentItems();
    if (e.key === "Escape") {
      e.preventDefault();
      cancelPicker();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      selectedIndex = Math.min(selectedIndex + 1, items.length - 1);
      updateSelectionClass();
      scrollSelectedIntoView();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      selectedIndex = Math.max(selectedIndex - 1, 0);
      updateSelectionClass();
      scrollSelectedIntoView();
    } else if (e.key === "Enter") {
      e.preventDefault();
      const chosen = items[selectedIndex];
      if (chosen) choosePage(chosen.value);
    }
  });

  document.getElementById("backdrop")?.addEventListener("click", (e) => {
    if (e.target === document.getElementById("backdrop")) cancelPicker();
  });

  // Register the command (appears in the command palette AND gets a
  // default keybinding that the user can rebind in Logseq's shortcut settings).
  logseq.App.registerCommandPalette(
    {
      key: "prune-to-page-move",
      label: "Prune to Page: move selected block(s)",
      keybinding: {
        binding: "mod+shift+m",
        mode: "global",
      },
    },
    () => {
      void pruneToPage();
    }
  );
}

function scrollSelectedIntoView() {
  const container = document.getElementById("results");
  const sel = container?.querySelector(".result.selected") as HTMLElement | null;
  if (sel) sel.scrollIntoView({ block: "nearest" });
}

logseq.ready(main).catch(console.error);
