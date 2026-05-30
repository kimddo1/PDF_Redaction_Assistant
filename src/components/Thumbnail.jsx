import { useEffect, useRef } from 'react';

/** A single rendered page thumbnail in the left strip. */
export default function Thumbnail({ page, pageNumber, isActive, onClick }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!page) return;
    let cancelled = false;
    const width = 140;
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: width / base.width });
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const task = page.render({ canvasContext: ctx, viewport });
    task.promise.catch((err) => {
      if (err?.name !== 'RenderingCancelledException' && !cancelled) {
        // eslint-disable-next-line no-console
        console.error(`Thumbnail ${pageNumber} failed`, err);
      }
    });
    return () => {
      cancelled = true;
      task.cancel();
    };
  }, [page, pageNumber]);

  return (
    <button
      type="button"
      className={`thumbnail${isActive ? ' is-active' : ''}`}
      onClick={() => onClick(pageNumber)}
      aria-label={`Go to page ${pageNumber}`}
      aria-current={isActive ? 'true' : undefined}
    >
      <canvas ref={canvasRef} className="thumbnail__canvas" />
      <span className="thumbnail__label">{pageNumber}</span>
    </button>
  );
}
