import express from "express";
import cors from "cors";
import multer from "multer";
import fs from "fs";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";

const app = express();
app.use(cors());
app.use(express.json());

const upload = multer({ dest: "uploads/" });

/**
 * Upload PDF
 */
app.post("/upload", upload.single("pdf"), (req, res) => {
  res.json({ filePath: req.file.path });
});

/**
 * Edit text in PDF
 */
app.post("/edit", async (req, res) => {
  const { filePath, edits } = req.body;

  const pdfBytes = fs.readFileSync(filePath);
  const pdfDoc = await PDFDocument.load(pdfBytes);

  const pages = pdfDoc.getPages();

  const fontCache = new Map();
  const pickStandardFont = (fontFamily = "", isBold = false, isItalic = false) => {
    const fam = String(fontFamily).toLowerCase();
    const family = /times/.test(fam)
      ? "Times"
      : /courier/.test(fam)
      ? "Courier"
      : "Helvetica"; // default for Arial/Calibri/Sans etc.
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

  for (const edit of edits) {
    const page = pages[edit.pageIndex];

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

    const fontKey = `${pickStandardFont(resolvedFamily, resolvedBold, resolvedItalic)}`;
    let font = fontCache.get(fontKey);
    if (!font) {
      font = await pdfDoc.embedFont(pickStandardFont(resolvedFamily, resolvedBold, resolvedItalic));
      fontCache.set(fontKey, font);
    }

    // Decide final size
    const sizeFromHeight = font.sizeAtHeight(hRect);
    const unitWidth = font.widthOfTextAtSize(edit.newText || "", 1) || 0;
    const sizeFromWidth = unitWidth > 0 ? (edit.width / unitWidth) : sizeFromHeight;
    const autoSize = Math.min(sizeFromHeight, sizeFromWidth);
    const targetSize = overrideSize ? overrideSize : autoSize;
    const widthAtSize = font.widthOfTextAtSize(edit.newText || "", targetSize);
    const glyphCount = Math.max((edit.newText || "").length - 1, 1);
    const characterSpacing = (edit.width - widthAtSize) / glyphCount;
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
  const outPath = "uploads/edited.pdf";
  fs.writeFileSync(outPath, updatedPdf);

  res.download(outPath);
});

app.listen(5000, () => {
  console.log("Backend running on http://localhost:5000");
});
