import { useEffect, useRef, useState } from 'react';

/**
 * Renders a single PDF page to a canvas and overlays highlight boxes.
 * Highlights arrive in scale-1 CSS coordinates and are multiplied by the
 * page's render scale here.
 */
export default function PdfPage({
  page,
  pageNumber,
  containerWidth,
  highlights,
  onRegister,
  onVisible,
}) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const [scale, setScale] = useState(1);
  const [size, setSize] = useState({ width: 0, height: 0 });

  // Render the page bitmap whenever the page or available width changes.
  useEffect(() => {
    if (!page || !containerWidth) return;
    let cancelled = false;
    let renderTask;

    const base = page.getViewport({ scale: 1 });
    const nextScale = containerWidth / base.width;
    const viewport = page.getViewport({ scale: nextScale });
    const dpr = window.devicePixelRatio || 1;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    canvas.width = Math.floor(viewport.width * dpr);
    canvas.height = Math.floor(viewport.height * dpr);
    canvas.style.width = `${viewport.width}px`;
    canvas.style.height = `${viewport.height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    renderTask = page.render({ canvasContext: ctx, viewport });
    renderTask.promise
      .then(() => {
        if (cancelled) return;
        setScale(nextScale);
        setSize({ width: viewport.width, height: viewport.height });
      })
      .catch((err) => {
        if (err?.name !== 'RenderingCancelledException') {
          // eslint-disable-next-line no-console
          console.error(`Failed to render page ${pageNumber}`, err);
        }
      });

    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [page, containerWidth, pageNumber]);

  // Register this page's DOM node so the viewer can scroll to it.
  useEffect(() => {
    onRegister?.(pageNumber, wrapRef.current);
    return () => onRegister?.(pageNumber, null);
  }, [pageNumber, onRegister]);

  // Report visibility so the active thumbnail can follow the scroll position.
  useEffect(() => {
    const node = wrapRef.current;
    if (!node || !onVisible) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && entry.intersectionRatio > 0.5) {
          onVisible(pageNumber);
        }
      },
      { threshold: [0.5] },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [pageNumber, onVisible]);

  return (
    <div
      ref={wrapRef}
      className="pdf-page"
      data-page={pageNumber}
      style={{ width: size.width || undefined }}
    >
      <canvas ref={canvasRef} className="pdf-page__canvas" />
      <div
        className="pdf-page__overlay"
        style={{ width: size.width, height: size.height }}
      >
        {highlights.map((h) => (
          <div
            key={h.id}
            className={`highlight highlight--${h.type}${h.selected ? ' is-selected' : ''}`}
            style={{
              left: h.rect.x * scale,
              top: h.rect.y * scale,
              width: h.rect.w * scale,
              height: h.rect.h * scale,
            }}
            title={h.text}
          />
        ))}
      </div>
      <span className="pdf-page__label">Page {pageNumber}</span>
    </div>
  );
}
