import type { ExtractedPage } from "./types";

export type ReflowedDocument = {
  title: string | null;
  authors: string | null;
  abstractParagraphs: string[];
  bodyParagraphs: string[];
};

type TextLine = {
  y: number;
  xMin: number;
  xMax: number;
  height: number;
  text: string;
};

type PdfItem = ExtractedPage["items"][number];

function shouldDebugReflow(): boolean {
  // Enable by running in DevTools console:
  //   window.__PDF_REFLOW_DEBUG__ = true
  // Then re-upload the PDF.
  return (
    typeof window !== "undefined" &&
    (window as any).__PDF_REFLOW_DEBUG__ === true &&
    // Avoid noisy logs in production builds.
    typeof import.meta !== "undefined" &&
    (import.meta as any).env?.DEV === true
  );
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(p * (sorted.length - 1))));
  return sorted[idx];
}

function isCjk(ch: string): boolean {
  // Unicode Han ideographs.
  return /\p{Script=Han}/u.test(ch);
}

function endsWithHyphen(text: string): boolean {
  return /[-‑–—]$/.test(text.trimEnd());
}

function startsWithLetter(text: string): boolean {
  return /^[A-Za-z]/.test(text.trimStart());
}

function needsSpaceBetween(a: string, b: string): boolean {
  const aTrim = a.trimEnd();
  const bTrim = b.trimStart();
  const last = aTrim.slice(-1);
  const first = bTrim.slice(0, 1);
  if (!last || !first) return false;
  if (isCjk(last) || isCjk(first)) return false;
  if (/\s/.test(last) || /\s/.test(first)) return false;
  if (/[([{"'“‘《【（]/.test(first)) return false;
  if (/[)}\]"'”’》】）]/.test(last)) return false;
  if (/[-‑–—]/.test(last)) return false;
  return /[A-Za-z0-9]/.test(last) && /[A-Za-z0-9]/.test(first);
}

function joinTextPieces(pieces: string[]): string {
  let out = "";
  for (const piece of pieces) {
    if (out === "") {
      out = piece;
      continue;
    }
    out += needsSpaceBetween(out, piece) ? ` ${piece}` : piece;
  }
  return out;
}

function buildLines(items: ExtractedPage["items"]): TextLine[] {
  if (items.length === 0) return [];
  const heights = items.map((i) => i.height).filter((h) => Number.isFinite(h) && h > 0);
  const medH = median(heights) || 10;
  const yTolerance = Math.max(2, medH * 0.6);

  const sorted = [...items].sort((a, b) => (a.y !== b.y ? a.y - b.y : a.x - b.x));
  const lines: { y: number; items: PdfItem[] }[] = [];

  for (const item of sorted) {
    const last = lines.at(-1);
    if (!last || Math.abs(item.y - last.y) > yTolerance) {
      lines.push({ y: item.y, items: [item] });
    } else {
      last.items.push(item);
      last.y = (last.y * (last.items.length - 1) + item.y) / last.items.length;
    }
  }

  return lines
    .map((line) => {
      const lineItems = [...line.items].sort((a, b) => a.x - b.x);
      const text = joinTextPieces(lineItems.map((i) => i.text));
      const xMin = Math.min(...lineItems.map((i) => i.x));
      const xMax = Math.max(...lineItems.map((i) => i.x + (i.width ?? 0)));
      const height = median(lineItems.map((i) => i.height));
      return { y: line.y, xMin, xMax, height, text };
    })
    .filter((l) => l.text.replace(/\s+/g, "") !== "");
}

function stripAbstractHeading(lineText: string): string {
  return lineText
    .replace(/^\s*(摘要|Abstract)\s*[:：]?\s*/i, "")
    .trim();
}

function looksLikeSectionHeading(text: string): boolean {
  // Minimal heuristic: "1 Introduction", "2.1 ...", "引言", "参考文献", etc.
  const t = text.trim();
  if (t === "") return false;
  if (/^(引言|参考文献|致谢|结论)\b/.test(t)) return true;
  return /^\d+(\.\d+)*\s+\S+/.test(t);
}

type ColumnMode =
  | { type: "single" }
  | { type: "double"; splitX: number; leftCenter: number; rightCenter: number };

function detectColumns(lines: TextLine[], pageWidth: number): ColumnMode {
  // Heuristic: exclude very wide (likely full-width / merged) lines from clustering,
  // because their xMin values can dominate the distribution and mask 2-column structure.
  const narrowLines = lines.filter((l) => (l.xMax - l.xMin) / pageWidth <= 0.75);
  const clusteringLines = narrowLines.length >= 8 ? narrowLines : lines;

  if (clusteringLines.length < 8) return { type: "single" };
  const xs = clusteringLines.map((l) => l.xMin);
  const c1Init = percentile(xs, 0.25);
  const c2Init = percentile(xs, 0.75);
  let c1 = Math.min(c1Init, c2Init);
  let c2 = Math.max(c1Init, c2Init);

  for (let iter = 0; iter < 10; iter++) {
    const g1: number[] = [];
    const g2: number[] = [];
    for (const x of xs) {
      (Math.abs(x - c1) <= Math.abs(x - c2) ? g1 : g2).push(x);
    }
    if (g1.length === 0 || g2.length === 0) return { type: "single" };
    c1 = g1.reduce((a, b) => a + b, 0) / g1.length;
    c2 = g2.reduce((a, b) => a + b, 0) / g2.length;
    if (c1 > c2) [c1, c2] = [c2, c1];
  }

  const separation = c2 - c1;
  const minClusterSize = Math.min(
    clusteringLines.filter((l) => l.xMin <= (c1 + c2) / 2).length,
    clusteringLines.filter((l) => l.xMin > (c1 + c2) / 2).length,
  );

  if (separation < pageWidth * 0.25) return { type: "single" };
  if (minClusterSize < clusteringLines.length * 0.2) return { type: "single" };

  return { type: "double", splitX: (c1 + c2) / 2, leftCenter: c1, rightCenter: c2 };
}

function linesToParagraphs(lines: TextLine[]): string[] {
  if (lines.length === 0) return [];
  const sorted = [...lines].sort((a, b) => a.y - b.y);
  const gaps = [];
  for (let i = 1; i < sorted.length; i++) gaps.push(sorted[i].y - sorted[i - 1].y);
  const typicalGap = median(gaps.filter((g) => g > 0)) || 10;

  const paragraphs: string[] = [];
  let current = "";

  for (let i = 0; i < sorted.length; i++) {
    const line = sorted[i];
    const prevLine = i > 0 ? sorted[i - 1] : null;
    const gap = prevLine ? line.y - prevLine.y : 0;
    const newParagraph = !prevLine || gap > typicalGap * 1.6;

    if (newParagraph) {
      if (current.trim() !== "") paragraphs.push(current.trim());
      current = line.text.trim();
      continue;
    }

    const nextPiece = line.text.trim();
    if (current === "") {
      current = nextPiece;
      continue;
    }

    if (endsWithHyphen(current) && startsWithLetter(nextPiece)) {
      current = current.trimEnd().replace(/[-‑–—]$/, "") + nextPiece.trimStart();
      continue;
    }

    current += needsSpaceBetween(current, nextPiece) ? ` ${nextPiece}` : nextPiece;
  }

  if (current.trim() !== "") paragraphs.push(current.trim());
  return paragraphs;
}

export function reflowAcademicPdf(pages: ExtractedPage[]): ReflowedDocument {
  const titleLines: TextLine[] = [];
  const authorLines: TextLine[] = [];
  const abstractLines: TextLine[] = [];

  const bodyParagraphs: string[] = [];
  const abstractParagraphs: string[] = [];

  const debug = shouldDebugReflow();

  for (const page of pages) {
    const lines = buildLines(page.items);
    const heights = lines.map((l) => l.height).filter((h) => Number.isFinite(h) && h > 0);
    const medH = median(heights) || 10;

    const footerLines = lines.filter((l) => {
      const yNorm = l.y / page.pageHeight;
      if (yNorm > 0.88) return true;
      if (yNorm > 0.75 && l.height < medH * 0.85) return true;
      return false;
    });

    const nonFooterLines = lines.filter((l) => !footerLines.includes(l));

    if (page.pageNumber === 1) {
      const topLines = nonFooterLines.filter((l) => l.y / page.pageHeight < 0.22);
      const titleCandidate = topLines.filter((l) => l.height > medH * 1.25);
      titleLines.push(...titleCandidate);

      const afterTitle = topLines.filter((l) => !titleCandidate.includes(l));
      authorLines.push(
        ...afterTitle.filter((l) => l.height >= medH * 0.9 && l.height <= medH * 1.25),
      );

      const abstractHeadIdx = nonFooterLines.findIndex(
        (l) =>
          l.y / page.pageHeight < 0.5 &&
          /\bAbstract\b/i.test(l.text) &&
          l.text.trim().length <= 40,
      );
      const zhHeadIdx = nonFooterLines.findIndex(
        (l) => l.y / page.pageHeight < 0.5 && /摘要/.test(l.text) && l.text.trim().length <= 40,
      );
      const headIdx = abstractHeadIdx >= 0 ? abstractHeadIdx : zhHeadIdx;

      if (headIdx >= 0) {
        const headLine = nonFooterLines[headIdx];
        const headY = headLine.y;

        for (let i = headIdx; i < nonFooterLines.length; i++) {
          const l = nonFooterLines[i];
          if (l.y <= headY) continue;
          if (l.y / page.pageHeight > 0.65) break;
          if (looksLikeSectionHeading(l.text)) break;
          abstractLines.push(l);
        }

        // If the heading line also contains content (e.g. "摘要：..."), keep it.
        const maybeInline = stripAbstractHeading(headLine.text);
        if (maybeInline) abstractLines.unshift({ ...headLine, text: maybeInline });
      }
    }

    // BODY: remove title/authors/abstract/footer from reading flow.
    const excluded = new Set<TextLine>();
    if (page.pageNumber === 1) {
      for (const l of titleLines) excluded.add(l);
      for (const l of authorLines) excluded.add(l);
      for (const l of abstractLines) excluded.add(l);
    }

    const bodyLinesRaw = nonFooterLines.filter((l) => !excluded.has(l));
    const bodyLines = bodyLinesRaw.filter((l) => {
      const yNorm = l.y / page.pageHeight;
      return yNorm > 0.12 && yNorm < 0.9;
    });

    const mode = detectColumns(bodyLines, page.pageWidth);

    if (debug && page.pageNumber >= 2) {
      const narrowForClustering = bodyLines.filter(
        (l) => (l.xMax - l.xMin) / page.pageWidth <= 0.75,
      );
      const clusteringLines = narrowForClustering.length >= 8 ? narrowForClustering : bodyLines;
      const xs = clusteringLines.map((l) => l.xMin);
      const xMinSorted = [...xs].sort((a, b) => a - b);
      const xMinMedian = xMinSorted.length > 0 ? median(xMinSorted) : NaN;
      const xMinMin = xMinSorted.length > 0 ? xMinSorted[0] : NaN;
      const xMinMax = xMinSorted.length > 0 ? xMinSorted[xMinSorted.length - 1] : NaN;

      const wideLines = bodyLines
        .map((l) => ({
          xMin: l.xMin,
          xMax: l.xMax,
          width: l.xMax - l.xMin,
          text: l.text,
        }))
        .filter((l) => l.width / page.pageWidth > 0.75);

      // eslint-disable-next-line no-console
      console.log(`[reflow][page ${page.pageNumber}] counts`, {
        lines: lines.length,
        footerLines: footerLines.length,
        bodyLines: bodyLines.length,
        narrowForClustering: narrowForClustering.length,
        clusteringLines: clusteringLines.length,
        mode,
      });
      // eslint-disable-next-line no-console
      console.log(`[reflow][page ${page.pageNumber}] xMin stats (clusteringLines)`, {
        min: xMinMin,
        median: xMinMedian,
        max: xMinMax,
      });
      // eslint-disable-next-line no-console
      console.log(
        `[reflow][page ${page.pageNumber}] first 15 xMin+text (clusteringLines)`,
        clusteringLines.slice(0, 15).map((l) => ({
          xMin: l.xMin,
          y: l.y,
          text: l.text.slice(0, 12),
        })),
      );
      // eslint-disable-next-line no-console
      console.log(`[reflow][page ${page.pageNumber}] wide lines in bodyLines (>75%)`, wideLines);
    }

    const orderedLines =
      mode.type === "double"
        ? [
            ...bodyLines.filter((l) => l.xMin <= mode.splitX).sort((a, b) => a.y - b.y),
            ...bodyLines.filter((l) => l.xMin > mode.splitX).sort((a, b) => a.y - b.y),
          ]
        : [...bodyLines].sort((a, b) => a.y - b.y);

    bodyParagraphs.push(...linesToParagraphs(orderedLines));

    const noteParagraphs = linesToParagraphs(footerLines.sort((a, b) => a.y - b.y));
    if (noteParagraphs.length > 0) {
      bodyParagraphs.push("【附注】");
      bodyParagraphs.push(...noteParagraphs);
    }
  }

  if (abstractLines.length > 0) {
    abstractParagraphs.push(...linesToParagraphs(abstractLines.sort((a, b) => a.y - b.y)));
  }

  const title = titleLines.length > 0 ? joinTextPieces(titleLines.map((l) => l.text)) : null;
  const authors = authorLines.length > 0 ? joinTextPieces(authorLines.map((l) => l.text)) : null;

  return { title, authors, abstractParagraphs, bodyParagraphs };
}
