import express from "express";
import cors from "cors";
import multer from "multer";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";

const PORT = Number(process.env.PORT) || 5000;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "http://localhost:5173";
const UPLOAD_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "uploads");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const app = express();
app.use(cors({ origin: CLIENT_ORIGIN }));
app.use(express.json({ limit: "1mb" }));

const MAX_PDF_BYTES = 25 * 1024 * 1024;
const MAX_FONT_BYTES = 10 * 1024 * 1024;

const pdfUpload = multer({
  dest: UPLOAD_DIR,
  limits: { fileSize: MAX_PDF_BYTES },
  fileFilter: (req, file, cb) => cb(null, file.mimetype === "application/pdf"),
});
const fontUpload = multer({
  dest: UPLOAD_DIR,
  limits: { fileSize: MAX_FONT_BYTES },
  fileFilter: (req, file, cb) => cb(null, /\.(ttf|otf)$/i.test(file.originalname)),
});

// Only allow reading files that multer stored in UPLOAD_DIR; ignore any client-supplied directories.
const resolveUpload = (p) => {
  if (typeof p !== "string" || !p) return null;
  const full = path.join(UPLOAD_DIR, path.basename(p));
  return fs.existsSync(full) ? full : null;
};

/**
 * Upload PDF
 */
app.post("/upload", pdfUpload.single("pdf"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "A PDF file is required" });
  res.json({ filePath: req.file.filename });
});

/**
 * Upload Font (TTF/OTF)
 */
app.post("/font/upload", fontUpload.single("font"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "A .ttf or .otf font file is required" });
  res.json({ fontPath: req.file.filename });
});

/**
 * Edit text in PDF
 */
app.post("/edit", async (req, res) => {
  const { filePath, edits } = req.body;

  const pdfFile = resolveUpload(filePath);
  if (!pdfFile) return res.status(400).json({ error: "Unknown filePath; upload the PDF first" });
  if (!Array.isArray(edits)) return res.status(400).json({ error: "edits must be an array" });

  const pdfBytes = fs.readFileSync(pdfFile);
  const pdfDoc = await PDFDocument.load(pdfBytes);

  const pages = pdfDoc.getPages();

  const fontCache = new Map();
  const pickStandardFont = (fontFamily = "", isBold = false, isItalic = false) => {
    const fam = String(fontFamily).toLowerCase();
    // Group common names to base PDF families
    let family = "Helvetica";
    if (/(times|georgia|garamond|palatino|serif)/.test(fam)) family = "Times";
    else if (/(courier|monospace|consolas|monaco|menlo|inconsolata|source code)/.test(fam)) family = "Courier";
    else if (/(helvetica|arial|calibri|verdana|tahoma|trebuchet)/.test(fam)) family = "Helvetica";

    const style = isBold && isItalic ? "BoldItalic" : isBold ? "Bold" : isItalic ? "Oblique" : "Regular";
    // Map to StandardFonts keys
    if (family === "Times") {
      if (style === "BoldItalic") return StandardFonts.TimesRomanBoldItalic;
      if (style === "Bold") return StandardFonts.TimesRomanBold;
      if (style === "Oblique") return StandardFonts.TimesRomanItalic;
      return StandardFonts.TimesRoman;
    }
    if (family === "Courier") {
      if (style === "BoldItalic") return StandardFonts.CourierBoldOblique;
      if (style === "Bold") return StandardFonts.CourierBold;
      if (style === "Oblique") return StandardFonts.CourierOblique;
      return StandardFonts.Courier;
    }
    // Helvetica default
    if (style === "BoldItalic") return StandardFonts.HelveticaBoldOblique;
    if (style === "Bold") return StandardFonts.HelveticaBold;
    if (style === "Oblique") return StandardFonts.HelveticaOblique;
    return StandardFonts.Helvetica;
  };

  // Cache embedded fonts by path or StandardFont key
  const embeddedCache = new Map();

  for (const edit of edits) {
    const page = pages[edit.pageIndex];
    if (!page) return res.status(400).json({ error: `Invalid pageIndex: ${edit.pageIndex}` });

    // Resolve style overrides or fallbacks from detected values
    const resolvedFamily = edit.overrideFontFamily || edit.fontFamily || "";
    const resolvedBold = typeof edit.overrideBold === 'boolean' ? edit.overrideBold : !!edit.isBold;
    const resolvedItalic = typeof edit.overrideItalic === 'boolean' ? edit.overrideItalic : !!edit.isItalic;

    const origSize = Number(edit.fontSize) || 12;
    const ascent = typeof edit.ascent === 'number' ? edit.ascent : 0.9;
    const descent = typeof edit.descent === 'number' ? edit.descent : -0.2;
    const yRect = edit.y + descent * origSize;
    const hRect = (ascent - descent) * origSize;

    // White-out old text area based on baseline + font metrics
    // If override size increases height, ensure we clear enough area
    const overrideSize = (typeof edit.overrideSize === 'number' && !Number.isNaN(edit.overrideSize)) ? Number(edit.overrideSize) : undefined;
    const newHeightIfOverride = overrideSize ? (ascent - descent) * overrideSize : hRect;
    const yRectOverride = overrideSize ? (edit.y + descent * overrideSize) : yRect;
    const clearY = Math.min(yRect, yRectOverride);
    const clearH = Math.max(hRect, newHeightIfOverride);
    page.drawRectangle({
      x: edit.x,
      y: clearY,
      width: edit.width,
      height: clearH,
      color: rgb(1, 1, 1),
    });

    let font;
    if (edit.embedFontPath) {
      const fontFile = resolveUpload(edit.embedFontPath);
      if (!fontFile) return res.status(400).json({ error: "Unknown embedFontPath; upload the font first" });
      const key = `embedded:${fontFile}`;
      font = embeddedCache.get(key);
      if (!font) {
        const fontBytes = fs.readFileSync(fontFile);
        font = await pdfDoc.embedFont(fontBytes, { subset: true });
        embeddedCache.set(key, font);
      }
    } else {
      const fontKey = `${pickStandardFont(resolvedFamily, resolvedBold, resolvedItalic)}`;
      font = fontCache.get(fontKey);
      if (!font) {
        font = await pdfDoc.embedFont(pickStandardFont(resolvedFamily, resolvedBold, resolvedItalic));
        fontCache.set(fontKey, font);
      }
    }

    // Decide final size, accounting for custom letter spacing if provided
    const sizeFromHeight = font.sizeAtHeight(hRect);
    const unitWidthAt1 = font.widthOfTextAtSize(edit.newText || "", 1) || 0;
    const glyphCount = Math.max((edit.newText || "").length - 1, 1);
    // Convert override spacing from preview px to PDF units
    const pxToPdfScale = edit.viewportBoxWidth && edit.viewportBoxWidth > 0 ? (edit.width / edit.viewportBoxWidth) : 1;
    const overrideSpacingPdf = (typeof edit.overrideSpacingPx === 'number' && !Number.isNaN(edit.overrideSpacingPx))
      ? edit.overrideSpacingPx * pxToPdfScale
      : undefined;
    const sizeFromWidthNoSpacing = unitWidthAt1 > 0 ? (edit.width / unitWidthAt1) : sizeFromHeight;
    const sizeFromWidthWithSpacing = unitWidthAt1 > 0
      ? Math.max(1, (edit.width - (glyphCount * (overrideSpacingPdf || 0))) / unitWidthAt1)
      : sizeFromHeight;
    const sizeFromWidth = overrideSpacingPdf !== undefined ? sizeFromWidthWithSpacing : sizeFromWidthNoSpacing;
    const autoSize = Math.min(sizeFromHeight, sizeFromWidth);
    const targetSize = overrideSize ? overrideSize : autoSize;
    const widthAtSize = font.widthOfTextAtSize(edit.newText || "", targetSize);
    const characterSpacing = overrideSpacingPdf !== undefined
      ? overrideSpacingPdf
      : (edit.width - widthAtSize) / glyphCount;
    // Parse color hex or fallback to black
    const hex = (edit.overrideColor || "#000000").toString();
    const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex);
    const r = m ? parseInt(m[1], 16) / 255 : 0;
    const g = m ? parseInt(m[2], 16) / 255 : 0;
    const b = m ? parseInt(m[3], 16) / 255 : 0;
    page.drawText(edit.newText, {
      x: edit.x,
      y: edit.y,
      size: targetSize,
      font,
      color: rgb(r, g, b),
      characterSpacing,
    });
  }

  const updatedPdf = await pdfDoc.save();
  res
    .type("application/pdf")
    .attachment("edited.pdf")
    .send(Buffer.from(updatedPdf));
});

// Express 5 forwards rejected async handlers here (e.g. a corrupt PDF or font).
app.use((err, req, res, next) => {
  console.error(err);
  const status = err instanceof multer.MulterError ? 400 : 500;
  res.status(status).json({ error: status === 400 ? err.message : "Failed to process request" });
});

app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});
