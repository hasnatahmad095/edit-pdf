
# Edit PDF – Simple PDF Text Editor (React + Node)

An end‑to‑end example that lets you upload a PDF, visualize its first page, click a text item to edit, and download an updated PDF. The client renders with PDF.js (via `pdfjs-dist`) and the server modifies the PDF using `pdf-lib`.

## Features

- **Upload a PDF** to the backend using Multer
- **Render first page** on canvas with PDF.js
- **Click-to-select text items** overlayed on the canvas
- **Edit text and save**; the server whites out the original region and draws new text
- **Basic font/style approximation** using built-in PDF standard fonts (Helvetica/Times/Courier)

## Tech Stack

- **Client**: React + Vite, `pdfjs-dist`
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
3. The first page is rendered; clickable overlays appear for each detected text item.
4. Click any overlay to select it, edit the text in the input, then click “Save PDF”.
5. A new tab opens with the edited PDF. Download or view it.

## How It Works

- **Client**
  - Uses PDF.js to render the first page to a canvas.
  - Builds absolutely positioned overlays that map to text item bounding boxes.
  - On save, posts a single edit describing the original text box coordinates and the new text.

- **Server**
  - `POST /upload` saves the uploaded file (field name: `pdf`) via Multer and returns `{ filePath }`.
  - `POST /edit` loads the PDF with `pdf-lib`, whites out the original text area, chooses an approximate standard font, determines a size that fits, draws the new text, saves to `uploads/edited.pdf`, and streams it back as a download.

## API Reference

- POST `/upload`
  - Content-Type: `multipart/form-data`
  - Field: `pdf` (the file)
  - Response: `{ "filePath": "uploads/your-uploaded-file" }`

- POST `/edit`
  - Content-Type: `application/json`
  - Body:

```json
{
  "filePath": "uploads/your-uploaded-file",
  "edits": [
    {
      "x": 100,              // PDF user space X
      "y": 200,              // PDF user space Y (baseline)
      "width": 150,          // width of the original text box
      "height": 12,          // height of the original text box
      "fontSize": 12,        // original text size (from PDF.js)
      "pageIndex": 0,        // zero-based page index
      "fontFamily": "Arial",// detected family (mapped to standard fonts)
      "isBold": false,
      "isItalic": false,
      "ascent": 0.9,         // font metrics from PDF.js style if available
      "descent": -0.2,
      "newText": "Updated value"
      // Optional advanced overrides supported by the server:
      // "overrideSize": 12,
      // "overrideColor": "#000000",
      // "overrideFontFamily": "Helvetica",
      // "overrideBold": false,
      // "overrideItalic": false
    }
  ]
}
```

  - Response: edited PDF as a file download (`uploads/edited.pdf`).

## Notes & Limitations

- Only the first page is rendered/edited by the current client UI.
- Font mapping is approximate: detected families are mapped to Helvetica/Times/Courier via `pdf-lib` standard fonts.
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

