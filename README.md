# Academic PDF Bionic Reader (V1)

Frontend-only tool for **text-based academic PDFs**:

- Extract text + coordinates via `pdf.js`
- Recover reading order for **single-column / double-column** pages
- Reflow into a **single-column HTML** reading view (no layout preservation)
- Apply **Chinese bionic reading** (sentence-boundary-based, bold first `N` Han characters)
- Apply **English bionic reading** (word-based, bold first 40–50% of each word)

## Requirements / non-goals (V1)

- Works with **text PDFs** only (no OCR)
- No PDF export
- No login / payment
- No original layout restoration

## Run locally

1. Install dependencies:
   - `npm install`
2. Start dev server:
   - `npm run dev`
3. Open the printed local URL, upload a PDF, and read in the HTML view.

## Default settings

- Chinese `N = 4` (configurable 2–6)
- Comma/顿号 are always treated as sentence boundaries
- English bolding: 45% per word
