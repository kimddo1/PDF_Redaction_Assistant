// Thin wrapper around pdf.js: configures the worker and exposes a single
// `loadPdf` entry point so the rest of the app never imports pdf.js directly.
import * as pdfjsLib from 'pdfjs-dist';
// Vite resolves this `?url` import to a hashed asset URL for the worker bundle.
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

/**
 * Load a PDF from a user-selected File.
 * @param {File} file
 * @returns {Promise<import('pdfjs-dist').PDFDocumentProxy>}
 */
export async function loadPdf(file) {
  const data = await file.arrayBuffer();
  // `data` is transferred to the worker, so pass a copy-safe typed array.
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(data) });
  return loadingTask.promise;
}

export { pdfjsLib };
