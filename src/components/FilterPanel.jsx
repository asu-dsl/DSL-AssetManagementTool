import './FilterPanel.css';

function Chip({ label, active, onClick }) {
  return (
    <button className={`fp-chip${active ? ' fp-chip-active' : ''}`} type="button" onClick={onClick}>
      {label}
    </button>
  );
}

function FilterPanel({ facets, active, onToggleType, onToggleCategory, onTagChange, onClear }) {
  const types = (facets && facets.types) || [];
  const categories = (facets && facets.categories) || [];
  const hasActive = active && (active.types.length || active.categories.length || (active.tag && active.tag.trim()));

  return (
    <div className="fp-card">
      <div className="fp-head">
        <span className="fp-title">filters</span>
        {hasActive ? (
          <button className="fp-clear" type="button" onClick={onClear}>clear</button>
        ) : null}
      </div>

      {types.length > 0 && (
        <div className="fp-group">
          <div className="fp-label">type</div>
          <div className="fp-chips">
            {types.map((t) => (
              <Chip key={t} label={t} active={active.types.includes(t)} onClick={() => onToggleType(t)} />
            ))}
          </div>
        </div>
      )}

      {categories.length > 0 && (
        <div className="fp-group">
          <div className="fp-label">category</div>
          <div className="fp-chips fp-chips-scroll">
            {categories.map((c) => (
              <Chip key={c} label={c} active={active.categories.includes(c)} onClick={() => onToggleCategory(c)} />
            ))}
          </div>
        </div>
      )}

      <div className="fp-group">
        <div className="fp-label">tag contains</div>
        <input
          className="fp-input"
          value={active.tag || ''}
          onChange={(e) => onTagChange(e.target.value)}
          placeholder="e.g. rock, bark, metal"
        />
      </div>

      {types.length === 0 && categories.length === 0 && (
        <div className="fp-empty">indexing package metadata — filters fill in as assets are read.</div>
      )}
    </div>
  );
}

export default FilterPanel;
