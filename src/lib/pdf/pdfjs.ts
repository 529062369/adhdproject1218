import * as pdfjsLib from "pdfjs-dist";

// pdf.js worker setup for Vite.
// This is required; otherwise parsing PDFs will be very slow and may fail in some browsers.
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

export { pdfjsLib };

