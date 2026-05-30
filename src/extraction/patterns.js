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

// Person names: Title Case sequences of two or more words. Allows interior
// apostrophes (O'Brien, D'Angelo), hyphens (Anne-Marie) and short connectors
// (van, de). Matched case-sensitively so it only fires on Capitalised tokens.
// A word is a capital followed by either lowercase letters, or an
// apostrophe/hyphen group (so "O'Brien" stays whole) — never a lone capital.
const NAME_WORD = String.raw`[A-Z](?:[a-z]+|['’\-][A-Z]?[a-z]+)(?:['’\-][A-Z]?[a-z]+)*`;
const NAME_CONNECTOR = String.raw`(?:van|von|de|del|della|der|da|di|la|le|bin|al)`;

export function buildNameRegex() {
  return new RegExp(
    String.raw`\b${NAME_WORD}(?:\s+(?:${NAME_CONNECTOR}\s+)?${NAME_WORD}){1,3}\b`,
    'g',
  );
}

// Common words that survive the Title Case heuristic but are not names.
// Used to reduce obvious false positives without overfitting.
export const NAME_STOPWORDS = new Set([
  'The', 'This', 'That', 'These', 'Those', 'From', 'To', 'For', 'And', 'But',
  'Dear', 'Sincerely', 'Regards', 'Best', 'Page', 'Date', 'Subject', 'Re',
  'Mr', 'Mrs', 'Ms', 'Dr', 'Monday', 'Tuesday', 'Wednesday', 'Thursday',
  'Friday', 'Saturday', 'Sunday', 'January', 'February', 'March', 'April',
  'May', 'June', 'July', 'August', 'September', 'October', 'November',
  'December',
]);
