import { useState, useRef, useEffect } from "react";
import pdfjsLib from "./pdfWorker";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

function App() {
  const [file, setFile] = useState(null);
  const [pdfPath, setPdfPath] = useState("");
  const [textItems, setTextItems] = useState([]);
  const [selected, setSelected] = useState(null);
  const [newText, setNewText] = useState("");
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const [overrideFamily, setOverrideFamily] = useState("");
  const [overrideBold, setOverrideBold] = useState(null);
  const [overrideItalic, setOverrideItalic] = useState(null);
  const [overrideSize, setOverrideSize] = useState("");
  const [overrideColor, setOverrideColor] = useState("#000000");
  const [useCustomColor, setUseCustomColor] = useState(false);
  const [overrideSpacingEnabled, setOverrideSpacingEnabled] = useState(false);
  const [overrideSpacing, setOverrideSpacing] = useState("");
  const [pendingEdits, setPendingEdits] = useState([]);
  const canvasRef = useRef(null);
  const previewCanvasRef = useRef(null);
  const pdfDocRef = useRef(null); // { pdf, buffer }
  const [pageIndex, setPageIndex] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  // Custom font embedding support
  const [uploadedFontServerPath, setUploadedFontServerPath] = useState("");
  const [uploadedFontFaceName, setUploadedFontFaceName] = useState("");
  const [useUploadedFont, setUseUploadedFont] = useState(false);
  const [hoveredIdx, setHoveredIdx] = useState(null);
  const [saveNotice, setSaveNotice] = useState("");
  const [saving, setSaving] = useState(false);

  const uploadCustomFont = async (fileObj) => {
    if (!fileObj) return;
    // 1) Upload font file to server to be embedded when saving
    const form = new FormData();
    form.append("font", fileObj);
    const res = await fetch(`${API_URL}/font/upload`, { method: "POST", body: form });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Font upload failed");
    setUploadedFontServerPath(data.fontPath);
    // 2) Load the same font in browser for accurate preview/measurements
    const blobUrl = URL.createObjectURL(fileObj);
    const family = "CustomFont"; // fixed family name referenced in preview
    const ff = new FontFace(family, `url(${blobUrl})`);
    await ff.load();
    document.fonts.add(ff);
    await document.fonts.ready;
    setUploadedFontFaceName(family);
    setUseUploadedFont(true);
    setOverrideFamily(family);
  };

  const uploadPdf = async () => {
    const form = new FormData();
    form.append("pdf", file);

    const res = await fetch(`${API_URL}/upload`, {
      method: "POST",
      body: form,
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "PDF upload failed");
    setPdfPath(data.filePath);
    await initPdf(file);
  };

  const initPdf = async (fileObj) => {
    const buffer = await fileObj.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
    pdfDocRef.current = { pdf, buffer };
    setTotalPages(pdf.numPages || 1);
    setPageIndex(0);
    setPendingEdits([]);
    await renderAndExtract(0);
  };

  const renderAndExtract = async (idx) => {
    const holder = pdfDocRef.current;
    if (!holder) return;
    const page = await holder.pdf.getPage(idx + 1);

    const scale = 1.5;
    const viewport = page.getViewport({ scale });
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    setViewportSize({ width: viewport.width, height: viewport.height });
    await page.render({ canvasContext: ctx, viewport }).promise;

    const content = await page.getTextContent();
    const styles = content.styles || {};
    const items = content.items.map((item) => {
      const [a, , , d, e, f] = item.transform;
      const rect = [
        ...viewport.convertToViewportPoint(e, f),
        ...viewport.convertToViewportPoint(e + (item.width || Math.abs(a)), f + (Math.abs(d) || 12)),
      ];
      const x1 = Math.min(rect[0], rect[2]);
      const y1 = Math.min(rect[1], rect[3]);
      const x2 = Math.max(rect[0], rect[2]);
      const y2 = Math.max(rect[1], rect[3]);
      const vx = x1;
      const vy = y1;
      const width = x2 - x1;
      const height = y2 - y1;
      const style = styles[item.fontName] || {};
      const fontFamily = style.fontFamily || "";
      const ascent = typeof style.ascent === "number" ? style.ascent : 0.9;
      const descent = typeof style.descent === "number" ? style.descent : -0.2;
      const isBold = /bold/i.test(item.fontName || "") || /bold/i.test(fontFamily);
      const isItalic = /(italic|oblique)/i.test(item.fontName || "") || /(italic|oblique)/i.test(fontFamily);
      return {
        text: item.str,
        x: vx,
        y: vy,
        width,
        height,
        fontSize: Math.abs(d) || 12,
        pdfX: e,
        pdfY: f,
        pdfWidth: item.width,
        pdfHeight: Math.abs(d) || 12,
        fontFamily,
        isBold,
        isItalic,
        ascent,
        descent,
        pageIndex: idx,
      };
    });

    setSelected(null);
    setTextItems(items);
  };

  const buildItemId = (it) => {
    if (!it) return "";
    return `${it.pageIndex}:${it.pdfX}:${it.pdfY}:${it.pdfWidth}:${it.pdfHeight}`;
  };

  const buildEditFromSelection = (it) => {
    if (!it) return null;
    return {
      id: buildItemId(it),
      x: it.pdfX,
      y: it.pdfY,
      width: it.pdfWidth,
      height: it.pdfHeight,
      fontSize: it.fontSize,
      pageIndex: it.pageIndex,
      fontFamily: it.fontFamily,
      isBold: it.isBold,
      isItalic: it.isItalic,
      ascent: it.ascent,
      descent: it.descent,
      newText,
      overrideFontFamily: overrideFamily || undefined,
      overrideBold: overrideBold,
      overrideItalic: overrideItalic,
      overrideSize: overrideSize === "" ? undefined : Number(overrideSize),
      overrideColor: useCustomColor ? overrideColor : undefined,
      embedFontPath: useUploadedFont ? uploadedFontServerPath : undefined,
      overrideSpacingPx:
        overrideSpacingEnabled && typeof overrideSpacing === "number"
          ? Number(overrideSpacing)
          : undefined,
      viewportBoxWidth: it.width,
    };
  };

  const selectionHasChanges = (it) => {
    if (!it) return false;
    if (newText !== it.text) return true;
    if (overrideFamily && (overrideFamily || "").toLowerCase() !== (it.fontFamily || "").toLowerCase()) return true;
    if (overrideBold !== null && overrideBold !== !!it.isBold) return true;
    if (overrideItalic !== null && overrideItalic !== !!it.isItalic) return true;
    if (overrideSize !== "" && Number(overrideSize) !== Number(it.fontSize)) return true;
    if (useCustomColor) return true;
    if (overrideSpacingEnabled && typeof overrideSpacing === "number") return true;
    if (useUploadedFont) return true;
    return false;
  };

  const maybeQueueCurrentEditIfChanged = () => {
    if (!selected) return;
    if (!selectionHasChanges(selected)) return;
    const edit = buildEditFromSelection(selected);
    if (!edit) return;
    setPendingEdits((prev) => {
      const idx = prev.findIndex((e) => e.id === edit.id);
      if (idx >= 0) {
        const next = prev.slice();
        next[idx] = edit;
        return next;
      }
      return [...prev, edit];
    });
  };

  const goToPage = async (idx) => {
    maybeQueueCurrentEditIfChanged();
    const clamped = Math.max(0, Math.min((totalPages || 1) - 1, idx));
    setPageIndex(clamped);
    await renderAndExtract(clamped);
  };

  // Keep preview canvas in sync with viewport size
  useEffect(() => {
    const p = previewCanvasRef.current;
    if (!p) return;
    p.width = viewportSize.width || 0;
    p.height = viewportSize.height || 0;
  }, [viewportSize]);

  // Draw real-time preview of the edit
  useEffect(() => {
    const p = previewCanvasRef.current;
    if (!p) return;
    const ctx = p.getContext("2d");
    // clear full canvas
    ctx.clearRect(0, 0, p.width, p.height);
    if (!selected) return;
    const text = newText ?? "";
    if (!text) return;

    // Resolve styles (map many names to base CSS stacks). Prefer uploaded font when enabled.
    let cssFamily = "Helvetica, Arial, sans-serif"; // default group: Arial/Calibri/Verdana/Tahoma/Trebuchet
    if (useUploadedFont && uploadedFontFaceName) {
      cssFamily = `${uploadedFontFaceName}, ${cssFamily}`;
    } else {
      const fam = (overrideFamily || "").toLowerCase();
      if (/(times|georgia|garamond|palatino|serif)/.test(fam)) {
        cssFamily = '"Times New Roman", Times, serif';
      } else if (/(courier|monospace|consolas|monaco|menlo|inconsolata|source code)/.test(fam)) {
        cssFamily = '"Courier New", Courier, monospace';
      } else if (/helvetica|arial|calibri|verdana|tahoma|trebuchet/.test(fam)) {
        cssFamily = 'Helvetica, Arial, sans-serif';
      } else if (!overrideFamily) {
        const detected = (selected.fontFamily || "").toLowerCase();
        if (/(times|georgia|garamond|palatino|serif)/.test(detected)) cssFamily = '"Times New Roman", Times, serif';
        else if (/(courier|monospace)/.test(detected)) cssFamily = '"Courier New", Courier, monospace';
        else cssFamily = 'Helvetica, Arial, sans-serif';
      }
    }

    const bold = typeof overrideBold === "boolean" ? overrideBold : !!selected?.isBold;
    const italic = typeof overrideItalic === "boolean" ? overrideItalic : !!selected?.isItalic;

    // Base size from selection, override if provided; shrink to fit if needed
    const targetBoxW = selected.width;
    let size = typeof overrideSize === "number" && !Number.isNaN(overrideSize)
      ? Number(overrideSize)
      : Number(selected.fontSize) || 12;

    ctx.textBaseline = "top"; // we position by top-left of detected box
    ctx.font = `${italic ? "italic " : ""}${bold ? "bold " : ""}${size}px ${cssFamily}`;

    const measured = ctx.measureText(text).width;
    if (measured > 0 && measured > targetBoxW) {
      const scale = targetBoxW / measured;
      size = Math.max(1, Math.floor(size * scale));
      ctx.font = `${italic ? "italic " : ""}${bold ? "bold " : ""}${size}px ${cssFamily}`;
    }

    // compute spacing to fill width similar to server logic
    const widthAtSize = ctx.measureText(text).width;
    const glyphCount = Math.max(text.length - 1, 1);
    const autoSpacingPx = glyphCount > 0 ? (targetBoxW - widthAtSize) / glyphCount : 0;
    const spacing = (overrideSpacingEnabled && typeof overrideSpacing === 'number' && !Number.isNaN(overrideSpacing))
      ? Number(overrideSpacing)
      : autoSpacingPx;

    // color
    const hex = (useCustomColor ? overrideColor : "#000000") || "#000000";
    const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex);
    const r = m ? parseInt(m[1], 16) : 0;
    const g = m ? parseInt(m[2], 16) : 0;
    const b = m ? parseInt(m[3], 16) : 0;
    ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;

    // Optionally white-out area to simulate replacement
    ctx.save();
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(selected.x, selected.y, selected.width, selected.height);
    ctx.restore();
    // Re-set fillStyle for text after white-out
    ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;

    // Draw text with per-character spacing
    let x = selected.x;
    const y = selected.y; // top-aligned
    if (!text || !Number.isFinite(spacing)) {
      ctx.fillText(text, x, y);
    } else {
      for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        ctx.fillText(ch, x, y);
        const w = ctx.measureText(ch).width;
        x += w + spacing;
      }
    }
  }, [selected, newText, overrideFamily, overrideBold, overrideItalic, overrideSize, overrideColor, useCustomColor, viewportSize]);

  useEffect(() => {
    if (!saveNotice) return;
    const t = setTimeout(() => setSaveNotice(""), 2000);
    return () => clearTimeout(t);
  }, [saveNotice]);

  const saveEdit = async () => {
    let payloadEdits = (pendingEdits || []).slice();
    if (selected && selectionHasChanges(selected)) {
      const cur = buildEditFromSelection(selected);
      if (cur) {
        const idx = payloadEdits.findIndex((e) => e.id === cur.id);
        if (idx >= 0) payloadEdits[idx] = cur; else payloadEdits.push(cur);
      }
    }
    if (!pdfPath || payloadEdits.length === 0) return;

    const editsToSend = payloadEdits.map((edit) => {
      const rest = { ...edit };
      delete rest.id;
      return rest;
    });

    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/edit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filePath: pdfPath,
          edits: editsToSend,
        })
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setSaveNotice(data.error || "Save failed");
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      window.open(url);
      setSaveNotice(`Saved ${payloadEdits.length} edit${payloadEdits.length > 1 ? 's' : ''}`);
      setPendingEdits([]);
    } finally {
      setSaving(false);
    }
  };

  const queued = pendingEdits || [];
  const selectedWouldAdd = selected && selectionHasChanges(selected) && !queued.some((e) => e.id === buildItemId(selected));
  const totalQueuedCount = queued.length + (selectedWouldAdd ? 1 : 0);
  const canSave = !!pdfPath && totalQueuedCount > 0;

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 p-4 md:p-6">
      <h2 className="text-2xl font-semibold tracking-tight">PDF Text Editor</h2>

      <div className="mt-4 flex items-center gap-3">
        <input
          type="file"
          accept="application/pdf"
          onChange={(e) => setFile(e.target.files[0])}
          className="block text-sm text-gray-700
             file:mr-3 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-indigo-50 file:text-indigo-700
             file:hover:bg-indigo-100
             file:cursor-pointer"
        />

        <button
          onClick={uploadPdf}
          disabled={!file}
          className="inline-flex items-center cursor-pointer rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
        >
          Upload PDF
        </button>
        {Boolean(saveNotice) && (
          <div className="fixed bottom-4 right-4 rounded-md bg-gray-900 text-white px-4 py-2 text-sm shadow-lg">
            {saveNotice}
          </div>
        )}
      </div>

      <div className="my-4 h-px w-full bg-gray-200" />

      <div className="flex items-center gap-3 mb-3">
        <button
          onClick={() => goToPage(pageIndex - 1)}
          disabled={pageIndex <= 0}
          className="rounded-md border bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50"
        >
          Prev
        </button>
        <span className="text-sm text-gray-700">
          Page {pageIndex + 1} of {totalPages}
        </span>
        <button
          onClick={() => goToPage(pageIndex + 1)}
          disabled={pageIndex >= (totalPages - 1)}
          className="rounded-md border bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50"
        >
          Next
        </button>
      </div>

      <div className="relative inline-block rounded-lg border border-gray-200 bg-white shadow-sm">
        <canvas ref={canvasRef} className="block" />
        <canvas
          ref={previewCanvasRef}
          className="absolute left-0 top-0 pointer-events-none"
        />
        <div
          className="absolute left-0 top-0 pointer-events-none"
          style={{ width: viewportSize.width, height: viewportSize.height }}
        >
          {textItems.map((item, i) => (
            <span
              key={i}
              onClick={() => {
                maybeQueueCurrentEditIfChanged();
                setSelected(item);
                setNewText(item.text);
                setOverrideFamily(item.fontFamily || "");
                setOverrideBold(item.isBold);
                setOverrideItalic(item.isItalic);
                setOverrideSize(item.fontSize || "");
                setUseCustomColor(false);
                setUseCustomColor(false);
                setOverrideSpacingEnabled(false);
                setOverrideSpacing("");
              }}
              onMouseEnter={() => setHoveredIdx(i)}
              onMouseLeave={() => setHoveredIdx(null)}
              className="absolute cursor-pointer select-none"
              style={{
                left: item.x,
                top: item.y,
                width: item.width,
                height: item.height,
                background: selected === item ? "rgba(99,102,241,0.18)" : (hoveredIdx === i ? "rgba(0,0,0,0.06)" : "transparent"),
                outline: selected === item ? "1px solid rgba(99,102,241,0.9)" : (hoveredIdx === i ? "1px dashed rgba(0,0,0,0.25)" : "none"),
                color: "transparent",
                pointerEvents: "auto",
              }}
              title={item.text}
            />
          ))}
        </div>
      </div>

      {selected && (
        <>
          <div className="left-[50%] translate-x-[-50%] min-w-[1400px] flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-white p-3 fixed bottom-5 z-[999] border border-gray-500">
            <input
              value={newText}
              onChange={(e) => setNewText(e.target.value)}
              className="min-w-[200px] rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="Enter replacement text"
            />
            <button
              onClick={saveEdit}
              disabled={!canSave || saving}
              className="inline-flex items-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
            >
              {saving ? 'Saving…' : `Save All${totalQueuedCount > 0 ? ` (${totalQueuedCount})` : ''}`}
            </button>
            <button
              onClick={() => setPendingEdits([])}
              disabled={pendingEdits.length === 0 || saving}
              className="rounded-md border bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50"
            >
              Clear queued
            </button>
            <button
              onClick={() => setPendingEdits((prev) => prev.slice(0, -1))}
              disabled={pendingEdits.length === 0 || saving}
              className="rounded-md border bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50"
            >
              Undo last
            </button>
            <span className="text-sm text-gray-600">
              {`Queued: ${totalQueuedCount}`}
            </span>
            <label className="inline-flex items-center gap-2 text-sm text-gray-700">
              Upload font
              <input
                type="file"
                accept=".ttf,.otf,font/ttf,font/otf"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (f) await uploadCustomFont(f);
                }}
                className="block text-sm text-gray-700 file:mr-2 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
              />
            </label>
            <label className="inline-flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={useUploadedFont}
                onChange={(e) => setUseUploadedFont(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                disabled={!uploadedFontFaceName}
              />
              Use uploaded font
            </label>
            <select
              value={overrideFamily}
              onChange={(e) => setOverrideFamily(e.target.value)}
              title="Font family"
              className="rounded-md border border-gray-300 bg-white px-2 py-2 text-sm shadow-sm"
            >
              <option value="">Auto (detected)</option>
              {/* Sans / Helvetica group */}
              <option value="Arial">Arial</option>
              <option value="Calibri">Calibri</option>
              <option value="Verdana">Verdana</option>
              <option value="Tahoma">Tahoma</option>
              <option value="Trebuchet MS">Trebuchet MS</option>
              <option value="Helvetica">Helvetica</option>
              {/* Serif / Times group */}
              <option value="Times New Roman">Times New Roman</option>
              <option value="Georgia">Georgia</option>
              <option value="Garamond">Garamond</option>
              <option value="Palatino">Palatino</option>
              <option value="Times">Times</option>
              {/* Monospace / Courier group */}
              <option value="Courier New">Courier New</option>
              <option value="Consolas">Consolas</option>
              <option value="Monaco">Monaco</option>
              <option value="Courier">Courier</option>
            </select>
            <select
              value={overrideBold === null ? "auto" : overrideBold ? "bold" : "regular"}
              onChange={(e) => {
                const v = e.target.value;
                setOverrideBold(v === "auto" ? null : v === "bold");
              }}
              title="Font weight"
              className="rounded-md border border-gray-300 bg-white px-2 py-2 text-sm shadow-sm"
            >
              <option value="auto">Weight: Auto</option>
              <option value="regular">Regular</option>
              <option value="bold">Bold</option>
            </select>
            <select
              value={overrideItalic === null ? "auto" : overrideItalic ? "italic" : "normal"}
              onChange={(e) => {
                const v = e.target.value;
                setOverrideItalic(v === "auto" ? null : v === "italic");
              }}
              title="Font style"
              className="rounded-md border border-gray-300 bg-white px-2 py-2 text-sm shadow-sm"
            >
              <option value="auto">Style: Auto</option>
              <option value="normal">Normal</option>
              <option value="italic">Italic</option>
            </select>
            <input
              type="number"
              min={1}
              step={0.5}
              value={overrideSize}
              onChange={(e) => {
                const val = e.target.value;
                setOverrideSize(val === "" ? "" : Number(val));
              }}
              placeholder={String(selected.fontSize || "")}
              title="Font size"
              className="w-24 rounded-md border border-gray-300 bg-white px-2 py-2 text-sm shadow-sm"
            />
            <label className="inline-flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={useCustomColor}
                onChange={(e) => setUseCustomColor(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              Color
              <input
                type="color"
                value={overrideColor}
                onChange={(e) => setOverrideColor(e.target.value)}
                disabled={!useCustomColor}
                className="h-8 w-10 cursor-pointer disabled:opacity-50"
              />
            </label>
            <label className="inline-flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={overrideSpacingEnabled}
                onChange={(e) => setOverrideSpacingEnabled(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              Letter spacing
              <input
                type="number"
                step={0.1}
                value={overrideSpacing}
                onChange={(e) => {
                  const v = e.target.value;
                  setOverrideSpacing(v === "" ? "" : Number(v));
                }}
                disabled={!overrideSpacingEnabled}
                placeholder="auto"
                className="w-24 rounded-md border border-gray-300 bg-white px-2 py-2 text-sm shadow-sm disabled:opacity-50"
                title="Letter spacing in pixels"
              />
            </label>
          </div>
        </>
      )}
    </div>
  );
}

export default App;
