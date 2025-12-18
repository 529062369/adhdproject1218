import { useMemo, useState } from "react";
import type { ReflowedDocument } from "./lib/pdf/reflow";
import { reflowAcademicPdf } from "./lib/pdf/reflow";
import { extractPagesFromPdf } from "./lib/pdf/extract";
import { bionicHtml } from "./lib/bionic/apply";
import type { BionicOptions } from "./lib/bionic/types";

const DEFAULT_OPTS: BionicOptions = {
  chineseBoldN: 4,
  englishBoldPercent: 0.45,
};

function clampN(n: number): number {
  if (!Number.isFinite(n)) return 4;
  return Math.min(6, Math.max(2, Math.floor(n)));
}

export default function App() {
  const [doc, setDoc] = useState<ReflowedDocument | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [opts, setOpts] = useState<BionicOptions>(DEFAULT_OPTS);

  const canReset = doc !== null || fileName !== null || error !== null;

  async function onPickFile(file: File | null) {
    setError(null);
    setDoc(null);
    setFileName(file?.name ?? null);

    if (!file) return;

    setBusy(true);
    try {
      const pages = await extractPagesFromPdf(file);
      const reflowed = reflowAcademicPdf(pages);
      setDoc(reflowed);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const reader = useMemo(() => {
    if (!doc) return null;

    const renderParagraph = (text: string, key: string) => {
      if (text.trim() === "【附注】") {
        return (
          <h2 key={key} className="noteBox">
            【附注】
          </h2>
        );
      }

      return (
        <p
          key={key}
          className={text.trimStart().startsWith("【") ? "noteBox" : undefined}
          dangerouslySetInnerHTML={{ __html: bionicHtml(text, opts) }}
        />
      );
    };

    return (
      <div className="reader card">
        {doc.title ? <h1>{doc.title}</h1> : <h1>Reading View</h1>}
        {doc.authors ? <p className="authors">{doc.authors}</p> : null}

        {doc.abstractParagraphs.length > 0 ? (
          <>
            <h2>摘要 / Abstract</h2>
            {doc.abstractParagraphs.map((p, idx) => renderParagraph(p, `abs-${idx}`))}
          </>
        ) : null}

        <h2>正文</h2>
        {doc.bodyParagraphs.map((p, idx) => renderParagraph(p, `body-${idx}`))}
      </div>
    );
  }, [doc, opts]);

  return (
    <div className="container">
      <h1 style={{ margin: "0 0 10px 0" }}>Academic PDF Bionic Reader (V1)</h1>
      <p className="muted" style={{ marginTop: 0 }}>
        Frontend-only: upload a text-based academic PDF, reflow into single-column reading order, then
        apply Chinese/English bionic reading.
      </p>

      <div className="card">
        <div className="row">
          <input
            type="file"
            accept="application/pdf"
            disabled={busy}
            onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
          />
          <div className="spacer" />
          <button
            type="button"
            disabled={!canReset || busy}
            onClick={() => {
              setDoc(null);
              setFileName(null);
              setError(null);
            }}
          >
            Reset
          </button>
        </div>

        <div className="row" style={{ marginTop: 12 }}>
          <label className="row" style={{ gap: 8 }}>
            <span className="muted">Chinese N (2–6)</span>
            <input
              type="number"
              min={2}
              max={6}
              value={opts.chineseBoldN}
              disabled={busy}
              onChange={(e) =>
                setOpts((o) => ({ ...o, chineseBoldN: clampN(Number(e.target.value)) }))
              }
            />
          </label>

          <div className="spacer" />

          {busy ? <span className="muted">Processing…</span> : null}
          {fileName && !busy ? <span className="muted">{fileName}</span> : null}
        </div>

        {error ? (
          <p className="muted" style={{ marginTop: 12, color: "#b91c1c" }}>
            Error: {error}
          </p>
        ) : null}
      </div>

      {reader}
    </div>
  );
}
