export type PdfTextItem = {
  pageNumber: number; // 1-based
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  pageWidth: number;
  pageHeight: number;
};

export type ExtractedPage = {
  pageNumber: number; // 1-based
  pageWidth: number;
  pageHeight: number;
  items: PdfTextItem[];
};

