import { useState } from 'react';

/* ===== Shared Styles ===== */
const pageWrapper: React.CSSProperties = {
  flex: 1,
  background: '#1e1e2e',
  overflowY: 'auto',
  padding: '40px',
};

const pageTitle: React.CSSProperties = {
  fontSize: 22,
  fontWeight: 600,
  color: '#cdd6f4',
  marginBottom: 6,
};

const pageSubtitle: React.CSSProperties = {
  fontSize: 13,
  color: '#6c7086',
  marginBottom: 32,
};

const card: React.CSSProperties = {
  background: '#181825',
  border: '1px solid #313244',
  borderRadius: 10,
  padding: '20px',
  marginBottom: 16,
};

const sectionTitle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: '#a6adc8',
  textTransform: 'uppercase' as const,
  letterSpacing: 0.8,
  marginBottom: 12,
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  height: 36,
  background: '#313244',
  border: '1px solid #313244',
  borderRadius: 6,
  padding: '0 12px',
  fontSize: 13,
  color: '#cdd6f4',
  outline: 'none',
};

const btnPrimary: React.CSSProperties = {
  background: '#a855f7',
  border: 'none',
  borderRadius: 6,
  padding: '8px 20px',
  fontSize: 13,
  fontWeight: 500,
  color: '#fff',
  cursor: 'pointer',
};

const btnSecondary: React.CSSProperties = {
  background: '#313244',
  border: '1px solid #313244',
  borderRadius: 6,
  padding: '8px 16px',
  fontSize: 13,
  fontWeight: 500,
  color: '#cdd6f4',
  cursor: 'pointer',
};

const badge = (color: string): React.CSSProperties => ({
  display: 'inline-block',
  fontSize: 10,
  fontWeight: 600,
  color,
  background: `${color}18`,
  padding: '2px 8px',
  borderRadius: 4,
});

/* ===== 1. Command Centre ===== */
export function CommandCentrePage() {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <div style={pageWrapper}>
      <div style={{ maxWidth: 800, margin: '0 auto' }}>
        {/* Greeting */}
        <div style={{ marginBottom: 32, textAlign: 'center' }}>
          <div style={{ fontSize: 28, fontWeight: 300, color: '#cdd6f4', marginBottom: 4 }}>
            {greeting}
          </div>
          <div style={{ fontSize: 14, color: '#6c7086' }}>Here is your daily overview</div>
        </div>

        {/* Stats row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12, marginBottom: 24 }}>
          {[
            { label: 'Tasks', value: '5', icon: '✅', color: '#a6e3a1' },
            { label: 'Memories', value: '24', icon: '🧠', color: '#89b4fa' },
            { label: 'Tokens Today', value: '12.4k', icon: '📊', color: '#f9e2af' },
            { label: 'Streak', value: '7 days', icon: '🔥', color: '#fab387' },
          ].map((s) => (
            <div key={s.label} style={{ ...card, textAlign: 'center', marginBottom: 0 }}>
              <div style={{ fontSize: 20, marginBottom: 4 }}>{s.icon}</div>
              <div style={{ fontSize: 20, fontWeight: 600, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 11, color: '#6c7086', marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Weather placeholder */}
        <div style={card}>
          <div style={sectionTitle}>Weather</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ fontSize: 36 }}>☀️</div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 500, color: '#cdd6f4' }}>22°C — Clear</div>
              <div style={{ fontSize: 12, color: '#6c7086' }}>Weather data will sync when connected</div>
            </div>
          </div>
        </div>

        {/* Recent Activity */}
        <div style={card}>
          <div style={sectionTitle}>Recent Activity</div>
          {[
            { time: '2 min ago', action: 'Edited App.tsx', detail: '14 lines changed' },
            { time: '15 min ago', action: 'Committed: "fix sidebar toggle"', detail: 'main branch' },
            { time: '1 hour ago', action: 'Ran test suite', detail: '42 passed, 0 failed' },
            { time: '3 hours ago', action: 'Created memory: project architecture', detail: 'Category: technical' },
          ].map((a, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '10px 0',
                borderBottom: i < 3 ? '1px solid #313244' : 'none',
              }}
            >
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#a855f7', flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, color: '#cdd6f4' }}>{a.action}</div>
                <div style={{ fontSize: 11, color: '#6c7086' }}>{a.detail}</div>
              </div>
              <div style={{ fontSize: 11, color: '#6c7086', flexShrink: 0 }}>{a.time}</div>
            </div>
          ))}
        </div>

        {/* Tasks summary */}
        <div style={card}>
          <div style={sectionTitle}>Tasks Due Today</div>
          {[
            { title: 'Review PR #42 — companion sync', priority: 'high' },
            { title: 'Write unit tests for agent loop', priority: 'medium' },
            { title: 'Update changelog for v0.21.4', priority: 'low' },
          ].map((t, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '8px 0',
                borderBottom: i < 2 ? '1px solid #313244' : 'none',
              }}
            >
              <div style={{
                width: 18, height: 18, borderRadius: 4,
                border: '2px solid #313244', flexShrink: 0, cursor: 'pointer',
              }} />
              <span style={{ fontSize: 13, color: '#cdd6f4', flex: 1 }}>{t.title}</span>
              <span style={badge(t.priority === 'high' ? '#f38ba8' : t.priority === 'medium' ? '#f9e2af' : '#a6e3a1')}>
                {t.priority}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ===== 2. Ava Chat ===== */
export function AvaChatPage() {
  const [messages, setMessages] = useState<{ role: 'ava' | 'user'; text: string }[]>([
    { role: 'ava', text: "Hey! I'm Ava, your AI assistant. This is the full-width chat — ask me anything, plan a feature, debug an issue, or just chat. I'm here for you." },
    { role: 'ava', text: "Tip: Switch modes with >> (Work), :: (Plan), ?? (Teach), !! (Security), or ** (Brainstorm)." },
  ]);
  const [input, setInput] = useState('');
  const [model, setModel] = useState('deepseek-chat');

  const send = () => {
    if (!input.trim()) return;
    setMessages((m) => [
      ...m,
      { role: 'user' as const, text: input },
      { role: 'ava' as const, text: "I'm not connected to a backend yet, but once wired up I'll respond with full agentic capabilities. Hang tight!" },
    ]);
    setInput('');
  };

  return (
    <div style={{ ...pageWrapper, padding: 0, display: 'flex', flexDirection: 'column' }}>
      {/* Top bar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 24px', borderBottom: '1px solid #313244', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 32, height: 32, borderRadius: '50%',
            background: 'linear-gradient(135deg, #a855f7, #6366f1)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#cdd6f4' }}>Ava</div>
            <div style={{ fontSize: 11, color: '#a6e3a1' }}>Online</div>
          </div>
        </div>
        <select
          value={model}
          onChange={(e) => setModel(e.target.value)}
          style={{
            height: 30, background: '#313244', border: '1px solid #313244',
            borderRadius: 6, padding: '0 10px', fontSize: 12, color: '#cdd6f4', outline: 'none',
          }}
        >
          <option value="deepseek-chat">DeepSeek Chat</option>
          <option value="deepseek-reasoner">DeepSeek Reasoner</option>
          <option value="qwen-plus">Qwen Plus</option>
          <option value="qwen-max">Qwen Max</option>
          <option value="moonshot-v1-128k">Moonshot v1 128K</option>
          <option value="glm-4-plus">GLM-4 Plus</option>
          <option value="mistral-large">Mistral Large</option>
        </select>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 40px' }}>
        {messages.map((msg, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
              marginBottom: 16,
            }}
          >
            <div
              style={{
                maxWidth: '70%',
                padding: '12px 16px',
                borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                background: msg.role === 'user' ? '#7c3aed' : '#181825',
                color: '#cdd6f4',
                fontSize: 14,
                lineHeight: 1.6,
                border: msg.role === 'ava' ? '1px solid #313244' : 'none',
              }}
            >
              {msg.role === 'ava' && (
                <div style={{ fontSize: 11, fontWeight: 600, color: '#a855f7', marginBottom: 4 }}>Ava</div>
              )}
              {msg.text}
            </div>
          </div>
        ))}
      </div>

      {/* Input bar */}
      <div style={{
        padding: '16px 40px',
        borderTop: '1px solid #313244',
        background: '#181825',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', gap: 10, maxWidth: 800, margin: '0 auto' }}>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') send(); }}
            placeholder="Message Ava..."
            style={{
              ...inputStyle,
              height: 44,
              borderRadius: 10,
              fontSize: 14,
              padding: '0 16px',
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = '#a855f7'; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = '#313244'; }}
          />
          <button
            onClick={send}
            style={{
              ...btnPrimary,
              width: 44,
              height: 44,
              padding: 0,
              borderRadius: 10,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#9333ea'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = '#a855f7'; }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

/* ===== 3. Memory ===== */
export function MemoryPage() {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const categories = ['all', 'technical', 'personal', 'project', 'preference'];

  const memories = [
    { id: 1, title: 'Project architecture — monorepo with pnpm workspaces', category: 'technical', date: '2026-03-20' },
    { id: 2, title: 'User prefers dark theme with purple accent', category: 'preference', date: '2026-03-19' },
    { id: 3, title: 'Companion app uses Next.js + Capacitor', category: 'project', date: '2026-03-18' },
    { id: 4, title: 'Works late, odd body clock — be patient and clear', category: 'personal', date: '2026-03-17' },
    { id: 5, title: 'Git workflow: development branch, PR to main', category: 'technical', date: '2026-03-16' },
    { id: 6, title: 'Avoid OpenAI terminology — use standard API format', category: 'preference', date: '2026-03-15' },
    { id: 7, title: '54 tools across 6 modes', category: 'project', date: '2026-03-14' },
    { id: 8, title: 'Mission: democratise agentic coding and free education', category: 'project', date: '2026-03-13' },
  ];

  const filtered = memories.filter((m) => {
    if (category !== 'all' && m.category !== category) return false;
    if (search && !m.title.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const catColors: Record<string, string> = {
    technical: '#89b4fa',
    personal: '#f9e2af',
    project: '#a855f7',
    preference: '#a6e3a1',
  };

  return (
    <div style={pageWrapper}>
      <div style={{ maxWidth: 800, margin: '0 auto' }}>
        <div style={pageTitle}>Memory</div>
        <div style={pageSubtitle}>Everything Ava remembers about you and your projects</div>

        {/* Search + Filter */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
          <input
            type="text"
            placeholder="Search memories..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ ...inputStyle, flex: 1 }}
            onFocus={(e) => { e.currentTarget.style.borderColor = '#a855f7'; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = '#313244'; }}
          />
        </div>

        {/* Category tabs */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              style={{
                padding: '6px 14px',
                borderRadius: 6,
                border: 'none',
                fontSize: 12,
                fontWeight: 500,
                cursor: 'pointer',
                background: category === c ? '#a855f7' : '#313244',
                color: category === c ? '#fff' : '#cdd6f4',
                textTransform: 'capitalize' as const,
              }}
              onMouseEnter={(e) => { if (category !== c) e.currentTarget.style.background = '#45475a'; }}
              onMouseLeave={(e) => { if (category !== c) e.currentTarget.style.background = '#313244'; }}
            >
              {c}
            </button>
          ))}
        </div>

        {/* Memory list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map((m) => (
            <div key={m.id} style={{ ...card, marginBottom: 0, display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, color: '#cdd6f4', marginBottom: 4 }}>{m.title}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={badge(catColors[m.category] || '#a6adc8')}>{m.category}</span>
                  <span style={{ fontSize: 11, color: '#6c7086' }}>{m.date}</span>
                </div>
              </div>
              <button
                style={{
                  width: 28, height: 28, borderRadius: 6,
                  background: 'transparent', border: '1px solid #313244',
                  color: '#6c7086', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#f38ba8'; e.currentTarget.style.color = '#f38ba8'; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#313244'; e.currentTarget.style.color = '#6c7086'; }}
                title="Delete memory"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
                  <path d="M10 11v6" />
                  <path d="M14 11v6" />
                </svg>
              </button>
            </div>
          ))}
        </div>

        <div style={{ fontSize: 12, color: '#6c7086', marginTop: 16, textAlign: 'center' }}>
          {filtered.length} {filtered.length === 1 ? 'memory' : 'memories'} found
        </div>
      </div>
    </div>
  );
}

/* ===== 4. Tasks ===== */
export function TasksPage() {
  const [tasks, setTasks] = useState([
    { id: 1, title: 'Review PR #42 — companion sync', done: false, priority: 'high' as const },
    { id: 2, title: 'Write unit tests for agent loop', done: false, priority: 'medium' as const },
    { id: 3, title: 'Update changelog for v0.21.4', done: false, priority: 'low' as const },
    { id: 4, title: 'Design plugin marketplace UI', done: true, priority: 'medium' as const },
    { id: 5, title: 'Fix sidebar resize bug', done: true, priority: 'high' as const },
  ]);
  const [newTask, setNewTask] = useState('');

  const priorityColors = { high: '#f38ba8', medium: '#f9e2af', low: '#a6e3a1' };

  const addTask = () => {
    if (!newTask.trim()) return;
    setTasks((t) => [...t, { id: Date.now(), title: newTask, done: false, priority: 'medium' as const }]);
    setNewTask('');
  };

  const toggle = (id: number) => {
    setTasks((t) => t.map((task) => task.id === id ? { ...task, done: !task.done } : task));
  };

  const pending = tasks.filter((t) => !t.done);
  const completed = tasks.filter((t) => t.done);

  return (
    <div style={pageWrapper}>
      <div style={{ maxWidth: 800, margin: '0 auto' }}>
        <div style={pageTitle}>Tasks</div>
        <div style={pageSubtitle}>{pending.length} pending, {completed.length} completed</div>

        {/* Add task */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 24 }}>
          <input
            type="text"
            placeholder="Add a new task..."
            value={newTask}
            onChange={(e) => setNewTask(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') addTask(); }}
            style={{ ...inputStyle, flex: 1 }}
            onFocus={(e) => { e.currentTarget.style.borderColor = '#a855f7'; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = '#313244'; }}
          />
          <button
            onClick={addTask}
            style={btnPrimary}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#9333ea'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = '#a855f7'; }}
          >
            Add
          </button>
        </div>

        {/* Pending */}
        {pending.length > 0 && (
          <>
            <div style={sectionTitle}>Pending</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 24 }}>
              {pending.map((t) => (
                <div key={t.id} style={{ ...card, marginBottom: 0, display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px' }}>
                  <div
                    onClick={() => toggle(t.id)}
                    style={{
                      width: 20, height: 20, borderRadius: 4,
                      border: '2px solid #313244', cursor: 'pointer', flexShrink: 0,
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#a855f7'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#313244'; }}
                  />
                  <span style={{ fontSize: 14, color: '#cdd6f4', flex: 1 }}>{t.title}</span>
                  <span style={badge(priorityColors[t.priority])}>{t.priority}</span>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Completed */}
        {completed.length > 0 && (
          <>
            <div style={sectionTitle}>Completed</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {completed.map((t) => (
                <div key={t.id} style={{ ...card, marginBottom: 0, display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px', opacity: 0.6 }}>
                  <div
                    onClick={() => toggle(t.id)}
                    style={{
                      width: 20, height: 20, borderRadius: 4,
                      background: '#a855f7', border: '2px solid #a855f7', cursor: 'pointer', flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </div>
                  <span style={{ fontSize: 14, color: '#6c7086', flex: 1, textDecoration: 'line-through' }}>{t.title}</span>
                  <span style={badge(priorityColors[t.priority])}>{t.priority}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ===== 5. Journal ===== */
export function JournalPage() {
  const [dateOffset, setDateOffset] = useState(0);
  const today = new Date();
  today.setDate(today.getDate() + dateOffset);
  const dateStr = today.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  const isToday = dateOffset === 0;

  return (
    <div style={pageWrapper}>
      <div style={{ maxWidth: 800, margin: '0 auto' }}>
        <div style={pageTitle}>Journal</div>
        <div style={pageSubtitle}>Your daily reflections and Ava's observations</div>

        {/* Date navigation */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <button
            onClick={() => setDateOffset((d) => d - 1)}
            style={{ ...btnSecondary, display: 'flex', alignItems: 'center', gap: 6 }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#45475a'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = '#313244'; }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            Previous
          </button>
          <div style={{ fontSize: 15, fontWeight: 500, color: '#cdd6f4' }}>
            {dateStr}
            {isToday && <span style={{ ...badge('#a855f7'), marginLeft: 8 }}>Today</span>}
          </div>
          <button
            onClick={() => setDateOffset((d) => Math.min(d + 1, 0))}
            style={{ ...btnSecondary, display: 'flex', alignItems: 'center', gap: 6, opacity: isToday ? 0.4 : 1, pointerEvents: isToday ? 'none' : 'auto' }}
            onMouseEnter={(e) => { if (!isToday) e.currentTarget.style.background = '#45475a'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = '#313244'; }}
          >
            Next
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </div>

        {/* Your entry */}
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <div style={{
              width: 28, height: 28, borderRadius: '50%',
              background: '#313244', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#cdd6f4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#cdd6f4' }}>Your Entry</div>
          </div>
          {isToday ? (
            <textarea
              placeholder="How was your day? What did you work on? What's on your mind?"
              style={{
                width: '100%', minHeight: 120, background: '#313244', border: '1px solid #313244',
                borderRadius: 8, padding: 14, fontSize: 14, color: '#cdd6f4', outline: 'none',
                resize: 'vertical', lineHeight: 1.6, fontFamily: 'inherit',
              }}
              onFocus={(e) => { e.currentTarget.style.borderColor = '#a855f7'; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = '#313244'; }}
            />
          ) : (
            <div style={{ fontSize: 13, color: '#6c7086', padding: '20px 0', textAlign: 'center' }}>
              No entry for this date
            </div>
          )}
        </div>

        {/* Ava's entry */}
        <div style={{ ...card, borderColor: 'rgba(168,85,247,0.2)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <div style={{
              width: 28, height: 28, borderRadius: '50%',
              background: 'linear-gradient(135deg, #a855f7, #6366f1)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#a855f7' }}>Ava's Observations</div>
          </div>
          {isToday ? (
            <div style={{ fontSize: 14, color: '#a6adc8', lineHeight: 1.7 }}>
              You've had a productive session today. You worked on the IDE dashboard features and made solid progress.
              Your focus was strong in the afternoon — consider keeping that pattern going. Remember to take breaks;
              sustained deep work is better with rest intervals. Keep it up!
            </div>
          ) : (
            <div style={{ fontSize: 13, color: '#6c7086', padding: '20px 0', textAlign: 'center' }}>
              No observations for this date
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ===== 6. Learning ===== */
export function LearningPage() {
  const curricula = [
    { title: 'Rust Fundamentals', progress: 72, lessons: 24, completed: 17, status: 'active' as const },
    { title: 'System Design Patterns', progress: 45, lessons: 18, completed: 8, status: 'active' as const },
    { title: 'TypeScript Advanced Types', progress: 100, lessons: 12, completed: 12, status: 'completed' as const },
    { title: 'WebAssembly Deep Dive', progress: 15, lessons: 20, completed: 3, status: 'active' as const },
    { title: 'Kubernetes & Container Orchestration', progress: 0, lessons: 16, completed: 0, status: 'planned' as const },
  ];

  const statusColors = { active: '#a855f7', completed: '#a6e3a1', planned: '#6c7086' };

  return (
    <div style={pageWrapper}>
      <div style={{ maxWidth: 800, margin: '0 auto' }}>
        <div style={pageTitle}>Learning</div>
        <div style={pageSubtitle}>Free AI-powered education — no price tag on knowledge</div>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 32 }}>
          {[
            { label: 'Active Courses', value: '3', color: '#a855f7' },
            { label: 'Lessons Complete', value: '40', color: '#a6e3a1' },
            { label: 'Study Streak', value: '7 days', color: '#f9e2af' },
          ].map((s) => (
            <div key={s.label} style={{ ...card, textAlign: 'center', marginBottom: 0 }}>
              <div style={{ fontSize: 22, fontWeight: 600, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 11, color: '#6c7086', marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Curriculum list */}
        <div style={sectionTitle}>Curricula</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {curricula.map((c) => (
            <div key={c.title} style={{ ...card, marginBottom: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <div style={{ fontSize: 15, fontWeight: 500, color: '#cdd6f4' }}>{c.title}</div>
                <span style={badge(statusColors[c.status])}>{c.status}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ flex: 1, height: 6, background: '#313244', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{
                    width: `${c.progress}%`,
                    height: '100%',
                    background: c.progress === 100 ? '#a6e3a1' : 'linear-gradient(90deg, #a855f7, #6366f1)',
                    borderRadius: 3,
                    transition: 'width 0.3s',
                  }} />
                </div>
                <span style={{ fontSize: 12, color: '#a6adc8', flexShrink: 0, minWidth: 40, textAlign: 'right' }}>
                  {c.progress}%
                </span>
              </div>
              <div style={{ fontSize: 12, color: '#6c7086', marginTop: 6 }}>
                {c.completed} / {c.lessons} lessons
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ===== 7. Personality ===== */
export function PersonalityPage() {
  const [name, setName] = useState('Ava');
  const [pronouns, setPronouns] = useState('she/her');
  const [tone, setTone] = useState('warm');
  const [energy, setEnergy] = useState('balanced');
  const [style, setStyle] = useState('concise');

  const toneOptions = ['warm', 'professional', 'playful', 'direct', 'empathetic'];
  const energyOptions = ['calm', 'balanced', 'enthusiastic', 'intense'];
  const styleOptions = ['concise', 'detailed', 'conversational', 'technical'];

  const SelectGroup = ({ label, value, options, onChange }: {
    label: string; value: string; options: string[]; onChange: (v: string) => void;
  }) => (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 13, fontWeight: 500, color: '#cdd6f4', marginBottom: 8 }}>{label}</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {options.map((opt) => (
          <button
            key={opt}
            onClick={() => onChange(opt)}
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              border: value === opt ? '1px solid #a855f7' : '1px solid #313244',
              background: value === opt ? 'rgba(168,85,247,0.15)' : '#313244',
              color: value === opt ? '#a855f7' : '#cdd6f4',
              fontSize: 13,
              cursor: 'pointer',
              textTransform: 'capitalize' as const,
              fontWeight: value === opt ? 600 : 400,
            }}
            onMouseEnter={(e) => { if (value !== opt) e.currentTarget.style.background = '#45475a'; }}
            onMouseLeave={(e) => { if (value !== opt) e.currentTarget.style.background = '#313244'; }}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div style={pageWrapper}>
      <div style={{ maxWidth: 800, margin: '0 auto' }}>
        <div style={pageTitle}>Personality</div>
        <div style={pageSubtitle}>Design how Ava communicates with you</div>

        <div style={card}>
          {/* Name */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: '#cdd6f4', marginBottom: 8 }}>Name</div>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={{ ...inputStyle, maxWidth: 300 }}
              onFocus={(e) => { e.currentTarget.style.borderColor = '#a855f7'; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = '#313244'; }}
            />
          </div>

          {/* Pronouns */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: '#cdd6f4', marginBottom: 8 }}>Pronouns</div>
            <div style={{ display: 'flex', gap: 6 }}>
              {['she/her', 'he/him', 'they/them'].map((p) => (
                <button
                  key={p}
                  onClick={() => setPronouns(p)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: 8,
                    border: pronouns === p ? '1px solid #a855f7' : '1px solid #313244',
                    background: pronouns === p ? 'rgba(168,85,247,0.15)' : '#313244',
                    color: pronouns === p ? '#a855f7' : '#cdd6f4',
                    fontSize: 13,
                    cursor: 'pointer',
                    fontWeight: pronouns === p ? 600 : 400,
                  }}
                  onMouseEnter={(e) => { if (pronouns !== p) e.currentTarget.style.background = '#45475a'; }}
                  onMouseLeave={(e) => { if (pronouns !== p) e.currentTarget.style.background = '#313244'; }}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          <SelectGroup label="Tone" value={tone} options={toneOptions} onChange={setTone} />
          <SelectGroup label="Energy" value={energy} options={energyOptions} onChange={setEnergy} />
          <SelectGroup label="Communication Style" value={style} options={styleOptions} onChange={setStyle} />

          <button
            style={{ ...btnPrimary, marginTop: 8 }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#9333ea'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = '#a855f7'; }}
          >
            Save Personality
          </button>
        </div>
      </div>
    </div>
  );
}

/* ===== 8. Cloud Sync ===== */
export function CloudSyncPage() {
  const syncData = [
    { type: 'Memories', local: 24, cloud: 20, icon: '🧠' },
    { type: 'Tasks', local: 12, cloud: 10, icon: '✅' },
    { type: 'Journal Entries', local: 30, cloud: 28, icon: '📓' },
    { type: 'Learning Progress', local: 5, cloud: 5, icon: '🎓' },
    { type: 'Settings', local: 1, cloud: 1, icon: '⚙️' },
    { type: 'Personality', local: 1, cloud: 0, icon: '🎨' },
  ];

  return (
    <div style={pageWrapper}>
      <div style={{ maxWidth: 800, margin: '0 auto' }}>
        <div style={pageTitle}>Cloud Sync</div>
        <div style={pageSubtitle}>Keep your data synchronized across devices</div>

        {/* Sync status */}
        <div style={{ ...card, display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{
            width: 48, height: 48, borderRadius: 12,
            background: 'rgba(168,85,247,0.15)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#a855f7" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="16 16 12 12 8 16" />
              <line x1="12" y1="12" x2="12" y2="21" />
              <path d="M20.39 18.39A5 5 0 0018 9h-1.26A8 8 0 103 16.3" />
            </svg>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 500, color: '#cdd6f4' }}>Last synced: 5 minutes ago</div>
            <div style={{ fontSize: 12, color: '#a6e3a1' }}>All data up to date</div>
          </div>
          <button
            style={btnPrimary}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#9333ea'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = '#a855f7'; }}
          >
            Sync Now
          </button>
        </div>

        {/* Data types */}
        <div style={sectionTitle}>Data Types</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {syncData.map((d) => {
            const inSync = d.local === d.cloud;
            return (
              <div key={d.type} style={{ ...card, marginBottom: 0, display: 'flex', alignItems: 'center', gap: 14, padding: '16px 20px' }}>
                <span style={{ fontSize: 20, width: 32, textAlign: 'center' }}>{d.icon}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 500, color: '#cdd6f4' }}>{d.type}</div>
                  <div style={{ fontSize: 12, color: '#6c7086', marginTop: 2 }}>
                    Device: {d.local} | Cloud: {d.cloud}
                  </div>
                </div>
                {inSync ? (
                  <span style={badge('#a6e3a1')}>Synced</span>
                ) : (
                  <button
                    style={{ ...btnSecondary, padding: '6px 12px', fontSize: 12 }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = '#45475a'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = '#313244'; }}
                  >
                    Push
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ===== 9. Usage ===== */
export function UsagePage() {
  const models = [
    { name: 'DeepSeek Chat', tokens: 8420, pct: 68, color: '#89b4fa' },
    { name: 'Qwen Plus', tokens: 2150, pct: 17, color: '#a855f7' },
    { name: 'Moonshot v1', tokens: 1230, pct: 10, color: '#f9e2af' },
    { name: 'GLM-4 Plus', tokens: 600, pct: 5, color: '#a6e3a1' },
  ];

  const daily = [
    { day: 'Mon', tokens: 8200 },
    { day: 'Tue', tokens: 12400 },
    { day: 'Wed', tokens: 9800 },
    { day: 'Thu', tokens: 15600 },
    { day: 'Fri', tokens: 11200 },
    { day: 'Sat', tokens: 6400 },
    { day: 'Sun', tokens: 3200 },
  ];
  const maxDaily = Math.max(...daily.map((d) => d.tokens));

  return (
    <div style={pageWrapper}>
      <div style={{ maxWidth: 800, margin: '0 auto' }}>
        <div style={pageTitle}>Usage</div>
        <div style={pageSubtitle}>Token consumption and model breakdown</div>

        {/* Total tokens */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 32 }}>
          {[
            { label: 'Today', value: '12.4k', color: '#a855f7' },
            { label: 'This Week', value: '67.0k', color: '#89b4fa' },
            { label: 'This Month', value: '284.2k', color: '#a6e3a1' },
          ].map((s) => (
            <div key={s.label} style={{ ...card, textAlign: 'center', marginBottom: 0 }}>
              <div style={{ fontSize: 22, fontWeight: 600, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 11, color: '#6c7086', marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Daily chart */}
        <div style={card}>
          <div style={sectionTitle}>Daily Usage (this week)</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 140, paddingTop: 12 }}>
            {daily.map((d) => (
              <div key={d.day} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                <div style={{ fontSize: 10, color: '#6c7086' }}>{(d.tokens / 1000).toFixed(1)}k</div>
                <div style={{
                  width: '100%',
                  height: `${(d.tokens / maxDaily) * 100}px`,
                  background: 'linear-gradient(180deg, #a855f7, #6366f1)',
                  borderRadius: '4px 4px 0 0',
                  minHeight: 4,
                }} />
                <div style={{ fontSize: 11, color: '#a6adc8' }}>{d.day}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Model breakdown */}
        <div style={card}>
          <div style={sectionTitle}>Model Breakdown</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {models.map((m) => (
              <div key={m.name}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 13, color: '#cdd6f4' }}>{m.name}</span>
                  <span style={{ fontSize: 12, color: '#6c7086' }}>{(m.tokens / 1000).toFixed(1)}k ({m.pct}%)</span>
                </div>
                <div style={{ height: 6, background: '#313244', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ width: `${m.pct}%`, height: '100%', background: m.color, borderRadius: 3 }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ===== 10. Settings ===== */
export function SettingsPage() {
  const [model, setModel] = useState('deepseek-chat');
  const [theme, setTheme] = useState('dark');
  const [fontSize, setFontSize] = useState('14');
  const [autoSave, setAutoSave] = useState(true);
  const [telemetry, setTelemetry] = useState(false);

  const Toggle = ({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) => (
    <div
      onClick={() => onChange(!value)}
      style={{
        width: 40, height: 22, borderRadius: 11,
        background: value ? '#a855f7' : '#313244',
        cursor: 'pointer', position: 'relative',
        transition: 'background 0.2s',
        flexShrink: 0,
      }}
    >
      <div style={{
        width: 16, height: 16, borderRadius: '50%',
        background: '#fff', position: 'absolute', top: 3,
        left: value ? 21 : 3,
        transition: 'left 0.2s',
      }} />
    </div>
  );

  return (
    <div style={pageWrapper}>
      <div style={{ maxWidth: 800, margin: '0 auto' }}>
        <div style={pageTitle}>Settings</div>
        <div style={pageSubtitle}>Configure your IDE preferences</div>

        {/* Model */}
        <div style={card}>
          <div style={sectionTitle}>AI Model</div>
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            style={{
              ...inputStyle,
              maxWidth: 400,
              appearance: 'auto' as never,
            }}
          >
            <option value="deepseek-chat">DeepSeek Chat</option>
            <option value="deepseek-reasoner">DeepSeek Reasoner</option>
            <option value="qwen-plus">Qwen Plus</option>
            <option value="qwen-max">Qwen Max</option>
            <option value="moonshot-v1-128k">Moonshot v1 128K</option>
            <option value="glm-4-plus">GLM-4 Plus</option>
            <option value="mistral-large">Mistral Large</option>
          </select>
        </div>

        {/* Editor */}
        <div style={card}>
          <div style={sectionTitle}>Editor</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 13, color: '#cdd6f4' }}>Theme</div>
                <div style={{ fontSize: 11, color: '#6c7086' }}>Choose your colour scheme</div>
              </div>
              <select
                value={theme}
                onChange={(e) => setTheme(e.target.value)}
                style={{ ...inputStyle, width: 200 }}
              >
                <option value="dark">Dark (Catppuccin)</option>
                <option value="light">Light</option>
                <option value="monokai">Monokai</option>
                <option value="dracula">Dracula</option>
              </select>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 13, color: '#cdd6f4' }}>Font Size</div>
                <div style={{ fontSize: 11, color: '#6c7086' }}>Editor font size in pixels</div>
              </div>
              <input
                type="number"
                value={fontSize}
                onChange={(e) => setFontSize(e.target.value)}
                style={{ ...inputStyle, width: 80, textAlign: 'center' }}
                onFocus={(e) => { e.currentTarget.style.borderColor = '#a855f7'; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = '#313244'; }}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 13, color: '#cdd6f4' }}>Auto Save</div>
                <div style={{ fontSize: 11, color: '#6c7086' }}>Automatically save files after changes</div>
              </div>
              <Toggle value={autoSave} onChange={setAutoSave} />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 13, color: '#cdd6f4' }}>Telemetry</div>
                <div style={{ fontSize: 11, color: '#6c7086' }}>Help improve Ava by sending anonymous usage data</div>
              </div>
              <Toggle value={telemetry} onChange={setTelemetry} />
            </div>
          </div>
        </div>

        {/* API Keys */}
        <div style={card}>
          <div style={sectionTitle}>API Keys (BYOK)</div>
          <div style={{ fontSize: 12, color: '#6c7086', marginBottom: 16 }}>
            Bring your own keys for direct provider access
          </div>
          {['DeepSeek', 'Qwen (Alibaba)', 'Moonshot (Kimi)', 'Zhipu (GLM)', 'Mistral'].map((provider) => (
            <div key={provider} style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, color: '#a6adc8', marginBottom: 4 }}>{provider}</div>
              <input
                type="password"
                placeholder={`${provider} API key`}
                style={inputStyle}
                onFocus={(e) => { e.currentTarget.style.borderColor = '#a855f7'; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = '#313244'; }}
              />
            </div>
          ))}
          <button
            style={{ ...btnPrimary, marginTop: 8 }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#9333ea'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = '#a855f7'; }}
          >
            Save Keys
          </button>
        </div>
      </div>
    </div>
  );
}

/* ===== 11. Release Notes ===== */
export function ReleaseNotesPage() {
  const releases = [
    {
      version: 'v0.21.4',
      date: '2026-03-22',
      highlights: [
        'Docs sync publish',
        'Web submodule updates',
        'Bug fixes for billing page',
      ],
    },
    {
      version: 'v0.21.0',
      date: '2026-03-20',
      highlights: [
        'Qwen free models added',
        'Pricing updates — 54 tools, 12 models',
        'Companion sync improvements',
      ],
    },
    {
      version: 'v0.20.0',
      date: '2026-03-17',
      highlights: [
        '24 specialist personas across 5 modes',
        'Persona orchestration via Conductor',
        'Companion app overhaul',
        'Demo redesign',
      ],
    },
    {
      version: 'v0.19.0',
      date: '2026-03-15',
      highlights: [
        'Daily briefing and smart reminders',
        'Health and wellness tracking',
        'JARVIS transition layer',
      ],
    },
    {
      version: 'v0.18.0',
      date: '2026-03-12',
      highlights: [
        'Plugin marketplace',
        'Computer use (browser + desktop)',
        'Capacitor wrapper for companion',
      ],
    },
    {
      version: 'v0.15.0',
      date: '2026-03-08',
      highlights: [
        'Evolution Phase 2 complete',
        'Pillars 4-6 shipped',
        '6 modes fully operational',
      ],
    },
  ];

  return (
    <div style={pageWrapper}>
      <div style={{ maxWidth: 800, margin: '0 auto' }}>
        <div style={pageTitle}>Release Notes</div>
        <div style={pageSubtitle}>What is new in Ava | Supernova</div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {releases.map((r, ri) => (
            <div key={r.version} style={{ ...card, marginBottom: 0, borderColor: ri === 0 ? 'rgba(168,85,247,0.3)' : '#313244' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 16, fontWeight: 600, color: ri === 0 ? '#a855f7' : '#cdd6f4' }}>{r.version}</span>
                  {ri === 0 && <span style={badge('#a855f7')}>Latest</span>}
                </div>
                <span style={{ fontSize: 12, color: '#6c7086' }}>{r.date}</span>
              </div>
              <ul style={{ margin: 0, paddingLeft: 20 }}>
                {r.highlights.map((h, i) => (
                  <li key={i} style={{ fontSize: 13, color: '#a6adc8', lineHeight: 1.8 }}>{h}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
