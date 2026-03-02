/**
 * Lightweight markdown renderer for the Ava agent panel.
 * Handles the common markdown patterns an AI coding assistant produces:
 * fenced code blocks, inline code, bold, italic, headings, lists, links.
 * No external dependencies — pure React.
 */
import * as React from '@theia/core/shared/react';

// ── Inline parser ────────────────────────────────────────────────────────────

/** Parse inline markdown (bold, italic, code, links) into React nodes. */
function parseInline(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  // Regex: inline code, bold, italic, links
  const re = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*]+\*)|(__[^_]+__)|(_[^_]+_)|(\[([^\]]+)\]\(([^)]+)\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = re.exec(text)) !== null) {
    // Text before match
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    if (match[1]) {
      // Inline code: `code`
      const code = match[1].slice(1, -1);
      nodes.push(
        <code key={match.index} style={{
          background: 'rgba(168, 85, 247, 0.12)',
          padding: '1px 5px',
          borderRadius: '3px',
          fontSize: '12px',
          fontFamily: 'var(--theia-editor-font-family, monospace)',
        }}>{code}</code>
      );
    } else if (match[2]) {
      // Bold: **text**
      nodes.push(<strong key={match.index}>{match[2].slice(2, -2)}</strong>);
    } else if (match[4]) {
      // Bold: __text__
      nodes.push(<strong key={match.index}>{match[4].slice(2, -2)}</strong>);
    } else if (match[3]) {
      // Italic: *text*
      nodes.push(<em key={match.index}>{match[3].slice(1, -1)}</em>);
    } else if (match[5]) {
      // Italic: _text_
      nodes.push(<em key={match.index}>{match[5].slice(1, -1)}</em>);
    } else if (match[6]) {
      // Link: [text](url)
      nodes.push(
        <a key={match.index} href={match[8]} target="_blank" rel="noopener noreferrer" style={{
          color: 'var(--ava-accent, #A855F7)',
          textDecoration: 'none',
        }}>{match[7]}</a>
      );
    }

    lastIndex = match.index + match[0].length;
  }

  // Remaining text
  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes.length > 0 ? nodes : [text];
}

// ── Code block component ─────────────────────────────────────────────────────

function CodeBlock({ language, code }: { language: string; code: string }) {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div style={{
      position: 'relative',
      borderRadius: '6px',
      overflow: 'hidden',
      margin: '6px 0',
      border: '1px solid var(--theia-panel-border)',
    }}>
      {/* Header bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '4px 10px',
        background: 'rgba(0, 0, 0, 0.25)',
        fontSize: '10px',
        opacity: 0.7,
      }}>
        <span>{language || 'text'}</span>
        <button
          onClick={handleCopy}
          style={{
            border: 'none',
            background: 'transparent',
            color: 'var(--theia-foreground)',
            cursor: 'pointer',
            fontSize: '10px',
            opacity: copied ? 1 : 0.6,
            padding: '1px 4px',
          }}
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      {/* Code content */}
      <pre style={{
        margin: 0,
        padding: '10px 12px',
        background: 'var(--theia-editor-background)',
        overflow: 'auto',
        fontSize: '12px',
        lineHeight: 1.5,
        fontFamily: 'var(--theia-editor-font-family, monospace)',
      }}>
        <code>{code}</code>
      </pre>
    </div>
  );
}

// ── Block parser ─────────────────────────────────────────────────────────────

interface Block {
  type: 'code' | 'heading' | 'list' | 'paragraph';
  content: string;
  language?: string;
  level?: number;
  ordered?: boolean;
}

function parseBlocks(markdown: string): Block[] {
  const blocks: Block[] = [];
  const lines = markdown.split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block: ```lang
    const codeMatch = line.match(/^```(\w*)\s*$/);
    if (codeMatch) {
      const language = codeMatch[1] || '';
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].match(/^```\s*$/)) {
        codeLines.push(lines[i]);
        i++;
      }
      blocks.push({ type: 'code', content: codeLines.join('\n'), language });
      i++; // skip closing ```
      continue;
    }

    // Heading: # ## ### ####
    const headingMatch = line.match(/^(#{1,4})\s+(.+)$/);
    if (headingMatch) {
      blocks.push({ type: 'heading', content: headingMatch[2], level: headingMatch[1].length });
      i++;
      continue;
    }

    // Unordered list block (consecutive - or * lines)
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ''));
        i++;
      }
      blocks.push({ type: 'list', content: items.join('\n'), ordered: false });
      continue;
    }

    // Ordered list block (consecutive 1. 2. lines)
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ''));
        i++;
      }
      blocks.push({ type: 'list', content: items.join('\n'), ordered: true });
      continue;
    }

    // Empty line — skip
    if (line.trim() === '') {
      i++;
      continue;
    }

    // Paragraph — collect consecutive non-empty, non-special lines
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !lines[i].match(/^```/) &&
      !lines[i].match(/^#{1,4}\s/) &&
      !lines[i].match(/^\s*[-*]\s+/) &&
      !lines[i].match(/^\s*\d+\.\s+/)
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    if (paraLines.length > 0) {
      blocks.push({ type: 'paragraph', content: paraLines.join('\n') });
    }
  }

  return blocks;
}

// ── Main component ───────────────────────────────────────────────────────────

const headingStyles: Record<number, React.CSSProperties> = {
  1: { fontSize: '16px', fontWeight: 700, margin: '12px 0 6px' },
  2: { fontSize: '14px', fontWeight: 700, margin: '10px 0 4px' },
  3: { fontSize: '13px', fontWeight: 600, margin: '8px 0 4px' },
  4: { fontSize: '12px', fontWeight: 600, margin: '6px 0 2px', opacity: 0.8 },
};

export function MarkdownContent({ content }: { content: string }) {
  const blocks = React.useMemo(() => parseBlocks(content), [content]);

  return (
    <div style={{ lineHeight: 1.6, wordBreak: 'break-word' }}>
      {blocks.map((block, idx) => {
        switch (block.type) {
          case 'code':
            return <CodeBlock key={idx} language={block.language || ''} code={block.content} />;

          case 'heading':
            return (
              <div key={idx} style={headingStyles[block.level || 1]}>
                {parseInline(block.content)}
              </div>
            );

          case 'list': {
            const items = block.content.split('\n');
            const ListTag = block.ordered ? 'ol' : 'ul';
            return (
              <ListTag key={idx} style={{
                margin: '4px 0',
                paddingLeft: '20px',
                fontSize: '13px',
              }}>
                {items.map((item, j) => (
                  <li key={j} style={{ margin: '2px 0' }}>{parseInline(item)}</li>
                ))}
              </ListTag>
            );
          }

          case 'paragraph':
            return (
              <div key={idx} style={{ margin: '4px 0', fontSize: '13px' }}>
                {parseInline(block.content)}
              </div>
            );

          default:
            return null;
        }
      })}
    </div>
  );
}
