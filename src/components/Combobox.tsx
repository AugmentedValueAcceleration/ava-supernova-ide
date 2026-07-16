import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * A free-form text field with a themed suggestion dropdown.
 *
 * Exists because `<input list>` + `<datalist>` renders the browser's own
 * dropdown — light-themed, unstyleable, and visibly foreign next to the IDE's
 * controls. This keeps the "pick a preset or type your own" behaviour that a
 * plain select would take away, while looking like everything around it.
 *
 * The menu is portaled to <body> with fixed positioning so a dialog's
 * max-height/overflow can't clip it, and it flips above the field when there
 * isn't room below.
 *
 * `style` passes through to the input so callers keep matching the register of
 * the controls beside them — the IDE's inline-style convention.
 *
 * Mirror of the extension's dashboard-ui/src/components/Combobox.tsx.
 */
interface ComboboxProps {
  value: string;
  onChange: (value: string) => void;
  /** Preset values offered in the dropdown. Typing is never restricted to them. */
  options: string[];
  placeholder?: string;
  style?: React.CSSProperties;
}

const MENU_DESIRED_HEIGHT = 200;

export function Combobox({ value, onChange, options, placeholder, style }: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});

  const reposition = useCallback(() => {
    const el = wrap.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const gap = 4;
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUp = spaceBelow < MENU_DESIRED_HEIGHT && rect.top > spaceBelow;
    const maxHeight = Math.max(96, Math.min(MENU_DESIRED_HEIGHT, (openUp ? rect.top : spaceBelow) - gap - 8));
    setMenuStyle({
      position: 'fixed',
      left: rect.left,
      width: rect.width,
      maxHeight,
      overflowY: 'auto',
      zIndex: 1000,
      background: '#1e1b2e',
      border: '1px solid color-mix(in srgb, var(--accent) 25%, transparent)',
      borderRadius: 8,
      padding: 4,
      boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
      ...(openUp ? { bottom: window.innerHeight - rect.top + gap } : { top: rect.bottom + gap }),
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    reposition();
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (wrap.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onScrollResize = () => reposition();
    document.addEventListener('mousedown', onDown);
    // capture: catch scrolls on any ancestor, not just window
    window.addEventListener('scroll', onScrollResize, true);
    window.addEventListener('resize', onScrollResize);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('scroll', onScrollResize, true);
      window.removeEventListener('resize', onScrollResize);
    };
  }, [open, reposition]);

  // Filter as you type, but never show an empty box — with no matches we close.
  const q = value.trim().toLowerCase();
  const matches = q ? options.filter((o) => o.toLowerCase().includes(q)) : options;

  return (
    <div style={{ position: 'relative' }} ref={wrap}>
      <input
        type="text"
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false); }}
        placeholder={placeholder}
        style={{ ...style, cursor: 'text' }}
      />
      {open && matches.length > 0 && createPortal(
        <div ref={menuRef} style={menuStyle}>
          {matches.map((o) => {
            const active = o === value;
            return (
              <button
                key={o}
                type="button"
                onMouseDown={(e) => e.preventDefault()} // keep focus so the input doesn't blur-close first
                onClick={() => { onChange(o); setOpen(false); }}
                onMouseEnter={(e) => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = 'color-mix(in srgb, var(--accent) 8%, transparent)'; }}
                onMouseLeave={(e) => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
                style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  padding: '6px 10px', borderRadius: 6, border: 'none',
                  fontSize: 12, cursor: 'pointer',
                  background: active ? 'color-mix(in srgb, var(--accent) 15%, transparent)' : 'transparent',
                  color: active ? '#e0b0ff' : '#cdd6f4',
                }}
              >
                {o}
              </button>
            );
          })}
        </div>,
        document.body,
      )}
    </div>
  );
}
