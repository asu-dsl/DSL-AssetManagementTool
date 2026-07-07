import { Compass, Search, SlidersHorizontal } from 'lucide-react';
import './TopBar.css';

const TABS = [
  { id: 'asset', label: 'Asset' },
  { id: 'anim', label: 'Anim' },
  { id: 'uiux', label: 'UI · UX' },
];

function TopBar({ department, onDepartmentChange, search, onSearchChange, filterOpen, onToggleFilter, right }) {
  return (
    <div className="topbar">
      <div className="topbar-left">
        <div className="topbar-logo">
          <Compass size={18} />
        </div>
        <div className="topbar-tabs">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`topbar-tab${department === tab.id ? ' active' : ''}`}
              onClick={() => onDepartmentChange && onDepartmentChange(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="topbar-center">
        <div className="topbar-search">
          <Search size={16} className="topbar-search-icon" />
          <input
            type="text"
            placeholder="Search by name, tag, or description"
            value={search}
            onChange={(e) => onSearchChange && onSearchChange(e.target.value)}
          />
        </div>
        <button
          type="button"
          className={`topbar-filter${filterOpen ? ' active' : ''}`}
          aria-label="Filter"
          onClick={() => onToggleFilter && onToggleFilter()}
        >
          <SlidersHorizontal size={18} />
        </button>
      </div>

      <div className="topbar-right">{right}</div>
    </div>
  );
}

export default TopBar;
