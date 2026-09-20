'use strict';

/**
 * Echo Parser
 * Parses daily notes and extracts timestamped, tagged log entries.
 *
 * Entry format:
 *   #### HH:MM #tag
 *   Content here...
 *   More content...
 *
 * Everything between one separator heading and the next belongs to that entry.
 */

const DEFAULT_SEPARATOR = 'h6';

/**
 * @typedef {Object} EchoEntry
 * @property {string} date       - YYYY-MM-DD normalized date
 * @property {string} time       - HH:MM from the heading
 * @property {string} tag        - the #tag found in the heading (without #)
 * @property {string} content    - trimmed text content of the block
 * @property {string} sourceFile - vault path of the daily note
 * @property {string} heading    - the raw heading line (for linking)
 */

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Try to extract a normalized YYYY-MM-DD date from a filename basename.
 * Supports:
 *   - YYYY-MM-DD  → 2026-03-23
 *   - YYMMDD      → 260323  → 2026-03-23
 *   - YYYYMMDD    → 20260323 → 2026-03-23
 *
 * Returns null if no pattern matches.
 *
 * @param {string} basename - filename without extension
 * @returns {string|null}
 */
function extractDate(basename) {
  // Strip anything after a space (e.g. "260320 - Gastro")
  const clean = basename.split(' ')[0].trim();

  // YYYY-MM-DD
  let m = clean.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;

  // YYYYMMDD
  m = clean.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;

  // YYMMDD  → assume 20YY
  m = clean.match(/^(\d{2})(\d{2})(\d{2})$/);
  if (m) return `20${m[1]}-${m[2]}-${m[3]}`;

  return null;
}

/**
 * Parse a single daily note's content into EchoEntry objects.
 *
 * @param {string} content     - raw markdown content of the daily note
 * @param {string} date        - YYYY-MM-DD (normalized)
 * @param {string} sourceFile  - vault path
 * @param {string} separator   - 'h4' (default) or h1–h6
 * @returns {EchoEntry[]}
 */
function parseNote(content, date, sourceFile, separator = DEFAULT_SEPARATOR) {
  const entries = [];
  const lines = content.split('\n');
  const levelMap = { h1: 1, h2: 2, h3: 3, h4: 4, h5: 5, h6: 6 };
  const level = levelMap[separator];

  if (!level) return entries;

  const hashes = '#'.repeat(level);
  // Heading pattern: #### [any text] — must contain a #tag somewhere
  const headingPrefix = new RegExp(`^${hashes}\\s+(.+)`);
  const timeRe = /\b(\d{1,2}:\d{2})\b/;
  const tagRe = /#([\w/-]+)/;

  let currentEntry = null;
  let contentLines = [];

  const flushEntry = () => {
    if (currentEntry) {
      currentEntry.content = contentLines.join('\n').trim();
      // Allow empty content entries — the tag + timestamp is already meaningful
      entries.push(currentEntry);
      currentEntry = null;
      contentLines = [];
    }
  };

  for (const line of lines) {
    const headMatch = line.match(headingPrefix);
    if (headMatch) {
      const rest = headMatch[1].trim();
      const tagMatch = rest.match(tagRe);
      if (!tagMatch) {
        // Same-level heading but no tag — close the current entry
        flushEntry();
        continue;
      }
      flushEntry();
      const timeMatch = rest.match(timeRe);
      currentEntry = {
        date,
        time: timeMatch ? timeMatch[1] : '',
        tag: tagMatch[1],
        content: '',
        sourceFile,
        heading: line.trim(),
      };
    } else if (currentEntry) {
      contentLines.push(line);
    }
  }

  flushEntry();
  return entries;
}

/**
 * Format a date + time into the Echo compact timestamp: YYMMDD-HH:MM
 * e.g. 2026-03-23 + 16:30 → 260323-16:30
 *
 * @param {string} date - YYYY-MM-DD
 * @param {string} time - HH:MM
 * @returns {string}
 */
function formatTimestamp(date, time) {
  // YYYY-MM-DD → YYMMDD
  const compact = date.replace(/-/g, '').slice(2);
  return time ? `${compact}-${time}` : compact;
}

/**
 * Build the Obsidian URI to open a daily note.
 *
 * @param {string} vaultName
 * @param {string} sourceFile - vault-relative path
 * @returns {string}
 */
function buildObsidianLink(vaultName, sourceFile) {
  const file = encodeURIComponent(sourceFile.replace(/\.md$/, ''));
  return `obsidian://open?vault=${encodeURIComponent(vaultName)}&file=${file}`;
}

module.exports = { parseNote, formatTimestamp, buildObsidianLink, extractDate, DEFAULT_SEPARATOR };
