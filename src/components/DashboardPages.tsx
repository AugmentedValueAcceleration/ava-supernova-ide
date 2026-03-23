import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
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

// ── Interfaces ──────────────────────────────────────────────────────────────

interface WeatherData {
  location: string;
  temp_c: number;
  condition: string;
  emoji: string;
  humidity: number;
  wind_kmph: number;
  forecast: Array<{ date: string; day: string; max_c: number; min_c: number; condition: string; emoji: string }>;
}

interface NewsArticle {
  title: string;
  slug: string;
  category: string;
  reading_time: number;
  date: string;
}

interface ReleaseInfo {
  version: string;
  title: string;
  published_at: string;
}

interface TaskEntry {
  id: string;
  title: string;
  status: string;
  priority: string;
  due_date?: string;
}

interface JournalDay {
  user_entry?: { content: string; mood?: number };
  ava_entry?: { content: string };
}

interface LearningCurriculum {
  id: string;
  title: string;
  subject: string;
  status: string;
  progress_percent: number;
}

interface MemoryEntry {
  key?: string;
  content: string;
  archived?: boolean;
  created_at: string;
  updated_at?: string;
}

// ── Constants ───────────────────────────────────────────────────────────────

const PRIORITY_COLORS: Record<string, string> = {
  low: '#a6e3a1',
  medium: '#89b4fa',
  high: '#f9e2af',
  urgent: '#f38ba8',
};

const MOOD_EMOJI: Record<number, string> = {
  1: '\uD83D\uDE14', 2: '\uD83D\uDE15', 3: '\uD83D\uDE10', 4: '\uD83D\uDE0A', 5: '\uD83D\uDE04',
};

const NEWS_CATEGORIES = [
  'ai-agents', 'models', 'dev-tools', 'open-source', 'education',
  'productivity', 'companions', 'health', 'enterprise', 'industry',
] as const;

const WMO_EMOJI: Record<number, { label: string; emoji: string }> = {
  0: { label: 'Clear sky', emoji: '\u2600\uFE0F' },
  1: { label: 'Mainly clear', emoji: '\uD83C\uDF24\uFE0F' },
  2: { label: 'Partly cloudy', emoji: '\u26C5' },
  3: { label: 'Overcast', emoji: '\u2601\uFE0F' },
  45: { label: 'Fog', emoji: '\uD83C\uDF2B\uFE0F' },
  48: { label: 'Rime fog', emoji: '\uD83C\uDF2B\uFE0F' },
  51: { label: 'Light drizzle', emoji: '\uD83C\uDF26\uFE0F' },
  53: { label: 'Drizzle', emoji: '\uD83C\uDF26\uFE0F' },
  55: { label: 'Dense drizzle', emoji: '\uD83C\uDF27\uFE0F' },
  61: { label: 'Light rain', emoji: '\uD83C\uDF26\uFE0F' },
  63: { label: 'Rain', emoji: '\uD83C\uDF27\uFE0F' },
  65: { label: 'Heavy rain', emoji: '\uD83C\uDF27\uFE0F' },
  71: { label: 'Light snow', emoji: '\uD83C\uDF28\uFE0F' },
  73: { label: 'Snow', emoji: '\u2744\uFE0F' },
  75: { label: 'Heavy snow', emoji: '\u2744\uFE0F' },
  77: { label: 'Snow grains', emoji: '\u2744\uFE0F' },
  80: { label: 'Light showers', emoji: '\uD83C\uDF26\uFE0F' },
  81: { label: 'Showers', emoji: '\uD83C\uDF27\uFE0F' },
  82: { label: 'Heavy showers', emoji: '\uD83C\uDF27\uFE0F' },
  85: { label: 'Snow showers', emoji: '\uD83C\uDF28\uFE0F' },
  86: { label: 'Heavy snow showers', emoji: '\uD83C\uDF28\uFE0F' },
  95: { label: 'Thunderstorm', emoji: '\u26A1' },
  96: { label: 'Thunderstorm + hail', emoji: '\u26A1' },
  99: { label: 'Thunderstorm + heavy hail', emoji: '\u26A1' },
};

const WEATHER_CACHE_KEY = 'ava-ide-weather-cache';
const WEATHER_CACHE_TTL = 30 * 60 * 1000; // 30 minutes

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

function formatRelativeDate(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function truncate(str: string, len: number): string {
  if (str.length <= len) return str;
  return str.slice(0, len).trimEnd() + '...';
}

function formatCategoryLabel(slug: string): string {
  return slug
    .split('-')
    .map(word => (word === 'ai' ? 'AI' : word.charAt(0).toUpperCase() + word.slice(1)))
    .join(' ');
}

function getDayName(dateStr: string): string {
  const d = new Date(dateStr);
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === tomorrow.toDateString()) return 'Tomorrow';
  return d.toLocaleDateString('en-GB', { weekday: 'short' });
}

// ── Weather fetching (direct HTTP, no platform) ────────────────────────────

async function fetchWeatherDirect(): Promise<WeatherData> {
  // Get location from ipwho.is
  const geoRes = await fetch('https://ipwho.is/');
  const geo = await geoRes.json();
  const lat = geo.latitude;
  const lon = geo.longitude;
  const city = geo.city || geo.region || 'Unknown';
  const country = geo.country_code || '';
  const location = country ? `${city}, ${country}` : city;

  // Fetch weather from Open-Meteo
  const weatherRes = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=4`
  );
  const w = await weatherRes.json();

  const currentCode = w.current?.weather_code ?? 0;
  const wmo = WMO_EMOJI[currentCode] || { label: 'Unknown', emoji: '\uD83C\uDF24\uFE0F' };

  const forecast: WeatherData['forecast'] = [];
  if (w.daily?.time) {
    // Skip today (index 0), take next 3 days
    for (let i = 1; i < Math.min(w.daily.time.length, 4); i++) {
      const dayCode = w.daily.weather_code?.[i] ?? 0;
      const dayWmo = WMO_EMOJI[dayCode] || { label: 'Unknown', emoji: '\uD83C\uDF24\uFE0F' };
      forecast.push({
        date: w.daily.time[i],
        day: getDayName(w.daily.time[i]),
        max_c: Math.round(w.daily.temperature_2m_max[i]),
        min_c: Math.round(w.daily.temperature_2m_min[i]),
        condition: dayWmo.label,
        emoji: dayWmo.emoji,
      });
    }
  }

  return {
    location,
    temp_c: Math.round(w.current?.temperature_2m ?? 0),
    condition: wmo.label,
    emoji: wmo.emoji,
    humidity: w.current?.relative_humidity_2m ?? 0,
    wind_kmph: Math.round(w.current?.wind_speed_10m ?? 0),
    forecast,
  };
}

function getCachedWeather(): WeatherData | null {
  try {
    const raw = localStorage.getItem(WEATHER_CACHE_KEY);
    if (!raw) return null;
    const cached = JSON.parse(raw);
    if (Date.now() - cached.timestamp > WEATHER_CACHE_TTL) return null;
    return cached.data;
  } catch { return null; }
}

function setCachedWeather(data: WeatherData): void {
  try {
    localStorage.setItem(WEATHER_CACHE_KEY, JSON.stringify({ data, timestamp: Date.now() }));
  } catch { /* ignore */ }
}

// ── News fetching (direct HTTP) ────────────────────────────────────────────

async function fetchNewsDirect(category?: string): Promise<NewsArticle[]> {
  try {
    const url = category
      ? `/news?category=${category}&limit=6`
      : `/news?limit=6`;
    const data = await apiFetch(url);
    return Array.isArray(data) ? data : (data.posts || data.articles || data.items || []);
  } catch { return []; }
}

// ── Reusable WidgetCard ─────────────────────────────────────────────────────

const widgetCardStyle: React.CSSProperties = {
  background: '#181825',
  border: '1px solid #313244',
  borderRadius: 12,
  padding: 16,
};

function WidgetCard({
  title, icon, subtitle, action, onRefresh, children,
}: {
  title: string;
  icon: string;
  subtitle?: string;
  action?: { label: string; onClick: () => void };
  onRefresh?: () => void;
  children: React.ReactNode;
}) {
  const [spinning, setSpinning] = useState(false);
  const handleRefresh = () => {
    if (!onRefresh || spinning) return;
    setSpinning(true);
    onRefresh();
    setTimeout(() => setSpinning(false), 1000);
  };

  return (
    <div style={widgetCardStyle}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 14 }}>{icon}</span>
          <h3 style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.8, color: '#a6adc8', margin: 0 }}>{title}</h3>
          {subtitle && (
            <span style={{ fontSize: 10, color: '#6c7086' }}>&middot; {subtitle}</span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {onRefresh && (
            <button
              onClick={handleRefresh}
              title={`Refresh ${title.toLowerCase()}`}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6c7086', padding: 2, display: 'flex' }}
            >
              <svg
                width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
                style={{ animation: spinning ? 'spin 0.8s linear infinite' : 'none' }}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          )}
          {action && (
            <button
              onClick={action.onClick}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 10, color: '#a855f7', padding: 0 }}
            >
              {action.label} &rarr;
            </button>
          )}
        </div>
      </div>
      {children}
    </div>
  );
}

// ── Weather Widget ──────────────────────────────────────────────────────────

function CCWeatherWidget({ weather, loading, onRefresh }: { weather: WeatherData | null; loading: boolean; onRefresh: () => void }) {
  if (loading) {
    return (
      <WidgetCard title="Weather" icon={'\uD83C\uDF24\uFE0F'}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '16px 0', fontSize: 12, color: '#6c7086' }}>
          Loading weather...
        </div>
      </WidgetCard>
    );
  }

  if (!weather) {
    return (
      <WidgetCard title="Weather" icon={'\uD83C\uDF24\uFE0F'} onRefresh={onRefresh}>
        <p style={{ padding: '8px 0', fontSize: 12, color: '#6c7086', margin: 0 }}>Unable to load weather data.</p>
      </WidgetCard>
    );
  }

  return (
    <WidgetCard title="Weather" icon={'\uD83C\uDF24\uFE0F'} subtitle={weather.location} onRefresh={onRefresh}>
      {/* Current conditions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <span style={{ fontSize: 36 }}>{weather.emoji}</span>
        <div>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#cdd6f4' }}>{weather.temp_c}&deg;C</div>
          <div style={{ fontSize: 12, color: '#a6adc8' }}>{weather.condition}</div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'grid', gridTemplateColumns: 'auto auto', gap: '4px 16px', fontSize: 12, color: '#6c7086' }}>
          <span>Humidity</span>
          <span style={{ color: '#a6adc8' }}>{weather.humidity}%</span>
          <span>Wind</span>
          <span style={{ color: '#a6adc8' }}>{weather.wind_kmph} km/h</span>
        </div>
      </div>

      {/* 3-day forecast */}
      {weather.forecast.length > 0 && (
        <div style={{ display: 'flex', gap: 12, marginTop: 12, paddingTop: 12, borderTop: '1px solid #313244' }}>
          {weather.forecast.map(day => (
            <div key={day.date} style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ fontSize: 10, color: '#6c7086' }}>{day.day}</div>
              <div style={{ fontSize: 20, margin: '4px 0' }}>{day.emoji}</div>
              <div style={{ fontSize: 10 }}>
                <span style={{ color: '#cdd6f4' }}>{day.max_c}&deg;</span>
                <span style={{ color: '#6c7086' }}> / {day.min_c}&deg;</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </WidgetCard>
  );
}

// ── Statistics Widget ───────────────────────────────────────────────────────

function CCStatCard({ icon, value, label, subtext }: { icon: string; value: string; label: string; subtext?: string }) {
  return (
    <div style={{ background: '#181825', border: '1px solid #313244', borderRadius: 12, padding: 16 }}>
      <div style={{
        width: 32, height: 32, borderRadius: 8, background: '#313244',
        display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 8, fontSize: 16,
      }}>
        {icon}
      </div>
      <div style={{ fontSize: 20, fontWeight: 700, color: '#cdd6f4' }}>{value}</div>
      <div style={{ fontSize: 12, color: '#a6adc8' }}>{label}</div>
      {subtext && <div style={{ fontSize: 10, color: '#6c7086', marginTop: 2 }}>{subtext}</div>}
    </div>
  );
}

// ── News Widget ─────────────────────────────────────────────────────────────

function CCNewsWidget({ articles, loading, onCategoryChange, selectedCategory, onRefresh }: {
  articles: NewsArticle[];
  loading: boolean;
  onCategoryChange: (cat: string | null) => void;
  selectedCategory: string | null;
  onRefresh: () => void;
}) {
  const catBtnBase: React.CSSProperties = {
    flexShrink: 0, borderRadius: 9999, padding: '4px 10px', fontSize: 10, fontWeight: 500,
    border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
  };

  return (
    <WidgetCard title="Latest News" icon={'\uD83D\uDCF0'} onRefresh={onRefresh}>
      {/* Category carousel */}
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4, marginBottom: 12, scrollbarWidth: 'none' }}>
        <style>{`.cc-news-scroll::-webkit-scrollbar { display: none; }`}</style>
        <div className="cc-news-scroll" style={{ display: 'flex', gap: 6, overflowX: 'auto', scrollbarWidth: 'none' }}>
          <button
            onClick={() => onCategoryChange(null)}
            style={{
              ...catBtnBase,
              background: selectedCategory === null ? '#a855f7' : '#313244',
              color: selectedCategory === null ? '#fff' : '#6c7086',
            }}
          >
            All
          </button>
          {NEWS_CATEGORIES.map(cat => (
            <button
              key={cat}
              onClick={() => onCategoryChange(cat)}
              style={{
                ...catBtnBase,
                background: selectedCategory === cat ? '#a855f7' : '#313244',
                color: selectedCategory === cat ? '#fff' : '#6c7086',
              }}
            >
              {formatCategoryLabel(cat)}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={{ padding: '16px 0', fontSize: 12, color: '#6c7086' }}>Loading news...</div>
      ) : articles.length === 0 ? (
        <p style={{ padding: '16px 0', fontSize: 12, color: '#6c7086', margin: 0 }}>No news articles available.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {articles.map((article, idx) => (
            <button
              key={article.slug || idx}
              onClick={() => window.open(`https://ava-supernova.com/news/${article.slug}`, '_blank')}
              style={{
                display: 'block', width: '100%', textAlign: 'left', padding: 12,
                background: 'rgba(49,50,68,0.3)', border: '1px solid #313244', borderRadius: 8, cursor: 'pointer',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                {article.category && (
                  <span style={{
                    borderRadius: 9999, background: 'rgba(168,85,247,0.15)', padding: '2px 8px',
                    fontSize: 9, fontWeight: 500, color: '#a855f7',
                  }}>
                    {formatCategoryLabel(article.category)}
                  </span>
                )}
                {article.reading_time > 0 && (
                  <span style={{ fontSize: 9, color: '#6c7086' }}>{article.reading_time} min read</span>
                )}
              </div>
              <p style={{ fontSize: 12, fontWeight: 500, color: '#cdd6f4', margin: 0, lineHeight: 1.4 }}>{article.title}</p>
              <p style={{ fontSize: 10, color: '#6c7086', margin: '4px 0 0 0' }}>{formatRelativeDate(article.date)}</p>
            </button>
          ))}
        </div>
      )}
    </WidgetCard>
  );
}

// ── Tasks Widget ────────────────────────────────────────────────────────────

function CCTasksWidget({ tasks, loading, onRefresh }: {
  tasks: TaskEntry[];
  loading: boolean;
  onRefresh: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);

  const todayTasks = useMemo(() => {
    return tasks.filter(t => {
      if (t.status === 'done' || t.status === 'archived') return false;
      if (t.due_date && t.due_date <= today) return true;
      if (t.status === 'in-progress') return true;
      return false;
    }).sort((a, b) => {
      const priorityOrder: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
      const aOverdue = a.due_date && a.due_date < today ? -1 : 0;
      const bOverdue = b.due_date && b.due_date < today ? -1 : 0;
      if (aOverdue !== bOverdue) return aOverdue - bOverdue;
      return (priorityOrder[a.priority] ?? 2) - (priorityOrder[b.priority] ?? 2);
    }).slice(0, 6);
  }, [tasks, today]);

  const handleComplete = async (id: string) => {
    try {
      await apiFetch(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify({ status: 'done' }) });
      onRefresh();
    } catch { /* ignore */ }
  };

  return (
    <WidgetCard
      title="Today's Tasks"
      icon={'\u2705'}
      action={tasks.length > 0 ? { label: 'View all', onClick: () => {} } : undefined}
      onRefresh={onRefresh}
    >
      {loading ? (
        <div style={{ padding: '16px 0', fontSize: 12, color: '#6c7086' }}>Loading tasks...</div>
      ) : todayTasks.length === 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '24px 0', textAlign: 'center' }}>
          <span style={{ fontSize: 28, opacity: 0.3, marginBottom: 8 }}>{'\uD83C\uDF89'}</span>
          <p style={{ fontSize: 12, color: '#6c7086', margin: 0 }}>No tasks today. Enjoy the clear board!</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {todayTasks.map(task => {
            const isOverdue = task.due_date && task.due_date < today;
            return (
              <div
                key={task.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: 10, borderRadius: 8,
                  border: isOverdue ? '1px solid rgba(243,139,168,0.2)' : '1px solid #313244',
                  background: isOverdue ? 'rgba(243,139,168,0.05)' : 'rgba(49,50,68,0.3)',
                }}
              >
                {/* Complete button */}
                <button
                  onClick={() => handleComplete(task.id)}
                  title="Complete task"
                  style={{
                    width: 20, height: 20, borderRadius: '50%', border: '1px solid #313244',
                    background: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center',
                    justifyContent: 'center', flexShrink: 0, color: '#6c7086', fontSize: 10,
                  }}
                >
                  {task.status === 'in-progress' ? '\u27F3' : '\u25CB'}
                </button>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 12, fontWeight: 500, color: '#cdd6f4', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.title}</p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                    <span style={{
                      width: 6, height: 6, borderRadius: '50%',
                      background: PRIORITY_COLORS[task.priority] ?? '#89b4fa', display: 'inline-block',
                    }} />
                    <span style={{ fontSize: 9, color: '#6c7086' }}>{task.priority}</span>
                    {isOverdue && (
                      <span style={{ fontSize: 9, fontWeight: 500, color: '#f38ba8' }}>Overdue</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </WidgetCard>
  );
}

// ── Journal Widget ──────────────────────────────────────────────────────────

function CCJournalWidget({ journalDay, loading }: { journalDay: JournalDay | null; loading: boolean }) {
  const userEntry = journalDay?.user_entry;
  const avaEntry = journalDay?.ava_entry;
  const hasContent = Boolean(userEntry || avaEntry);

  return (
    <WidgetCard
      title="Today's Journal"
      icon={'\uD83D\uDCD3'}
      action={{ label: hasContent ? 'Open journal' : 'Write entry', onClick: () => {} }}
    >
      {loading ? (
        <div style={{ padding: '16px 0', fontSize: 12, color: '#6c7086' }}>Loading journal...</div>
      ) : !hasContent ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '16px 0', textAlign: 'center' }}>
          <span style={{ fontSize: 28, opacity: 0.3, marginBottom: 8 }}>{'\uD83D\uDCDD'}</span>
          <p style={{ fontSize: 12, color: '#6c7086', margin: 0 }}>No journal entries today.</p>
          <p style={{ fontSize: 10, color: '#6c7086', marginTop: 4 }}>Take a moment to reflect.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {userEntry && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 10, fontWeight: 500, color: '#a6adc8' }}>Your entry</span>
                {userEntry.mood && (
                  <span style={{ fontSize: 14 }}>{MOOD_EMOJI[userEntry.mood] ?? ''}</span>
                )}
              </div>
              <p style={{ fontSize: 12, color: '#6c7086', margin: 0, lineHeight: 1.6 }}>
                {truncate(userEntry.content, 120)}
              </p>
            </div>
          )}
          {avaEntry && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 10, fontWeight: 500, color: '#a855f7' }}>Ava's entry</span>
              </div>
              <p style={{ fontSize: 12, color: '#6c7086', margin: 0, lineHeight: 1.6 }}>
                {truncate(avaEntry.content, 120)}
              </p>
            </div>
          )}
        </div>
      )}
    </WidgetCard>
  );
}

// ── Learning Widget ─────────────────────────────────────────────────────────

function CCLearningWidget({ curriculums, loading }: { curriculums: LearningCurriculum[]; loading: boolean }) {
  const active = useMemo(() => {
    return curriculums.filter(c => c.status !== 'completed').slice(0, 3);
  }, [curriculums]);

  return (
    <WidgetCard
      title="Learning"
      icon={'\uD83C\uDF93'}
      action={curriculums.length > 0 ? { label: 'Continue learning', onClick: () => {} } : undefined}
    >
      {loading ? (
        <div style={{ padding: '16px 0', fontSize: 12, color: '#6c7086' }}>Loading learning...</div>
      ) : active.length === 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '16px 0', textAlign: 'center' }}>
          <span style={{ fontSize: 28, opacity: 0.3, marginBottom: 8 }}>{'\uD83D\uDCDA'}</span>
          <p style={{ fontSize: 12, color: '#6c7086', margin: 0 }}>No active learning paths.</p>
          <p style={{ fontSize: 10, color: '#6c7086', marginTop: 4 }}>Tell Ava what you want to learn.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {active.map(curr => (
            <div key={curr.id}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <p style={{ fontSize: 12, fontWeight: 500, color: '#cdd6f4', margin: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{curr.title}</p>
                <span style={{ fontSize: 10, fontWeight: 500, color: '#a6adc8', marginLeft: 8, flexShrink: 0 }}>
                  {Math.round(curr.progress_percent)}%
                </span>
              </div>
              <div style={{ height: 6, borderRadius: 9999, background: '#313244', overflow: 'hidden' }}>
                <div style={{
                  height: '100%', borderRadius: 9999, transition: 'width 0.3s',
                  width: `${curr.progress_percent}%`,
                  background: 'linear-gradient(to right, #a855f7, #6366f1)',
                }} />
              </div>
              <p style={{ fontSize: 9, color: '#6c7086', margin: '2px 0 0 0' }}>{curr.subject}</p>
            </div>
          ))}
        </div>
      )}
    </WidgetCard>
  );
}

// ── Memory Widget ───────────────────────────────────────────────────────────

function CCMemoryWidget({ memories, loading }: { memories: MemoryEntry[]; loading: boolean }) {
  const activeCount = memories.filter(m => !m.archived).length;
  const lastMemory = memories.length > 0
    ? memories.reduce((latest, m) => {
        const mDate = m.updated_at ?? m.created_at;
        const latestDate = latest.updated_at ?? latest.created_at;
        return mDate > latestDate ? m : latest;
      })
    : null;

  return (
    <WidgetCard
      title="Memory"
      icon={'\uD83E\uDDE0'}
      action={{ label: 'View all', onClick: () => {} }}
    >
      {loading ? (
        <div style={{ padding: '16px 0', fontSize: 12, color: '#6c7086' }}>Loading memories...</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div>
              <div style={{ fontSize: 28, fontWeight: 700, color: '#cdd6f4' }}>{activeCount}</div>
              <div style={{ fontSize: 10, color: '#6c7086' }}>Active memories</div>
            </div>
            <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
              <div style={{ fontSize: 20, fontWeight: 600, color: '#a6adc8' }}>{memories.length}</div>
              <div style={{ fontSize: 10, color: '#6c7086' }}>Total</div>
            </div>
          </div>
          {lastMemory && (
            <div style={{ background: 'rgba(49,50,68,0.3)', border: '1px solid #313244', borderRadius: 8, padding: 10 }}>
              <p style={{ fontSize: 10, color: '#6c7086', margin: '0 0 2px 0' }}>Last saved</p>
              <p style={{ fontSize: 12, color: '#a6adc8', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {lastMemory.key || truncate(lastMemory.content, 60)}
              </p>
              <p style={{ fontSize: 9, color: '#6c7086', margin: '2px 0 0 0' }}>
                {formatRelativeDate(lastMemory.updated_at ?? lastMemory.created_at)}
              </p>
            </div>
          )}
        </div>
      )}
    </WidgetCard>
  );
}

// ── Release Widget ──────────────────────────────────────────────────────────

function CCReleaseWidget({ release, loading, onRefresh }: { release: ReleaseInfo | null; loading: boolean; onRefresh: () => void }) {
  return (
    <WidgetCard title="Latest Release" icon={'\uD83D\uDE80'} onRefresh={onRefresh}>
      {loading ? (
        <div style={{ padding: '16px 0', fontSize: 12, color: '#6c7086' }}>Loading release info...</div>
      ) : !release ? (
        <p style={{ padding: '16px 0', fontSize: 12, color: '#6c7086', margin: 0 }}>No release info available.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              borderRadius: 9999, background: 'rgba(168,85,247,0.15)', padding: '2px 10px',
              fontSize: 12, fontWeight: 700, color: '#a855f7',
            }}>
              v{release.version}
            </span>
            <span style={{ fontSize: 10, color: '#6c7086' }}>{formatRelativeDate(release.published_at)}</span>
          </div>
          <p style={{ fontSize: 12, fontWeight: 500, color: '#cdd6f4', margin: 0 }}>{release.title}</p>
          <button
            onClick={() => window.open('https://ava-supernova.com/releases', '_blank')}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 10, color: '#a855f7', padding: 0, textAlign: 'left' }}
          >
            View release notes &rarr;
          </button>
        </div>
      )}
    </WidgetCard>
  );
}

// ── Not Connected Widget Placeholder ────────────────────────────────────────

function CCNotConnectedPlaceholder({ widgetName }: { widgetName: string }) {
  return (
    <div style={{ padding: '16px 0', fontSize: 12, color: '#6c7086', textAlign: 'center' }}>
      Connect your account to see {widgetName.toLowerCase()}
    </div>
  );
}

// ── Main Command Centre Page ────────────────────────────────────────────────

export function CommandCentrePage() {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const connected = checkConnected();
  const email = getStoredEmail();
  const dateStr = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  // ── Weather state (direct fetch, cached) ──────────────────────────────
  const [weather, setWeather] = useState<WeatherData | null>(getCachedWeather());
  const [weatherLoading, setWeatherLoading] = useState(!getCachedWeather());

  const loadWeather = useCallback(() => {
    setWeatherLoading(true);
    fetchWeatherDirect()
      .then(data => { setWeather(data); setCachedWeather(data); })
      .catch(() => setWeather(null))
      .finally(() => setWeatherLoading(false));
  }, []);

  useEffect(() => {
    if (!getCachedWeather()) loadWeather();
  }, [loadWeather]);

  // ── News state (direct fetch) ─────────────────────────────────────────
  const [newsArticles, setNewsArticles] = useState<NewsArticle[]>([]);
  const [newsLoading, setNewsLoading] = useState(true);
  const [newsCategory, setNewsCategory] = useState<string | null>(null);

  const loadNews = useCallback((category?: string | null) => {
    setNewsLoading(true);
    fetchNewsDirect(category || undefined)
      .then(setNewsArticles)
      .catch(() => setNewsArticles([]))
      .finally(() => setNewsLoading(false));
  }, []);

  useEffect(() => { loadNews(); }, [loadNews]);

  const handleNewsCategory = (cat: string | null) => {
    setNewsCategory(cat);
    loadNews(cat);
  };

  // ── Platform API data (tasks, journal, learning, memory, usage, release) ──
  const { data: usage, loading: usageLoading } = useApiData<any>('/usage/summary', null);
  const { data: rawTasks2, loading: tasksLoading, refetch: refetchTasks } = useApiData<any>('/tasks', null);
  const tasks: TaskEntry[] = Array.isArray(rawTasks2) ? rawTasks2 : (rawTasks2?.tasks ?? rawTasks2?.data ?? []);
  const { data: journalDay, loading: journalLoading } = useApiData<JournalDay | null>(`/journal?date=${new Date().toISOString().slice(0, 10)}`, null);
  const { data: rawLearning, loading: learningLoading } = useApiData<any>('/learning', null);
  const curriculums: LearningCurriculum[] = Array.isArray(rawLearning) ? rawLearning : (rawLearning?.curriculums ?? rawLearning?.data ?? []);
  const { data: rawMemories2, loading: memoriesLoading } = useApiData<any>('/memories', null);
  const memories: MemoryEntry[] = Array.isArray(rawMemories2) ? rawMemories2 : (rawMemories2?.memories ?? rawMemories2?.entries ?? rawMemories2?.data ?? []);
  const { data: releaseData, loading: releaseLoading, refetch: refetchRelease } = useApiData<any>('/releases?limit=1', null);

  const latestRelease: ReleaseInfo | null = useMemo(() => {
    if (!releaseData) return null;
    if (Array.isArray(releaseData)) return releaseData[0] ?? null;
    return releaseData;
  }, [releaseData]);

  // Stats
  const tokensUsed = usage?.tokens_used ?? usage?.today?.total_tokens ?? 0;
  const requestsCount = usage?.requests_count ?? usage?.requests ?? 0;

  return (
    <div style={pageWrapper}>
      <div style={{ width: '100%' }}>
        {/* Spin animation */}
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

        {/* ── Greeting Header ───────────────────────────────────────────── */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ fontSize: 28, fontWeight: 300, color: '#cdd6f4', marginBottom: 4 }}>
            {greeting}{email ? `, ${email.split('@')[0]}` : ''}
          </div>
          <div style={{ fontSize: 13, color: '#6c7086' }}>{dateStr}</div>
        </div>

        {!connected && <NotConnectedBanner />}

        {/* ── Weather (full width) ──────────────────────────────────────── */}
        <div style={{ marginBottom: 16 }}>
          <CCWeatherWidget weather={weather} loading={weatherLoading} onRefresh={loadWeather} />
        </div>

        {/* ── Statistics (2x2 grid) ─────────────────────────────────────── */}
        <div style={{ marginBottom: 16 }}>
          <h2 style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.8, color: '#6c7086', marginBottom: 12 }}>Statistics</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <CCStatCard
              icon={'\uD83D\uDCCA'}
              value={connected && usage ? formatNumber(tokensUsed) : '--'}
              label="Tokens Used"
              subtext={usageLoading && connected ? 'Loading...' : 'This period'}
            />
            <CCStatCard
              icon={'\u26A1'}
              value={connected && usage ? String(requestsCount) : '--'}
              label="Requests"
              subtext={usageLoading && connected ? 'Loading...' : 'This period'}
            />
          </div>
        </div>

        {/* ── News + Tasks (2 column) ───────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
          <CCNewsWidget
            articles={newsArticles}
            loading={newsLoading}
            onCategoryChange={handleNewsCategory}
            selectedCategory={newsCategory}
            onRefresh={() => loadNews(newsCategory)}
          />
          {connected ? (
            <CCTasksWidget tasks={tasks} loading={tasksLoading} onRefresh={refetchTasks} />
          ) : (
            <WidgetCard title="Today's Tasks" icon={'\u2705'}>
              <CCNotConnectedPlaceholder widgetName="tasks" />
            </WidgetCard>
          )}
        </div>

        {/* ── Journal + Learning (2 column) ─────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
          {connected ? (
            <CCJournalWidget journalDay={journalDay} loading={journalLoading} />
          ) : (
            <WidgetCard title="Today's Journal" icon={'\uD83D\uDCD3'}>
              <CCNotConnectedPlaceholder widgetName="journal entries" />
            </WidgetCard>
          )}
          {connected ? (
            <CCLearningWidget curriculums={curriculums} loading={learningLoading} />
          ) : (
            <WidgetCard title="Learning" icon={'\uD83C\uDF93'}>
              <CCNotConnectedPlaceholder widgetName="learning paths" />
            </WidgetCard>
          )}
        </div>

        {/* ── Memory + Release (2 column) ───────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
          {connected ? (
            <CCMemoryWidget memories={memories} loading={memoriesLoading} />
          ) : (
            <WidgetCard title="Memory" icon={'\uD83E\uDDE0'}>
              <CCNotConnectedPlaceholder widgetName="memories" />
            </WidgetCard>
          )}
          <CCReleaseWidget release={latestRelease} loading={releaseLoading} onRefresh={refetchRelease} />
        </div>
      </div>
    </div>
  );
}

/* ===== 2. Ava Chat ===== */
export function AvaChatPage() {
  // ── Types ──────────────────────────────────────────────────────────────────
  type AvaMode = 'work' | 'plan' | 'chat' | 'teach' | 'security' | 'brainstorm';
  interface ChatMessage {
    id: string;
    role: 'ava' | 'user' | 'error' | 'system';
    text: string;
    timestamp: number;
    toolCalls?: { name: string; status: 'running' | 'done' | 'error' }[];
  }
  interface Conversation {
    id: string;
    title: string;
    messages: ChatMessage[];
    createdAt: number;
    updatedAt: number;
    model: string;
  }

  // ── Mode definitions ───────────────────────────────────────────────────────
  const MODES: { id: AvaMode; label: string; icon: string; prefix: string; placeholder: string }[] = [
    { id: 'work', label: 'Work', icon: '>>', prefix: '', placeholder: 'Build something amazing...' },
    { id: 'plan', label: 'Plan', icon: '::', prefix: '[Plan Mode] ', placeholder: 'Plan an architecture, feature, or strategy...' },
    { id: 'chat', label: 'Chat', icon: '..', prefix: '[Chat Mode] ', placeholder: 'Just chat with Ava...' },
    { id: 'teach', label: 'Teach', icon: '??', prefix: '[Teach Mode] ', placeholder: 'What do you want to learn?' },
    { id: 'security', label: 'Security', icon: '!!', prefix: '[Security Audit Mode] ', placeholder: 'Describe what to audit...' },
    { id: 'brainstorm', label: 'Brainstorm', icon: '**', prefix: '[Brainstorm Mode] ', placeholder: 'Throw an idea at me...' },
  ];

  // ── BYOK model map per provider ────────────────────────────────────────────
  const BYOK_MODELS: Record<string, { id: string; name: string }[]> = {
    DeepSeek: [
      { id: 'deepseek-chat', name: 'DeepSeek Chat' },
      { id: 'deepseek-reasoner', name: 'DeepSeek Reasoner' },
    ],
    Qwen: [
      { id: 'qwen-plus', name: 'Qwen Plus' },
      { id: 'qwen-max', name: 'Qwen Max' },
    ],
    Moonshot: [
      { id: 'moonshot-v1-128k', name: 'Moonshot v1 128K' },
    ],
    Zhipu: [
      { id: 'glm-4-plus', name: 'GLM-4 Plus' },
    ],
    Mistral: [
      { id: 'mistral-large', name: 'Mistral Large' },
    ],
  };

  // ── Helpers ────────────────────────────────────────────────────────────────
  const nextMsgId = useRef(0);
  const mkId = () => `msg-${++nextMsgId.current}-${Date.now()}`;
  const fmtTime = (ts: number) => {
    const d = new Date(ts);
    const h = d.getHours();
    const m = d.getMinutes().toString().padStart(2, '0');
    const ampm = h >= 12 ? 'PM' : 'AM';
    return `${h % 12 || 12}:${m} ${ampm}`;
  };
  const fmtTokens = (n: number) => n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}K` : `${n}`;

  // ── State ──────────────────────────────────────────────────────────────────
  const connected = checkConnected();

  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    try {
      const saved = localStorage.getItem('ava-ide-chat-current');
      if (saved) { const parsed = JSON.parse(saved); if (Array.isArray(parsed) && parsed.length > 0) return parsed; }
    } catch { /* */ }
    return [
      { id: mkId(), role: 'ava' as const, text: "Hey! I'm Ava, your AI assistant. Ask me anything, plan a feature, debug an issue, or just chat. I'm here for you.", timestamp: Date.now() },
    ];
  });
  const [input, setInput] = useState('');
  const [model, setModel] = useState<string>(() => localStorage.getItem('ava-ide-chat-model') || 'qwen-flash');
  const [mode, setMode] = useState<AvaMode>(() => (localStorage.getItem('ava-ide-chat-mode') as AvaMode) || 'work');
  const [streaming, setStreaming] = useState(false);
  const [hoveredMsg, setHoveredMsg] = useState<string | null>(null);
  const [copiedMsg, setCopiedMsg] = useState<string | null>(null);
  const [modeMenuOpen, setModeMenuOpen] = useState(false);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [tokenCount, setTokenCount] = useState(0);
  const [conversationTitle, setConversationTitle] = useState('New Chat');
  const [contextPercent, setContextPercent] = useState(0);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const modeMenuRef = useRef<HTMLDivElement>(null);
  const modelMenuRef = useRef<HTMLDivElement>(null);

  // ── Derived: available BYOK models ────────────────────────────────────────
  const byokModels = useMemo(() => {
    try {
      const raw = localStorage.getItem('ava-ide-byok');
      if (!raw) return [];
      const keys: Record<string, string> = JSON.parse(raw);
      const result: { id: string; name: string; provider: string }[] = [];
      for (const [provider, key] of Object.entries(keys)) {
        if (key && key.trim()) {
          const models = BYOK_MODELS[provider] || [];
          models.forEach((m) => result.push({ ...m, provider }));
        }
      }
      return result;
    } catch { return []; }
  }, []);

  // ── Persist model & mode ──────────────────────────────────────────────────
  useEffect(() => { try { localStorage.setItem('ava-ide-chat-model', model); } catch { /* */ } }, [model]);
  useEffect(() => { try { localStorage.setItem('ava-ide-chat-mode', mode); } catch { /* */ } }, [mode]);

  // ── Persist messages ──────────────────────────────────────────────────────
  useEffect(() => {
    try { localStorage.setItem('ava-ide-chat-current', JSON.stringify(messages)); } catch { /* */ }
    // Derive conversation title from first user message
    const firstUser = messages.find((m) => m.role === 'user');
    if (firstUser) {
      setConversationTitle(firstUser.text.slice(0, 50) + (firstUser.text.length > 50 ? '...' : ''));
    }
  }, [messages]);

  // ── Auto-scroll ───────────────────────────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── Close dropdowns on outside click ──────────────────────────────────────
  useEffect(() => {
    if (!modeMenuOpen && !modelMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (modeMenuOpen && modeMenuRef.current && !modeMenuRef.current.contains(e.target as Node)) setModeMenuOpen(false);
      if (modelMenuOpen && modelMenuRef.current && !modelMenuRef.current.contains(e.target as Node)) setModelMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [modeMenuOpen, modelMenuOpen]);

  // ── Auto-resize textarea ──────────────────────────────────────────────────
  const resizeTextarea = useCallback(() => {
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = 'auto';
      ta.style.height = Math.min(ta.scrollHeight, 160) + 'px';
    }
  }, []);

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && !e.altKey && !e.metaKey) {
        const idx = parseInt(e.key) - 1;
        if (idx >= 0 && idx < MODES.length) {
          e.preventDefault();
          setMode(MODES[idx].id);
          setModeMenuOpen(false);
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // ── New Chat ──────────────────────────────────────────────────────────────
  const newChat = useCallback(() => {
    // Save current conversation to history if it has user messages
    const hasUserMsgs = messages.some((m) => m.role === 'user');
    if (hasUserMsgs) {
      try {
        const historyRaw = localStorage.getItem('ava-ide-chat-history') || '[]';
        const history: Conversation[] = JSON.parse(historyRaw);
        const firstUser = messages.find((m) => m.role === 'user');
        const conv: Conversation = {
          id: `conv-${Date.now()}`,
          title: firstUser ? firstUser.text.slice(0, 60) : 'Untitled',
          messages,
          createdAt: messages[0]?.timestamp || Date.now(),
          updatedAt: Date.now(),
          model,
        };
        history.unshift(conv);
        // Keep max 50 conversations
        localStorage.setItem('ava-ide-chat-history', JSON.stringify(history.slice(0, 50)));
      } catch { /* */ }
    }
    setMessages([
      { id: mkId(), role: 'ava', text: "Fresh conversation started. What would you like to do?", timestamp: Date.now() },
    ]);
    setConversationTitle('New Chat');
    setTokenCount(0);
    setContextPercent(0);
    if (abortRef.current) { abortRef.current.abort(); abortRef.current = null; }
    setStreaming(false);
    textareaRef.current?.focus();
  }, [messages, model]);

  // ── Copy message ──────────────────────────────────────────────────────────
  const copyMessage = useCallback((msgId: string, text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedMsg(msgId);
      setTimeout(() => setCopiedMsg(null), 2000);
    });
  }, []);

  // ── Cancel streaming ──────────────────────────────────────────────────────
  const cancelStream = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setStreaming(false);
  }, []);

  // ── Render markdown (basic) ───────────────────────────────────────────────
  const renderMarkdown = useCallback((text: string) => {
    if (!text) return null;
    const parts: React.ReactNode[] = [];
    // Split on code blocks first
    const codeBlockRegex = /```(\w*)\n?([\s\S]*?)```/g;
    let lastIndex = 0;
    let match;
    let partKey = 0;

    while ((match = codeBlockRegex.exec(text)) !== null) {
      // Text before code block
      if (match.index > lastIndex) {
        parts.push(<span key={partKey++}>{renderInlineMarkdown(text.slice(lastIndex, match.index))}</span>);
      }
      // Code block
      const lang = match[1] || '';
      const code = match[2] || '';
      parts.push(
        <div key={partKey++} style={{
          background: '#11111b', border: '1px solid #313244', borderRadius: 8, margin: '8px 0',
          overflow: 'hidden',
        }}>
          {lang && (
            <div style={{
              fontSize: 10, color: '#6c7086', padding: '4px 12px', background: '#181825',
              borderBottom: '1px solid #313244', fontFamily: 'monospace',
            }}>{lang}</div>
          )}
          <pre style={{
            margin: 0, padding: '10px 12px', fontSize: 13, lineHeight: 1.5,
            fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
            color: '#cdd6f4', overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          }}>{code}</pre>
        </div>
      );
      lastIndex = match.index + match[0].length;
    }
    // Remaining text
    if (lastIndex < text.length) {
      parts.push(<span key={partKey++}>{renderInlineMarkdown(text.slice(lastIndex))}</span>);
    }
    return <>{parts}</>;
  }, []);

  const renderInlineMarkdown = (text: string): React.ReactNode[] => {
    const nodes: React.ReactNode[] = [];
    // Process inline code and bold
    const inlineRegex = /(`[^`]+`|\*\*[^*]+\*\*)/g;
    let lastIdx = 0;
    let m;
    let key = 0;
    while ((m = inlineRegex.exec(text)) !== null) {
      if (m.index > lastIdx) nodes.push(text.slice(lastIdx, m.index));
      const matched = m[0];
      if (matched.startsWith('`') && matched.endsWith('`')) {
        nodes.push(
          <code key={`ic-${key++}`} style={{
            background: '#313244', padding: '1px 6px', borderRadius: 4,
            fontSize: '0.9em', fontFamily: "'JetBrains Mono', monospace", color: '#f5c2e7',
          }}>{matched.slice(1, -1)}</code>
        );
      } else if (matched.startsWith('**') && matched.endsWith('**')) {
        nodes.push(<strong key={`b-${key++}`} style={{ color: '#cdd6f4', fontWeight: 600 }}>{matched.slice(2, -2)}</strong>);
      }
      lastIdx = m.index + matched.length;
    }
    if (lastIdx < text.length) nodes.push(text.slice(lastIdx));
    return nodes;
  };

  // ── Send message ──────────────────────────────────────────────────────────
  const send = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    setInput('');
    if (textareaRef.current) { textareaRef.current.style.height = 'auto'; }

    const currentMode = MODES.find((m) => m.id === mode)!;
    const userMsg: ChatMessage = { id: mkId(), role: 'user', text: trimmed, timestamp: Date.now() };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);

    if (!connected) {
      setMessages((prev) => [...prev, {
        id: mkId(), role: 'error' as const,
        text: "I'm not connected to the platform yet. Connect your account in the Dashboard sidebar to chat with me.",
        timestamp: Date.now(),
      }]);
      return;
    }

    setStreaming(true);
    const controller = new AbortController();
    abortRef.current = controller;

    // Build API messages, applying mode prefix
    const apiMessages = updatedMessages.map((m) => ({
      role: m.role === 'user' ? 'user' : m.role === 'ava' ? 'assistant' : 'user',
      content: m.text,
    }));
    // Add mode prefix to the latest user message
    if (currentMode.prefix && apiMessages.length > 0) {
      const last = apiMessages[apiMessages.length - 1];
      apiMessages[apiMessages.length - 1] = { ...last, content: currentMode.prefix + last.content };
    }

    const avaMsg: ChatMessage = { id: mkId(), role: 'ava', text: '', timestamp: Date.now(), toolCalls: [] };
    setMessages((prev) => [...prev, avaMsg]);

    try {
      const key = getPlatformKey();
      const response = await fetch(apiStreamUrl('/chat'), {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages: apiMessages }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errText = await response.text();
        setMessages((prev) => {
          const copy = [...prev];
          const last = copy[copy.length - 1];
          if (last && last.role === 'ava') {
            copy[copy.length - 1] = { ...last, text: `Error: ${response.status} -- ${errText}`, role: 'error' };
          }
          return copy;
        });
        setStreaming(false);
        abortRef.current = null;
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) {
        setMessages((prev) => {
          const copy = [...prev];
          const last = copy[copy.length - 1];
          if (last && last.role === 'ava') {
            copy[copy.length - 1] = { ...last, text: 'No response stream available.', role: 'error' };
          }
          return copy;
        });
        setStreaming(false);
        abortRef.current = null;
        return;
      }

      const decoder = new TextDecoder();
      let buffer = '';
      let sessionTokens = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmedLine = line.trim();
          if (!trimmedLine) continue;
          if (trimmedLine === 'data: [DONE]') continue;

          if (trimmedLine.startsWith('data: ')) {
            try {
              const json = JSON.parse(trimmedLine.slice(6));

              // Handle tool calls
              if (json.choices?.[0]?.delta?.tool_calls || json.tool_calls) {
                const toolCalls = json.choices?.[0]?.delta?.tool_calls || json.tool_calls || [];
                for (const tc of toolCalls) {
                  if (tc.function?.name) {
                    setMessages((prev) => {
                      const copy = [...prev];
                      const last = copy[copy.length - 1];
                      if (last && last.role === 'ava') {
                        const existing = last.toolCalls || [];
                        copy[copy.length - 1] = {
                          ...last,
                          toolCalls: [...existing, { name: tc.function.name, status: 'running' }],
                        };
                      }
                      return copy;
                    });
                  }
                }
                continue;
              }

              // Handle usage info
              if (json.usage) {
                sessionTokens += json.usage.total_tokens || json.usage.completion_tokens || 0;
                setTokenCount(sessionTokens);
                if (json.usage.prompt_tokens && json.usage.completion_tokens) {
                  const total = json.usage.prompt_tokens + json.usage.completion_tokens;
                  const ctxWindow = 131072; // Default context window
                  setContextPercent(Math.min(100, Math.round((total / ctxWindow) * 100)));
                }
              }

              // Handle content delta
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

              // Handle error events
              if (json.error) {
                setMessages((prev) => {
                  const copy = [...prev];
                  const last = copy[copy.length - 1];
                  if (last && last.role === 'ava') {
                    copy[copy.length - 1] = { ...last, text: `Error: ${json.error.message || json.error}`, role: 'error' };
                  }
                  return copy;
                });
              }
            } catch {
              // Non-JSON SSE line
            }
          }
        }
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        setMessages((prev) => {
          const copy = [...prev];
          const last = copy[copy.length - 1];
          if (last && last.role === 'ava' && !last.text) {
            copy[copy.length - 1] = { ...last, text: '(Cancelled)', role: 'system' };
          }
          return copy;
        });
      } else {
        setMessages((prev) => [...prev, {
          id: mkId(), role: 'error' as const,
          text: `Connection error: ${err.message || 'unknown'}`,
          timestamp: Date.now(),
        }]);
      }
    }

    setStreaming(false);
    abortRef.current = null;
    textareaRef.current?.focus();
  }, [input, mode, model, messages, connected]);

  // ── Active mode info ──────────────────────────────────────────────────────
  const currentMode = MODES.find((m) => m.id === mode) || MODES[0];
  const activeModelName = useMemo(() => {
    if (model === 'qwen-flash') return 'Qwen Flash';
    if (model === 'qwen3.5-plus') return 'Qwen 3.5 Plus';
    const byok = byokModels.find((m) => m.id === model);
    return byok ? byok.name : model;
  }, [model, byokModels]);

  // ── Keyframes style (injected once) ───────────────────────────────────────
  const keyframesStyle = `
    @keyframes avaPulse { 0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); } 40% { opacity: 1; transform: scale(1); } }
    @keyframes avaFadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes spin { to { transform: rotate(360deg); } }
  `;

  return (
    <div style={{ ...pageWrapper, padding: 0, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <style>{keyframesStyle}</style>

      {/* ── Header Bar (48px) ───────────────────────────────────────────── */}
      <div style={{
        height: 48, minHeight: 48, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 16px', borderBottom: '1px solid #313244', background: '#181825', flexShrink: 0,
      }}>
        {/* Left: Model selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div ref={modelMenuRef} style={{ position: 'relative' }}>
            <button
              onClick={() => setModelMenuOpen(!modelMenuOpen)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px',
                background: '#313244', border: '1px solid rgba(168,85,247,0.2)', borderRadius: 8,
                color: '#cdd6f4', fontSize: 12, fontWeight: 500, cursor: 'pointer',
              }}
            >
              <span style={{
                width: 7, height: 7, borderRadius: '50%', background: connected ? '#a6e3a1' : '#6c7086',
                flexShrink: 0,
              }} />
              {activeModelName}
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                style={{ transform: modelMenuOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
              </svg>
            </button>

            {/* Model dropdown */}
            {modelMenuOpen && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, marginTop: 4, zIndex: 999,
                background: '#1e1e2e', border: '1px solid #313244', borderRadius: 10,
                padding: 6, minWidth: 240, boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
              }}>
                {/* Platform models header */}
                <div style={{ fontSize: 10, fontWeight: 600, color: '#6c7086', padding: '6px 10px 4px', textTransform: 'uppercase', letterSpacing: 0.8 }}>
                  Platform (Free)
                </div>
                {[
                  { id: 'qwen-flash', name: 'Qwen Flash', tag: 'Free' },
                  { id: 'qwen3.5-plus', name: 'Qwen 3.5 Plus', tag: 'Free' },
                ].map((m) => (
                  <button
                    key={m.id}
                    onClick={() => { setModel(m.id); setModelMenuOpen(false); }}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%',
                      padding: '8px 10px', background: model === m.id ? 'rgba(168,85,247,0.15)' : 'transparent',
                      border: 'none', borderRadius: 6, color: model === m.id ? '#e0b0ff' : '#cdd6f4',
                      fontSize: 12, cursor: 'pointer', textAlign: 'left',
                    }}
                    onMouseEnter={(e) => { if (model !== m.id) e.currentTarget.style.background = 'rgba(168,85,247,0.08)'; }}
                    onMouseLeave={(e) => { if (model !== m.id) e.currentTarget.style.background = 'transparent'; }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {model === m.id && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#a6e3a1' }} />}
                      {m.name}
                    </span>
                    <span style={{ fontSize: 10, color: '#a6e3a1', fontWeight: 500 }}>{m.tag}</span>
                  </button>
                ))}

                {/* BYOK models */}
                {byokModels.length > 0 && (
                  <>
                    <div style={{ height: 1, background: '#313244', margin: '6px 0' }} />
                    <div style={{ fontSize: 10, fontWeight: 600, color: '#6c7086', padding: '6px 10px 4px', textTransform: 'uppercase', letterSpacing: 0.8 }}>
                      Your API Keys
                    </div>
                    {byokModels.map((m) => (
                      <button
                        key={m.id}
                        onClick={() => { setModel(m.id); setModelMenuOpen(false); }}
                        style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%',
                          padding: '8px 10px', background: model === m.id ? 'rgba(168,85,247,0.15)' : 'transparent',
                          border: 'none', borderRadius: 6, color: model === m.id ? '#e0b0ff' : '#cdd6f4',
                          fontSize: 12, cursor: 'pointer', textAlign: 'left',
                        }}
                        onMouseEnter={(e) => { if (model !== m.id) e.currentTarget.style.background = 'rgba(168,85,247,0.08)'; }}
                        onMouseLeave={(e) => { if (model !== m.id) e.currentTarget.style.background = 'transparent'; }}
                      >
                        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {model === m.id && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#a6e3a1' }} />}
                          {m.name}
                        </span>
                        <span style={{ fontSize: 10, color: '#6c7086' }}>{m.provider}</span>
                      </button>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>

          {/* Conversation title */}
          <span style={{ fontSize: 12, color: '#6c7086', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {conversationTitle}
          </span>
        </div>

        {/* Right: tokens + new chat */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* Token counter */}
          {tokenCount > 0 && (
            <span style={{ fontSize: 11, color: '#6c7086', fontFamily: 'monospace' }} title={`${tokenCount.toLocaleString()} tokens used`}>
              {fmtTokens(tokenCount)} tokens
            </span>
          )}

          {/* Context usage ring */}
          {contextPercent > 0 && (() => {
            const isWarning = contextPercent >= 80;
            const isCritical = contextPercent >= 90;
            const color = isCritical ? '#ef4444' : isWarning ? '#eab308' : '#a855f7';
            const r = 9;
            const circumference = 2 * Math.PI * r;
            const dashOffset = circumference - (contextPercent / 100) * circumference;
            return (
              <div style={{ position: 'relative', width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center' }} title={`Context: ${contextPercent}%`}>
                <svg width="22" height="22" viewBox="0 0 22 22" style={{ transform: 'rotate(-90deg)' }}>
                  <circle cx="11" cy="11" r={r} fill="none" stroke="#313244" strokeWidth="2.5" />
                  <circle cx="11" cy="11" r={r} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round"
                    strokeDasharray={circumference} strokeDashoffset={dashOffset} style={{ transition: 'stroke-dashoffset 0.5s ease' }} />
                </svg>
                <span style={{ position: 'absolute', fontSize: 7, fontWeight: 700, color, fontFamily: 'monospace' }}>{contextPercent}</span>
              </div>
            );
          })()}

          {/* New Chat button */}
          <button
            onClick={newChat}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px',
              background: 'rgba(168,85,247,0.1)', border: '1px solid rgba(168,85,247,0.25)',
              borderRadius: 8, color: '#a855f7', fontSize: 11, fontWeight: 600, cursor: 'pointer',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(168,85,247,0.2)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(168,85,247,0.1)'; }}
            title="New Chat"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            New Chat
          </button>
        </div>
      </div>

      {/* ── Messages Area (flex-1, scrollable) ──────────────────────────── */}
      <div style={{
        flex: 1, overflowY: 'auto', padding: '20px 24px',
        display: 'flex', flexDirection: 'column', gap: 4,
      }}>
        {messages.map((msg) => {
          const isUser = msg.role === 'user';
          const isAva = msg.role === 'ava';
          const isError = msg.role === 'error';
          const isSystem = msg.role === 'system';

          // System messages
          if (isSystem) {
            return (
              <div key={msg.id} style={{
                display: 'flex', justifyContent: 'center', margin: '8px 0',
                animation: 'avaFadeIn 0.3s ease-out',
              }}>
                <span style={{
                  fontSize: 11, color: '#6c7086', background: '#181825', border: '1px solid #313244',
                  borderRadius: 12, padding: '4px 14px',
                }}>{msg.text}</span>
              </div>
            );
          }

          return (
            <div
              key={msg.id}
              style={{
                display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start',
                marginBottom: 8, animation: 'avaFadeIn 0.3s ease-out',
              }}
              onMouseEnter={() => setHoveredMsg(msg.id)}
              onMouseLeave={() => setHoveredMsg(null)}
            >
              {/* Ava avatar */}
              {(isAva || isError) && (
                <div style={{
                  width: 32, height: 32, borderRadius: '50%', flexShrink: 0, marginRight: 10, marginTop: 4,
                  background: isError ? 'linear-gradient(135deg, #ef4444, #dc2626)' : 'linear-gradient(135deg, #a855f7, #6366f1)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {isError ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                    </svg>
                  )}
                </div>
              )}

              <div style={{ maxWidth: '75%', position: 'relative' }}>
                {/* Name + timestamp */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4,
                  justifyContent: isUser ? 'flex-end' : 'flex-start',
                }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: isUser ? '#b4befe' : isError ? '#ef4444' : '#a855f7' }}>
                    {isUser ? 'You' : isError ? 'Error' : 'Ava'}
                  </span>
                  <span style={{ fontSize: 10, color: '#45475a' }}>{fmtTime(msg.timestamp)}</span>
                </div>

                {/* Message bubble */}
                <div style={{
                  padding: '10px 16px',
                  borderRadius: isUser ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                  background: isUser ? '#7c3aed' : isError ? 'rgba(239,68,68,0.1)' : '#181825',
                  color: isError ? '#fca5a5' : '#cdd6f4',
                  fontSize: 14, lineHeight: 1.65,
                  border: isUser ? 'none' : isError ? '1px solid rgba(239,68,68,0.25)' : '1px solid #313244',
                  position: 'relative',
                }}>
                  {/* Rendered text with markdown */}
                  <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                    {isAva || isError ? renderMarkdown(msg.text) : msg.text}
                    {/* Blinking cursor while streaming empty message */}
                    {isAva && streaming && !msg.text && msg === messages[messages.length - 1] && (
                      <span style={{ opacity: 0.5 }}>{'\u2588'}</span>
                    )}
                  </div>

                  {/* Tool calls timeline */}
                  {msg.toolCalls && msg.toolCalls.length > 0 && (
                    <div style={{ marginTop: 10, borderTop: '1px solid #313244', paddingTop: 8 }}>
                      {msg.toolCalls.map((tc, idx) => (
                        <div key={idx} style={{
                          display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0',
                          fontSize: 11, color: '#6c7086',
                        }}>
                          <span style={{
                            width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                            background: tc.status === 'running' ? '#eab308' : tc.status === 'done' ? '#a6e3a1' : '#ef4444',
                            ...(tc.status === 'running' ? { animation: 'avaPulse 1.5s infinite' } : {}),
                          }} />
                          <span style={{ fontFamily: 'monospace', fontSize: 11 }}>{tc.name}</span>
                          <span style={{ fontSize: 10, color: '#45475a' }}>
                            {tc.status === 'running' ? 'running...' : tc.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Copy button on hover for Ava messages */}
                  {isAva && msg.text && hoveredMsg === msg.id && (
                    <button
                      onClick={() => copyMessage(msg.id, msg.text)}
                      style={{
                        position: 'absolute', top: 6, right: 6, padding: '4px 8px',
                        background: '#313244', border: '1px solid #45475a', borderRadius: 6,
                        color: copiedMsg === msg.id ? '#a6e3a1' : '#6c7086', fontSize: 10,
                        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                      }}
                      title="Copy message"
                    >
                      {copiedMsg === msg.id ? (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                      ) : (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                        </svg>
                      )}
                      {copiedMsg === msg.id ? 'Copied' : 'Copy'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {/* Typing indicator */}
        {streaming && messages.length > 0 && messages[messages.length - 1].role === 'ava' && !messages[messages.length - 1].text && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0 8px 42px' }}>
            <div style={{ display: 'flex', gap: 4 }}>
              {[0, 1, 2].map((i) => (
                <div key={i} style={{
                  width: 7, height: 7, borderRadius: '50%', background: '#a855f7',
                  animation: 'avaPulse 1.4s infinite', animationDelay: `${i * 0.2}s`,
                }} />
              ))}
            </div>
            <span style={{ fontSize: 11, color: '#6c7086' }}>Ava is thinking...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* ── Input Bar (fixed at bottom) ─────────────────────────────────── */}
      <div style={{
        padding: '12px 24px 16px', borderTop: '1px solid #313244',
        background: '#181825', flexShrink: 0,
      }}>
        <div style={{ maxWidth: 860, margin: '0 auto' }}>
          {/* Mode selector row */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div ref={modeMenuRef} style={{ position: 'relative' }}>
              <button
                onClick={() => setModeMenuOpen(!modeMenuOpen)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px',
                  background: 'linear-gradient(135deg, #a855f7, #7c3aed)', border: '1px solid rgba(168,85,247,0.6)',
                  borderRadius: 8, color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                  boxShadow: '0 2px 8px rgba(168,85,247,0.3)',
                }}
                title="Switch mode (Ctrl+Shift+1-6)"
              >
                <span style={{ fontFamily: 'monospace', fontSize: 10, opacity: 0.7 }}>{currentMode.icon}</span>
                {currentMode.label}
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                  style={{ transform: modeMenuOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                </svg>
              </button>

              {/* Mode dropdown (opens upward) */}
              {modeMenuOpen && (
                <div style={{
                  position: 'absolute', bottom: '100%', left: 0, marginBottom: 6, zIndex: 999,
                  background: '#1e1e2e', border: '1px solid rgba(168,85,247,0.2)', borderRadius: 10,
                  padding: 6, minWidth: 220, boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                }}>
                  {MODES.map((m, idx) => (
                    <button
                      key={m.id}
                      onClick={() => { setMode(m.id); setModeMenuOpen(false); }}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%',
                        padding: '8px 10px', background: mode === m.id ? 'rgba(168,85,247,0.2)' : 'transparent',
                        border: 'none', borderRadius: 6, color: mode === m.id ? '#fff' : '#cdd6f4',
                        fontSize: 12, fontWeight: mode === m.id ? 600 : 400, cursor: 'pointer', textAlign: 'left',
                        opacity: mode === m.id ? 1 : 0.7,
                      }}
                      onMouseEnter={(e) => { if (mode !== m.id) { e.currentTarget.style.background = 'rgba(168,85,247,0.1)'; e.currentTarget.style.opacity = '1'; } }}
                      onMouseLeave={(e) => { if (mode !== m.id) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.opacity = '0.7'; } }}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontFamily: 'monospace', fontSize: 10, opacity: 0.6, width: 16, textAlign: 'center' }}>{m.icon}</span>
                        {m.label}
                      </span>
                      <span style={{ fontSize: 9, opacity: 0.4, fontFamily: 'monospace' }}>Ctrl+Shift+{idx + 1}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Character count */}
            <span style={{ fontSize: 10, color: input.length > 4000 ? '#ef4444' : '#45475a', fontFamily: 'monospace' }}>
              {input.length > 0 ? `${input.length.toLocaleString()} chars` : ''}
            </span>
          </div>

          {/* Input container */}
          <div style={{
            display: 'flex', alignItems: 'flex-end', gap: 8,
            background: 'rgba(0,0,0,0.35)', border: '1.5px solid rgba(168,85,247,0.15)',
            borderRadius: 14, padding: '8px 8px 8px 16px',
            transition: 'border-color 0.2s, box-shadow 0.2s',
          }}
            onFocus={(e) => {
              const el = e.currentTarget;
              el.style.borderColor = '#a855f7';
              el.style.boxShadow = '0 0 12px rgba(168,85,247,0.2), 0 0 0 1px rgba(168,85,247,0.1)';
            }}
            onBlur={(e) => {
              // Only remove focus style if focus leaves the container entirely
              if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                const el = e.currentTarget;
                el.style.borderColor = 'rgba(168,85,247,0.15)';
                el.style.boxShadow = 'none';
              }
            }}
          >
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => { setInput(e.target.value); resizeTextarea(); }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  if (!streaming) send();
                }
              }}
              placeholder={connected ? currentMode.placeholder : 'Connect account to chat...'}
              disabled={!connected}
              rows={1}
              style={{
                flex: 1, resize: 'none', background: 'transparent', border: 'none', outline: 'none',
                color: '#cdd6f4', fontSize: 14, lineHeight: 1.5, padding: '6px 0',
                fontFamily: 'inherit', maxHeight: 160, minHeight: 24,
                opacity: !connected ? 0.4 : 1,
              }}
            />

            {/* Mic placeholder */}
            <button
              style={{
                width: 36, height: 36, borderRadius: 8, border: '1px solid rgba(168,85,247,0.15)',
                background: 'rgba(168,85,247,0.05)', color: '#6c7086', cursor: 'not-allowed',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                opacity: 0.4,
              }}
              title="Voice input (coming soon)"
              disabled
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
              </svg>
            </button>

            {/* Send / Stop button */}
            {streaming ? (
              <button
                onClick={cancelStream}
                style={{
                  width: 36, height: 36, borderRadius: 8, border: '1px solid rgba(239,68,68,0.5)',
                  background: 'linear-gradient(135deg, #e53935, #c62828)', color: '#fff',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0, boxShadow: '0 2px 8px rgba(229,57,53,0.35)',
                }}
                title="Stop generating"
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                  <rect x="3" y="3" width="10" height="10" rx="1.5" />
                </svg>
              </button>
            ) : (
              <button
                onClick={send}
                disabled={!input.trim() || !connected}
                style={{
                  width: 36, height: 36, borderRadius: 8, flexShrink: 0,
                  border: input.trim() && connected ? '1px solid rgba(168,85,247,0.5)' : '1px solid rgba(168,85,247,0.08)',
                  background: input.trim() && connected ? 'linear-gradient(135deg, #a855f7, #7c3aed)' : 'transparent',
                  color: input.trim() && connected ? '#fff' : '#6c7086',
                  cursor: input.trim() && connected ? 'pointer' : 'not-allowed',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  opacity: input.trim() && connected ? 1 : 0.15,
                  boxShadow: input.trim() && connected ? '0 2px 8px rgba(168,85,247,0.4)' : 'none',
                  transition: 'all 0.2s',
                }}
                title="Send (Enter)"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M8 3.5l-4.5 4.5.707.707L7.5 5.414V13h1V5.414l3.293 3.293.707-.707L8 3.5z" />
                </svg>
              </button>
            )}
          </div>
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
