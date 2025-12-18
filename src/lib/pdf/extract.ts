import { pdfjsLib } from "./pdfjs";
import type { ExtractedPage, PdfTextItem } from "./types";

function isRenderableText(text: string): boolean {
  // Skip empty / whitespace-only items.
  return text.replace(/\s+/g, "") !== "";
}

export async function extractPagesFromPdf(file: File): Promise<ExtractedPage[]> {
  const buffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(buffer) });
  const pdf = await loadingTask.promise;

  const pages: ExtractedPage[] = [];

  for (let pageIndex = 1; pageIndex <= pdf.numPages; pageIndex++) {
    const page = await pdf.getPage(pageIndex);
    const viewport = page.getViewport({ scale: 1 });
    const textContent = await page.getTextContent();

    const items: PdfTextItem[] = [];

    for (const raw of textContent.items) {
      if (!("str" in raw) || typeof raw.str !== "string") continue;
      const text = raw.str;
      if (!isRenderableText(text)) continue;

      // Convert item transform into viewport coordinates so x/y increase right/down.
      const m = pdfjsLib.Util.transform(viewport.transform, raw.transform);
      const x = m[4];
      const y = m[5];

      // Estimate glyph box from the transform.
      const height = Math.hypot(m[2], m[3]);
      const width = raw.width ?? 0;

      items.push({
        pageNumber: pageIndex,
        text,
        x,
        y,
        width,
        height,
        pageWidth: viewport.width,
        pageHeight: viewport.height,
      });
    }

    pages.push({
      pageNumber: pageIndex,
      pageWidth: viewport.width,
      pageHeight: viewport.height,
      items,
    });
  }

  return pages;
}

