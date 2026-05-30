import { useEffect, useState } from 'react';
import Thumbnail from './Thumbnail.jsx';

/** Left panel: vertical strip of page thumbnails. */
export default function ThumbnailStrip({ pdfDoc, currentPage, onJump }) {
  const [pages, setPages] = useState([]);

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

  return (
    <aside className="thumb-strip" aria-label="Page thumbnails">
      <h2 className="panel-title">Pages</h2>
      <div className="thumb-strip__list">
        {pages.map((page, i) => (
          <Thumbnail
            key={i + 1}
            page={page}
            pageNumber={i + 1}
            isActive={currentPage === i + 1}
            onClick={onJump}
          />
        ))}
      </div>
    </aside>
  );
}
