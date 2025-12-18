import type { BionicOptions } from "./types";

const SKIP_AT_SENTENCE_START = new Set([
  " ",
  "\t",
  "\n",
  "\r",
  "“",
  "”",
  "‘",
  "’",
  "「",
  "」",
  "『",
  "』",
  "（",
  "）",
  "(",
  ")",
  "[",
  "]",
  "【",
  "】",
  "《",
  "》",
  "—",
  "–",
  "-",
  "·",
  "…",
]);

const SENTENCE_BOUNDARIES = new Set([
  "。",
  "！",
  "？",
  "；",
  "：",
  "，",
  "、",
  ".",
  "!",
  "?",
  ";",
  ":",
  ",",
  "\n",
]);

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function isHan(ch: string): boolean {
  return /\p{Script=Han}/u.test(ch);
}

function isBoundaryChar(ch: string): boolean {
  return SENTENCE_BOUNDARIES.has(ch);
}

function splitEnglishWord(word: string, percent: number): { head: string; tail: string } {
  const p = Math.min(0.5, Math.max(0.4, percent));
  const cut = Math.max(1, Math.min(word.length, Math.ceil(word.length * p)));
  return { head: word.slice(0, cut), tail: word.slice(cut) };
}

/**
 * Applies:
 * - Chinese sentence-boundary-based bionic reading (bold first N Han characters per sentence).
 * - English word-based bionic reading (bold first 40–50% of each word).
 *
 * Output is HTML (escaped, with <strong> tags inserted).
 */
export function bionicHtml(text: string, opts: BionicOptions): string {
  const n = Math.min(6, Math.max(2, Math.floor(opts.chineseBoldN)));
  const englishPercent = opts.englishBoldPercent;

  let out = "";
  let atSentenceStart = true; // new paragraph is a sentence boundary
  let chineseBolded = 0;

  const wordRe = /[A-Za-z][A-Za-z']*/y;
  let i = 0;

  while (i < text.length) {
    const ch = text[i];

    // English word token
    wordRe.lastIndex = i;
    const match = wordRe.exec(text);
    if (match) {
      const word = match[0];
      const { head, tail } = splitEnglishWord(word, englishPercent);
      out += `<strong>${escapeHtml(head)}</strong>${escapeHtml(tail)}`;
      i += word.length;
      continue;
    }

    // Sentence boundary punctuation/newlines
    if (isBoundaryChar(ch)) {
      out += escapeHtml(ch);
      atSentenceStart = true;
      chineseBolded = 0;
      i++;
      continue;
    }

    // Chinese sentence-start scanning + skipping non-content chars
    if (atSentenceStart) {
      if (SKIP_AT_SENTENCE_START.has(ch) || /\s/.test(ch)) {
        out += escapeHtml(ch);
        i++;
        continue;
      }

      if (isHan(ch) && chineseBolded < n) {
        out += `<strong>${escapeHtml(ch)}</strong>`;
        chineseBolded++;
        if (chineseBolded >= n) atSentenceStart = false;
        i++;
        continue;
      }

      // Not a Han character: still ends "sentence start" mode so we don't
      // keep trying to bold across non-Chinese leading tokens.
      atSentenceStart = false;
      out += escapeHtml(ch);
      i++;
      continue;
    }

    out += escapeHtml(ch);
    i++;
  }

  return out;
}
