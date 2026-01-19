import * as pdfjsLib from "pdfjs-dist";
// Use module worker for pdfjs v5 with Vite
const worker = new Worker(
  new URL("pdfjs-dist/build/pdf.worker.mjs", import.meta.url),
  { type: "module" }
);
pdfjsLib.GlobalWorkerOptions.workerPort = worker;

export default pdfjsLib;
