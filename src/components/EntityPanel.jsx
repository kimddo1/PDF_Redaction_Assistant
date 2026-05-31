import { useEffect, useMemo, useRef, useState } from 'react';

function EntitySection({ type, label, entities, selectedIds, onSelectGroup, onSelect }) {
  const [open, setOpen] = useState(true);
  const checkboxRef = useRef(null);

  const selectedCount = entities.filter((e) => selectedIds.has(e.id)).length;
  const allSelected = entities.length > 0 && selectedCount === entities.length;
  const someSelected = selectedCount > 0 && !allSelected;

  // indeterminate can only be set imperatively, not via a React prop.
  useEffect(() => {
    if (checkboxRef.current) checkboxRef.current.indeterminate = someSelected;
  }, [someSelected]);

  return (
    <section className={`entity-section entity-section--${type}`}>
      <div className="entity-section__header">
        <label
          className={`group-checkbox-label group-checkbox-label--${type}`}
          title={allSelected ? `Deselect all ${label.replace('Show ', '')}` : `Select all ${label.replace('Show ', '')}`}
        >
          <input
            ref={checkboxRef}
            type="checkbox"
            className="group-checkbox"
            checked={allSelected}
            onChange={(e) => onSelectGroup(e.target.checked)}
            aria-label={`Select all ${label}`}
          />
          <span className="group-checkbox__box" aria-hidden="true" />
        </label>

        <button
          type="button"
          className="entity-section__toggle"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          <span className="entity-section__title">{label}</span>
          <span className="entity-section__badge">{entities.length}</span>
          <span className="entity-section__chevron">{open ? '▾' : '▸'}</span>
        </button>
      </div>

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
export default function EntityPanel({ entities, selectedIds, onSelect, onSelectGroup }) {
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
        onSelectGroup={(selectAll) => onSelectGroup('date', dates, selectAll)}
      />
      <EntitySection
        type="name"
        label="Show Names"
        entities={names}
        selectedIds={selectedIds}
        onSelect={onSelect}
        onSelectGroup={(selectAll) => onSelectGroup('name', names, selectAll)}
      />
    </aside>
  );
}
