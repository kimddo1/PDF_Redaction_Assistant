import { useRef, useState } from 'react';

/** Initial drop / browse screen shown before a PDF is loaded. */
export default function UploadScreen({ onFile, error }) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);

  const handleFiles = (files) => {
    const file = files?.[0];
    if (file) onFile(file);
  };

  return (
    <div className="upload-screen">
      <div
        className={`dropzone${dragging ? ' is-dragging' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          handleFiles(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
      >
        <div className="dropzone__icon">📄</div>
        <h1 className="dropzone__title">PDF Redaction Assistant</h1>
        <p className="dropzone__hint">
          Drop a PDF here or click to browse. Dates and person names are
          detected automatically and highlighted in the viewer.
        </p>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          className="dropzone__input"
          onChange={(e) => handleFiles(e.target.files)}
        />
        {error && <p className="dropzone__error">{error}</p>}
      </div>
    </div>
  );
}
