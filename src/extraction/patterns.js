// Regex patterns for entity extraction.
//
// Each date format is kept as its own named, documented pattern so the README
// can reference them directly and so they can be tested in isolation. They are
// combined into a single alternation (ordered most-specific first) for matching.

const MONTHS =
  '(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|' +
  'Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)';

export const DATE_PATTERNS = {
  // ISO 8601: 2024-01-12
  iso: String.raw`\b\d{4}-\d{2}-\d{2}\b`,

  // DD/MM/YYYY or DD-MM-YYYY, and DD-Mon-YYYY (e.g. 12/01/2024, 03-Feb-2024)
  numericOrShortMonth: String.raw`\b\d{1,2}[\/\-](?:\d{1,2}|${MONTHS})[\/\-]\d{2,4}\b`,

  // Month DD, YYYY (e.g. January 12, 2024)
  monthDayYear: String.raw`\b${MONTHS}\.?\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4}\b`,

  // DD Month YYYY (e.g. 12 January 2024)
  dayMonthYear: String.raw`\b\d{1,2}(?:st|nd|rd|th)?\s+${MONTHS}\.?\s+\d{4}\b`,
};

/** Single combined date regex (global, case-insensitive). */
export function buildDateRegex() {
  const combined = Object.values(DATE_PATTERNS).join('|');
  return new RegExp(combined, 'gi');
}

