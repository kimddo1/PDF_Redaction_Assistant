import { useMemo, useState } from 'react';

function EntitySection({ type, label, entities, selectedIds, onSelect }) {
  const [open, setOpen] = useState(true);

  return (
    <section className={`entity-section entity-section--${type}`}>
      <button
        type="button"
        className="entity-section__header"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className={`swatch swatch--${type}`} aria-hidden="true" />
        <span className="entity-section__title">{label}</span>
        <span className="entity-section__badge">{entities.length}</span>
        <span className="entity-section__chevron">{open ? '▾' : '▸'}</span>
      </button>

      {open && (
        <ul className="entity-list">
          {entities.length === 0 && (
            <li className="entity-list__empty">None detected</li>
          )}
          {entities.map((e) => (
            <li key={e.id}>
              <button
                type="button"
                className={`entity-item${selectedIds.has(e.id) ? ' is-selected' : ''}`}
                onClick={() => onSelect(e)}
              >
                <span className="entity-item__text">{e.text}</span>
                <span className="entity-item__page">p.{e.pageNumber}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Right panel: toggleable Dates and Names sections with click-to-highlight. */
export default function EntityPanel({ entities, selectedIds, onSelect }) {
  const { dates, names } = useMemo(() => {
    const sortFn = (a, b) =>
      a.pageNumber - b.pageNumber || a.text.localeCompare(b.text);
    return {
      dates: entities.filter((e) => e.type === 'date').sort(sortFn),
      names: entities.filter((e) => e.type === 'name').sort(sortFn),
    };
  }, [entities]);

  return (
    <aside className="entity-panel" aria-label="Detected entities">
      <h2 className="panel-title">Entities</h2>
      <EntitySection
        type="date"
        label="Show Dates"
        entities={dates}
        selectedIds={selectedIds}
        onSelect={onSelect}
      />
      <EntitySection
        type="name"
        label="Show Names"
        entities={names}
        selectedIds={selectedIds}
        onSelect={onSelect}
      />
    </aside>
  );
}
