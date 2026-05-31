// Sanity check for date patterns.
// Name detection now uses compromise NLP -- tested via scripts/verifyExtract.mjs.
// Run with: node scripts/testPatterns.mjs
import { buildDateRegex } from '../src/extraction/patterns.js';

let passed = 0;
let failed = 0;

function expect(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) {
    passed++;
  } else {
    failed++;
    console.error(`✗ ${label}\n    got:  ${JSON.stringify(got)}\n    want: ${JSON.stringify(want)}`);
  }
}

const dateSamples = [
  ['12/01/2024', ['12/01/2024']],
  ['03-Feb-2024', ['03-Feb-2024']],
  ['January 12, 2024', ['January 12, 2024']],
  ['12 January 2024', ['12 January 2024']],
  ['2024-01-12', ['2024-01-12']],
  ['Meeting on 3 Feb 2024 and 03-02-2024.', ['3 Feb 2024', '03-02-2024']],
  ['no dates here', []],
];

for (const [input, want] of dateSamples) {
  const got = [...input.matchAll(buildDateRegex())].map((m) => m[0]);
  expect(`date: "${input}"`, got, want);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
