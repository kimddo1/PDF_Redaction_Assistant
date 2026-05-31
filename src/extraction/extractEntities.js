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

import nlp from 'compromise';
import { pdfjsLib } from '../pdf/pdfClient.js';
import { buildDateRegex } from './patterns.js';

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
 * Collapse artifactual spaces introduced when a PDF encodes individual glyphs
 * as separate text items. Returns a normalized string and an origPos array so
 * that normalized[i] came from text[origPos[i]] — allowing regex match offsets
 * to be translated back to original positions for highlight geometry.
 *
 * Rules (applied in order, cumulative):
 *   "2 7 th"  → "27th"   split day-digits + ordinal suffix
 *   "30 th"   → "30th"   day + separated ordinal suffix
 *   "202 6"   → "2026"   4-digit year split 3+1 across items
 */
function buildNormalizedText(text) {
  const skip = new Set();

  // "2 7 th" → "27th": single digit, space, single digit, space, ordinal
  for (const m of text.matchAll(/\b(\d) (\d) (st|nd|rd|th)\b/gi)) {
    skip.add(m.index + 1);           // space between the two digit characters
    skip.add(m.index + 3);           // space between second digit and ordinal
  }
  // "30 th" → "30th": one or two digits, space, ordinal suffix
  for (const m of text.matchAll(/\b(\d{1,2}) (st|nd|rd|th)\b/gi)) {
    skip.add(m.index + m[1].length); // the space between digits and suffix
  }
  // "202 6" → "2026": three-digit prefix, space, one trailing digit of a year
  for (const m of text.matchAll(/\b(\d{3}) (\d)\b/g)) {
    skip.add(m.index + 3);           // the space inside the split year
  }

  const origPos = [];
  let normalized = '';
  for (let i = 0; i < text.length; i++) {
    if (!skip.has(i)) {
      origPos.push(i);
      normalized += text[i];
    }
  }
  return { normalized, origPos };
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

// Translate a [normStart, normEnd) span in the normalized text back to original
// character positions using the origPos mapping, then resolve to rects.
function rectsForNormSpan(normStart, normEnd, origPos, index) {
  if (normStart >= origPos.length) return [];
  const origStart = origPos[normStart];
  const origEnd = (origPos[Math.min(normEnd, origPos.length) - 1] ?? origPos[origPos.length - 1]) + 1;
  return rectsForSpan(origStart, origEnd, index);
}

function collectNlpNames(normalized, origPos, pageNumber, index) {
  const entities = [];
  for (const match of nlp(normalized).people().json({ offset: true })) {
    // compromise sometimes appends punctuation; strip trailing non-name chars.
    const value = match.text.replace(/[\s.,;:!?()\[\]]+$/, '');
    // em/en dashes appear in headings ("Page Two — Correspondence"), not names.
    if (!value || value.split(/\s+/).length < 2 || /[—–]/.test(value)) continue;
    const normStart = match.offset.start;
    const normEnd = normStart + value.length;
    const rects = rectsForNormSpan(normStart, normEnd, origPos, index);
    if (rects.length === 0) continue;
    entities.push({ id: nextId(), type: 'name', text: value, pageNumber, rects });
  }
  return entities;
}

function collectMatches(regex, normalized, origPos, type, pageNumber, index) {
  const entities = [];
  for (const match of normalized.matchAll(regex)) {
    const value = match[0].trim();
    if (!value) continue;
    const normStart = match.index;
    const normEnd = normStart + match[0].length;
    const rects = rectsForNormSpan(normStart, normEnd, origPos, index);
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
    const { normalized, origPos } = buildNormalizedText(text);

    all.push(
      ...collectMatches(buildDateRegex(), normalized, origPos, 'date', pageNumber, index),
      ...collectNlpNames(normalized, origPos, pageNumber, index),
    );

    page.cleanup();
  }

  return all;
}
