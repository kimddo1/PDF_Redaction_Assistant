# PDF Redaction Assistant

A three-panel, fully client-side web app that lets a reviewer upload a PDF,
automatically detect **dates** and **person names**, and see them highlighted
in a live PDF viewer before deciding what to redact.

No backend, no external API — everything runs in the browser.

## Setup

Requires Node 18+.

```bash
npm install
npm run dev
```

Then open the printed local URL and drop in any PDF.

To run the date-pattern sanity checks:

```bash
node scripts/testPatterns.mjs
```

## How it works

### Three-panel layout

| Panel | Responsibility |
| ----- | -------------- |
| **Left** (`ThumbnailStrip`) | Renders a thumbnail per page. Click to jump; the page currently in view is highlighted via an `IntersectionObserver`. |
| **Centre** (`PdfViewer` / `PdfPage`) | Continuous vertical scroll of every page (canvas + absolutely-positioned highlight overlay). Scrolls to and highlights the selected entity. |
| **Right** (`EntityPanel`) | Collapsible **Show Dates** / **Show Names** sections listing every detected instance with its page number and a count badge. Checkbox header selects/deselects the whole category at once. Click an item to highlight + scroll to it. |

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

App state is just `pdfDoc`, `entities`, `selectedIds` (a `Set`, so multiple
highlights show at once), `currentPage`, and a `scrollTarget`. The viewer
derives per-page overlays from `selectedIds`; the panel filters on `type`.

### Entity extraction

Regexes need to run on *continuous* text, but pdf.js returns text in fragmented
"items", each with its own position. For every page we:

1. Concatenate all item strings into one page string, inserting a space
   (or newline on `hasEOL`) between items, while recording each item's
   `[start, end)` character offset and its bounding box.
2. Normalise artifactual spaces introduced when a PDF encodes individual glyphs
   as separate items (e.g. `"30 th June 202 6"` → `"30th June 2026"`), while
   building an `origPos[]` array to map normalised offsets back to original
   positions.
3. Run the date regex and compromise NLP on the normalised string.
4. Map each match's character span through `origPos[]` back to the original
   index, clipping partially-covered items proportionally, to produce highlight
   rectangles.

Boxes are stored at scale 1 in CSS (top-left origin) coordinates; the PDF's
bottom-left origin is converted using `pdfjsLib.Util.transform`. The viewer
multiplies stored rects by the render scale at draw time, so highlights stay
aligned at any zoom level.

See `src/extraction/extractEntities.js` and `src/extraction/patterns.js`.

### Patterns matched

**Dates** (case-insensitive):

| Format | Example |
| ------ | ------- |
| ISO `YYYY-MM-DD` | `2024-01-12` |
| `DD/MM/YYYY`, `DD-MM-YYYY`, `DD-Mon-YYYY` | `12/01/2024`, `03-Feb-2024` |
| `Month DD, YYYY` | `January 12, 2024` |
| `DD Month YYYY` | `12 January 2024` |
| `Month YYYY` | `Sep 2022`, `January 2024` |

**Person names** — detected using [compromise](https://github.com/spencermountain/compromise)
NLP. `nlp(pageText).people().json({ offset: true })` returns contextually
identified person names with character offsets that map directly into the
highlight geometry pipeline. Post-filters reject:
- Matches containing em/en dashes (page headings like "Page Two — Correspondence")
- Matches whose first character is lowercase (compromise occasionally misfires
  on lowercase common-word pairs; person names in formal documents always start
  with a capital)
- Single-word matches

## Known limitations

- **Non-English names**: compromise is trained on English text and may miss
  names from other languages or naming conventions (e.g. Korean family-name-first
  order). False positives are surfaced for the reviewer to dismiss; false
  negatives are silent misses.
- **Scanned PDFs** with no embedded text layer render correctly but yield no
  entities — there is no text to match.
- **Proportional-font clipping**: highlight boxes are width-clipped by character
  fraction, assuming roughly even glyph widths. May be a pixel or two off for
  highly variable fonts.
- All pages render eagerly — fine for typical review documents, but very large
  PDFs would benefit from lazy per-page rendering.

## Tech

- **React + Vite** — three-panel state management and dev tooling.
- **pdf.js** (`pdfjs-dist`) — PDF rendering and text extraction.
- **compromise** — lightweight NLP for person name detection.
- No backend or network calls; the uploaded PDF never leaves the browser.

## Project structure

```
src/
  pdf/pdfClient.js            # pdf.js worker setup + loadPdf()
  extraction/
    patterns.js               # date regexes (Month YYYY through ISO)
    extractEntities.js        # page-index build, normalization, offset mapping
  components/
    UploadScreen.jsx
    ThumbnailStrip.jsx / Thumbnail.jsx
    PdfViewer.jsx / PdfPage.jsx
    EntityPanel.jsx
  App.jsx                     # state orchestration
scripts/
  testPatterns.mjs            # date regex sanity checks (node scripts/testPatterns.mjs)
  verifyExtract.mjs           # end-to-end extraction check against public/sample.pdf
  makeSample.mjs              # generates public/sample.pdf via pdfkit
public/
  sample.pdf                  # three-page demo document with known entities
```

---

## Thought process & design decisions

### Problem decomposition

The assignment splits cleanly into two independent sub-problems: (1) render a
PDF faithfully in the browser, and (2) detect and locate sensitive entities
precisely enough to draw highlight boxes over them. Keeping these as separate
modules (`pdf/`, `extraction/`) let each be developed and tested independently.

### Why React + Vite?

The three-panel layout involves non-trivial shared state (`selectedIds`,
`currentPage`, `scrollTarget`) that flows in multiple directions. A lightweight
component tree with a single state root is the clearest way to model this, and
Vite's fast HMR made iteration tight.

### Why continuous scroll instead of page-by-page navigation?

Continuous scroll lets a reviewer see context around an entity without
explicitly navigating pages. The `IntersectionObserver` on each `PdfPage` drives
the active thumbnail passively as the user scrolls — no coordination code needed.

### The core extraction algorithm: offset-index mapping

Regexes must run on *continuous text*, but pdf.js decomposes a page into dozens
of small items, each with its own geometry. Two approaches were considered:

| Approach | Pros | Cons |
|---|---|---|
| Regex per item | Simple | Multi-word entities spanning two items are never matched |
| **Concatenate + map offsets back** (chosen) | Handles cross-item entities | Requires a mapping layer |

While concatenating, each item's `[start, end)` character offset and bounding
box are pushed into an index array. After matching, the index is walked once per
match, clipping overlapping segments proportionally. O(items per page) — fast in
practice.

### PDF glyph-split normalisation

Some PDFs (especially those produced by design tools) encode each glyph or small
cluster as its own text item, causing pdf.js to yield strings like
`"30 th June 202 6"` instead of `"30th June 2026"`. The `buildNormalizedText()`
function collapses three artifact patterns:

| Artifact | Example |
|---|---|
| Split ordinal suffix | `"30 th"` → `"30th"` |
| Split day + ordinal | `"2 7 th"` → `"27th"` |
| Split year (3 + 1 digits) | `"202 6"` → `"2026"` |

It returns the normalised string alongside an `origPos[]` mapping so that every
match offset translates back to the original geometry index — highlight boxes
remain correctly placed despite the collapsing.

### The `hasEOL` line-break bug

pdf.js emits empty items with `hasEOL = true` at every line break. An early
version skipped items where `item.str` was empty, collapsing line breaks into
spaces. This caused the name matcher to absorb the capitalised first word of the
next line ("Alice Wong" + next-line "To:" → "Alice Wong To"). Fix: always append
`\n` when `hasEOL` is set, regardless of `item.str`.

### Name detection: from regex heuristic to NLP

The initial approach was a hand-rolled Title Case regex with a stopword filter.
This produced many false positives (headings, sentence-initial phrases) because
it had no semantic understanding. It was replaced with
[compromise](https://github.com/spencermountain/compromise)'s `.people()`, which
uses a trained English model and understands context — "John Smith" after "Signed
by" is a person; "United Kingdom" is not. Two lightweight post-filters handle
known model edge cases: an em-dash guard (headings) and a first-character
uppercase guard (occasional lowercase misfires).

### UI decisions

- **Checkbox select-all with indeterminate state** — three states (none / some /
  all) let a reviewer toggle a whole category at once. The `indeterminate` state
  cannot be set via a React prop; it requires an imperative `useRef` + `useEffect`.
- **Yellow / blue highlights** — high contrast on the dark viewer background,
  semi-transparent so the underlying text stays legible.
- **Loading spinner** — pdf.js parses asynchronously; without feedback the drop
  zone appears to hang. A spinner card replaces it during parsing.

---

## AI tools used

This project was developed with the assistance of **Claude Code** (Anthropic's
AI-powered CLI), `claude-sonnet-4-6` model. AI assistance covered the full
development lifecycle:

- **Architecture** — three-panel layout, state model, and offset-index extraction
  algorithm were planned conversationally before any code was written.
- **Code generation** — all source files were generated or co-edited in the
  session, with the developer reviewing and approving each change before it was
  committed.
- **Debugging** — several non-trivial bugs were diagnosed with AI assistance,
  including the `hasEOL` line-break collapse, a scroll-precision issue (fixed by
  adding `data-entity` attributes to highlight elements), and PDF glyph-split
  artifacts causing date misdetection.
- **Iterative improvement** — name detection was upgraded from a regex heuristic
  to compromise NLP mid-project after testing against real documents revealed the
  heuristic's limitations.
- **Testing** — `scripts/testPatterns.mjs` and `scripts/verifyExtract.mjs` were
  generated to confirm coverage against known inputs.
- **Documentation** — README drafted with AI assistance and reviewed for accuracy.

All commits were reviewed and approved by the developer. The AI acted as an
accelerant for implementation detail; architectural choices and acceptance
criteria were driven by the developer throughout.
