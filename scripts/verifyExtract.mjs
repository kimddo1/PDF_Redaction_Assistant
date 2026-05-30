// Deterministic, Node-based end-to-end check of extraction against the sample
// PDF. Mirrors buildPageIndex/rectsForSpan from src/extraction/extractEntities
// (the browser build pulls in a Vite ?url worker import, so we replicate the
// pure logic here) and uses the REAL patterns from src/extraction/patterns.js.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import {
  buildDateRegex,
  buildNameRegex,
  NAME_STOPWORDS,
} from '../src/extraction/patterns.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pdfPath = path.join(__dirname, '..', 'public', 'sample.pdf');

function buildPageIndex(items) {
  let text = '';
  const index = [];
  for (const item of items) {
    if (item.str) {
      const start = text.length;
      text += item.str;
      index.push({ start, end: text.length });
    }
    if (item.hasEOL) text += '\n';
    else if (item.str) text += ' ';
  }
  return { text, index };
}

function rectsForSpan(s, e, index) {
  return index.filter((seg) => !(seg.end <= s || seg.start >= e));
}

function looksLikeName(t) {
  const w = t.split(/\s+/);
  return !NAME_STOPWORDS.has(w[0]) && w.length >= 2;
}

const data = new Uint8Array(fs.readFileSync(pdfPath));
const doc = await getDocument({ data }).promise;

const results = { dates: [], names: [] };
for (let p = 1; p <= doc.numPages; p++) {
  const page = await doc.getPage(p);
  const tc = await page.getTextContent();
  const { text, index } = buildPageIndex(tc.items);

  for (const m of text.matchAll(buildDateRegex())) {
    if (rectsForSpan(m.index, m.index + m[0].length, index).length)
      results.dates.push(`p${p}:${m[0].trim()}`);
  }
  for (const m of text.matchAll(buildNameRegex())) {
    const v = m[0].trim();
    if (!looksLikeName(v)) continue;
    if (rectsForSpan(m.index, m.index + m[0].length, index).length)
      results.names.push(`p${p}:${v}`);
  }
}

console.log(`numPages: ${doc.numPages}`);
console.log(`\nDATES (${results.dates.length}):`);
results.dates.forEach((d) => console.log('  ' + d));
console.log(`\nNAMES (${results.names.length}):`);
results.names.forEach((n) => console.log('  ' + n));
