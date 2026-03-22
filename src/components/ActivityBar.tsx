import type { ReactNode } from 'react';
import type { ActivityItem } from '../App';

interface Props {
  active: ActivityItem;
  onSelect: (item: ActivityItem) => void;
  sidebarOpen: boolean;
}

const icons: Record<ActivityItem, { label: string; svg: ReactNode }> = {
  explorer: {
    label: 'Explorer',
    svg: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2v11z" />
      </svg>
    ),
  },
  search: {
    label: 'Search',
    svg: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8" />
        <path d="M21 21l-4.35-4.35" />
      </svg>
    ),
  },
  git: {
    label: 'Source Control',
    svg: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <line x1="6" y1="3" x2="6" y2="15" />
        <circle cx="18" cy="6" r="3" />
        <circle cx="6" cy="18" r="3" />
        <path d="M18 9a9 9 0 01-9 9" />
      </svg>
    ),
  },
  ava: {
    label: 'Ava',
    svg: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
      </svg>
    ),
  },
  extensions: {
    label: 'Extensions',
    svg: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </svg>
    ),
  },
  debug: {
    label: 'Run and Debug',
    svg: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="5 3 19 12 5 21 5 3" />
      </svg>
    ),
  },
};

const order: ActivityItem[] = ['explorer', 'search', 'git', 'ava', 'extensions', 'debug'];

export default function ActivityBar({ active, onSelect, sidebarOpen }: Props) {
  return (
    <div
      style={{
        width: 48,
        background: '#181825',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingTop: 4,
        paddingBottom: 4,
        flexShrink: 0,
        borderRight: '1px solid #313244',
      }}
    >
      {/* Top icons */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0 }}>
        {order.map((item) => {
          const isActive = active === item && sidebarOpen;
          return (
            <button
              key={item}
              title={icons[item].label}
              onClick={() => onSelect(item)}
              style={{
                width: 48,
                height: 48,
                background: 'transparent',
                border: 'none',
                borderLeft: isActive ? '2px solid #a855f7' : '2px solid transparent',
                color: isActive ? '#cdd6f4' : '#6c7086',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                transition: 'color 0.15s',
              }}
              onMouseEnter={(e) => {
                if (!isActive) e.currentTarget.style.color = '#cdd6f4';
              }}
              onMouseLeave={(e) => {
                if (!isActive) e.currentTarget.style.color = '#6c7086';
              }}
            >
              {icons[item].svg}
            </button>
          );
        })}
      </div>

      {/* Bottom: Dashboard */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <button
          title="Dashboard"
          onClick={() => onSelect('dashboard')}
          style={{
            width: 48,
            height: 48,
            background: 'transparent',
            border: 'none',
            borderLeft: active === 'dashboard' && sidebarOpen ? '2px solid #a855f7' : '2px solid transparent',
            color: active === 'dashboard' && sidebarOpen ? '#cdd6f4' : '#6c7086',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            transition: 'color 0.15s',
          }}
          onMouseEnter={(e) => { if (!(active === 'dashboard' && sidebarOpen)) e.currentTarget.style.color = '#cdd6f4'; }}
          onMouseLeave={(e) => { if (!(active === 'dashboard' && sidebarOpen)) e.currentTarget.style.color = '#6c7086'; }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="7" height="9" rx="1" />
            <rect x="14" y="3" width="7" height="5" rx="1" />
            <rect x="14" y="12" width="7" height="9" rx="1" />
            <rect x="3" y="16" width="7" height="5" rx="1" />
          </svg>
        </button>
      </div>
    </div>
  );
}
