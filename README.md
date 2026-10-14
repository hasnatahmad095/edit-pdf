
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
- **Edit queue:** make several edits across pages, then save them all at once (with undo/clear)
- **Save PDF**; the server whites out the original region and draws new text on the correct page

## Tech Stack

- **Client**: React 19 + Vite 7, `pdfjs-dist` 6, Tailwind CSS (via CDN)
- **Server**: Node.js + Express 5, `pdf-lib`, `multer`, `cors`

## Project Structure

```
edit-pdf/
├─ client/              # React + Vite app
│  ├─ src/
│  │  ├─ App.jsx        # UI, rendering, overlays, edit queue
│  │  ├─ main.jsx
│  │  └─ pdfWorker.js   # PDF.js module-worker setup
│  └─ index.html
└─ server/
   ├─ server.js         # Express API
   └─ uploads/          # Uploaded PDFs/fonts (created at runtime, git-ignored)
```

## Prerequisites

- Node.js 20.19+ or 22.12+ (required by Vite 7)
- npm 9+

## Quick Start

Run the server and client in separate terminals.

1) Server

```bash
cd server
npm install
npm start
# Server starts at http://localhost:5000
```

Use `npm run dev` instead to restart automatically on file changes.

2) Client

```bash
cd client
npm install
npm run dev
# Vite dev server: http://localhost:5173
```

Open the client URL in your browser.

## Configuration

All settings are optional; the defaults work for local development.

| Variable        | Where  | Default                 | Purpose                                   |
| --------------- | ------ | ----------------------- | ----------------------------------------- |
| `PORT`          | server | `5000`                  | Port the API listens on                   |
| `CLIENT_ORIGIN` | server | `http://localhost:5173` | Origin allowed by CORS                    |
| `VITE_API_URL`  | client | `http://localhost:5000` | API base URL (e.g. put it in `client/.env.local`) |

## Usage

1. Choose a PDF file using the file picker.
2. Click **Upload PDF**. The file is sent to the backend and stored under `server/uploads`.
3. Use the **Prev/Next** buttons to navigate pages. Each page renders with clickable text overlays.
4. Click a text overlay to select it. An edit bar fixed to the bottom of the screen shows:
   - Replacement text input
   - Font family, weight, style, size, and color
   - Letter spacing (auto by default; tick **Letter spacing** to set it manually)
   - Optional: **Upload font** (TTF/OTF) and **Use uploaded font** for exact matching
5. Your changes appear immediately on a transparent preview layer.
6. Select another text item to queue the current edit. Use **Undo last** or **Clear queued** to manage the queue.
7. Click **Save All** to apply every queued edit and open the updated PDF.

## How It Works

- **Client**
  - Uses PDF.js to render the current page to a canvas.
  - Renders a transparent overlay canvas to show live edits (font, size, weight, italic, color, letter spacing).
  - Builds absolutely positioned overlays that map to text item bounding boxes and handle selection.
  - For custom fonts, loads the TTF/OTF via `FontFace` so preview measurements match the server.
  - On save, posts all queued edits with coordinates, page index, text, and optional overrides.

- **Server**
  - `POST /upload` stores the PDF and returns an ID for it.
  - `POST /font/upload` stores a TTF/OTF font and returns an ID for later embedding.
  - `POST /edit` loads the PDF with `pdf-lib`, whites out each original area, embeds either a standard font (Helvetica/Times/Courier with bold/italic variants) or the uploaded custom font, computes the size to fit (respecting manual size/letter-spacing overrides), draws the new text, and returns the PDF.
  - Only files stored in `server/uploads` can be referenced; other paths are rejected.

## API Reference

- POST `/upload`
  - Content-Type: `multipart/form-data`
  - Field: `pdf` (a PDF, max 25 MB)
  - Response: `{ "filePath": "<upload-id>" }`

- POST `/font/upload`
  - Content-Type: `multipart/form-data`
  - Field: `font` (a `.ttf` or `.otf` file, max 10 MB)
  - Response: `{ "fontPath": "<upload-id>" }`

- POST `/edit`
  - Content-Type: `application/json`
  - Body:

```jsonc
{
  "filePath": "<upload-id from /upload>",
  "edits": [
    {
      "x": 100,                 // PDF user space X
      "y": 200,                 // PDF user space Y (baseline)
      "width": 150,             // width of the original text box
      "height": 12,             // height of the original text box
      "fontSize": 12,           // original text size (from PDF.js)
      "pageIndex": 0,           // zero-based page index
      "fontFamily": "Arial",    // detected family (for fallback mapping)
      "isBold": false,
      "isItalic": false,
      "ascent": 0.9,            // font metrics from PDF.js style if available
      "descent": -0.2,
      "newText": "Updated value",

      // Optional overrides
      "overrideSize": 12,
      "overrideColor": "#000000",
      "overrideFontFamily": "Helvetica",  // mapped to base fonts if no custom font is used
      "overrideBold": false,
      "overrideItalic": false,

      // Letter spacing (manual override in preview pixels; server converts to PDF units)
      "overrideSpacingPx": 0.8,
      // Width of the selection box in preview pixels (used for unit conversion)
      "viewportBoxWidth": 220,

      // Custom font embedding
      "embedFontPath": "<upload-id from /font/upload>"
    }
  ]
}
```

  - Response: the edited PDF (`application/pdf`, downloaded as `edited.pdf`).
  - Errors: `400` with `{ "error": "..." }` for an unknown file, invalid page, or rejected upload.

## Notes & Limitations

- **Editing is not redaction.** The original text is covered with a white box, but it remains in the PDF and can still be copied or extracted. Do not use this tool to hide sensitive information.
- Multi-page is supported via pagination (one page visible at a time).
- Without a custom font, families are mapped to the closest PDF base font (Helvetica/Times/Courier). Upload a TTF/OTF to embed the exact font.
- Bounding boxes come from PDF.js text content and can vary in accuracy depending on the PDF.
- Uploaded files are never deleted automatically; clear `server/uploads` yourself.
- No authentication or rate limiting. This is a local demo, not production-hardened.
- Tailwind is loaded from its Play CDN, which is meant for development only.

## Troubleshooting

- **Port already in use**
  - Server (5000) or Vite (5173) may be occupied. Stop the conflicting process, or change ports using `PORT` / `CLIENT_ORIGIN` / `VITE_API_URL` and `npm run dev -- --port <port>`.

- **CORS errors**
  - The server only allows `CLIENT_ORIGIN` (default `http://localhost:5173`). If the client runs elsewhere, set `CLIENT_ORIGIN` to match.

## License

[MIT](LICENSE) © Hasnat Ahmad
