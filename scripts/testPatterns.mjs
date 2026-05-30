// Lightweight, dependency-free sanity check for the date/name patterns.
// Run with: node scripts/testPatterns.mjs
import { buildDateRegex, buildNameRegex, NAME_STOPWORDS } from '../src/extraction/patterns.js';

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

function names(input) {
  return [...input.matchAll(buildNameRegex())]
    .map((m) => m[0])
    .filter((n) => !NAME_STOPWORDS.has(n.split(/\s+/)[0]));
}

const nameSamples = [
  ['Signed by John Smith and Alice Wong.', ['John Smith', 'Alice Wong']],
  ['Please contact Mary O’Brien today.', ['Mary O’Brien']],
  ['Reviewed by Anne-Marie Becker.', ['Anne-Marie Becker']],
  ['The Quick report', []], // "The" stopword-led
  ['no names', []],
];

for (const [input, want] of nameSamples) {
  expect(`name: "${input}"`, names(input), want);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
