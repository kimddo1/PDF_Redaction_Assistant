# PDF Redaction Assistant

A three-panel, fully client-side web app that lets a reviewer upload a PDF,
automatically detect **dates** and **person names**, and see them highlighted
in a live PDF viewer before deciding what to redact.

No backend, no external API — everything runs in the browser.

![screenshot](docs/screenshot.png)
<!-- Replace docs/screenshot.png with a real screenshot or screen recording. -->

## Setup

Requires Node 18+.

```bash
npm install
npm run dev
```

Then open the printed local URL and drop in any PDF.

To run the regex sanity checks:

```bash
node scripts/testPatterns.mjs
```

## How it works

### Three-panel layout

| Panel  | Responsibility |
| ------ | -------------- |
| **Left** (`ThumbnailStrip`) | Renders a thumbnail per page. Click to jump; the page currently in view is highlighted via an `IntersectionObserver`. |
| **Centre** (`PdfViewer` / `PdfPage`) | Continuous vertical scroll of every page (canvas + absolutely-positioned highlight overlay). Scrolls to and highlights the selected entity. |
| **Right** (`EntityPanel`) | Collapsible **Show Dates** / **Show Names** sections listing every detected instance with its page number and a count badge. Click an item to highlight + scroll to it. |

### Data model

A single flat list of entities drives the whole UI:

```js
Entity = {
  id,                     // stable unique id
  type: 'date' | 'name',
  text,                   // matched string
  pageNumber,             // 1-based
  rects: [{ x, y, w, h }] // highlight boxes in scale-1 CSS coords
}
```

App state is just: `pdfDoc`, `entities`, `selectedIds` (a `Set`, so multiple
highlights can show at once), `currentPage`, and a `scrollTarget`. The viewer
derives per-page overlays from `selectedIds`; the panel derives its lists by
filtering on `type`.

### Entity extraction (the interesting part)

Regexes need to run on *continuous* text, but pdf.js returns text in fragmented
"items", each with its own position. So for every page we:

1. Concatenate all item strings into one page string, inserting a single space
   (or newline on `hasEOL`) between items, while recording each item's
   `[start, end)` character offset **and** its bounding box.
2. Run the date/name regexes on that page string.
3. Map each match's character span back to the item(s) it overlaps, clipping
   partially-covered items proportionally, to produce highlight rectangles.

Boxes are stored at scale 1 in CSS (top-left origin) coordinates; the PDF's
bottom-left origin is converted using pdf.js's `viewport.transform`
(`pdfjsLib.Util.transform`). The viewer multiplies the stored rects by each
page's render scale at draw time, so highlights stay aligned at any width.

See `src/extraction/extractEntities.js` and `src/extraction/patterns.js`.

### Patterns matched

**Dates** (case-insensitive) — each is a separately-documented pattern:

| Format | Example |
| ------ | ------- |
| ISO `YYYY-MM-DD` | `2024-01-12` |
| `DD/MM/YYYY`, `DD-MM-YYYY`, `DD-Mon-YYYY` | `12/01/2024`, `03-Feb-2024` |
| `Month DD, YYYY` | `January 12, 2024` |
| `DD Month YYYY` | `12 January 2024` |

**Person names** — detected using [compromise](https://github.com/spencermountain/compromise)
NLP. `nlp(pageText).people()` returns contextually identified person names with
character offsets that map directly back into the highlight geometry pipeline.
A post-filter rejects matches containing em/en dashes (page headings such as
"Page Two — Correspondence"). Matches shorter than two words are also dropped.

## Known limitations

- **NLP names**: compromise's people() model is strong but not perfect —
  unusual names or highly domain-specific text can be missed or misidentified.
  All-caps or all-lowercase names are not detected. False positives are surfaced
  for the reviewer to ignore and never crash the app.
- **Scanned PDFs** with no embedded text layer yield no entities (there is no
  text to match); the viewer still renders the pages.
- **Partial-item clipping** is proportional (assumes roughly even glyph widths),
  so a highlight box may be a pixel or two off for proportional fonts.
- All pages render eagerly, which is fine for typical documents but would
  benefit from lazy rendering for very large PDFs.

## Tech

- **React + Vite** for the three-panel state and dev tooling.
- **pdf.js** (`pdfjs-dist`) for rendering and text extraction.
- No backend or network calls; the uploaded PDF never leaves the browser.

## Project structure

```
src/
  pdf/pdfClient.js            # pdf.js worker setup + loadPdf()
  extraction/
    patterns.js               # date + name regexes, stopwords
    extractEntities.js        # offset-index mapping -> entities with rects
  components/
    UploadScreen.jsx
    ThumbnailStrip.jsx / Thumbnail.jsx
    PdfViewer.jsx / PdfPage.jsx
    EntityPanel.jsx
  App.jsx                     # state orchestration
scripts/testPatterns.mjs      # regex sanity checks
```

---

## Thought process & design decisions

### Problem decomposition

The assignment has two largely independent sub-problems: (1) render a PDF faithfully in the browser, and (2) detect and locate sensitive entities precisely enough to draw highlight boxes over them. I kept these as separate modules (`pdf/`, `extraction/`) so each could be developed and tested independently.

### Why React + Vite?

The three-panel layout involves a non-trivial shared state (selected entity IDs, current page, scroll target) that needs to flow in multiple directions — from the panel into the viewer, and from the viewer back into the thumbnail strip. A lightweight component tree with a single `selectedIds` set at the root is the clearest way to express that, and Vite's fast HMR made iteration fast without any configuration overhead.

### Why continuous scroll instead of page-by-page navigation?

Page-flipping feels unnatural for a redaction reviewer who wants to skim context around a detected name. Continuous scroll lets the user see whether a name appears at the bottom of one page and the top of the next without explicitly changing pages. The `IntersectionObserver` on each `PdfPage` drives the active thumbnail passively as the user scrolls, so there is no coordination code needed.

### The core extraction algorithm: offset-index mapping

This was the central engineering challenge. Regexes must run on *continuous text*, but pdf.js decomposes a page into dozens of small "items", each with its own position. Two approaches were considered:

| Approach | Pros | Cons |
|---|---|---|
| Run regexes per item | Simple | Multi-word entities (e.g. "12 January 2024") spanning two items are split and never matched |
| **Concatenate all items, map offsets back** (chosen) | Handles cross-item entities naturally | Requires a mapping layer |

The chosen approach: while concatenating, push `{ start, end, x, y, w, h }` per item into an index array. After matching, walk the index once per match and clip each overlapping segment proportionally. The clipping is O(items per page) — fast enough in practice.

### Coordinate system

pdf.js uses a bottom-left origin. The conversion to CSS top-left is handled by `pdfjsLib.Util.transform(viewport.transform, item.transform)`. Crucially, rects are stored normalised to scale 1; each `PdfPage` multiplies by its current render scale at draw time. This means the overlay stays aligned at any window width without storing or recomputing positions.

### The `hasEOL` line-break bug (found and fixed)

An early version skipped items where `item.str` was empty. pdf.js emits empty items with `hasEOL = true` at every line break — skipping them collapses newlines into spaces, which made the name regex greedily absorb the capitalised first word of the next line ("Alice Wong" + next-line "On March…" → "Alice Wong On"). Fixing this required two changes: (a) always append `\n` when `hasEOL` is true regardless of `item.str`, and (b) change the regex separator from `\s+` to `[ \t]+` (horizontal-only).

### Name detection design

Person name detection uses [compromise](https://github.com/spencermountain/compromise), a lightweight NLP library with a trained English model. `nlp(pageText).people().json({ offset: true })` returns each detected name with a `{ start, length }` character offset that plugs directly into the existing `rectsForSpan()` geometry function — no changes to the highlight pipeline were needed.

Compared to the earlier hand-rolled Title Case regex, compromise understands context: it correctly identifies "John Smith" after "Signed by" while ignoring "United Kingdom" or "New York" in the same document. A single post-filter rejects matches containing em/en dashes (which indicate page headings like "Page Two — Correspondence" rather than person names).

### UI decisions

- **Checkbox select-all with indeterminate state**: the brief's wireframe showed `▢ Show Dates`, implying a checkbox. Implementing it with three states (none/some/all selected) lets a reviewer quickly toggle a whole category when scanning for one entity type. The `indeterminate` state cannot be set via a React prop — it requires an imperative `useRef` + `useEffect`.
- **No pagination** — all pages render eagerly. For the review task this is preferable (no loading gaps mid-document), and realistic review PDFs are short enough that the memory cost is acceptable.
- **Yellow/blue colour scheme** — high contrast against the dark viewer background, distinct from each other at a glance, and semi-transparent so the underlying text remains legible.
- **Loading spinner** — pdf.js parses and extracts text asynchronously; without feedback the drop zone appears to hang for large files. A spinner card replaces the drop zone during parsing.

---

## AI tools used

This project was developed with the assistance of **Claude Code** (Anthropic's AI-powered CLI), using the `claude-sonnet-4-6` model. AI assistance covered the full development lifecycle:

- **Architecture design** — the three-panel layout, state model, and offset-index extraction algorithm were planned conversationally before any code was written.
- **Code generation** — all source files were generated or co-edited in the session, with the developer reviewing and approving each change before it was committed.
- **Debugging** — two non-trivial bugs were diagnosed with AI assistance:
  - The `hasEOL` line-break collapse bug (described above)
  - A scroll-precision issue where clicking an entity scrolled to the page rather than the exact highlight box (fixed by adding `data-entity` attributes to highlight `<div>` elements)
- **Testing** — the `scripts/testPatterns.mjs` sanity-check script and `scripts/verifyExtract.mjs` end-to-end verification script were generated to confirm regex coverage against known inputs.
- **Documentation** — the README extraction rationale and this section were drafted with AI assistance and then reviewed for accuracy.

All commits were reviewed and approved by the developer. The AI acted as an accelerant for implementation detail; architectural choices and acceptance criteria were driven by the developer throughout.
