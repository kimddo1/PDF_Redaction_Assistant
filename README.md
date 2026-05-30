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

**Person names** — a heuristic regex for Title Case sequences of two or more
words, allowing interior apostrophes (`O'Brien`), hyphens (`Anne-Marie`) and
lowercase connectors (`van`, `de`, `von`, …):

```
word = [A-Z](?:[a-z]+ | ['’-][A-Z]?[a-z]+)(['’-][A-Z]?[a-z]+)*
name = word (\s+ (connector\s+)? word){1,3}
```

Matches whose first word is a common non-name (`The`, `Dear`, weekday/month
names, titles like `Mr`/`Dr`, …) are dropped via a small stopword list to
reduce obvious false positives. A `compromise.js` NER pass could be swapped in
behind the same `extractEntities` interface if higher recall were needed.

## Known limitations

- **Heuristic names**: capitalised non-name phrases (e.g. a sentence-initial
  verb, some headings, or product names) can slip through; conversely an
  all-caps or all-lowercase name is missed. This is expected per the brief —
  false positives are surfaced for the reviewer to ignore and never crash the
  app.
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
