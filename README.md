
# Edit PDF – Simple PDF Text Editor (React + Node)

An end‑to‑end example that lets you upload a PDF, preview and edit text with live styling, and download an updated PDF. The client renders with PDF.js (via `pdfjs-dist`) and the server updates the PDF using `pdf-lib`.

## Features

- **Upload a PDF** to the backend using Multer
- **Multi-page viewing** with simple pagination (Prev/Next)
- **Click-to-select text items** overlayed on the canvas
- **Real-time preview overlay** of your edits (no need to save to see changes)
- **Style controls:** font family, size, weight (bold), style (italic), and color
- **Letter spacing control:** auto-calculated to fit the original box, with optional manual override
- **Custom font upload & embedding (TTF/OTF)** for accurate output matching the preview
- **Save PDF**; the server whites out the original region and draws new text on the correct page

## Tech Stack

- **Client**: React + Vite, `pdfjs-dist`, Tailwind CSS (via CDN)
- **Server**: Node.js + Express, `pdf-lib`, `multer`, `cors`

## Project Structure

```
edit-pdf/
├─ client/            # React + Vite app
│  ├─ src/
│  │  ├─ App.jsx
│  │  ├─ main.jsx
│  │  └─ pdfWorker.*  # PDF.js worker helper (imported as ./pdfWorker)
│  └─ index.html
└─ server/
   ├─ server.js       # Express server
   └─ uploads/        # Uploaded and edited PDFs
```

## Prerequisites

- Node.js 18+ (recommended Node 20+)
- npm 8+

Because `server/server.js` uses ES Modules (`import` syntax), ensure the server runs in ESM mode.

Options:

- Add this to `server/package.json`:

```json
{
  "type": "module"
}
```

- Or rename `server.js` to `server.mjs` and run `node server.mjs`.

## Quick Start

Run server and client in separate terminals.

1) Server

```bash
cd server
npm install
# ensure ESM (see Prerequisites)
node server.js
# Server will start at http://localhost:5000
```

Optionally add an npm script to `server/package.json` for convenience:

```json
{
  "scripts": {
    "start": "node server.js"
  }
}
```

2) Client

```bash
cd client
npm install
npm run dev
# Vite dev server (default): http://localhost:5173
```

Open the client URL in your browser. The client is configured to call the backend at `http://localhost:5000`.

## Usage

1. Choose a PDF file using the file picker.
2. Click “Upload PDF”. The file is sent to the backend and stored under `server/uploads`.
3. Use the **Prev/Next** buttons to navigate pages. Each page renders with clickable text overlays.
4. Click a text overlay to select it. A toolbar appears below with:
   - Replacement text input
   - Font family, weight, style, size, and color
   - Letter spacing (auto by default; enable override to set manually)
   - Optional: **Upload font** (TTF/OTF) and toggle “Use uploaded font” for exact matching
5. Your changes appear immediately on a transparent preview layer.
6. Click **Save PDF** to download/open the updated document.

## How It Works

- **Client**
  - Uses PDF.js to render the current page to a canvas.
  - Renders a transparent overlay canvas to show live edits (font, size, weight, italic, color, letter spacing).
  - Builds absolutely positioned overlays that map to text item bounding boxes and handle selection.
  - For custom fonts, loads the TTF/OTF via `FontFace` so preview measurements match the server.
  - On save, posts an edit with coordinates, page index, text, and optional overrides (font, size, color, letter spacing, custom font path).

- **Server**
  - `POST /upload` saves the uploaded PDF and returns `{ filePath }`.
  - `POST /font/upload` saves an uploaded font (TTF/OTF) and returns `{ fontPath }` for later embedding.
  - `POST /edit` loads the PDF with `pdf-lib`, whites out the original area, embeds either a standard font (Helvetica/Times/Courier with bold/italic variants) or the uploaded custom font, computes size to fit (respecting manual size/letter-spacing overrides), draws the new text, saves `uploads/edited.pdf`, and returns it.

## API Reference

- POST `/upload`
  - Content-Type: `multipart/form-data`
  - Field: `pdf` (the file)
  - Response: `{ "filePath": "uploads/your-uploaded-file" }`

- POST `/font/upload`
  - Content-Type: `multipart/form-data`
  - Field: `font` (the font file, .ttf or .otf)
  - Response: `{ "fontPath": "uploads/your-uploaded-font" }`

- POST `/edit`
  - Content-Type: `application/json`
  - Body:

```json
{
  "filePath": "uploads/your-uploaded-file",
  "edits": [
    {
      "x": 100,                 // PDF user space X
      "y": 200,                 // PDF user space Y (baseline)
      "width": 150,             // width of the original text box
      "height": 12,             // height of the original text box
      "fontSize": 12,           // original text size (from PDF.js)
      "pageIndex": 0,           // zero-based page index
      "fontFamily": "Arial",   // detected family (for fallback mapping)
      "isBold": false,
      "isItalic": false,
      "ascent": 0.9,            // font metrics from PDF.js style if available
      "descent": -0.2,
      "newText": "Updated value",

      // Optional overrides
      "overrideSize": 12,
      "overrideColor": "#000000",
      "overrideFontFamily": "Helvetica",  // will be mapped to base fonts if no custom font is used
      "overrideBold": false,
      "overrideItalic": false,

      // Letter spacing (manual override in preview pixels; server converts to PDF units)
      "overrideSpacingPx": 0.8,
      // Width of the selection box in preview pixels (used for unit conversion)
      "viewportBoxWidth": 220,

      // Custom font embedding (from /font/upload)
      "embedFontPath": "uploads/your-uploaded-font"
    }
  ]
}
```

  - Response: edited PDF as a file download (`uploads/edited.pdf`).

## Notes & Limitations

- Multi-page is supported via pagination (one page visible at a time).
- Without a custom font, families are mapped to the closest PDF base font (Helvetica/Times/Courier). Upload a TTF/OTF to embed the exact font.
- The edited file path is fixed to `uploads/edited.pdf` and is overwritten on each save.
- Bounding boxes come from PDF.js text content and can vary in accuracy depending on the PDF.
- No authentication, authorization, or file validation; not production-hardened.

## Troubleshooting

- **SyntaxError: Cannot use import statement outside a module**
  - Ensure the server runs as ESM (see Prerequisites). Add `"type": "module"` to `server/package.json` or rename `server.js` to `server.mjs`.

- **Port already in use**
  - Server (5000) or Vite (5173) may be occupied. Stop the conflicting process or change the port.

- **CORS errors**
  - The server enables CORS globally via `cors()`. If you change ports/origins, verify CORS settings.

## License

No license specified. If you intend to open-source, consider adding a LICENSE file (e.g., MIT).

