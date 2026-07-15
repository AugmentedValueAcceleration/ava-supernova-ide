import { useState, useRef, useEffect, useCallback, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';

/**
 * Bespoke Select — the IDE's custom dropdown, matching the extension's Select
 * (portal menu with fixed positioning that flips up when there's no room below,
 * check on the selected row, click-outside to close). Inline-styled to sit in
 * the same family as the ColorField / player transports — never a native
 * <select>, which reads as the one un-styled thing in the studio.
 */

interface SelectOption { value: string; label: string }

interface Props {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  /** `md` (default) full control · `sm` compact inline control. */
  size?: 'sm' | 'md';
  /** Wrapper style — width / margins for inline placement. */
  style?: CSSProperties;
  title?: string;
  /** Portal-menu z-index. Default 1000; raise it when the Select sits inside a
   *  higher-stacked layer (e.g. a modal overlay) so the menu isn't hidden. */
  menuZIndex?: number;
}

const BORDER = 'var(--border, #2a2440)';
const MENU_DESIRED_HEIGHT = 240;

export function Select({ value, onChange, options, size = 'md', style, title, menuZIndex = 1000 }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({});

  const reposition = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const gap = 4;
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const openUp = spaceBelow < MENU_DESIRED_HEIGHT && spaceAbove > spaceBelow;
    const maxHeight = Math.max(120, Math.min(MENU_DESIRED_HEIGHT, (openUp ? spaceAbove : spaceBelow) - gap - 8));
    setMenuStyle({
      position: 'fixed',
      left: rect.left,
      minWidth: rect.width,
      maxWidth: Math.max(rect.width, window.innerWidth - rect.left - 8),
      maxHeight,
      overflowY: 'auto',
      zIndex: menuZIndex,
      borderRadius: 8,
      border: `1px solid ${BORDER}`,
      background: '#1a1028',
      padding: '4px 0',
      boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
      ...(openUp ? { bottom: window.innerHeight - rect.top + gap } : { top: rect.bottom + gap }),
    });
  }, [menuZIndex]);

  useEffect(() => {
    if (!open) return;
    reposition();
    const handleClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onScrollResize = () => reposition();
    document.addEventListener('mousedown', handleClick);
    window.addEventListener('scroll', onScrollResize, true);
    window.addEventListener('resize', onScrollResize);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      window.removeEventListener('scroll', onScrollResize, true);
      window.removeEventListener('resize', onScrollResize);
    };
  }, [open, reposition]);

  const selected = options.find(o => o.value === value);
  const pad = size === 'sm' ? '6px 10px' : '9px 12px';
  const fs = size === 'sm' ? 12 : 13;
  const optPad = size === 'sm' ? '7px 12px' : '9px 12px';

  return (
    <div ref={ref} style={{ position: 'relative', ...style }}>
      <button type="button" onClick={() => setOpen(o => !o)} title={title}
        style={{ display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'space-between', gap: 8,
          borderRadius: 8, border: `1px solid ${BORDER}`, background: '#1a1028', padding: pad, fontSize: fs,
          color: '#cdd6f4', textAlign: 'left', cursor: 'pointer', outline: 'none' }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selected?.label ?? value}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8b8398" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          style={{ flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} aria-hidden="true">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && createPortal(
        <div ref={menuRef} style={menuStyle}>
          {options.map(o => {
            const isSel = o.value === value;
            return (
              <button key={o.value} type="button"
                onClick={() => { onChange(o.value); setOpen(false); }}
                style={{ display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                  border: 'none', padding: optPad, fontSize: fs, textAlign: 'left', cursor: 'pointer',
                  background: isSel ? 'color-mix(in srgb, var(--accent) 10%, transparent)' : 'transparent',
                  color: isSel ? '#fff' : '#a6adc8' }}
                onMouseEnter={e => { if (!isSel) { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(26,16,40,0.9)'; (e.currentTarget as HTMLButtonElement).style.color = '#fff'; } }}
                onMouseLeave={e => { if (!isSel) { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = '#a6adc8'; } }}>
                <span style={{ whiteSpace: 'nowrap' }}>{o.label}</span>
                {isSel && (
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }} aria-hidden="true">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>,
        document.body,
      )}
    </div>
  );
}
