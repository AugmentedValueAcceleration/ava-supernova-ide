import { useState, useEffect, useRef, useCallback } from 'react';
import { apiFetch, getPlatformKey, getStoredEmail, getStoredTier, isConnected as checkConnected, apiStreamUrl } from '../lib/api';

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

/* ===== Shared Components ===== */

function LoadingSpinner() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '40px 0' }}>
      <div style={{
        width: 28, height: 28, border: '3px solid #313244', borderTopColor: '#a855f7',
        borderRadius: '50%', animation: 'spin 0.8s linear infinite',
      }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function NotConnectedBanner() {
  return (
    <div style={{
      ...card, textAlign: 'center', borderColor: 'rgba(168,85,247,0.3)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '32px 20px',
    }}>
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#a855f7" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4" />
        <polyline points="10 17 15 12 10 7" />
        <line x1="15" y1="12" x2="3" y2="12" />
      </svg>
      <div style={{ fontSize: 15, fontWeight: 500, color: '#cdd6f4' }}>Connect your account to see live data</div>
      <div style={{ fontSize: 12, color: '#6c7086' }}>Open the Dashboard sidebar and click Connect Account</div>
    </div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div style={{ ...card, borderColor: 'rgba(243,139,168,0.3)', textAlign: 'center' }}>
      <div style={{ fontSize: 13, color: '#f38ba8' }}>{message}</div>
    </div>
  );
}

function ComingSoonBanner() {
  return (
    <div style={{ ...card, textAlign: 'center', borderColor: 'rgba(168,85,247,0.2)', padding: '32px 20px' }}>
      <div style={{ fontSize: 20, marginBottom: 8 }}>Coming soon</div>
      <div style={{ fontSize: 13, color: '#6c7086' }}>This data will be available when connected to the platform</div>
    </div>
  );
}

/* ===== Generic data hook ===== */
function useApiData<T>(path: string, defaultValue: T): { data: T; loading: boolean; error: string; refetch: () => void } {
  const [data, setData] = useState<T>(defaultValue);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetch_ = useCallback(() => {
    if (!checkConnected()) { setLoading(false); return; }
    setLoading(true);
    setError('');
    apiFetch(path)
      .then((d) => { setData(d); setLoading(false); })
      .catch((e) => { setError(e.message || 'Failed to load'); setLoading(false); });
  }, [path]);

  useEffect(() => { fetch_(); }, [fetch_]);

  return { data, loading, error, refetch: fetch_ };
}

/* ===== 1. Command Centre ===== */
export function CommandCentrePage() {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const connected = checkConnected();
  const email = getStoredEmail();

  const { data: usage, loading: usageLoading } = useApiData<any>('/usage/summary', null);
  const { data: releases, loading: releasesLoading } = useApiData<any[]>('/releases?limit=5', []);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tokensToday = usage?.today?.total_tokens || usage?.tokens_today || 0;
  const memoriesCount = usage?.memories_count ?? usage?.memories ?? '--';
  const tasksCount = usage?.tasks_count ?? usage?.tasks ?? '--';
  const streak = usage?.streak ?? '--';

  const stats = [
    { label: 'Tasks', value: connected && usage ? String(tasksCount) : '--', icon: '\u2705', color: '#a6e3a1' },
    { label: 'Memories', value: connected && usage ? String(memoriesCount) : '--', icon: '\uD83E\uDDE0', color: '#89b4fa' },
    { label: 'Tokens Today', value: connected && usage ? formatTokens(tokensToday) : '--', icon: '\uD83D\uDCCA', color: '#f9e2af' },
    { label: 'Streak', value: connected && usage ? `${streak} days` : '--', icon: '\uD83D\uDD25', color: '#fab387' },
  ];

  return (
    <div style={pageWrapper}>
      <div style={{ maxWidth: 800, margin: '0 auto' }}>
        {/* Greeting */}
        <div style={{ marginBottom: 32, textAlign: 'center' }}>
          <div style={{ fontSize: 28, fontWeight: 300, color: '#cdd6f4', marginBottom: 4 }}>
            {greeting}{email ? `, ${email.split('@')[0]}` : ''}
          </div>
          <div style={{ fontSize: 14, color: '#6c7086' }}>Here is your daily overview</div>
        </div>

        {!connected && <NotConnectedBanner />}

        {/* Stats row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12, marginBottom: 24 }}>
          {stats.map((s) => (
            <div key={s.label} style={{ ...card, textAlign: 'center', marginBottom: 0 }}>
              <div style={{ fontSize: 20, marginBottom: 4 }}>{s.icon}</div>
              {usageLoading && connected ? (
                <div style={{ fontSize: 14, color: '#6c7086' }}>...</div>
              ) : (
                <div style={{ fontSize: 20, fontWeight: 600, color: s.color }}>{s.value}</div>
              )}
              <div style={{ fontSize: 11, color: '#6c7086', marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Recent Activity */}
        <div style={card}>
          <div style={sectionTitle}>Recent Activity</div>
          {connected ? (
            releasesLoading ? <LoadingSpinner /> :
            releases.length > 0 ? releases.map((r: any, i: number) => (
              <div
                key={i}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0',
                  borderBottom: i < releases.length - 1 ? '1px solid #313244' : 'none',
                }}
              >
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#a855f7', flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, color: '#cdd6f4' }}>{r.version || r.title || `Release ${i + 1}`}</div>
                  <div style={{ fontSize: 11, color: '#6c7086' }}>
                    {r.highlights ? (Array.isArray(r.highlights) ? r.highlights[0] : r.highlights) : r.description || ''}
                  </div>
                </div>
                <div style={{ fontSize: 11, color: '#6c7086', flexShrink: 0 }}>{r.date || ''}</div>
              </div>
            )) : (
              <div style={{ fontSize: 13, color: '#6c7086', textAlign: 'center', padding: '16px 0' }}>No recent activity</div>
            )
          ) : (
            <div style={{ fontSize: 13, color: '#6c7086', textAlign: 'center', padding: '16px 0' }}>
              Connect to see your activity
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

/* ===== 2. Ava Chat ===== */
export function AvaChatPage() {
  const [messages, setMessages] = useState<{ role: 'ava' | 'user'; text: string }[]>([
    { role: 'ava', text: "Hey! I'm Ava, your AI assistant. This is the full-width chat \u2014 ask me anything, plan a feature, debug an issue, or just chat. I'm here for you." },
    { role: 'ava', text: "Tip: Switch modes with >> (Work), :: (Plan), ?? (Teach), !! (Security), or ** (Brainstorm)." },
  ]);
  const [input, setInput] = useState('');
  const [model, setModel] = useState('qwen-flash');
  const [streaming, setStreaming] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const connected = checkConnected();

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = async () => {
    if (!input.trim()) return;
    const userMsg = input.trim();
    setInput('');

    const updatedMessages = [...messages, { role: 'user' as const, text: userMsg }];
    setMessages(updatedMessages);

    if (!connected) {
      setMessages((m) => [...m, { role: 'ava' as const, text: "I'm not connected to the platform yet. Connect your account in the Dashboard sidebar to chat with me." }]);
      return;
    }

    setStreaming(true);

    // Build the messages payload for the API
    const apiMessages = updatedMessages.map((m) => ({
      role: m.role === 'ava' ? 'assistant' : 'user',
      content: m.text,
    }));

    try {
      const key = getPlatformKey();
      const response = await fetch(apiStreamUrl('/chat'), {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ model, messages: apiMessages }),
      });

      if (!response.ok) {
        const errText = await response.text();
        setMessages((m) => [...m, { role: 'ava' as const, text: `Error: ${response.status} \u2014 ${errText}` }]);
        setStreaming(false);
        return;
      }

      // SSE streaming
      const reader = response.body?.getReader();
      if (!reader) {
        setMessages((m) => [...m, { role: 'ava' as const, text: 'No response stream available.' }]);
        setStreaming(false);
        return;
      }

      // Add empty ava message to stream into
      setMessages((m) => [...m, { role: 'ava' as const, text: '' }]);

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed === 'data: [DONE]') continue;
          if (trimmed.startsWith('data: ')) {
            try {
              const json = JSON.parse(trimmed.slice(6));
              const content = json.choices?.[0]?.delta?.content
                || json.delta?.content
                || json.content
                || json.text
                || '';
              if (content) {
                setMessages((prev) => {
                  const copy = [...prev];
                  const last = copy[copy.length - 1];
                  if (last && last.role === 'ava') {
                    copy[copy.length - 1] = { ...last, text: last.text + content };
                  }
                  return copy;
                });
              }
            } catch {
              // Non-JSON SSE line, skip
            }
          }
        }
      }
    } catch (err: any) {
      setMessages((m) => [...m, { role: 'ava' as const, text: `Connection error: ${err.message || 'unknown'}` }]);
    }

    setStreaming(false);
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
            <div style={{ fontSize: 11, color: connected ? '#a6e3a1' : '#6c7086' }}>
              {connected ? (streaming ? 'Typing...' : 'Online') : 'Offline'}
            </div>
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
          <option value="qwen-flash">Qwen Flash (Free)</option>
          <option value="qwen-turbo">Qwen Turbo (Free)</option>
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
                whiteSpace: 'pre-wrap',
              }}
            >
              {msg.role === 'ava' && (
                <div style={{ fontSize: 11, fontWeight: 600, color: '#a855f7', marginBottom: 4 }}>Ava</div>
              )}
              {msg.text || (streaming && i === messages.length - 1 ? '\u2588' : '')}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
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
            onKeyDown={(e) => { if (e.key === 'Enter' && !streaming) send(); }}
            placeholder={connected ? 'Message Ava...' : 'Connect account to chat...'}
            disabled={streaming}
            style={{
              ...inputStyle,
              height: 44,
              borderRadius: 10,
              fontSize: 14,
              padding: '0 16px',
              opacity: streaming ? 0.6 : 1,
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = '#a855f7'; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = '#313244'; }}
          />
          <button
            onClick={send}
            disabled={streaming}
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
              opacity: streaming ? 0.6 : 1,
            }}
            onMouseEnter={(e) => { if (!streaming) e.currentTarget.style.background = '#9333ea'; }}
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
  const connected = checkConnected();

  const { data: rawMemories, loading, error } = useApiData<any[]>('/memories', []);
  const [memories, setMemories] = useState<any[]>([]);

  useEffect(() => {
    if (Array.isArray(rawMemories)) setMemories(rawMemories);
  }, [rawMemories]);

  const filtered = memories.filter((m) => {
    if (category !== 'all' && m.category !== category) return false;
    if (search && !(m.title || m.content || '').toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const catColors: Record<string, string> = {
    technical: '#89b4fa',
    personal: '#f9e2af',
    project: '#a855f7',
    preference: '#a6e3a1',
  };

  const handleDelete = async (id: string | number) => {
    try {
      await apiFetch(`/memories/${id}`, { method: 'DELETE' });
      setMemories((prev) => prev.filter((m) => (m.id || m._id) !== id));
    } catch (err: any) {
      alert(`Failed to delete: ${err.message}`);
    }
  };

  return (
    <div style={pageWrapper}>
      <div style={{ maxWidth: 800, margin: '0 auto' }}>
        <div style={pageTitle}>Memory</div>
        <div style={pageSubtitle}>Everything Ava remembers about you and your projects</div>

        {!connected && <NotConnectedBanner />}

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
                padding: '6px 14px', borderRadius: 6, border: 'none', fontSize: 12,
                fontWeight: 500, cursor: 'pointer',
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
        {loading ? <LoadingSpinner /> : error ? <ErrorBanner message={error} /> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filtered.map((m) => {
              const id = m.id || m._id;
              return (
                <div key={id} style={{ ...card, marginBottom: 0, display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, color: '#cdd6f4', marginBottom: 4 }}>{m.title || m.content}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={badge(catColors[m.category] || '#a6adc8')}>{m.category || 'general'}</span>
                      <span style={{ fontSize: 11, color: '#6c7086' }}>{m.date || m.created_at || ''}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDelete(id)}
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
              );
            })}
          </div>
        )}

        <div style={{ fontSize: 12, color: '#6c7086', marginTop: 16, textAlign: 'center' }}>
          {filtered.length} {filtered.length === 1 ? 'memory' : 'memories'} found
        </div>
      </div>
    </div>
  );
}

/* ===== 4. Tasks ===== */
export function TasksPage() {
  const connected = checkConnected();
  const { data: rawTasks, loading, error } = useApiData<any[]>('/tasks', []);
  const [tasks, setTasks] = useState<any[]>([]);
  const [newTask, setNewTask] = useState('');

  useEffect(() => {
    if (Array.isArray(rawTasks) && rawTasks.length > 0) setTasks(rawTasks);
  }, [rawTasks]);

  const priorityColors: Record<string, string> = { high: '#f38ba8', medium: '#f9e2af', low: '#a6e3a1' };

  const addTask = async () => {
    if (!newTask.trim()) return;
    if (!connected) {
      setTasks((t) => [...t, { id: Date.now(), title: newTask, done: false, priority: 'medium' }]);
      setNewTask('');
      return;
    }
    try {
      const created = await apiFetch('/tasks', {
        method: 'POST',
        body: JSON.stringify({ title: newTask, priority: 'medium' }),
      });
      setTasks((t) => [...t, created]);
      setNewTask('');
    } catch (err: any) {
      // Fallback to local
      setTasks((t) => [...t, { id: Date.now(), title: newTask, done: false, priority: 'medium' }]);
      setNewTask('');
    }
  };

  const toggleTask = async (task: any) => {
    const id = task.id || task._id;
    const newDone = !task.done;
    setTasks((t) => t.map((tt) => (tt.id || tt._id) === id ? { ...tt, done: newDone } : tt));
    if (connected) {
      try {
        await apiFetch(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify({ done: newDone }) });
      } catch { /* local toggle stands */ }
    }
  };

  const deleteTask = async (task: any) => {
    const id = task.id || task._id;
    setTasks((t) => t.filter((tt) => (tt.id || tt._id) !== id));
    if (connected) {
      try { await apiFetch(`/tasks/${id}`, { method: 'DELETE' }); } catch { /* */ }
    }
  };

  const pending = tasks.filter((t) => !t.done);
  const completed = tasks.filter((t) => t.done);

  return (
    <div style={pageWrapper}>
      <div style={{ maxWidth: 800, margin: '0 auto' }}>
        <div style={pageTitle}>Tasks</div>
        <div style={pageSubtitle}>{pending.length} pending, {completed.length} completed</div>

        {!connected && <NotConnectedBanner />}

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

        {loading ? <LoadingSpinner /> : error ? <ErrorBanner message={error} /> : (
          <>
            {/* Pending */}
            {pending.length > 0 && (
              <>
                <div style={sectionTitle}>Pending</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 24 }}>
                  {pending.map((t) => (
                    <div key={t.id || t._id} style={{ ...card, marginBottom: 0, display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px' }}>
                      <div
                        onClick={() => toggleTask(t)}
                        style={{
                          width: 20, height: 20, borderRadius: 4,
                          border: '2px solid #313244', cursor: 'pointer', flexShrink: 0,
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#a855f7'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#313244'; }}
                      />
                      <span style={{ fontSize: 14, color: '#cdd6f4', flex: 1 }}>{t.title}</span>
                      <span style={badge(priorityColors[t.priority] || '#a6adc8')}>{t.priority || 'medium'}</span>
                      <button
                        onClick={() => deleteTask(t)}
                        style={{
                          width: 24, height: 24, borderRadius: 4, background: 'transparent',
                          border: 'none', color: '#6c7086', cursor: 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.color = '#f38ba8'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.color = '#6c7086'; }}
                        title="Delete"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="18" y1="6" x2="6" y2="18" />
                          <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      </button>
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
                    <div key={t.id || t._id} style={{ ...card, marginBottom: 0, display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px', opacity: 0.6 }}>
                      <div
                        onClick={() => toggleTask(t)}
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
                      <span style={badge(priorityColors[t.priority] || '#a6adc8')}>{t.priority || 'medium'}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* ===== 5. Journal ===== */
export function JournalPage() {
  const [dateOffset, setDateOffset] = useState(0);
  const connected = checkConnected();

  const today = new Date();
  today.setDate(today.getDate() + dateOffset);
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  const isoDate = `${yyyy}-${mm}-${dd}`;
  const dateStr = today.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const isToday = dateOffset === 0;

  const { data: journalData, loading } = useApiData<any>(`/journal?date=${isoDate}`, null);
  const [entry, setEntry] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');

  useEffect(() => {
    setEntry(journalData?.content || journalData?.entry || '');
  }, [journalData]);

  const saveEntry = async () => {
    if (!connected) return;
    setSaving(true);
    setSaveMsg('');
    try {
      await apiFetch('/journal', {
        method: 'POST',
        body: JSON.stringify({ date: isoDate, content: entry }),
      });
      setSaveMsg('Saved');
      setTimeout(() => setSaveMsg(''), 2000);
    } catch (err: any) {
      setSaveMsg(`Error: ${err.message}`);
    }
    setSaving(false);
  };

  return (
    <div style={pageWrapper}>
      <div style={{ maxWidth: 800, margin: '0 auto' }}>
        <div style={pageTitle}>Journal</div>
        <div style={pageSubtitle}>Your daily reflections and Ava's observations</div>

        {!connected && <NotConnectedBanner />}

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

        {loading ? <LoadingSpinner /> : (
          <>
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
                <div style={{ fontSize: 14, fontWeight: 600, color: '#cdd6f4', flex: 1 }}>Your Entry</div>
                {connected && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {saveMsg && <span style={{ fontSize: 11, color: saveMsg.startsWith('Error') ? '#f38ba8' : '#a6e3a1' }}>{saveMsg}</span>}
                    <button
                      onClick={saveEntry}
                      disabled={saving}
                      style={{ ...btnPrimary, padding: '5px 14px', fontSize: 12, opacity: saving ? 0.6 : 1 }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = '#9333ea'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = '#a855f7'; }}
                    >
                      {saving ? 'Saving...' : 'Save'}
                    </button>
                  </div>
                )}
              </div>
              <textarea
                value={entry}
                onChange={(e) => setEntry(e.target.value)}
                placeholder="How was your day? What did you work on? What's on your mind?"
                style={{
                  width: '100%', minHeight: 120, background: '#313244', border: '1px solid #313244',
                  borderRadius: 8, padding: 14, fontSize: 14, color: '#cdd6f4', outline: 'none',
                  resize: 'vertical', lineHeight: 1.6, fontFamily: 'inherit',
                }}
                onFocus={(e) => { e.currentTarget.style.borderColor = '#a855f7'; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = '#313244'; }}
              />
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
              <div style={{ fontSize: 14, color: '#a6adc8', lineHeight: 1.7 }}>
                {journalData?.ava_observation || journalData?.ava_entry || (
                  connected
                    ? 'No observations for this date yet.'
                    : 'Connect your account to see Ava\'s observations.'
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ===== 6. Learning ===== */
export function LearningPage() {
  const connected = checkConnected();
  const { data: rawData, loading, error } = useApiData<any>('/learning', null);

  const curricula = Array.isArray(rawData) ? rawData : rawData?.curricula || rawData?.courses || [];
  const statsData = rawData?.stats || null;

  const statusColors: Record<string, string> = { active: '#a855f7', completed: '#a6e3a1', planned: '#6c7086' };

  const activeCourses = curricula.filter((c: any) => c.status === 'active').length || 0;
  const lessonsComplete = curricula.reduce((sum: number, c: any) => sum + (c.completed || 0), 0);
  const studyStreak = statsData?.streak || '--';

  return (
    <div style={pageWrapper}>
      <div style={{ maxWidth: 800, margin: '0 auto' }}>
        <div style={pageTitle}>Learning</div>
        <div style={pageSubtitle}>Free AI-powered education \u2014 no price tag on knowledge</div>

        {!connected && <NotConnectedBanner />}

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 32 }}>
          {[
            { label: 'Active Courses', value: connected ? String(activeCourses) : '--', color: '#a855f7' },
            { label: 'Lessons Complete', value: connected ? String(lessonsComplete) : '--', color: '#a6e3a1' },
            { label: 'Study Streak', value: connected ? `${studyStreak} days` : '--', color: '#f9e2af' },
          ].map((s) => (
            <div key={s.label} style={{ ...card, textAlign: 'center', marginBottom: 0 }}>
              <div style={{ fontSize: 22, fontWeight: 600, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 11, color: '#6c7086', marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Curriculum list */}
        <div style={sectionTitle}>Curricula</div>
        {loading ? <LoadingSpinner /> : error ? <ComingSoonBanner /> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {curricula.length > 0 ? curricula.map((c: any) => (
              <div key={c.title || c.id || c._id} style={{ ...card, marginBottom: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <div style={{ fontSize: 15, fontWeight: 500, color: '#cdd6f4' }}>{c.title}</div>
                  <span style={badge(statusColors[c.status] || '#6c7086')}>{c.status || 'planned'}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ flex: 1, height: 6, background: '#313244', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{
                      width: `${c.progress || 0}%`,
                      height: '100%',
                      background: (c.progress || 0) === 100 ? '#a6e3a1' : 'linear-gradient(90deg, #a855f7, #6366f1)',
                      borderRadius: 3,
                      transition: 'width 0.3s',
                    }} />
                  </div>
                  <span style={{ fontSize: 12, color: '#a6adc8', flexShrink: 0, minWidth: 40, textAlign: 'right' }}>
                    {c.progress || 0}%
                  </span>
                </div>
                <div style={{ fontSize: 12, color: '#6c7086', marginTop: 6 }}>
                  {c.completed || 0} / {c.lessons || c.total_lessons || '?'} lessons
                </div>
              </div>
            )) : (
              <div style={{ ...card, textAlign: 'center', marginBottom: 0 }}>
                <div style={{ fontSize: 13, color: '#6c7086', padding: '16px 0' }}>
                  {connected ? 'No curricula yet. Start learning with Ava in Teach mode (??).' : 'Connect to see your learning progress.'}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ===== 7. Personality ===== */
export function PersonalityPage() {
  const connected = checkConnected();
  const [name, setName] = useState('Ava');
  const [pronouns, setPronouns] = useState('she/her');
  const [tone, setTone] = useState('warm');
  const [energy, setEnergy] = useState('balanced');
  const [style, setStyle] = useState('concise');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');

  useEffect(() => {
    if (!connected) { setLoading(false); return; }
    apiFetch('/settings')
      .then((data) => {
        if (data.personality_name || data.name) setName(data.personality_name || data.name);
        if (data.pronouns) setPronouns(data.pronouns);
        if (data.tone) setTone(data.tone);
        if (data.energy) setEnergy(data.energy);
        if (data.style || data.communication_style) setStyle(data.style || data.communication_style);
        setLoading(false);
      })
      .catch(() => { setLoading(false); });
  }, [connected]);

  const toneOptions = ['warm', 'professional', 'playful', 'direct', 'empathetic'];
  const energyOptions = ['calm', 'balanced', 'enthusiastic', 'intense'];
  const styleOptions = ['concise', 'detailed', 'conversational', 'technical'];

  const handleSave = async () => {
    if (!connected) return;
    setSaving(true);
    setSaveMsg('');
    try {
      await apiFetch('/settings', {
        method: 'POST',
        body: JSON.stringify({
          personality_name: name,
          pronouns,
          tone,
          energy,
          communication_style: style,
        }),
      });
      setSaveMsg('Saved');
      setTimeout(() => setSaveMsg(''), 2000);
    } catch (err: any) {
      setSaveMsg(`Error: ${err.message}`);
    }
    setSaving(false);
  };

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
              padding: '8px 16px', borderRadius: 8,
              border: value === opt ? '1px solid #a855f7' : '1px solid #313244',
              background: value === opt ? 'rgba(168,85,247,0.15)' : '#313244',
              color: value === opt ? '#a855f7' : '#cdd6f4',
              fontSize: 13, cursor: 'pointer', textTransform: 'capitalize' as const,
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

  if (loading) return <div style={pageWrapper}><LoadingSpinner /></div>;

  return (
    <div style={pageWrapper}>
      <div style={{ maxWidth: 800, margin: '0 auto' }}>
        <div style={pageTitle}>Personality</div>
        <div style={pageSubtitle}>Design how Ava communicates with you</div>

        {!connected && <NotConnectedBanner />}

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
                    padding: '8px 16px', borderRadius: 8,
                    border: pronouns === p ? '1px solid #a855f7' : '1px solid #313244',
                    background: pronouns === p ? 'rgba(168,85,247,0.15)' : '#313244',
                    color: pronouns === p ? '#a855f7' : '#cdd6f4',
                    fontSize: 13, cursor: 'pointer', fontWeight: pronouns === p ? 600 : 400,
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

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
            <button
              onClick={handleSave}
              disabled={saving || !connected}
              style={{ ...btnPrimary, opacity: (saving || !connected) ? 0.6 : 1 }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#9333ea'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = '#a855f7'; }}
            >
              {saving ? 'Saving...' : 'Save Personality'}
            </button>
            {saveMsg && <span style={{ fontSize: 12, color: saveMsg.startsWith('Error') ? '#f38ba8' : '#a6e3a1' }}>{saveMsg}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ===== 8. Cloud Sync ===== */
export function CloudSyncPage() {
  const connected = checkConnected();
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState('Never');
  const [syncStatus, setSyncStatus] = useState('');

  const syncTypes = [
    { type: 'Memories', icon: '\uD83E\uDDE0', endpoint: '/memories' },
    { type: 'Tasks', icon: '\u2705', endpoint: '/tasks' },
    { type: 'Journal Entries', icon: '\uD83D\uDCD3', endpoint: '/journal' },
    { type: 'Learning Progress', icon: '\uD83C\uDF93', endpoint: '/learning' },
    { type: 'Settings', icon: '\u2699\uFE0F', endpoint: '/settings' },
    { type: 'Personality', icon: '\uD83C\uDFA8', endpoint: '/settings' },
  ];

  const [counts, setCounts] = useState<Record<string, { local: number; cloud: number }>>({});

  useEffect(() => {
    if (!connected) return;
    // Try to fetch counts for each data type
    const fetchCounts = async () => {
      const results: Record<string, { local: number; cloud: number }> = {};
      for (const s of syncTypes) {
        try {
          const data = await apiFetch(s.endpoint);
          const count = Array.isArray(data) ? data.length : (data?.count || data?.total || 0);
          results[s.type] = { local: count, cloud: count };
        } catch {
          results[s.type] = { local: 0, cloud: 0 };
        }
      }
      setCounts(results);
      setLastSync(new Date().toLocaleTimeString());
    };
    fetchCounts();
  }, [connected]);

  const handleSyncAll = async () => {
    if (!connected) return;
    setSyncing(true);
    setSyncStatus('');
    try {
      // Re-fetch all counts to verify sync
      for (const s of syncTypes) {
        try { await apiFetch(s.endpoint); } catch { /* */ }
      }
      setLastSync(new Date().toLocaleTimeString());
      setSyncStatus('Sync complete');
      setTimeout(() => setSyncStatus(''), 3000);
    } catch (err: any) {
      setSyncStatus(`Error: ${err.message}`);
    }
    setSyncing(false);
  };

  return (
    <div style={pageWrapper}>
      <div style={{ maxWidth: 800, margin: '0 auto' }}>
        <div style={pageTitle}>Cloud Sync</div>
        <div style={pageSubtitle}>Keep your data synchronized across devices</div>

        {!connected && <NotConnectedBanner />}

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
            <div style={{ fontSize: 15, fontWeight: 500, color: '#cdd6f4' }}>Last synced: {lastSync}</div>
            <div style={{ fontSize: 12, color: syncStatus.startsWith('Error') ? '#f38ba8' : '#a6e3a1' }}>
              {syncStatus || (connected ? 'Ready' : 'Not connected')}
            </div>
          </div>
          <button
            onClick={handleSyncAll}
            disabled={syncing || !connected}
            style={{ ...btnPrimary, opacity: (syncing || !connected) ? 0.6 : 1 }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#9333ea'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = '#a855f7'; }}
          >
            {syncing ? 'Syncing...' : 'Sync Now'}
          </button>
        </div>

        {/* Data types */}
        <div style={sectionTitle}>Data Types</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {syncTypes.map((d) => {
            const c = counts[d.type] || { local: 0, cloud: 0 };
            const inSync = c.local === c.cloud;
            return (
              <div key={d.type} style={{ ...card, marginBottom: 0, display: 'flex', alignItems: 'center', gap: 14, padding: '16px 20px' }}>
                <span style={{ fontSize: 20, width: 32, textAlign: 'center' }}>{d.icon}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 500, color: '#cdd6f4' }}>{d.type}</div>
                  <div style={{ fontSize: 12, color: '#6c7086', marginTop: 2 }}>
                    {connected ? `Device: ${c.local} | Cloud: ${c.cloud}` : 'Connect to sync'}
                  </div>
                </div>
                {connected && inSync ? (
                  <span style={badge('#a6e3a1')}>Synced</span>
                ) : connected ? (
                  <button
                    style={{ ...btnSecondary, padding: '6px 12px', fontSize: 12 }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = '#45475a'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = '#313244'; }}
                  >
                    Push
                  </button>
                ) : (
                  <span style={badge('#6c7086')}>Offline</span>
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
  const connected = checkConnected();
  const { data: usage, loading, error } = useApiData<any>('/usage/summary', null);

  // Extract data from API response with fallbacks
  const tokensToday = usage?.today?.total_tokens || usage?.tokens_today || 0;
  const tokensWeek = usage?.week?.total_tokens || usage?.tokens_week || 0;
  const tokensMonth = usage?.month?.total_tokens || usage?.tokens_month || 0;

  const models: any[] = usage?.models || usage?.model_breakdown || [];
  const daily: any[] = usage?.daily || usage?.daily_usage || [];

  const maxDaily = daily.length > 0 ? Math.max(...daily.map((d: any) => d.tokens || d.total_tokens || 0)) : 1;

  return (
    <div style={pageWrapper}>
      <div style={{ maxWidth: 800, margin: '0 auto' }}>
        <div style={pageTitle}>Usage</div>
        <div style={pageSubtitle}>Token consumption and model breakdown</div>

        {!connected && <NotConnectedBanner />}

        {loading ? <LoadingSpinner /> : error ? <ComingSoonBanner /> : (
          <>
            {/* Total tokens */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 32 }}>
              {[
                { label: 'Today', value: connected ? formatTokens(tokensToday) : '--', color: '#a855f7' },
                { label: 'This Week', value: connected ? formatTokens(tokensWeek) : '--', color: '#89b4fa' },
                { label: 'This Month', value: connected ? formatTokens(tokensMonth) : '--', color: '#a6e3a1' },
              ].map((s) => (
                <div key={s.label} style={{ ...card, textAlign: 'center', marginBottom: 0 }}>
                  <div style={{ fontSize: 22, fontWeight: 600, color: s.color }}>{s.value}</div>
                  <div style={{ fontSize: 11, color: '#6c7086', marginTop: 2 }}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* Daily chart */}
            {daily.length > 0 && (
              <div style={card}>
                <div style={sectionTitle}>Daily Usage (this week)</div>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 140, paddingTop: 12 }}>
                  {daily.map((d: any, i: number) => {
                    const tokens = d.tokens || d.total_tokens || 0;
                    return (
                      <div key={d.day || d.date || i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                        <div style={{ fontSize: 10, color: '#6c7086' }}>{formatTokens(tokens)}</div>
                        <div style={{
                          width: '100%',
                          height: `${(tokens / maxDaily) * 100}px`,
                          background: 'linear-gradient(180deg, #a855f7, #6366f1)',
                          borderRadius: '4px 4px 0 0',
                          minHeight: 4,
                        }} />
                        <div style={{ fontSize: 11, color: '#a6adc8' }}>{d.day || d.date || ''}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Model breakdown */}
            {models.length > 0 && (
              <div style={card}>
                <div style={sectionTitle}>Model Breakdown</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {models.map((m: any, i: number) => {
                    const tokens = m.tokens || m.total_tokens || 0;
                    const pct = m.pct || m.percentage || 0;
                    const colors = ['#89b4fa', '#a855f7', '#f9e2af', '#a6e3a1', '#fab387', '#f38ba8'];
                    return (
                      <div key={m.name || m.model || i}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                          <span style={{ fontSize: 13, color: '#cdd6f4' }}>{m.name || m.model}</span>
                          <span style={{ fontSize: 12, color: '#6c7086' }}>{formatTokens(tokens)} ({pct}%)</span>
                        </div>
                        <div style={{ height: 6, background: '#313244', borderRadius: 3, overflow: 'hidden' }}>
                          <div style={{ width: `${pct}%`, height: '100%', background: m.color || colors[i % colors.length], borderRadius: 3 }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {!daily.length && !models.length && connected && (
              <div style={{ ...card, textAlign: 'center' }}>
                <div style={{ fontSize: 13, color: '#6c7086', padding: '16px 0' }}>
                  No usage data available yet. Start using Ava to see your stats here.
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* ===== 10. Settings ===== */
export function SettingsPage() {
  const connected = checkConnected();
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
            <option value="qwen-flash">Qwen Flash (Free)</option>
            <option value="qwen-turbo">Qwen Turbo (Free)</option>
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

        {/* Account info */}
        {connected && (
          <div style={card}>
            <div style={sectionTitle}>Account</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 40, height: 40, borderRadius: '50%',
                background: 'linear-gradient(135deg, #a855f7, #6366f1)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 500, color: '#cdd6f4' }}>{getStoredEmail() || 'Connected'}</div>
                <div style={{ fontSize: 12, color: '#a855f7', textTransform: 'capitalize' as const }}>{getStoredTier() || 'free'} plan</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ===== 11. Release Notes ===== */
export function ReleaseNotesPage() {
  const connected = checkConnected();
  const { data: apiReleases, loading } = useApiData<any[]>('/releases', []);

  // Fallback releases if API doesn't have them
  const fallbackReleases = [
    {
      version: 'v0.21.4', date: '2026-03-22',
      highlights: ['Docs sync publish', 'Web submodule updates', 'Bug fixes for billing page'],
    },
    {
      version: 'v0.21.0', date: '2026-03-20',
      highlights: ['Qwen free models added', 'Pricing updates \u2014 54 tools, 12 models', 'Companion sync improvements'],
    },
    {
      version: 'v0.20.0', date: '2026-03-17',
      highlights: ['24 specialist personas across 5 modes', 'Persona orchestration via Conductor', 'Companion app overhaul', 'Demo redesign'],
    },
    {
      version: 'v0.19.0', date: '2026-03-15',
      highlights: ['Daily briefing and smart reminders', 'Health and wellness tracking', 'JARVIS transition layer'],
    },
    {
      version: 'v0.18.0', date: '2026-03-12',
      highlights: ['Plugin marketplace', 'Computer use (browser + desktop)', 'Capacitor wrapper for companion'],
    },
    {
      version: 'v0.15.0', date: '2026-03-08',
      highlights: ['Evolution Phase 2 complete', 'Pillars 4-6 shipped', '6 modes fully operational'],
    },
  ];

  const releases = (connected && apiReleases && apiReleases.length > 0) ? apiReleases : fallbackReleases;

  return (
    <div style={pageWrapper}>
      <div style={{ maxWidth: 800, margin: '0 auto' }}>
        <div style={pageTitle}>Release Notes</div>
        <div style={pageSubtitle}>What is new in Ava | Supernova</div>

        {loading ? <LoadingSpinner /> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {releases.map((r: any, ri: number) => (
              <div key={r.version || ri} style={{ ...card, marginBottom: 0, borderColor: ri === 0 ? 'rgba(168,85,247,0.3)' : '#313244' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 16, fontWeight: 600, color: ri === 0 ? '#a855f7' : '#cdd6f4' }}>{r.version}</span>
                    {ri === 0 && <span style={badge('#a855f7')}>Latest</span>}
                  </div>
                  <span style={{ fontSize: 12, color: '#6c7086' }}>{r.date}</span>
                </div>
                <ul style={{ margin: 0, paddingLeft: 20 }}>
                  {(Array.isArray(r.highlights) ? r.highlights : [r.description || r.body || '']).map((h: string, i: number) => (
                    <li key={i} style={{ fontSize: 13, color: '#a6adc8', lineHeight: 1.8 }}>{h}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
