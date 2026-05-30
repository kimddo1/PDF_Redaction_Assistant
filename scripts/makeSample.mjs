// Generates a small multi-page sample PDF with dates and names for manual
// testing. Run with: node scripts/makeSample.mjs
// Requires pdfkit (installed as a devDependency).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import PDFDocument from 'pdfkit';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, '..', 'samples');
fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, 'sample.pdf');

const doc = new PDFDocument({ size: 'A4', margin: 64 });
doc.pipe(fs.createWriteStream(outPath));

const pages = [
  {
    title: 'Confidential Memorandum',
    lines: [
      'Date: 12 January 2024',
      'From: John Smith',
      'To: Alice Wong',
      '',
      'On 03-Feb-2024 the committee, chaired by Mary O’Brien, agreed to',
      'review the case opened on 2024-01-12. A follow-up is scheduled for',
      'February 28, 2024.',
    ],
  },
  {
    title: 'Page Two — Correspondence',
    lines: [
      'Reviewed by Anne-Marie Becker on 5 March 2024.',
      '',
      'Please contact David Lee or Sarah Connor before 15/03/2024.',
      'A second meeting with Robert De Niro is set for March 20, 2024.',
    ],
  },
  {
    title: 'Page Three — Summary',
    lines: [
      'Signed: Michael Jordan',
      'Witnessed: Emma Watson',
      'Filed on 2024-04-01 and amended 02-04-2024.',
    ],
  },
];

pages.forEach((page, i) => {
  if (i > 0) doc.addPage();
  doc.fontSize(20).text(page.title);
  doc.moveDown();
  doc.fontSize(12);
  page.lines.forEach((line) => doc.text(line || ' '));
});

doc.end();
console.log(`Wrote ${outPath}`);
