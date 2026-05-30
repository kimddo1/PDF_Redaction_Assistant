import { useCallback, useMemo, useState } from 'react';
import { loadPdf } from './pdf/pdfClient.js';
import { extractEntities } from './extraction/extractEntities.js';
import UploadScreen from './components/UploadScreen.jsx';
import ThumbnailStrip from './components/ThumbnailStrip.jsx';
import PdfViewer from './components/PdfViewer.jsx';
import EntityPanel from './components/EntityPanel.jsx';
import './App.css';

export default function App() {
  const [status, setStatus] = useState('idle'); // idle | loading | ready | error
  const [error, setError] = useState('');
  const [pdfDoc, setPdfDoc] = useState(null);
  const [fileName, setFileName] = useState('');
  const [entities, setEntities] = useState([]);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [scrollTarget, setScrollTarget] = useState(null);

  const handleFile = useCallback(async (file) => {
    if (file.type && file.type !== 'application/pdf') {
      setStatus('error');
      setError('That file is not a PDF. Please choose a .pdf file.');
      return;
    }
    setStatus('loading');
    setError('');
    try {
      const doc = await loadPdf(file);
      const found = await extractEntities(doc);
      setPdfDoc(doc);
      setFileName(file.name);
      setEntities(found);
      setSelectedIds(new Set());
      setCurrentPage(1);
      setStatus('ready');
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(err);
      setError(
        err?.name === 'PasswordException'
          ? 'This PDF is password protected and cannot be opened.'
          : 'Could not read this PDF. It may be corrupt or unsupported.',
      );
      setStatus('error');
    }
  }, []);

  const handleSelect = useCallback((entity) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(entity.id)) next.delete(entity.id);
      else next.add(entity.id);
      return next;
    });
    setScrollTarget({
      pageNumber: entity.pageNumber,
      entityId: entity.id,
      nonce: Date.now(),
    });
  }, []);

  const handleJump = useCallback((pageNumber) => {
    setScrollTarget({ pageNumber, nonce: Date.now() });
  }, []);

  // Group the rects of every selected entity by page for the viewer overlays.
  const highlightsByPage = useMemo(() => {
    const map = new Map();
    for (const entity of entities) {
      if (!selectedIds.has(entity.id)) continue;
      const list = map.get(entity.pageNumber) || [];
      entity.rects.forEach((rect, i) => {
        list.push({
          id: `${entity.id}-${i}`,
          entityId: entity.id,
          type: entity.type,
          text: entity.text,
          rect,
          selected: true,
        });
      });
      map.set(entity.pageNumber, list);
    }
    return map;
  }, [entities, selectedIds]);

  if (status !== 'ready') {
    return (
      <UploadScreen
        onFile={handleFile}
        error={status === 'error' ? error : ''}
      />
    );
  }

  const dateCount = entities.filter((e) => e.type === 'date').length;
  const nameCount = entities.filter((e) => e.type === 'name').length;

  return (
    <div className="app">
      <header className="app__header">
        <span className="app__brand">📄 PDF Redaction Assistant</span>
        <span className="app__file" title={fileName}>{fileName}</span>
        <span className="app__stats">
          {pdfDoc.numPages} pages · {dateCount} dates · {nameCount} names
        </span>
        <button
          type="button"
          className="app__new"
          onClick={() => {
            setStatus('idle');
            setPdfDoc(null);
            setEntities([]);
            setSelectedIds(new Set());
          }}
        >
          New PDF
        </button>
      </header>

      <main className="app__grid">
        <ThumbnailStrip
          pdfDoc={pdfDoc}
          currentPage={currentPage}
          onJump={handleJump}
        />
        <PdfViewer
          pdfDoc={pdfDoc}
          highlightsByPage={highlightsByPage}
          scrollTarget={scrollTarget}
          onCurrentPageChange={setCurrentPage}
        />
        <EntityPanel
          entities={entities}
          selectedIds={selectedIds}
          onSelect={handleSelect}
        />
      </main>
    </div>
  );
}
