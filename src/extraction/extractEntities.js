// Entity extraction with text-offset -> geometry mapping.
//
// The core problem: regexes must run on continuous page text, but pdf.js gives
// us text in fragmented "items", each with its own geometry. So for every page
// we build one concatenated string while recording, per item, its [start,end)
// character offset and its bounding box. A regex match then maps its character
// span back to the item(s) it overlaps, producing highlight rectangles.
//
// All rectangles are stored at scale = 1 in CSS coordinates (origin top-left).
// The viewer multiplies them by the current render scale at draw time. The
// PDF -> CSS y-axis flip is handled by pdf.js's viewport.transform.

import { pdfjsLib } from '../pdf/pdfClient.js';
import {
  buildDateRegex,
  buildNameRegex,
  NAME_STOPWORDS,
} from './patterns.js';

let idCounter = 0;
const nextId = () => `e${idCounter++}`;

/**
 * Build the page text + an index mapping character offsets to item geometry.
 * A single space separator is inserted between items so that entities spanning
 * multiple items (e.g. "12 January 2024") are matchable.
 */
function buildPageIndex(textContent, viewport) {
  let text = '';
  const index = []; // { start, end, x, y, w, h }

  for (const item of textContent.items) {
    if (item.str) {
      const start = text.length;
      text += item.str;

      // Map the text-space transform into viewport (top-left origin) space.
      const tx = pdfjsLib.Util.transform(viewport.transform, item.transform);
      const fontHeight = Math.hypot(tx[2], tx[3]);
      index.push({
        start,
        end: text.length,
        x: tx[4],
        y: tx[5] - fontHeight, // tx[5] is the baseline; box top sits a glyph above it
        w: item.width * viewport.scale,
        h: fontHeight,
      });
    }

    // pdf.js emits a separate zero-width item with hasEOL=true at every line
    // break. We must honour it even when the string is empty, otherwise line
    // breaks collapse into spaces and a name greedily joins the next line's
    // first word ("John Smith" + "To:" -> "John Smith To").
    if (item.hasEOL) text += '\n';
    else if (item.str) text += ' ';
  }

  return { text, index };
}

/**
 * Resolve a [matchStart, matchEnd) character span to highlight rectangles.
 * Items partially covered by the match are clipped proportionally so the box
 * hugs the matched substring rather than the whole text run.
 */
function rectsForSpan(matchStart, matchEnd, index) {
  const rects = [];
  for (const seg of index) {
    if (seg.end <= matchStart || seg.start >= matchEnd) continue;
    const len = seg.end - seg.start || 1;
    const from = Math.max(matchStart, seg.start);
    const to = Math.min(matchEnd, seg.end);
    const fracStart = (from - seg.start) / len;
    const fracEnd = (to - seg.start) / len;
    rects.push({
      x: seg.x + seg.w * fracStart,
      y: seg.y,
      w: seg.w * (fracEnd - fracStart),
      h: seg.h,
    });
  }
  return rects;
}

function looksLikeName(text) {
  const words = text.split(/\s+/);
  // Reject if the first word is a stopword (e.g. "Dear John" -> "Dear" leads).
  if (NAME_STOPWORDS.has(words[0])) return false;
  // Reject single-word leftovers (regex requires 2+, but guard anyway).
  return words.length >= 2;
}

function collectMatches(regex, text, type, pageNumber, index, filter) {
  const entities = [];
  for (const match of text.matchAll(regex)) {
    const value = match[0].trim();
    if (filter && !filter(value)) continue;
    const start = match.index;
    const end = start + match[0].length;
    const rects = rectsForSpan(start, end, index);
    if (rects.length === 0) continue;
    entities.push({ id: nextId(), type, text: value, pageNumber, rects });
  }
  return entities;
}

/**
 * Extract date and name entities from every page of a loaded PDF document.
 * @param {import('pdfjs-dist').PDFDocumentProxy} pdfDoc
 * @returns {Promise<Array<{id,type,text,pageNumber,rects}>>}
 */
export async function extractEntities(pdfDoc) {
  idCounter = 0;
  const all = [];

  for (let pageNumber = 1; pageNumber <= pdfDoc.numPages; pageNumber++) {
    const page = await pdfDoc.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1 });
    const textContent = await page.getTextContent();
    const { text, index } = buildPageIndex(textContent, viewport);

    all.push(
      ...collectMatches(buildDateRegex(), text, 'date', pageNumber, index),
      ...collectMatches(buildNameRegex(), text, 'name', pageNumber, index, looksLikeName),
    );

    page.cleanup();
  }

  return all;
}
