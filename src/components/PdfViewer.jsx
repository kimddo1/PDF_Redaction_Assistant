import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import PdfPage from './PdfPage.jsx';

/**
 * Centre panel: continuous vertical scroll of every page, each with its own
 * highlight overlay. Owns page-proxy loading, width measurement, scroll-to
 * targeting and current-page reporting.
 */
export default function PdfViewer({
  pdfDoc,
  highlightsByPage,
  scrollTarget,
  onCurrentPageChange,
}) {
  const scrollRef = useRef(null);
  const pageNodes = useRef(new Map());
  const [pages, setPages] = useState([]);
  const [containerWidth, setContainerWidth] = useState(0);

  // Load every page proxy once per document.
  useEffect(() => {
    if (!pdfDoc) return;
    let cancelled = false;
    Promise.all(
      Array.from({ length: pdfDoc.numPages }, (_, i) => pdfDoc.getPage(i + 1)),
    ).then((loaded) => {
      if (!cancelled) setPages(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, [pdfDoc]);

  // Track available width (minus padding) so pages render to fit.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => setContainerWidth(el.clientWidth - 48);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const registerPage = useCallback((pageNumber, node) => {
    if (node) pageNodes.current.set(pageNumber, node);
    else pageNodes.current.delete(pageNumber);
  }, []);

  // React to scroll-to requests from thumbnails or the entity list.
  useEffect(() => {
    if (!scrollTarget) return;
    const { pageNumber, entityId } = scrollTarget;

    if (entityId) {
      // Defer to let overlays for the (possibly newly selected) entity mount.
      const raf = requestAnimationFrame(() => {
        const box = scrollRef.current?.querySelector(
          `[data-entity="${entityId}"]`,
        );
        if (box) box.scrollIntoView({ behavior: 'smooth', block: 'center' });
        else pageNodes.current.get(pageNumber)?.scrollIntoView({ behavior: 'smooth' });
      });
      return () => cancelAnimationFrame(raf);
    }

    pageNodes.current.get(pageNumber)?.scrollIntoView({ behavior: 'smooth' });
  }, [scrollTarget]);

  if (!pdfDoc) return null;

  return (
    <div className="pdf-viewer" ref={scrollRef}>
      {pages.map((page, i) => {
        const pageNumber = i + 1;
        return (
          <PdfPage
            key={pageNumber}
            page={page}
            pageNumber={pageNumber}
            containerWidth={containerWidth}
            highlights={highlightsByPage.get(pageNumber) || []}
            onRegister={registerPage}
            onVisible={onCurrentPageChange}
          />
        );
      })}
    </div>
  );
}
