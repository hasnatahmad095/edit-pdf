import { useState, useRef } from "react";
import pdfjsLib from "./pdfWorker";

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
  const canvasRef = useRef(null);

  const uploadPdf = async () => {
    const form = new FormData();
    form.append("pdf", file);

    const res = await fetch("http://localhost:5000/upload", {
      method: "POST",
      body: form,
    });

    const data = await res.json();
    setPdfPath(data.filePath);
    extractText(file);
  };

  const extractText = async (file) => {
    const buffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument(buffer).promise;
    const page = await pdf.getPage(1);

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
      const [a, b, c, d, e, f] = item.transform;
      const rect = viewport.convertToViewportRectangle([
        e,
        f,
        e + (item.width || Math.abs(a)),
        f + (Math.abs(d) || 12),
      ]);
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
        pageIndex: 0,
      };
    });

    setTextItems(items);
  };

  const saveEdit = async () => {
    const res = await fetch("http://localhost:5000/edit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filePath: pdfPath,
        edits: [{
          x: selected.pdfX,
          y: selected.pdfY,
          width: selected.pdfWidth,
          height: selected.pdfHeight,
          fontSize: selected.fontSize,
          pageIndex: selected.pageIndex,
          fontFamily: selected.fontFamily,
          isBold: selected.isBold,
          isItalic: selected.isItalic,
          ascent: selected.ascent,
          descent: selected.descent,
          newText,
          overrideFontFamily: overrideFamily || undefined,
          overrideBold: overrideBold,
          overrideItalic: overrideItalic,
          overrideSize: overrideSize === "" ? undefined : Number(overrideSize),
          overrideColor: useCustomColor ? overrideColor : undefined,
        }]
      })
    });

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    window.open(url);
  };

  return (
    <div style={{ padding: 20 }}>
      <h2>PDF Text Editor</h2>

      <input
        type="file"
        accept="application/pdf"
        onChange={(e) => setFile(e.target.files[0])}
      />

      <button onClick={uploadPdf} disabled={!file}>Upload PDF</button>

      <hr />

      <div
        style={{
          position: "relative",
          display: "inline-block",
          border: "1px solid #ddd",
        }}
      >
        <canvas ref={canvasRef} style={{ display: "block" }} />
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: viewportSize.width,
            height: viewportSize.height,
            pointerEvents: "none",
          }}
        >
          {textItems.map((item, i) => (
            <span
              key={i}
              onClick={() => {
                setSelected(item);
                setNewText(item.text);
                setOverrideFamily(item.fontFamily || "");
                setOverrideBold(item.isBold);
                setOverrideItalic(item.isItalic);
                setOverrideSize(item.fontSize || "");
                setUseCustomColor(false);
              }}
              style={{
                position: "absolute",
                left: item.x,
                top: item.y,
                width: item.width,
                height: item.height,
                background: selected === item ? "rgba(255,0,0,0.15)" : "transparent",
                outline: selected === item ? "1px solid red" : "none",
                cursor: "pointer",
                color: "transparent",
                userSelect: "none",
                pointerEvents: "auto",
              }}
              title={item.text}
            />
          ))}
        </div>
      </div>

      {selected && (
        <>
          <hr />
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <input
              value={newText}
              onChange={(e) => setNewText(e.target.value)}
            />
            <button onClick={saveEdit}>Save PDF</button>
            <select
              value={overrideFamily}
              onChange={(e) => setOverrideFamily(e.target.value)}
              title="Font family"
            >
              <option value="">Auto (detected)</option>
              <option value="Helvetica">Helvetica</option>
              <option value="Times">Times</option>
              <option value="Courier">Courier</option>
            </select>
            <select
              value={overrideBold === null ? "auto" : overrideBold ? "bold" : "regular"}
              onChange={(e) => {
                const v = e.target.value;
                setOverrideBold(v === "auto" ? null : v === "bold");
              }}
              title="Font weight"
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
              style={{ width: 90 }}
            />
            <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <input
                type="checkbox"
                checked={useCustomColor}
                onChange={(e) => setUseCustomColor(e.target.checked)}
              />
              Color
              <input
                type="color"
                value={overrideColor}
                onChange={(e) => setOverrideColor(e.target.value)}
                disabled={!useCustomColor}
              />
            </label>
          </div>
        </>
      )}
    </div>
  );
}

export default App;
