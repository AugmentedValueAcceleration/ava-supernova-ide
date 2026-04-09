import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { t, useLocale, getLocale } from '../lib/i18n';
import { apiFetch, getPlatformKey, getStoredEmail, isConnected as checkConnected, disconnectAccount, trackTokenUsage, trackMessage, trackToolCall, getSessionStats, resetSessionStats, type SessionStats } from '../lib/api';
import { getSidecar, type SidecarEvent, type SidecarConfig } from '../lib/sidecar';
import IdeTasksPanel, { type SessionTaskUI, type AvaCompletedTaskUI, type TodayTaskUI } from './IdeTasksPanel';

/* ===== Shared Styles ===== */
const pageWrapper: React.CSSProperties = {
  flex: 1,
  background: 'linear-gradient(135deg, #0f0a1a 0%, #1a1028 40%, #150d22 100%)',
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
  background: 'rgba(26, 16, 40, 0.6)',
  border: '1px solid rgba(168, 85, 247, 0.12)',
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
  background: 'rgba(49, 34, 68, 0.5)',
  border: '1px solid rgba(168, 85, 247, 0.12)',
  borderRadius: 6,
  padding: '0 12px',
  fontSize: 13,
  color: '#cdd6f4',
  outline: 'none',
};

/* ===== Custom Dropdown (replaces native <select>) ===== */
function CustomSelect({ value, onChange, options, placeholder, width, height }: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  width?: number | string;
  height?: number;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = options.find(o => o.value === value);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} style={{ position: 'relative', width: width || '100%' }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          ...inputStyle,
          width: '100%',
          height: height || 36,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          cursor: 'pointer', textAlign: 'left',
          borderColor: open ? '#a855f7' : 'rgba(49, 34, 68, 0.5)',
          borderRadius: 8,
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12 }}>
          {selected?.label || placeholder || 'Select...'}
        </span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#6c7086" strokeWidth="2"
          style={{ flexShrink: 0, transition: 'transform 0.15s', transform: open ? 'rotate(180deg)' : 'rotate(0)' }}>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4,
          background: 'rgba(26, 16, 40, 0.6)', border: '1px solid rgba(168, 85, 247, 0.12)', borderRadius: 8,
          boxShadow: '0 8px 24px rgba(0,0,0,0.4)', zIndex: 50,
          maxHeight: 220, overflowY: 'auto',
        }}>
          {options.map(opt => (
            <button
              key={opt.value}
              onClick={() => { onChange(opt.value); setOpen(false); }}
              style={{
                display: 'block', width: '100%', padding: '8px 12px',
                background: opt.value === value ? 'rgba(49, 34, 68, 0.5)' : 'transparent',
                border: 'none', color: opt.value === value ? '#cba6f7' : '#cdd6f4',
                fontSize: 12, textAlign: 'left', cursor: 'pointer',
              }}
              onMouseOver={e => { if (opt.value !== value) e.currentTarget.style.background = 'rgba(49, 34, 68, 0.5)'; }}
              onMouseOut={e => { if (opt.value !== value) e.currentTarget.style.background = 'transparent'; }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

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
  background: 'rgba(49, 34, 68, 0.5)',
  border: '1px solid rgba(168, 85, 247, 0.12)',
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
        width: 28, height: 28, border: '3px solid rgba(168, 85, 247, 0.12)', borderTopColor: '#a855f7',
        borderRadius: '50%', animation: 'spin 0.8s linear infinite',
      }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function StorageBadge() {
  const connected = checkConnected();
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 500,
      padding: '2px 8px', borderRadius: 6,
      background: connected ? 'rgba(96,165,250,0.10)' : 'rgba(166,227,161,0.10)',
      color: connected ? '#60a5fa' : '#a6e3a1',
      border: `1px solid ${connected ? 'rgba(96,165,250,0.20)' : 'rgba(166,227,161,0.20)'}`,
    }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: connected ? '#60a5fa' : '#a6e3a1' }} />
      {connected ? 'Cloud' : 'Local'}
    </span>
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
      <div style={{ fontSize: 15, fontWeight: 500, color: '#cdd6f4' }}>{t('dash.cc.connect_title')}</div>
      <div style={{ fontSize: 12, color: '#6c7086' }}>{t('dash.cc.connect_hint')}</div>
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

/* ComingSoonBanner removed — no longer used */

/* ===== Generic data hook ===== */
function useApiData<T>(path: string, defaultValue: T): { data: T; loading: boolean; error: string; refetch: () => void } {
  const [data, setData] = useState<T>(defaultValue);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetch_ = useCallback(() => {
    if (!checkConnected()) { setData(defaultValue); setLoading(false); return; }
    setLoading(true);
    setError('');
    apiFetch(path)
      .then((d) => { setData(d); setLoading(false); })
      .catch((e) => { setError(e.message || 'Failed to load'); setLoading(false); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

  useEffect(() => { fetch_(); }, [fetch_]);

  // Reset to default when auth changes (logout clears connection)
  useEffect(() => {
    const handler = () => {
      if (!checkConnected()) { setData(defaultValue); setError(''); }
      else fetch_();
    };
    window.addEventListener('ava-auth-changed', handler);
    return () => window.removeEventListener('ava-auth-changed', handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetch_]);

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
  0: { label: t('weather.clear_sky'), emoji: '\u2600\uFE0F' },
  1: { label: t('weather.mainly_clear'), emoji: '\uD83C\uDF24\uFE0F' },
  2: { label: t('weather.partly_cloudy'), emoji: '\u26C5' },
  3: { label: t('weather.overcast'), emoji: '\u2601\uFE0F' },
  45: { label: t('weather.fog'), emoji: '\uD83C\uDF2B\uFE0F' },
  48: { label: t('weather.rime_fog'), emoji: '\uD83C\uDF2B\uFE0F' },
  51: { label: t('weather.light_drizzle'), emoji: '\uD83C\uDF26\uFE0F' },
  53: { label: t('weather.drizzle'), emoji: '\uD83C\uDF26\uFE0F' },
  55: { label: t('weather.dense_drizzle'), emoji: '\uD83C\uDF27\uFE0F' },
  61: { label: t('weather.light_rain'), emoji: '\uD83C\uDF26\uFE0F' },
  63: { label: t('weather.rain'), emoji: '\uD83C\uDF27\uFE0F' },
  65: { label: t('weather.heavy_rain'), emoji: '\uD83C\uDF27\uFE0F' },
  71: { label: t('weather.light_snow'), emoji: '\uD83C\uDF28\uFE0F' },
  73: { label: t('weather.snow'), emoji: '\u2744\uFE0F' },
  75: { label: t('weather.heavy_snow'), emoji: '\u2744\uFE0F' },
  77: { label: t('weather.snow_grains'), emoji: '\u2744\uFE0F' },
  80: { label: t('weather.light_showers'), emoji: '\uD83C\uDF26\uFE0F' },
  81: { label: t('weather.showers'), emoji: '\uD83C\uDF27\uFE0F' },
  82: { label: t('weather.heavy_showers'), emoji: '\uD83C\uDF27\uFE0F' },
  85: { label: t('weather.snow_showers'), emoji: '\uD83C\uDF28\uFE0F' },
  86: { label: t('weather.heavy_snow_showers'), emoji: '\uD83C\uDF28\uFE0F' },
  95: { label: t('weather.thunderstorm'), emoji: '\u26A1' },
  96: { label: t('weather.thunderstorm_hail'), emoji: '\u26A1' },
  99: { label: t('weather.thunderstorm_heavy_hail'), emoji: '\u26A1' },
};

const WEATHER_CACHE_KEY = 'ava-ide-weather-cache';
const WEATHER_CACHE_TTL = 30 * 60 * 1000; // 30 minutes

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(n);
}

function formatRelativeDate(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return t('dash.cc.today');
  if (diffDays === 1) return t('dash.cc.yesterday');
  if (diffDays < 7) return t('dash.cc.days_ago', { n: diffDays });
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
  if (d.toDateString() === today.toDateString()) return t('dash.cc.today');
  if (d.toDateString() === tomorrow.toDateString()) return t('dash.cc.tomorrow');
  return d.toLocaleDateString('en-GB', { weekday: 'short' });
}

// ── Weather fetching (direct HTTP, no platform) ────────────────────────────

async function fetchWeatherDirect(): Promise<WeatherData> {
  // Get location — try multiple services with fallback
  let lat: number | undefined, lon: number | undefined, city = 'Unknown', country = '';
  try {
    const geoRes = await fetch('https://ipwho.is/', { signal: AbortSignal.timeout(5000) });
    if (geoRes.ok) {
      const geo = await geoRes.json();
      lat = geo.latitude; lon = geo.longitude;
      city = geo.city || geo.region || 'Unknown';
      country = geo.country_code || '';
    }
  } catch { /* fallback below */ }
  if (!lat || !lon) {
    try {
      const geoRes2 = await fetch('https://ip-api.com/json/?fields=lat,lon,city,countryCode', { signal: AbortSignal.timeout(5000) });
      if (geoRes2.ok) {
        const geo2 = await geoRes2.json();
        lat = geo2.lat; lon = geo2.lon;
        city = geo2.city || 'Unknown';
        country = geo2.countryCode || '';
      }
    } catch { /* use defaults */ }
  }
  if (!lat || !lon) { lat = 51.5; lon = -0.1; city = 'London'; country = 'GB'; } // Safe default
  const location = country ? `${city}, ${country}` : city;

  // Fetch weather from Open-Meteo
  const weatherRes = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=4`
  );
  const w = await weatherRes.json();

  const currentCode = w.current?.weather_code ?? 0;
  const wmo = WMO_EMOJI[currentCode] || { label: t('weather.unknown'), emoji: '\uD83C\uDF24\uFE0F' };

  const forecast: WeatherData['forecast'] = [];
  if (w.daily?.time) {
    // Skip today (index 0), take next 3 days
    for (let i = 1; i < Math.min(w.daily.time.length, 4); i++) {
      const dayCode = w.daily.weather_code?.[i] ?? 0;
      const dayWmo = WMO_EMOJI[dayCode] || { label: t('weather.unknown'), emoji: '\uD83C\uDF24\uFE0F' };
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

const PUBLIC_API = 'https://ava-supernova.com/api';

async function fetchNewsDirect(category?: string): Promise<NewsArticle[]> {
  try {
    const url = category
      ? `${PUBLIC_API}/news?category=${category}&limit=6`
      : `${PUBLIC_API}/news?limit=6`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : (data.posts || data.articles || data.items || []);
  } catch { return []; }
}

async function fetchArticleDirect(slug: string): Promise<{ post: any; related: any[] } | null> {
  try {
    const res = await fetch(`${PUBLIC_API}/news/${encodeURIComponent(slug)}`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const data = await res.json();
    return { post: data.post || null, related: data.related || [] };
  } catch { return null; }
}

async function fetchReleasesDirect(locale: string, limit = 1): Promise<any> {
  try {
    const res = await fetch(`${PUBLIC_API}/releases?limit=${limit}&locale=${locale}`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    return res.json();
  } catch { return null; }
}

// ── Reusable WidgetCard ─────────────────────────────────────────────────────

const widgetCardStyle: React.CSSProperties = {
  background: 'rgba(26, 16, 40, 0.6)',
  border: '1px solid rgba(168, 85, 247, 0.12)',
  borderRadius: 12,
  padding: 16,
  minWidth: 0,
  overflow: 'hidden',
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
      <WidgetCard title={t('dash.cc.weather')} icon={'\uD83C\uDF24\uFE0F'}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '16px 0', fontSize: 12, color: '#6c7086' }}>
          {t('dash.cc.loading_weather')}
        </div>
      </WidgetCard>
    );
  }

  if (!weather) {
    return (
      <WidgetCard title={t('dash.cc.weather')} icon={'\uD83C\uDF24\uFE0F'} onRefresh={onRefresh}>
        <p style={{ padding: '8px 0', fontSize: 12, color: '#6c7086', margin: 0 }}>{t('dash.cc.weather_error')}</p>
      </WidgetCard>
    );
  }

  return (
    <WidgetCard title={t('dash.cc.weather')} icon={'\uD83C\uDF24\uFE0F'} subtitle={weather.location} onRefresh={onRefresh}>
      {/* Current conditions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <span style={{ fontSize: 36 }}>{weather.emoji}</span>
        <div>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#cdd6f4' }}>{weather.temp_c}&deg;C</div>
          <div style={{ fontSize: 12, color: '#a6adc8' }}>{weather.condition}</div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'grid', gridTemplateColumns: 'auto auto', gap: '4px 16px', fontSize: 12, color: '#6c7086' }}>
          <span>{t('weather.humidity')}</span>
          <span style={{ color: '#a6adc8' }}>{weather.humidity}%</span>
          <span>{t('weather.wind')}</span>
          <span style={{ color: '#a6adc8' }}>{weather.wind_kmph} km/h</span>
        </div>
      </div>

      {/* 3-day forecast */}
      {weather.forecast.length > 0 && (
        <div style={{ display: 'flex', gap: 12, marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(168, 85, 247, 0.12)' }}>
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

// ── Working Hours Clock ──────────────────────────────────────────────────

function WorkingHoursClock() {
  const connected = checkConnected();
  const [start, setStart] = useState<number>(() => {
    try { return Number(localStorage.getItem('ava-ide-work-start')) || 9; } catch { return 9; }
  });
  const [end, setEnd] = useState<number>(() => {
    try { return Number(localStorage.getItem('ava-ide-work-end')) || 17; } catch { return 17; }
  });
  const [dragging, setDragging] = useState<'start' | 'end' | null>(null);
  const clockRef = useRef<SVGSVGElement>(null);

  // Load from platform on mount (connected users)
  useEffect(() => {
    if (!connected) return;
    apiFetch('/settings').then((data: any) => {
      if (data?.work_start != null) { setStart(data.work_start); localStorage.setItem('ava-ide-work-start', String(data.work_start)); }
      if (data?.work_end != null) { setEnd(data.work_end); localStorage.setItem('ava-ide-work-end', String(data.work_end)); }
    }).catch(() => {});
  }, [connected]);

  const save = useCallback((s: number, e: number) => {
    try {
      localStorage.setItem('ava-ide-work-start', String(s));
      localStorage.setItem('ava-ide-work-end', String(e));
      window.dispatchEvent(new CustomEvent('ava-working-hours-changed'));
    } catch {}
    // Sync to platform for connected users
    if (checkConnected()) {
      apiFetch('/settings', { method: 'POST', body: JSON.stringify({ work_start: s, work_end: e }) }).catch(() => {});
    }
  }, []);

  const angleForHour = (h: number) => ((h / 24) * 360 - 90) * (Math.PI / 180);
  const hourFromAngle = (angleDeg: number) => {
    let h = Math.round(((angleDeg + 90) / 360) * 24) % 24;
    if (h < 0) h += 24;
    return h;
  };

  const getAngleFromEvent = useCallback((e: MouseEvent) => {
    if (!clockRef.current) return 0;
    const rect = clockRef.current.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = e.clientX - cx;
    const dy = e.clientY - cy;
    return Math.atan2(dy, dx) * (180 / Math.PI);
  }, []);

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent) => {
      const angle = getAngleFromEvent(e);
      const hour = hourFromAngle(angle);
      if (dragging === 'start') { setStart(hour); save(hour, end); }
      else { setEnd(hour); save(start, hour); }
    };
    const onUp = () => setDragging(null);
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
  }, [dragging, start, end, save, getAngleFromEvent]);

  const size = 140;
  const cx = size / 2, cy = size / 2, r = 54;

  const pinPos = (h: number) => {
    const a = angleForHour(h);
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
  };

  const startPos = pinPos(start);
  const endPos = pinPos(end);

  // Arc path for the active working period
  const arcPath = () => {
    const a1 = angleForHour(start);
    const a2 = angleForHour(end);
    const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
    const x2 = cx + r * Math.cos(a2), y2 = cy + r * Math.sin(a2);
    // Determine if the arc should be the long way around
    let diff = ((end - start) % 24 + 24) % 24;
    const largeArc = diff > 12 ? 1 : 0;
    return `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`;
  };

  const fmt = (h: number) => `${String(h).padStart(2, '0')}:00`;
  const now = new Date().getHours();
  const isWorking = start <= end ? (now >= start && now < end) : (now >= start || now < end);

  return (
    <WidgetCard title={t('dash.cc.working_hours')} icon="🕐">
      <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
        <svg ref={clockRef} width={size} height={size} style={{ flexShrink: 0 }}>
          {/* Clock face */}
          <circle cx={cx} cy={cy} r={r + 8} fill="rgba(10, 6, 18, 0.8)" stroke="rgba(168, 85, 247, 0.12)" strokeWidth={1} />
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(168, 85, 247, 0.12)" strokeWidth={2} />

          {/* Hour markers */}
          {Array.from({ length: 24 }, (_, i) => {
            const a = angleForHour(i);
            const inner = r - (i % 6 === 0 ? 10 : 5);
            const outer = r - 2;
            return (
              <line key={i}
                x1={cx + inner * Math.cos(a)} y1={cy + inner * Math.sin(a)}
                x2={cx + outer * Math.cos(a)} y2={cy + outer * Math.sin(a)}
                stroke={i % 6 === 0 ? '#585b70' : 'rgba(168, 85, 247, 0.12)'} strokeWidth={i % 6 === 0 ? 1.5 : 0.8}
              />
            );
          })}

          {/* Hour labels */}
          {[0, 6, 12, 18].map(h => {
            const a = angleForHour(h);
            const lr = r - 18;
            return (
              <text key={h} x={cx + lr * Math.cos(a)} y={cy + lr * Math.sin(a) + 3}
                fontSize={9} fill="#585b70" textAnchor="middle" fontWeight={500}
              >{h}</text>
            );
          })}

          {/* Active arc */}
          <path d={arcPath()} fill="none" stroke="#a855f7" strokeWidth={4} strokeLinecap="round" opacity={0.6} />

          {/* Current time indicator */}
          {(() => {
            const a = angleForHour(now);
            return <circle cx={cx + r * Math.cos(a)} cy={cy + r * Math.sin(a)} r={3} fill={isWorking ? '#a6e3a1' : '#6c7086'} />;
          })()}

          {/* Start pin */}
          <circle cx={startPos.x} cy={startPos.y} r={7} fill="#a855f7" stroke="#0f0a1a" strokeWidth={2}
            style={{ cursor: 'grab' }}
            onMouseDown={(e) => { e.preventDefault(); setDragging('start'); }}
          />
          {/* End pin */}
          <circle cx={endPos.x} cy={endPos.y} r={7} fill="#f5c2e7" stroke="#0f0a1a" strokeWidth={2}
            style={{ cursor: 'grab' }}
            onMouseDown={(e) => { e.preventDefault(); setDragging('end'); }}
          />
        </svg>

        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#cdd6f4', marginBottom: 8 }}>
            {fmt(start)} — {fmt(end)}
          </div>
          <div style={{ fontSize: 11, color: isWorking ? '#a6e3a1' : '#6c7086', marginBottom: 12 }}>
            {isWorking ? `● ${t('dash.cc.currently_working')}` : `○ ${t('dash.cc.outside_hours')}`}
          </div>
          <div style={{ fontSize: 10, color: '#585b70', lineHeight: 1.5 }}>
            {t('dash.cc.working_hours_hint')}
          </div>
        </div>
      </div>
    </WidgetCard>
  );
}

// ── Article Reader ──────────────────────────────────────────────────────────

const ARTICLE_GRADIENTS = [
  'radial-gradient(ellipse at 20% 50%, rgba(124,58,237,0.2), transparent 60%), linear-gradient(135deg, #1a1a2e, #16213e)',
  'radial-gradient(ellipse at 80% 20%, rgba(167,139,250,0.2), transparent 60%), linear-gradient(135deg, #0f172a, #1e1b4b)',
  'radial-gradient(ellipse at 50% 80%, rgba(192,132,252,0.2), transparent 60%), linear-gradient(135deg, #1a1a2e, #312e81)',
  'radial-gradient(ellipse at 30% 30%, rgba(129,140,248,0.2), transparent 60%), linear-gradient(135deg, #0c0a1d, #1e293b)',
  'radial-gradient(ellipse at 70% 60%, rgba(99,102,241,0.2), transparent 60%), linear-gradient(135deg, #111827, #1e1b4b)',
];

const ARTICLE_CATEGORIES: Record<string, { label: string; icon: string }> = {
  'ai-agents':    { label: 'AI Agents',          icon: '🤖' },
  'models':       { label: 'Models & Benchmarks', icon: '🧠' },
  'dev-tools':    { label: 'Developer Tools',     icon: '🛠️' },
  'open-source':  { label: 'Open Source',          icon: '📦' },
  'education':    { label: 'AI Education',         icon: '🎓' },
  'productivity': { label: 'Productivity & AI',    icon: '⚡' },
  'companions':   { label: 'AI Companions',        icon: '💬' },
  'health':       { label: 'Health & Wellness',    icon: '🏥' },
  'enterprise':   { label: 'Enterprise AI',        icon: '🏢' },
  'industry':     { label: 'Industry & Policy',    icon: '📰' },
};

function renderMarkdown(md: string): string {
  let html = md
    .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre class="art-code"><code>$2</code></pre>')
    .replace(/`([^`]+)`/g, '<code class="art-inline">$1</code>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m: string, text: string, url: string) => /^(https?:|mailto:|\/|#)/i.test(url) ? `<a href="${url}" target="_blank" rel="noopener noreferrer">${text}</a>` : text)
    .replace(/^---$/gm, '<hr />')
    .replace(/^[*-] (.+)$/gm, '<li>$1</li>')
    .replace(/\n\n/g, '</p><p>');
  html = html.replace(/((?:<li>.*<\/li>\n?)+)/g, '<ul>$1</ul>');
  html = `<p>${html}</p>`;
  html = html.replace(/<p>\s*<\/p>/g, '');
  html = html.replace(/<p>(<h[1-3]>)/g, '$1');
  html = html.replace(/(<\/h[1-3]>)<\/p>/g, '$1');
  html = html.replace(/<p>(<pre)/g, '$1');
  html = html.replace(/(<\/pre>)<\/p>/g, '$1');
  html = html.replace(/<p>(<ul>)/g, '$1');
  html = html.replace(/(<\/ul>)<\/p>/g, '$1');
  html = html.replace(/<p>(<hr \/>)/g, '$1');
  html = html.replace(/(<hr \/>)<\/p>/g, '$1');
  return html;
}

function IdeArticleReader({ article, related, onBack, onNavigateToArticle }: {
  article: any;
  related: any[];
  onBack: () => void;
  onNavigateToArticle: (slug: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const cat = article.category ? ARTICLE_CATEGORIES[article.category] : null;
  const sources: any[] = article.sources || [];
  const tags: string[] = article.tags || [];
  const articleHtml = renderMarkdown(article.content || '');
  const gradientIndex = (article.slug || '').split('').reduce((acc: number, c: string) => acc + c.charCodeAt(0), 0) % ARTICLE_GRADIENTS.length;
  const articleUrl = `https://ava-supernova.com/news/${article.slug}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(articleUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* */ }
  };

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', paddingBottom: 48 }}>
      {/* Back button */}
      <button
        onClick={onBack}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#6c7086', background: 'none', border: 'none', cursor: 'pointer', marginBottom: 24, padding: 0 }}
      >
        <svg style={{ width: 14, height: 14 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
        </svg>
        Back to News
      </button>

      {/* Hero image */}
      <div style={{ position: 'relative', marginBottom: 24, height: 144, overflow: 'hidden', borderRadius: 12 }}>
        {article.image_url ? (
          <img src={article.image_url} alt={article.title} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <div style={{ position: 'absolute', inset: 0, background: ARTICLE_GRADIENTS[gradientIndex] }} />
        )}
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, transparent 40%, #0f0a1a)' }} />
        <div style={{ position: 'absolute', right: 12, top: 12, display: 'flex', gap: 6 }}>
          {cat && (
            <span style={{ borderRadius: 9999, background: 'rgba(255,255,255,0.1)', padding: '3px 10px', fontSize: 9, fontWeight: 700, color: '#fff', backdropFilter: 'blur(4px)' }}>
              {cat.icon} {cat.label}
            </span>
          )}
          {article.priority === 'breaking' && (
            <span style={{ borderRadius: 9999, background: '#ef4444', padding: '3px 10px', fontSize: 9, fontWeight: 700, color: '#fff' }}>BREAKING</span>
          )}
          {article.ai_generated && (
            <span style={{ borderRadius: 9999, background: 'rgba(255,255,255,0.1)', padding: '3px 10px', fontSize: 9, fontWeight: 700, color: '#a855f7', backdropFilter: 'blur(4px)' }}>AI-Curated</span>
          )}
        </div>
      </div>

      {/* Meta */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, fontSize: 10, color: '#6c7086', marginBottom: 12 }}>
        <span>{new Date(article.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
        {article.reading_time && <><span>&middot;</span><span>{article.reading_time} min read</span></>}
        {article.source_publication && <><span>&middot;</span><span>{article.source_publication}</span></>}
      </div>

      {/* Title */}
      <h1 style={{ fontSize: 20, fontWeight: 700, lineHeight: 1.3, color: '#cdd6f4', margin: '0 0 8px 0' }}>{article.title}</h1>
      {article.excerpt && <p style={{ fontSize: 13, color: '#a6adc8', margin: '0 0 16px 0' }}>{article.excerpt}</p>}

      {/* Tags */}
      {tags.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
          {tags.map((tag: string) => (
            <span key={tag} style={{ borderRadius: 9999, border: '1px solid rgba(168,85,247,0.12)', padding: '2px 8px', fontSize: 9, color: '#a6adc8' }}>#{tag}</span>
          ))}
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        <button onClick={handleCopy} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 8, border: '1px solid rgba(168,85,247,0.12)', background: 'rgba(49,34,68,0.3)', padding: '6px 12px', fontSize: 10, color: '#a6adc8', cursor: 'pointer' }}>
          {copied ? '✓ Copied!' : '🔗 Copy Link'}
        </button>
        <button onClick={() => window.open(articleUrl, '_blank')} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 8, border: '1px solid rgba(168,85,247,0.12)', background: 'rgba(49,34,68,0.3)', padding: '6px 12px', fontSize: 10, color: '#a6adc8', cursor: 'pointer' }}>
          🔗 Open in Browser
        </button>
      </div>

      {/* Source attribution */}
      {(article.source_url || article.source_author || article.source_publication) && (
        <div style={{ marginBottom: 24, borderRadius: 12, border: '1px solid rgba(168,85,247,0.12)', background: 'rgba(26,16,40,0.6)', padding: 12 }}>
          <p style={{ fontSize: 12, color: '#a6adc8', margin: 0 }}>
            Originally reported
            {article.source_author && <> by <span style={{ fontWeight: 500, color: '#cdd6f4' }}>{article.source_author}</span></>}
            {article.source_publication && <> at <span style={{ fontWeight: 500, color: '#cdd6f4' }}>{article.source_publication}</span></>}
          </p>
          {article.source_url && (
            <a href={article.source_url} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 4, fontSize: 12, color: '#a855f7', textDecoration: 'none' }}>
              Read the original article ↗
            </a>
          )}
        </div>
      )}

      {/* Article content */}
      <style>{`
        .ide-article h1 { font-size: 18px; font-weight: 700; color: #cdd6f4; margin: 24px 0 8px; }
        .ide-article h2 { font-size: 16px; font-weight: 600; color: #cdd6f4; margin: 20px 0 6px; }
        .ide-article h3 { font-size: 14px; font-weight: 600; color: #cdd6f4; margin: 16px 0 4px; }
        .ide-article p { margin: 0 0 12px; }
        .ide-article a { color: #a855f7; text-decoration: none; }
        .ide-article a:hover { text-decoration: underline; }
        .ide-article strong { color: #cdd6f4; font-weight: 600; }
        .ide-article ul { list-style-type: disc; padding-left: 20px; margin: 0 0 12px; }
        .ide-article li { margin-bottom: 4px; }
        .ide-article hr { border: none; border-top: 1px solid rgba(168,85,247,0.12); margin: 20px 0; }
        .ide-article pre.art-code { background: rgba(49,34,68,0.3); border: 1px solid rgba(168,85,247,0.12); border-radius: 8px; padding: 12px; overflow-x: auto; font-size: 12px; margin: 0 0 12px; }
        .ide-article code.art-inline { background: rgba(49,34,68,0.3); border-radius: 4px; padding: 1px 4px; font-size: 0.85em; }
      `}</style>
      <div className="ide-article" style={{ fontSize: 13, lineHeight: 1.7, color: '#a6adc8' }} dangerouslySetInnerHTML={{ __html: articleHtml }} />

      {/* Ava's commentary */}
      {article.ava_commentary && (
        <div style={{ marginTop: 32, borderRadius: 12, border: '1px solid rgba(168,85,247,0.3)', background: 'linear-gradient(135deg, rgba(168,85,247,0.05), rgba(168,85,247,0.1))', padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'linear-gradient(to right, #a855f7, #c084fc)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: '#fff' }}>A</span>
            </div>
            <div>
              <p style={{ fontSize: 12, fontWeight: 700, color: '#cdd6f4', margin: 0 }}>Ava's Take</p>
              <p style={{ fontSize: 9, color: '#6c7086', margin: 0 }}>Ava | Supernova Commentary</p>
            </div>
          </div>
          <p style={{ fontSize: 12, lineHeight: 1.6, color: '#a6adc8', margin: 0 }}>{article.ava_commentary}</p>
        </div>
      )}

      {/* Sources */}
      {sources.length > 0 && (
        <div style={{ marginTop: 32, borderTop: '1px solid rgba(168,85,247,0.12)', paddingTop: 24 }}>
          <h2 style={{ fontSize: 12, fontWeight: 600, color: '#a6adc8', marginBottom: 12 }}>Sources</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {sources.map((source: any, i: number) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, borderRadius: 8, border: '1px solid rgba(168,85,247,0.12)', background: 'rgba(26,16,40,0.6)', padding: 10 }}>
                <span style={{ width: 16, height: 16, borderRadius: '50%', background: 'rgba(49,34,68,0.5)', fontSize: 9, fontWeight: 700, color: '#6c7086', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{i + 1}</span>
                <div>
                  <a href={source.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, fontWeight: 500, color: '#a855f7', textDecoration: 'none' }}>{source.title}</a>
                  <p style={{ marginTop: 2, fontSize: 10, color: '#6c7086', margin: '2px 0 0' }}>
                    {source.author && <>{source.author} — </>}{source.publication}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Related articles */}
      {related.length > 0 && (
        <div style={{ marginTop: 32, borderTop: '1px solid rgba(168,85,247,0.12)', paddingTop: 24 }}>
          <h2 style={{ fontSize: 12, fontWeight: 600, color: '#a6adc8', marginBottom: 12 }}>Related Articles</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            {related.map((rel: any, i: number) => {
              const relCat = rel.category ? ARTICLE_CATEGORIES[rel.category] : null;
              return (
                <button key={rel.id} onClick={() => onNavigateToArticle(rel.slug)} style={{ display: 'block', overflow: 'hidden', borderRadius: 12, border: '1px solid rgba(168,85,247,0.12)', background: 'rgba(26,16,40,0.6)', cursor: 'pointer', textAlign: 'left', padding: 0 }}>
                  <div style={{ position: 'relative', height: 80, overflow: 'hidden' }}>
                    {rel.image_url ? (
                      <img src={rel.image_url} alt="" loading="lazy" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <div style={{ position: 'absolute', inset: 0, background: ARTICLE_GRADIENTS[(i + gradientIndex) % ARTICLE_GRADIENTS.length] }} />
                    )}
                    <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.5), transparent)' }} />
                    {relCat && (
                      <span style={{ position: 'absolute', left: 8, top: 8, borderRadius: 4, background: 'rgba(0,0,0,0.4)', padding: '2px 6px', fontSize: 8, fontWeight: 700, color: '#fff', backdropFilter: 'blur(4px)' }}>
                        {relCat.icon} {relCat.label}
                      </span>
                    )}
                  </div>
                  <div style={{ padding: 10 }}>
                    <h3 style={{ fontSize: 11, fontWeight: 600, lineHeight: 1.4, color: '#cdd6f4', margin: 0, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{rel.title}</h3>
                    <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 6, fontSize: 9, color: '#6c7086' }}>
                      {rel.reading_time && <span>{rel.reading_time}m read</span>}
                      {rel.reading_time && <span>&middot;</span>}
                      <span>{new Date(rel.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Transparency notice */}
      <div style={{ marginTop: 32, borderRadius: 8, border: '1px solid rgba(168,85,247,0.12)', background: 'rgba(49,34,68,0.2)', padding: '8px 12px', textAlign: 'center', fontSize: 10, color: '#6c7086' }}>
        {article.ai_generated
          ? 'This article was AI-curated by Ava | Supernova. All credit belongs to the original authors and publications listed above.'
          : 'All credit belongs to the original authors and publications where applicable.'
        }
      </div>
    </div>
  );
}

// ── News Widget ─────────────────────────────────────────────────────────────

function CCNewsWidget({ articles, loading, onCategoryChange, selectedCategory, onRefresh, onOpenArticle }: {
  articles: NewsArticle[];
  loading: boolean;
  onCategoryChange: (cat: string | null) => void;
  selectedCategory: string | null;
  onRefresh: () => void;
  onOpenArticle?: (slug: string) => void;
}) {
  const catBtnBase: React.CSSProperties = {
    flexShrink: 0, borderRadius: 9999, padding: '4px 10px', fontSize: 10, fontWeight: 500,
    border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
  };

  return (
    <WidgetCard title={t('dash.cc.latest_news')} icon={'\uD83D\uDCF0'} onRefresh={onRefresh}>
      {/* Category carousel */}
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4, marginBottom: 12, scrollbarWidth: 'none' }}>
        <style>{`.cc-news-scroll::-webkit-scrollbar { display: none; }`}</style>
        <div className="cc-news-scroll" style={{ display: 'flex', gap: 6, overflowX: 'auto', scrollbarWidth: 'none' }}>
          <button
            onClick={() => onCategoryChange(null)}
            style={{
              ...catBtnBase,
              background: selectedCategory === null ? '#a855f7' : 'rgba(49, 34, 68, 0.5)',
              color: selectedCategory === null ? '#fff' : '#6c7086',
            }}
          >
            {t('news.all')}
          </button>
          {NEWS_CATEGORIES.map(cat => (
            <button
              key={cat}
              onClick={() => onCategoryChange(cat)}
              style={{
                ...catBtnBase,
                background: selectedCategory === cat ? '#a855f7' : 'rgba(49, 34, 68, 0.5)',
                color: selectedCategory === cat ? '#fff' : '#6c7086',
              }}
            >
              {t(`news.${cat.replace(/-/g, '_')}`) || formatCategoryLabel(cat)}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={{ padding: '16px 0', fontSize: 12, color: '#6c7086' }}>{t('dash.cc.loading_news')}</div>
      ) : articles.length === 0 ? (
        <p style={{ padding: '16px 0', fontSize: 12, color: '#6c7086', margin: 0 }}>{t('dash.cc.no_news')}</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {articles.map((article, idx) => (
            <button
              key={article.slug || idx}
              onClick={() => onOpenArticle ? onOpenArticle(article.slug) : window.open(`https://ava-supernova.com/news/${article.slug}`, '_blank')}
              style={{
                display: 'block', width: '100%', textAlign: 'left', padding: 12,
                background: 'rgba(49,50,68,0.3)', border: '1px solid rgba(168, 85, 247, 0.12)', borderRadius: 8, cursor: 'pointer',
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
                  <span style={{ fontSize: 9, color: '#6c7086' }}>{t('news.min_read', { n: article.reading_time })}</span>
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
      title={t('dash.cc.todays_tasks')}
      icon={'\u2705'}
      action={tasks.length > 0 ? { label: t('dash.cc.view_all'), onClick: () => window.dispatchEvent(new CustomEvent('ava-navigate-dashboard', { detail: 'tasks' })) } : undefined}
      onRefresh={onRefresh}
    >
      {loading ? (
        <div style={{ padding: '16px 0', fontSize: 12, color: '#6c7086' }}>{t('dash.cc.loading_tasks')}</div>
      ) : todayTasks.length === 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '24px 0', textAlign: 'center' }}>
          <span style={{ fontSize: 28, opacity: 0.3, marginBottom: 8 }}>{'\uD83C\uDF89'}</span>
          <p style={{ fontSize: 12, color: '#6c7086', margin: 0 }}>{t('dash.cc.no_tasks')}</p>
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
                  border: isOverdue ? '1px solid rgba(243,139,168,0.2)' : '1px solid rgba(168, 85, 247, 0.12)',
                  background: isOverdue ? 'rgba(243,139,168,0.05)' : 'rgba(49,50,68,0.3)',
                }}
              >
                {/* Complete button */}
                <button
                  onClick={() => handleComplete(task.id)}
                  title={t('dash.cc.complete_task')}
                  style={{
                    width: 20, height: 20, borderRadius: '50%', border: '1px solid rgba(168, 85, 247, 0.12)',
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
                      <span style={{ fontSize: 9, fontWeight: 500, color: '#f38ba8' }}>{t('dash.cc.overdue')}</span>
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
      title={t('dash.cc.todays_journal')}
      icon={'\uD83D\uDCD3'}
      action={{ label: hasContent ? t('dash.cc.open_journal') : t('dash.cc.write_entry'), onClick: () => window.dispatchEvent(new CustomEvent('ava-navigate-dashboard', { detail: 'journal' })) }}
    >
      {loading ? (
        <div style={{ padding: '16px 0', fontSize: 12, color: '#6c7086' }}>{t('dash.cc.loading_journal')}</div>
      ) : !hasContent ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '16px 0', textAlign: 'center' }}>
          <span style={{ fontSize: 28, opacity: 0.3, marginBottom: 8 }}>{'\uD83D\uDCDD'}</span>
          <p style={{ fontSize: 12, color: '#6c7086', margin: 0 }}>{t('dash.cc.no_journal')}</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {userEntry && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 10, fontWeight: 500, color: '#a6adc8' }}>{t('dash.journal.your_entries')}</span>
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
                <span style={{ fontSize: 10, fontWeight: 500, color: '#a855f7' }}>{t('dash.journal.ava_entries')}</span>
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
      title={t('dash.cc.learning')}
      icon={'\uD83C\uDF93'}
      action={curriculums.length > 0 ? { label: t('dash.cc.continue_learning'), onClick: () => window.dispatchEvent(new CustomEvent('ava-navigate-dashboard', { detail: 'learning' })) } : undefined}
    >
      {loading ? (
        <div style={{ padding: '16px 0', fontSize: 12, color: '#6c7086' }}>{t('dash.cc.loading_learning')}</div>
      ) : active.length === 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '16px 0', textAlign: 'center' }}>
          <span style={{ fontSize: 28, opacity: 0.3, marginBottom: 8 }}>{'\uD83D\uDCDA'}</span>
          <p style={{ fontSize: 12, color: '#6c7086', margin: 0 }}>{t('dash.cc.no_learning')}</p>
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
              <div style={{ height: 6, borderRadius: 9999, background: 'rgba(49, 34, 68, 0.5)', overflow: 'hidden' }}>
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
      title={t('dash.cc.memory')}
      icon={'\uD83E\uDDE0'}
      action={{ label: t('dash.cc.view_all'), onClick: () => window.dispatchEvent(new CustomEvent('ava-navigate-dashboard', { detail: 'memory' })) }}
    >
      {loading ? (
        <div style={{ padding: '16px 0', fontSize: 12, color: '#6c7086' }}>{t('dash.cc.loading_memories')}</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div>
              <div style={{ fontSize: 28, fontWeight: 700, color: '#cdd6f4' }}>{activeCount}</div>
              <div style={{ fontSize: 10, color: '#6c7086' }}>{t('dash.cc.active_memories')}</div>
            </div>
            <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
              <div style={{ fontSize: 20, fontWeight: 600, color: '#a6adc8' }}>{memories.length}</div>
              <div style={{ fontSize: 10, color: '#6c7086' }}>{t('dash.cc.total')}</div>
            </div>
          </div>
          {lastMemory && (
            <div style={{ background: 'rgba(49,50,68,0.3)', border: '1px solid rgba(168, 85, 247, 0.12)', borderRadius: 8, padding: 10 }}>
              <p style={{ fontSize: 10, color: '#6c7086', margin: '0 0 2px 0' }}>{t('dash.cc.last_saved')}</p>
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
    <WidgetCard title={t('dash.cc.latest_release')} icon={'\uD83D\uDE80'} onRefresh={onRefresh}>
      {loading ? (
        <div style={{ padding: '16px 0', fontSize: 12, color: '#6c7086' }}>{t('dash.cc.loading_release')}</div>
      ) : !release ? (
        <p style={{ padding: '16px 0', fontSize: 12, color: '#6c7086', margin: 0 }}>{t('dash.cc.no_release_info')}</p>
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
            {t('dash.cc.view_release_notes')} &rarr;
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
      {t('dash.cc.connect_to_see', { widget: widgetName })}
    </div>
  );
}

// ── Main Command Centre Page ────────────────────────────────────────────────

export function CommandCentrePage() {
  useLocale();
  const hour = new Date().getHours();
  const greeting = hour < 12 ? t('dash.cc.greeting_morning') : hour < 18 ? t('dash.cc.greeting_afternoon') : t('dash.cc.greeting_evening');

  // Re-render on auth changes (login/logout)
  const [authRefresh, setAuthRefresh] = useState(0);
  useEffect(() => {
    const handler = () => setAuthRefresh(n => n + 1);
    window.addEventListener('ava-auth-changed', handler);
    return () => window.removeEventListener('ava-auth-changed', handler);
  }, []);
  void authRefresh;

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

  // ── Article reader state ─────────────────────────────────────────────
  const [activeArticle, setActiveArticle] = useState<any>(null);
  const [activeArticleRelated, setActiveArticleRelated] = useState<any[]>([]);
  const [_articleLoading, setArticleLoading] = useState(false);

  const openArticle = useCallback((slug: string) => {
    setArticleLoading(true);
    fetchArticleDirect(slug).then(result => {
      if (result?.post) {
        setActiveArticle(result.post);
        setActiveArticleRelated(result.related);
      }
      setArticleLoading(false);
    });
  }, []);

  // ── Platform API data (tasks, journal, learning, memory, release) ──
  const { data: rawTasks2, loading: tasksLoading, refetch: refetchTasks } = useApiData<any>('/tasks', null);
  const tasks: TaskEntry[] = Array.isArray(rawTasks2) ? rawTasks2 : (rawTasks2?.tasks ?? rawTasks2?.data ?? []);
  const { data: journalDay, loading: journalLoading } = useApiData<JournalDay | null>(`/journal?date=${new Date().toISOString().slice(0, 10)}`, null);
  const { data: rawLearning, loading: learningLoading } = useApiData<any>('/learning', null);
  const curriculums: LearningCurriculum[] = Array.isArray(rawLearning) ? rawLearning : (rawLearning?.curriculums ?? rawLearning?.data ?? []);
  const { data: rawMemories2, loading: memoriesLoading } = useApiData<any>('/memories', null);
  const memories: MemoryEntry[] = Array.isArray(rawMemories2) ? rawMemories2 : (rawMemories2?.memories ?? rawMemories2?.entries ?? rawMemories2?.data ?? []);
  const [releaseData, setReleaseData] = useState<any>(null);
  const [releaseLoading, setReleaseLoading] = useState(true);
  const refetchRelease = useCallback(() => {
    setReleaseLoading(true);
    fetchReleasesDirect(getLocale(), 1).then(d => { setReleaseData(d); setReleaseLoading(false); }).catch(() => setReleaseLoading(false));
  }, []);
  useEffect(() => { refetchRelease(); }, [refetchRelease]);

  const latestRelease: ReleaseInfo | null = useMemo(() => {
    if (!releaseData) return null;
    if (Array.isArray(releaseData)) return releaseData[0] ?? null;
    return releaseData;
  }, [releaseData]);

  // Show article reader when an article is active
  if (activeArticle) {
    return (
      <div style={pageWrapper}>
        <IdeArticleReader
          article={activeArticle}
          related={activeArticleRelated}
          onBack={() => { setActiveArticle(null); setActiveArticleRelated([]); }}
          onNavigateToArticle={(slug) => {
            setActiveArticle(null);
            setArticleLoading(true);
            openArticle(slug);
          }}
        />
      </div>
    );
  }

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

        {!connected && (
          <div style={{
            ...card, padding: '16px 20px', marginBottom: 16,
            background: 'linear-gradient(135deg, rgba(168,85,247,0.08), rgba(99,102,241,0.05))',
            border: '1px solid rgba(168,85,247,0.2)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ fontSize: 24 }}>{'\uD83D\uDD11'}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#cdd6f4' }}>{t('dash.cc.byok_mode')}</div>
                <div style={{ fontSize: 11, color: '#6c7086' }}>
                  {t('dash.cc.byok_desc')}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Weather (full width) ──────────────────────────────────────── */}
        <div style={{ marginBottom: 16 }}>
          <CCWeatherWidget weather={weather} loading={weatherLoading} onRefresh={loadWeather} />
        </div>

        {/* ── Working Hours Clock ───────────────────────────────────────── */}
        <div style={{ marginBottom: 16 }}>
          <WorkingHoursClock />
        </div>

        {/* ── News + Tasks (40/60 split, tasks gets more space) ─────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: '40% 1fr', gap: 16, marginBottom: 16 }}>
          <CCNewsWidget
            articles={newsArticles}
            loading={newsLoading}
            onCategoryChange={handleNewsCategory}
            selectedCategory={newsCategory}
            onRefresh={() => loadNews(newsCategory)}
            onOpenArticle={openArticle}
          />
          {connected ? (
            <CCTasksWidget tasks={tasks} loading={tasksLoading} onRefresh={refetchTasks} />
          ) : (
            <WidgetCard title={t('dash.cc.todays_tasks')} icon={'\u2705'}>
              <CCNotConnectedPlaceholder widgetName={t('dash.cc.widget_tasks')} />
            </WidgetCard>
          )}
        </div>

        {/* ── Journal + Learning (2 column) ─────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
          {connected ? (
            <CCJournalWidget journalDay={journalDay} loading={journalLoading} />
          ) : (
            <WidgetCard title={t('dash.cc.todays_journal')} icon={'\uD83D\uDCD3'}>
              <CCNotConnectedPlaceholder widgetName={t('dash.cc.widget_journal')} />
            </WidgetCard>
          )}
          {connected ? (
            <CCLearningWidget curriculums={curriculums} loading={learningLoading} />
          ) : (
            <WidgetCard title={t('dash.cc.learning')} icon={'\uD83C\uDF93'}>
              <CCNotConnectedPlaceholder widgetName={t('dash.cc.widget_learning')} />
            </WidgetCard>
          )}
        </div>

        {/* ── Memory + Release (2 column) ───────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
          {connected ? (
            <CCMemoryWidget memories={memories} loading={memoriesLoading} />
          ) : (
            <WidgetCard title={t('dash.cc.memory')} icon={'\uD83E\uDDE0'}>
              <CCNotConnectedPlaceholder widgetName={t('dash.cc.widget_memories')} />
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
  useLocale();
  // ── Types ──────────────────────────────────────────────────────────────────
  type AvaMode = 'work' | 'plan' | 'chat' | 'teach' | 'security' | 'brainstorm';
  interface ChatMessage {
    id: string;
    role: 'ava' | 'user' | 'error' | 'system';
    text: string;
    timestamp: number;
    toolCalls?: { name: string; status: 'running' | 'done' | 'error'; result?: string; args?: Record<string, any> }[];
    images?: { src: string; alt?: string }[]; // base64 or URL images
    files?: { name: string; path?: string; url?: string; type?: string }[]; // created files
    attachments?: { name: string; dataUri: string; mimeType: string }[]; // user-attached files
  }
  interface Conversation {
    id: string;
    title: string;
    messages: ChatMessage[];
    createdAt: number;
    updatedAt: number;
    model: string;
  }

  // ── Sidecar model mapping (single source of truth) ─────────────────────────
  const IDE_KNOWLEDGE_PACKS = [
    { id: 'game-development', name: 'Game Development', icon: '\uD83C\uDFAE', desc: 'Unreal, Godot, Unity' },
    { id: 'marketing', name: 'Marketing & Growth', icon: '\uD83D\uDCC8', desc: 'SEO, content, analytics' },
    { id: 'finance', name: 'Finance & Business', icon: '\uD83D\uDCB0', desc: 'Modelling, budgeting' },
    { id: 'legal', name: 'Legal & Compliance', icon: '\u2696\uFE0F', desc: 'Contracts, IP, privacy' },
    { id: 'product', name: 'Product Management', icon: '\uD83D\uDCCB', desc: 'Roadmaps, metrics' },
    { id: 'devops', name: 'DevOps & Infra', icon: '\u2601\uFE0F', desc: 'CI/CD, Docker, cloud' },
    { id: 'data-science', name: 'Data Science', icon: '\uD83D\uDCC9', desc: 'Analysis, ML' },
  ];

  const SIDECAR_MODEL_MAP: Record<string, string> = {
    'auto': 'auto',
    'qwen3.6-plus': 'platform:qwen3.6-plus',
    'kimi-k2.5': 'platform:kimi-k2.5',
    'qwen3-omni-flash': 'platform:qwen3-omni-flash',
    'qwen3.5-omni-plus': 'platform:qwen3.5-omni-plus',
    'qwen3.5-plus': 'platform:qwen3.5-plus',
    'qwen-flash': 'platform:qwen-flash',
    'MiniMax-M2.7': 'platform:MiniMax-M2.7',
    'MiniMax-M2.5': 'platform:MiniMax-M2.5',
    'MiniMax-M2': 'platform:MiniMax-M2',
    'deepseek-chat': 'deepseek:deepseek-chat',
    'deepseek-reasoner': 'deepseek:deepseek-reasoner',
    'moonshot-v1-128k': 'kimi:moonshot-v1-128k',
    'glm-4-plus': 'zhipu:glm-4-plus',
    'mistral-large': 'mistral:mistral-large-latest',
  };

  // ── Mode definitions ───────────────────────────────────────────────────────
  const MODES: { id: AvaMode; label: string; icon: string; prefix: string; placeholder: string }[] = [
    { id: 'work', label: t('mode.work'), icon: '>>', prefix: '', placeholder: t('mode.work.placeholder') },
    { id: 'plan', label: t('mode.plan'), icon: '::', prefix: '[Plan Mode] ', placeholder: t('mode.plan.placeholder') },
    { id: 'chat', label: t('mode.chat'), icon: '..', prefix: '[Chat Mode] ', placeholder: t('mode.chat.placeholder') },
    { id: 'teach', label: t('mode.teach'), icon: '??', prefix: '[Teach Mode] ', placeholder: t('mode.teach.placeholder') },
    { id: 'security', label: t('mode.security'), icon: '!!', prefix: '[Security Audit Mode] ', placeholder: t('mode.security.placeholder') },
    { id: 'brainstorm', label: t('mode.brainstorm'), icon: '**', prefix: '[Brainstorm Mode] ', placeholder: t('mode.brainstorm.placeholder') },
  ];

  // ── BYOK model map — fetched from platform, fallback to hardcoded ──────────
  const BYOK_MODELS_FALLBACK: Record<string, { id: string; name: string }[]> = {
    DeepSeek: [{ id: 'deepseek-chat', name: 'DeepSeek V3.2' }, { id: 'deepseek-reasoner', name: 'DeepSeek Reasoner' }],
    Qwen: [{ id: 'qwen3.5-omni-plus', name: 'Qwen 3.5 Omni Plus' }, { id: 'qwen3-omni-flash', name: 'Qwen Omni Flash' }, { id: 'qwen3.5-plus', name: 'Qwen 3.5 Plus' }, { id: 'qwen-flash', name: 'Qwen Flash' }],
    MiniMax: [{ id: 'MiniMax-M2.7', name: 'MiniMax M2.7' }, { id: 'MiniMax-M2.5', name: 'MiniMax M2.5' }],
    Moonshot: [{ id: 'kimi-k2.5', name: 'Kimi K2.5' }],
    Zhipu: [{ id: 'glm-5', name: 'GLM-5' }, { id: 'glm-4-plus', name: 'GLM-4 Plus' }],
    Mistral: [{ id: 'mistral-large-latest', name: 'Mistral Large 3' }, { id: 'codestral-latest', name: 'Codestral' }],
    Anthropic: [{ id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6' }, { id: 'claude-opus-4-6', name: 'Claude Opus 4.6' }],
  };

  const [platformModels, setPlatformModels] = useState<Record<string, { id: string; name: string }[]> | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { fetchPlatformModels } = await import('../lib/api');
        const models = await fetchPlatformModels();
        if (models && models.length > 0) {
          const byokMap: Record<string, { id: string; name: string }[]> = {};
          for (const m of models) {
            if (m.section !== 'byok') continue;
            const providerName = m.provider.charAt(0).toUpperCase() + m.provider.slice(1);
            if (!byokMap[providerName]) byokMap[providerName] = [];
            byokMap[providerName].push({ id: m.id, name: m.name });
          }
          setPlatformModels(byokMap);
        }
      } catch { /* fallback to hardcoded */ }
    })();
  }, []);

  const BYOK_MODELS = platformModels || BYOK_MODELS_FALLBACK;

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
  // Re-render on auth changes — reset to local-first state on logout
  const [authRefreshChat, setAuthRefreshChat] = useState(0);
  useEffect(() => {
    const handler = () => {
      setAuthRefreshChat(n => n + 1);
      if (!checkConnected()) {
        // Clear cloud state — snap back to local-first
        setPlatformBalance(null);
        setUsageWarning({ level: 'none', message: '' });
        setChatBackend('local');
        setMessages([{ id: `msg-reset-${Date.now()}`, role: 'ava' as const, text: t('dash.chat.welcome'), timestamp: Date.now() }]);
        setConversationTitle(t('dash.chat.new_chat'));
        setEnabledPacks(new Set());
        setSecrets([]);
        setTokenCount(0);
        setContextPercent(0);
      }
    };
    window.addEventListener('ava-auth-changed', handler);
    return () => window.removeEventListener('ava-auth-changed', handler);
  }, []);
  void authRefreshChat;
  const connected = checkConnected();

  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    try {
      const saved = localStorage.getItem('ava-ide-chat-current');
      if (saved) { const parsed = JSON.parse(saved); if (Array.isArray(parsed) && parsed.length > 0) return parsed; }
    } catch { /* */ }
    return [
      { id: mkId(), role: 'ava' as const, text: t('dash.chat.welcome'), timestamp: Date.now() },
    ];
  });
  const [input, setInput] = useState('');
  const [model, setModel] = useState<string>(() => localStorage.getItem('ava-ide-chat-model') || 'auto');
  const [mode, setMode] = useState<AvaMode>(() => (localStorage.getItem('ava-ide-chat-mode') as AvaMode) || 'work');
  const [streaming, setStreaming] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [hoveredMsg, setHoveredMsg] = useState<string | null>(null);
  const [copiedMsg, setCopiedMsg] = useState<string | null>(null);
  const [modeMenuOpen, setModeMenuOpen] = useState(false);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [packsMenuOpen, setPacksMenuOpen] = useState(false);
  const [enabledPacks, setEnabledPacks] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem('ava-knowledge-packs');
      return saved ? new Set(JSON.parse(saved) as string[]) : new Set<string>();
    } catch { return new Set<string>(); }
  });
  const [tokenCount, setTokenCount] = useState(0);
  const [platformBalance, setPlatformBalance] = useState<{ used: number; limit: number } | null>(null);
  const [conversationTitle, setConversationTitle] = useState(t('dash.chat.new_chat'));
  const [contextPercent, setContextPercent] = useState(0);

  // ── Load conversation from history ──────────────────────────────────────
  useEffect(() => {
    const handler = () => {
      try {
        const raw = localStorage.getItem('ava-ide-load-conversation');
        if (!raw) return;
        localStorage.removeItem('ava-ide-load-conversation');
        const conv = JSON.parse(raw);
        if (conv.messages && Array.isArray(conv.messages)) {
          setMessages(conv.messages);
          setConversationTitle(conv.title || t('dash.chat.new_chat'));
        }
      } catch { /* ignore */ }
    };
    window.addEventListener('ava-load-conversation', handler);
    return () => window.removeEventListener('ava-load-conversation', handler);
  }, []);

  // ── Platform balance fetch ──────────────────────────────────────────────
  const fetchBalance = useCallback(async () => {
    const key = getPlatformKey();
    if (!key) return;
    try {
      const res = await apiFetch('/account-info');
      if (res?.usage && res.usage.free_tokens_used !== undefined) {
        setPlatformBalance({ used: res.usage.free_tokens_used, limit: res.usage.free_tokens_limit || 3000000 });
      }
    } catch { /* non-fatal */ }
  }, []);

  useEffect(() => { fetchBalance(); }, [fetchBalance]);
  // Refresh balance when streaming ends
  useEffect(() => { if (!streaming) fetchBalance(); }, [streaming, fetchBalance]);

  // ── Local sidecar state ─────────────────────────────────────────────────
  const [chatBackend, setChatBackend] = useState<'local' | 'cloud'>(() => {
    const saved = localStorage.getItem('ava-ide-chat-backend') as 'local' | 'cloud' | null;
    // Force local if not connected — Cloud needs a platform account
    if (!checkConnected()) return 'local';
    return saved || 'cloud';
  });
  const [sidecarReady, setSidecarReady] = useState(false);
  const [sidecarStatus, setSidecarStatus] = useState<'off' | 'starting' | 'ready' | 'error'>('off');
  const [pendingConfirm, setPendingConfirm] = useState<{
    id: string; toolName: string; args: Record<string, unknown>;
  } | null>(null);
  const [confirmInput, setConfirmInput] = useState('');
  const [pendingAttachments, setPendingAttachments] = useState<{ name: string; dataUri: string; mimeType: string }[]>([]);

  // ── Usage warning state ──────────────────────────────────────────────
  const [usageWarning, setUsageWarning] = useState<{ level: string; message: string }>({ level: 'none', message: '' });
  const fetchUsageWarning = useCallback(async () => {
    if (!checkConnected()) return;
    try {
      const res = await apiFetch('/account-info');
      if (res?.warning && res.warning !== 'none') {
        setUsageWarning({ level: res.warning, message: res.warning_message || '' });
      } else {
        setUsageWarning({ level: 'none', message: '' });
      }
    } catch { /* silent */ }
  }, []);

  // ── Secret Vault state ────────────────────────────────────────────────
  const [secrets, setSecrets] = useState<{ id: string; label: string; value: string }[]>([]);
  const [showVault, setShowVault] = useState(false);
  const [vaultNewLabel, setVaultNewLabel] = useState('');
  const [vaultNewValue, setVaultNewValue] = useState('');
  const [vaultRevealIds, setVaultRevealIds] = useState<Set<string>>(new Set());
  // Track which message IDs used secrets (for the lock icon)
  const secretMsgIds = useRef<Set<string>>(new Set());
  // Track inline reveal toggles per message: msgId -> set of character offsets
  const [inlineReveals, setInlineReveals] = useState<Record<string, Set<number>>>({});
  const vaultPanelRef = useRef<HTMLDivElement>(null);
  const vaultBtnRef = useRef<HTMLButtonElement>(null);

  // Load secrets from localStorage on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem('ava-ide-secrets');
      if (raw) { const parsed = JSON.parse(raw); if (Array.isArray(parsed)) setSecrets(parsed); }
    } catch { /* */ }
  }, []);

  // Persist secrets to localStorage
  useEffect(() => {
    try { localStorage.setItem('ava-ide-secrets', JSON.stringify(secrets)); } catch { /* */ }
  }, [secrets]);

  // Close vault on outside click
  useEffect(() => {
    if (!showVault) return;
    const handler = (e: MouseEvent) => {
      if (vaultPanelRef.current && !vaultPanelRef.current.contains(e.target as Node) && vaultBtnRef.current && !vaultBtnRef.current.contains(e.target as Node)) setShowVault(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showVault]);

  const addSecret = useCallback(() => {
    const label = vaultNewLabel.trim();
    const value = vaultNewValue.trim();
    if (!label || !value) return;
    setSecrets(prev => [...prev, { id: `secret-${crypto.randomUUID()}`, label, value }]);
    setVaultNewLabel('');
    setVaultNewValue('');
  }, [vaultNewLabel, vaultNewValue]);

  const deleteSecret = useCallback((id: string) => {
    setSecrets(prev => prev.filter(s => s.id !== id));
  }, []);

  const toggleVaultReveal = useCallback((id: string) => {
    setVaultRevealIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  // Replace @secret:Label references with actual values, returns { text, usedSecrets }
  const injectSecrets = useCallback((text: string): { text: string; usedSecrets: boolean } => {
    let usedSecrets = false;
    const result = text.replace(/@secret:(\S+)/g, (_match, label) => {
      const s = secrets.find(sec => sec.label === label);
      if (s) { usedSecrets = true; return s.value; }
      return _match; // leave unchanged if not found
    });
    return { text: result, usedSecrets };
  }, [secrets]);

  // Redact any raw secret values from text
  const redactSecrets = useCallback((text: string): string => {
    let result = text;
    for (const s of secrets) {
      if (s.value && result.includes(s.value)) {
        result = result.split(s.value).join('\u2022\u2022\u2022\u2022\u2022\u2022');
      }
    }
    return result;
  }, [secrets]);

  const chatUserAvatar = useMemo(() => localStorage.getItem('ava-ide-user-avatar') || '', []);
  const chatAiAvatar = useMemo(() => localStorage.getItem('ava-ide-ai-avatar') || '', []);

  // ── Tasks panel state ──────────────────────────────────────────────────
  const [tasksPanelOpen, setTasksPanelOpen] = useState<boolean>(() => {
    try { return localStorage.getItem('ava-ide-tasks-open') === 'true'; } catch { return false; }
  });
  const [tasksPanelWidth, setTasksPanelWidth] = useState<number>(() => {
    try { return Number(localStorage.getItem('ava-ide-tasks-width')) || 260; } catch { return 260; }
  });
  const [sessionTasks, setSessionTasks] = useState<SessionTaskUI[]>([]);
  const [avaCompletedTasks, setAvaCompletedTasks] = useState<AvaCompletedTaskUI[]>(() => {
    try { const s = localStorage.getItem('ava-ide-tasks-completed'); return s ? JSON.parse(s) : []; } catch { return []; }
  });
  const [todayTasks, setTodayTasks] = useState<TodayTaskUI[]>([]);
  const [allTasks, setAllTasks] = useState<TodayTaskUI[]>([]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const modeMenuRef = useRef<HTMLDivElement>(null);
  const modelMenuRef = useRef<HTMLDivElement>(null);
  const packsMenuRef = useRef<HTMLDivElement>(null);

  // ── Derived: available BYOK models ────────────────────────────────────────
  // ── BYOK models (reactive — updates when sidebar keys change) ────────────
  const [byokRefresh, setByokRefresh] = useState(0);
  useEffect(() => {
    const handler = () => setByokRefresh(n => n + 1);
    window.addEventListener('storage', handler);
    window.addEventListener('ava-byok-changed', handler);
    return () => { window.removeEventListener('storage', handler); window.removeEventListener('ava-byok-changed', handler); };
  }, []);

  // Forward working hours changes to sidecar (zero tokens — only fires on pin drag)
  useEffect(() => {
    const handler = () => {
      const sidecar = getSidecar();
      if (!sidecar.isReady) return;
      const s = Number(localStorage.getItem('ava-ide-work-start')) || 9;
      const e = Number(localStorage.getItem('ava-ide-work-end')) || 17;
      sidecar.setWorkingHours(s, e).catch(() => {});
    };
    window.addEventListener('ava-working-hours-changed', handler);
    return () => window.removeEventListener('ava-working-hours-changed', handler);
  }, []);

  const byokModels = useMemo(() => {
    void byokRefresh; // trigger recalc
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
  }, [byokRefresh]);

  // ── Derived: can the user actually chat? ────────────────────────────────
  const hasByokKeys = byokModels.length > 0;
  const canChat = chatBackend === 'local' ? (hasByokKeys || connected) : connected;
  const chatInactiveReason = !canChat
    ? (!connected && !hasByokKeys
      ? t('dash.chat.inactive_no_keys')
      : chatBackend === 'cloud' && !connected
        ? t('dash.chat.inactive_no_cloud')
        : '')
    : '';

  // ── Persist model & mode ──────────────────────────────────────────────────
  useEffect(() => { try { localStorage.setItem('ava-ide-chat-model', model); } catch { /* */ } }, [model]);
  useEffect(() => {
    try { localStorage.setItem('ava-ide-chat-mode', mode); } catch { /* */ }
    window.dispatchEvent(new CustomEvent('ava-mode-changed'));
  }, [mode]);

  // Listen for mode changes from status bar
  useEffect(() => {
    const handler = () => {
      const newMode = localStorage.getItem('ava-ide-chat-mode') as AvaMode;
      if (newMode && newMode !== mode) setMode(newMode);
    };
    window.addEventListener('ava-mode-changed', handler);
    return () => window.removeEventListener('ava-mode-changed', handler);
  }, [mode]);

  // ── Persist tasks panel state ───────────────────────────────────────────
  useEffect(() => { try { localStorage.setItem('ava-ide-tasks-open', String(tasksPanelOpen)); } catch {} }, [tasksPanelOpen]);
  useEffect(() => { try { localStorage.setItem('ava-ide-tasks-width', String(tasksPanelWidth)); } catch {} }, [tasksPanelWidth]);
  useEffect(() => { try { localStorage.setItem('ava-ide-tasks-completed', JSON.stringify(avaCompletedTasks)); } catch {} }, [avaCompletedTasks]);

  // ── Fetch user tasks when panel opens ───────────────────────────────────
  const fetchUserTasks = useCallback(async () => {
    if (!checkConnected()) return;
    try {
      const today = new Date().toISOString().slice(0, 10);
      const data = await apiFetch(`/tasks?date=${today}`);
      const arr = Array.isArray(data) ? data : (data?.tasks ?? data?.data ?? []);
      const mapped = arr.map((t: any) => ({
        id: t.id, title: t.title, priority: t.priority || 'medium',
        status: t.status || 'todo', dueDate: t.due_date, category: t.category || 'general',
      }));
      setAllTasks(mapped);
      setTodayTasks(mapped.filter((t: TodayTaskUI) => !t.dueDate || t.dueDate === today));
    } catch { /* silently fail */ }
  }, []);

  useEffect(() => { if (tasksPanelOpen) fetchUserTasks(); }, [tasksPanelOpen, fetchUserTasks]);

  const handleToggleTask = useCallback(async (taskId: string) => {
    if (!checkConnected()) return;
    try {
      const task = allTasks.find(t => t.id === taskId);
      const newStatus = task?.status === 'done' ? 'todo' : 'done';
      await apiFetch(`/tasks/${taskId}`, { method: 'PATCH', body: JSON.stringify({ status: newStatus }) });
      fetchUserTasks();
    } catch { /* */ }
  }, [allTasks, fetchUserTasks]);

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

  // ── Usage warning check (on mount + after messages change while not streaming) ──
  useEffect(() => {
    if (!streaming) fetchUsageWarning();
  }, [messages.length, streaming, fetchUsageWarning]);

  // ── Close dropdowns on outside click ──────────────────────────────────────
  useEffect(() => {
    if (!modeMenuOpen && !modelMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (modeMenuOpen && modeMenuRef.current && !modeMenuRef.current.contains(e.target as Node)) setModeMenuOpen(false);
      if (modelMenuOpen && modelMenuRef.current && !modelMenuRef.current.contains(e.target as Node)) setModelMenuOpen(false);
      if (packsMenuOpen && packsMenuRef.current && !packsMenuRef.current.contains(e.target as Node)) setPacksMenuOpen(false);
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

  // ── Paste/drop image handler ──────────────────────────────────────────────
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    // Try clipboardData.files first (works better in WebView2)
    const files = e.clipboardData?.files;
    if (files && files.length > 0) {
      for (const file of Array.from(files)) {
        if (file.type.startsWith('image/')) {
          e.preventDefault();
          const ext = file.type.split('/')[1] || 'png';
          const name = file.name && file.name !== '' && file.name !== 'image.png' ? file.name : `pasted-${Date.now()}.${ext}`;
          const reader = new FileReader();
          reader.onloadend = () => {
            const dataUri = reader.result as string;
            if (dataUri && dataUri.startsWith('data:')) {
              setPendingAttachments((prev) => [...prev, { name, dataUri, mimeType: file.type }]);
            }
          };
          reader.readAsDataURL(file);
          return; // handled
        }
      }
    }

    // Fallback: try clipboardData.items
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const blob = item.getAsFile();
        if (!blob || blob.size === 0) continue;
        const ext = item.type.split('/')[1] || 'png';
        const name = `pasted-${Date.now()}.${ext}`;
        const reader = new FileReader();
        reader.onloadend = () => {
          const dataUri = reader.result as string;
          if (dataUri && dataUri.startsWith('data:')) {
            setPendingAttachments((prev) => [...prev, { name, dataUri, mimeType: item.type }]);
          }
        };
        reader.readAsDataURL(blob);
      }
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const files = e.dataTransfer?.files;
    if (!files) return;
    for (const file of Array.from(files)) {
      if (file.type.startsWith('image/') || file.type === 'application/pdf') {
        const reader = new FileReader();
        reader.onload = () => {
          setPendingAttachments((prev) => [...prev, {
            name: file.name,
            dataUri: reader.result as string,
            mimeType: file.type,
          }]);
        };
        reader.readAsDataURL(file);
      }
    }
  }, []);

  const removeAttachment = useCallback((idx: number) => {
    setPendingAttachments((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && !e.altKey && !e.metaKey && /^[1-9]$/.test(e.key)) {
        const idx = parseInt(e.key) - 1;
        if (idx < MODES.length) {
          e.preventDefault();
          setMode(MODES[idx].id);
          setModeMenuOpen(false);
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // ── Persist chat backend ─────────────────────────────────────────────────
  useEffect(() => {
    try { localStorage.setItem('ava-ide-chat-backend', chatBackend); } catch { /* */ }
  }, [chatBackend]);

  // Ref to hold the latest event handler — set synchronously, never null after mount
  const sidecarEventRef = useRef<(event: SidecarEvent) => void>(() => {});

  // ── Sidecar lifecycle — always runs (both Local and Cloud need tools) ──
  useEffect(() => {
    // Sidecar runs in both modes — Cloud uses platform key, Local uses BYOK
    if (!canChat) {
      setSidecarReady(false);
      setSidecarStatus('off');
      return;
    }

    let cancelled = false;
    const sidecar = getSidecar();

    const startSidecar = async () => {
      setSidecarStatus('starting');
      try {
        // Build config from localStorage BYOK keys
        const providers: Record<string, { apiKey: string }> = {};
        try {
          const raw = localStorage.getItem('ava-ide-byok');
          if (raw) {
            const keys: Record<string, string> = JSON.parse(raw);
            const nameMap: Record<string, string> = { DeepSeek: 'deepseek', Qwen: 'qwen', Moonshot: 'kimi', Zhipu: 'glm', Mistral: 'mistral' };
            for (const [name, key] of Object.entries(keys)) {
              if (key?.trim()) {
                const mapped = nameMap[name] || name.toLowerCase();
                providers[mapped] = { apiKey: key.trim() };
              }
            }
          }
        } catch { /* */ }

        const modelMap = SIDECAR_MODEL_MAP;

        // Read working hours from localStorage
        const workStart = Number(localStorage.getItem('ava-ide-work-start')) || 9;
        const workEnd = Number(localStorage.getItem('ava-ide-work-end')) || 17;

        const config: SidecarConfig = {
          providers,
          platformKey: getPlatformKey() || undefined,
          activeModel: modelMap[model] || `qwen:${model}`,
          cwd: localStorage.getItem('ava-ide-project-folder') || '.',
          mode,
          permissionMode: (localStorage.getItem('ava-ide-settings') ? JSON.parse(localStorage.getItem('ava-ide-settings')!).permissionMode : 'balanced') || 'balanced',
          autoMemory: true,
          workingHours: { start: workStart, end: workEnd },
          userName: localStorage.getItem('ava-ide-user-name') || localStorage.getItem('ava-ide-email')?.split('@')[0] || undefined,
          userEmail: localStorage.getItem('ava-ide-email') || undefined,
          userTier: localStorage.getItem('ava-ide-tier') || undefined,
          _devPlatformFallback: !!getPlatformKey(),
          // Computer Use — pass HAI key if configured
          holoApiKey: localStorage.getItem('ava-ide-holo-key') || undefined,
        } as SidecarConfig;

        await sidecar.start(config);

        if (!cancelled) {
          // Attach event listener IMMEDIATELY after start — before setting ready
          // This prevents the race condition where messages are sent before listeners exist
          const handler = (event: SidecarEvent) => { sidecarEventRef.current(event); };
          (sidecar as any).__avaHandler = handler;
          sidecar.onAny(handler);
          setSidecarReady(true);
          setSidecarStatus('ready');
        }
      } catch (err: any) {
        if (!cancelled) {
          setSidecarStatus('error');
        }
      }
    };

    startSidecar();

    // Listen for sidecar close
    const onClose = () => {
      if (!cancelled) {
        setSidecarReady(false);
        setSidecarStatus('off');
      }
    };
    sidecar.on('close', onClose);

    // Memory clear events
    const onClearMemory = () => { sidecar.clearMemory().catch(() => {}); };
    window.addEventListener('ava-clear-memory', onClearMemory);

    // Folder change — update sidecar working directory when user opens a new project
    const onFolderChanged = (e: Event) => {
      const path = (e as CustomEvent).detail;
      if (path && sidecar.isReady) {
        sidecar.setWorkingDirectory(path).catch(() => {});
      }
    };
    window.addEventListener('ava-folder-changed', onFolderChanged);

    return () => {
      cancelled = true;
      sidecar.off('close', onClose);
      if ((sidecar as any).__avaHandler) sidecar.offAny((sidecar as any).__avaHandler);
      window.removeEventListener('ava-clear-memory', onClearMemory);
      window.removeEventListener('ava-folder-changed', onFolderChanged);
      sidecar.stop().catch(() => {});
    };
  }, [canChat]); // Restart sidecar when chat ability changes

  // ── Send model/mode changes to running sidecar (no restart) ────────────
  const prevModelRef = useRef(model);
  const prevModeRef = useRef(mode);
  useEffect(() => {
    if (!sidecarReady) return;
    const sidecar = getSidecar();
    if (model !== prevModelRef.current) {
      prevModelRef.current = model;
      sidecar.setModel(SIDECAR_MODEL_MAP[model] || `platform:${model}`).catch(() => {});
    }
    if (mode !== prevModeRef.current) {
      prevModeRef.current = mode;
      sidecar.setMode(mode).catch(() => {});
    }
  }, [model, mode, sidecarReady]);

  // ── Sidecar event handler (for local mode streaming) ──────────────────
  const handleSidecarEvent = useCallback((event: SidecarEvent) => {
    switch (event.event) {
      case 'stream_start':
        setStatusText('');
        break;

      // ── Status feedback — show users what Ava is doing ──────────────
      case 'info':
        if (event.message) {
          // Map sidecar info messages to user-friendly status text
          const msg = event.message;
          if (msg.includes('Memory manager')) setStatusText(t('dash.chat.status.loading_memory'));
          else if (msg.includes('Personality')) setStatusText(t('dash.chat.status.loading_personality'));
          else if (msg.includes('Locale')) setStatusText(t('dash.chat.status.setting_language'));
          else if (msg.includes('Project indexed')) setStatusText(msg.replace('Project indexed:', 'Scanned project:').trim());
          else if (msg.includes('Resolving model')) setStatusText(t('dash.chat.status.connecting_model'));
          else if (msg.includes('Memory Agent')) setStatusText(t('dash.chat.status.memory_agent_ready'));
          else if (msg.includes('Memory brief')) setStatusText(t('dash.chat.status.recalling_context'));
          else if (msg.includes('Recalled')) setStatusText(msg);
          else if (msg.includes('Re-indexed')) setStatusText(t('dash.chat.status.rescanning_project'));
          else if (msg.includes('Image attached')) setStatusText(msg);
          else if (msg.includes('Image loaded')) setStatusText(t('dash.chat.status.processing_image'));
          else if (msg.includes('Provider failover')) setStatusText(t('dash.chat.status.switching_provider'));
        }
        break;

      case 'orchestration_start':
        setStatusText(t('dash.chat.status.planning'));
        break;

      case 'conductor_event':
        if (event.message) setStatusText(event.message);
        break;

      case 'orchestration_end':
        setStatusText(t('dash.chat.status.executing'));
        break;

      case 'auto_routing':
        setStatusText(t('dash.chat.status.selecting_model'));
        break;

      case 'auto_agent_start':
        setStatusText(t('dash.chat.status.spinning_agent'));
        break;

      case 'auto_agent_end':
        setStatusText('');
        break;

      case 'context_compression_start':
        setStatusText(t('dash.chat.status.compressing'));
        break;

      case 'context_compression_end':
        setStatusText('');
        break;

      case 'thinking_delta':
        setStatusText(t('dash.chat.status.thinking'));
        break;

      case 'stream_delta':
        if (event.content) {
          setStatusText('');
          setMessages((prev) => {
            const copy = [...prev];
            const last = copy[copy.length - 1];
            // If last message is an ava message with tool calls but no text after them,
            // create a new ava message for the continuation text (timeline flow)
            if (last?.role === 'ava' && last.toolCalls && last.toolCalls.length > 0 && !last.text.endsWith(event.content || '')) {
              const hasTextAfterTools = last.text.length > 0;
              if (hasTextAfterTools) {
                // Start a new ava message for text after tool calls
                copy.push({ id: mkId(), role: 'ava', text: redactSecrets(event.content || ''), timestamp: Date.now(), toolCalls: [] });
                return copy;
              }
            }
            if (last?.role === 'ava') {
              const newText = redactSecrets(last.text + event.content);
              if (newText !== last.text + event.content) {
                const prevUser = copy.filter(m => m.role === 'user').pop();
                if (prevUser) secretMsgIds.current.add(prevUser.id);
                secretMsgIds.current.add(last.id);
              }
              copy[copy.length - 1] = { ...last, text: newText };
            }
            return copy;
          });
        }
        break;

      case 'tool_call_start': {
        // Show tool name as status
        const toolLabel = event.toolName === 'bash' ? t('dash.chat.status.tool.bash')
          : event.toolName === 'glob' || event.toolName === 'list_directory' ? t('dash.chat.status.tool.glob')
          : event.toolName === 'grep' || event.toolName === 'find_symbol' ? t('dash.chat.status.tool.grep')
          : event.toolName === 'file_read' ? t('dash.chat.status.tool.file_read')
          : event.toolName === 'file_write' || event.toolName === 'file_edit' ? t('dash.chat.status.tool.file_write')
          : event.toolName === 'git_status' || event.toolName === 'git_diff' ? t('dash.chat.status.tool.git')
          : event.toolName === 'web_search' ? t('dash.chat.status.tool.web_search')
          : event.toolName === 'memory_recall' ? t('dash.chat.status.tool.memory_recall')
          : event.toolName === 'memory_save' ? t('dash.chat.status.tool.memory_save')
          : event.toolName === 'test_run' ? t('dash.chat.status.tool.test_run')
          : event.toolName === 'analyze_architecture' ? t('dash.chat.status.tool.architecture')
          : event.toolName === 'project_index' ? t('dash.chat.status.tool.project_index')
          : event.toolName ? `Using ${event.toolName}...` : '';
        if (toolLabel) setStatusText(toolLabel);
        setMessages((prev) => {
          const copy = [...prev];
          const last = copy[copy.length - 1];
          if (last?.role === 'ava') {
            const existing = last.toolCalls || [];
            copy[copy.length - 1] = {
              ...last,
              toolCalls: [...existing, { name: event.toolName || 'unknown', status: 'running', args: event.args }],
            };
          }
          return copy;
        });

        // Update session tasks immediately when todo_write is called (args has the latest list)
        if (event.toolName === 'todo_write' && event.args?.todos && Array.isArray(event.args.todos)) {
          setSessionTasks(event.args.todos.map((t: any, idx: number) => ({
            id: `session-${Date.now()}-${idx}`,
            title: t.content || t.title || t.text || '',
            status: t.status || 'pending',
          })));
          if (!tasksPanelOpen) setTasksPanelOpen(true);
        }
        break;
      }

      case 'tool_call_end':
        trackToolCall();
        setMessages((prev) => {
          const copy = [...prev];
          const last = copy[copy.length - 1];
          if (last?.role === 'ava') {
            const updates: Partial<ChatMessage> = {};

            // Update tool status
            if (last.toolCalls) {
              const tools = [...last.toolCalls];
              const idx = tools.findIndex((t) => t.name === event.toolName && t.status === 'running');
              if (idx >= 0) {
                tools[idx] = { ...tools[idx], status: event.success ? 'done' : 'error', result: event.result };
                updates.toolCalls = tools;
              }
            }

            // Extract images from tool results (generate_image, screenshot, remove_background)
            const imageTools = ['generate_image', 'screenshot', 'remove_background'];
            if (imageTools.includes(event.toolName || '') && event.result) {
              try {
                const parsed = typeof event.result === 'string' ? JSON.parse(event.result) : event.result;
                if (parsed?.base64_image || parsed?.url || parsed?.image_url) {
                  const src = parsed.base64_image
                    ? `data:${parsed.mime_type || 'image/png'};base64,${parsed.base64_image}`
                    : parsed.url || parsed.image_url;
                  updates.images = [...(last.images || []), { src, alt: event.toolName }];
                }
              } catch {
                // Result might contain a base64 string directly or a file path
                if (event.result && (event.result as string).startsWith?.('data:')) {
                  updates.images = [...(last.images || []), { src: event.result as string }];
                }
              }
            }

            // Extract created files (document_manage, presentation_create, etc.)
            const fileTools = ['document_manage', 'presentation_create', 'email_draft', 'report_generate'];
            if (fileTools.includes(event.toolName || '') && event.result && event.success) {
              try {
                const parsed = typeof event.result === 'string' ? JSON.parse(event.result) : event.result;
                if (parsed?.path || parsed?.filename) {
                  const name = parsed.filename || parsed.path?.split(/[/\\]/).pop() || 'file';
                  updates.files = [...(last.files || []), { name, path: parsed.path, url: parsed.url }];
                }
              } catch {
                // Plain text result with file path
                const match = (event.result as string)?.match?.(/(?:saved|created|wrote).*?([^\s]+\.\w{2,5})/i);
                if (match) {
                  updates.files = [...(last.files || []), { name: match[1].split(/[/\\]/).pop() || 'file', path: match[1] }];
                }
              }
            }

            if (Object.keys(updates).length > 0) {
              copy[copy.length - 1] = { ...last, ...updates };
            }
          }
          return copy;
        });

        // Extract session tasks from todo_write
        if (event.toolName === 'todo_write' && event.success) {
          try {
            const parsed = typeof event.result === 'string' ? JSON.parse(event.result) : (event.args || event.result);
            const todos = parsed?.todos || parsed?.items;
            if (Array.isArray(todos)) {
              setSessionTasks(todos.map((t: any, idx: number) => ({
                id: `session-${Date.now()}-${idx}`,
                title: t.content || t.title || t.text || '',
                status: t.status || 'pending',
              })));
              if (!tasksPanelOpen) setTasksPanelOpen(true);
            }
          } catch { /* malformed */ }
        }
        break;

      case 'confirm_required':
        setPendingConfirm({
          id: event.id!,
          toolName: event.toolName || 'unknown',
          args: event.args || {},
        });
        break;

      case 'usage':
        if (event.usage) {
          const total = event.usage.total_tokens || (event.usage.prompt_tokens || 0) + (event.usage.completion_tokens || 0);
          setTokenCount((prev) => prev + total);
          trackTokenUsage(event.usage, model);
        }
        break;

      case 'context_usage':
        if (event.percent) {
          setContextPercent(Math.round(event.percent));
        }
        break;

      case 'done':
        // Ensure the message has the full content — fallback if stream_delta missed anything
        if (event.content) {
          setMessages((prev) => {
            const copy = [...prev];
            const last = copy[copy.length - 1];
            if (last?.role === 'ava') {
              // Only replace if the accumulated text is shorter (missed deltas)
              const fullContent = redactSecrets(event.content as string);
              if (!last.text || last.text.length < fullContent.length * 0.8) {
                if (fullContent !== event.content) secretMsgIds.current.add(last.id);
                copy[copy.length - 1] = { ...last, text: fullContent };
              }
            }
            return copy;
          });
        }
        setStreaming(false);
        setStatusText('');
        textareaRef.current?.focus();
        break;

      case 'cancelled':
        setMessages((prev) => {
          const copy = [...prev];
          const last = copy[copy.length - 1];
          if (last?.role === 'ava' && !last.text) {
            copy[copy.length - 1] = { ...last, text: t('dash.chat.cancelled'), role: 'system' };
          }
          return copy;
        });
        setStreaming(false);
        setStatusText('');
        break;

      case 'error':
      case 'agent_error':
        setMessages((prev) => [...prev, {
          id: mkId(), role: 'error' as const,
          text: event.message || t('dash.chat.unknown_error'),
          timestamp: Date.now(),
        }]);
        setStreaming(false);
        setStatusText('');
        break;

      case 'warning':
        setMessages((prev) => [...prev, {
          id: mkId(), role: 'error' as const,
          text: event.message || 'Warning',
          timestamp: Date.now(),
        }]);
        break;

      case 'cwd_changed':
        setMessages((prev) => [...prev, {
          id: mkId(), role: 'system' as const,
          text: `Project folder changed: ${event.message}`,
          timestamp: Date.now(),
        }]);
        break;

      case 'audit_log':
      case 'audit_entry':
        // Forward audit events to window so UsagePage can pick them up
        window.dispatchEvent(new CustomEvent('ava-audit-event', { detail: event }));
        break;
    }
  }, [redactSecrets]);

  // Keep the ref in sync — synchronous assignment, not in useEffect
  sidecarEventRef.current = handleSidecarEvent;

  // Event listener is now attached in the sidecar lifecycle effect above
  // to prevent race condition where messages are sent before listeners exist

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
          title: firstUser ? firstUser.text.slice(0, 60) : t('dash.chat.untitled'),
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
      { id: mkId(), role: 'ava', text: t('dash.chat.fresh'), timestamp: Date.now() },
    ]);
    setConversationTitle(t('dash.chat.new_chat'));
    setTokenCount(0);
    setContextPercent(0);
    resetSessionStats();
    // Move completed session tasks to history, clear session
    if (sessionTasks.length > 0) {
      const completed = sessionTasks.filter(t => t.status === 'completed').map(t => ({
        id: t.id, title: t.title, completedAt: new Date().toISOString(),
      }));
      if (completed.length > 0) setAvaCompletedTasks(prev => [...completed, ...prev]);
      setSessionTasks([]);
    }
    if (abortRef.current) { abortRef.current.abort(); abortRef.current = null; }
    const sidecar = getSidecar();
    sidecar.clear().catch(() => {});
    setStreaming(false);
    textareaRef.current?.focus();
  }, [messages, model]);

  // ── Copy message ──────────────────────────────────────────────────────────
  const copyMessage = useCallback((msgId: string, text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedMsg(msgId);
      setTimeout(() => setCopiedMsg(null), 2000);
    }).catch(() => {});
  }, []);

  // ── Cancel streaming ──────────────────────────────────────────────────────
  // Soft interrupt — tap to get Ava's attention
  const togglePack = useCallback((id: string) => {
    setEnabledPacks(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      localStorage.setItem('ava-knowledge-packs', JSON.stringify([...next]));
      return next;
    });
  }, []);

  const interruptStream = useCallback(() => {
    const sidecar = getSidecar();
    sidecar.interrupt().catch(() => {
      // Interrupt not supported or failed — fall back to hard cancel
      sidecar.cancel().catch(() => {});
    });
    setPendingConfirm(null);
    // Don't set streaming to false — Ava will respond to the interrupt
  }, []);

  // Hard stop — long press or fallback
  const hardStop = useCallback(() => {
    const sidecar = getSidecar();
    sidecar.cancel().catch(() => {
      sidecar.stop().then(() => {
        sidecar.start({
          providers: {},
          platformKey: getPlatformKey() || undefined,
          activeModel: `platform:${model}`,
          cwd: localStorage.getItem('ava-ide-project-folder') || '.',
          mode,
          permissionMode: (localStorage.getItem('ava-ide-settings') ? JSON.parse(localStorage.getItem('ava-ide-settings')!).permissionMode : 'balanced') || 'balanced',
          autoMemory: true,
          _devPlatformFallback: true,
          holoApiKey: localStorage.getItem('ava-ide-holo-key') || undefined,
        } as SidecarConfig).catch(() => {});
      }).catch(() => {});
    });
    setPendingConfirm(null);
    setStreaming(false);
    setMessages((prev) => {
      const copy = [...prev];
      const last = copy[copy.length - 1];
      if (last?.role === 'ava' && !last.text) {
        copy[copy.length - 1] = { ...last, text: t('dash.chat.stopped') };
      }
      return copy;
    });
  }, [model, mode]);

  // Stop button: single click = soft interrupt, hold 800ms = hard stop
  const stopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelStream = useCallback(() => {
    interruptStream();
  }, [interruptStream]);

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
      // Text before code block (may contain tables)
      if (match.index > lastIndex) {
        parts.push(...renderTextWithTables(text.slice(lastIndex, match.index), partKey));
        partKey += 10; // leave room for table keys
      }
      // Code block
      const lang = match[1] || '';
      const code = match[2] || '';
      parts.push(
        <div key={partKey++} style={{
          background: 'rgba(10, 6, 18, 0.8)', border: '1px solid rgba(168, 85, 247, 0.12)', borderRadius: 8, margin: '8px 0',
          overflow: 'hidden',
        }}>
          {lang && (
            <div style={{
              fontSize: 10, color: '#6c7086', padding: '4px 12px', background: 'rgba(26, 16, 40, 0.6)',
              borderBottom: '1px solid rgba(168, 85, 247, 0.12)', fontFamily: 'monospace',
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
    // Remaining text (may contain tables)
    if (lastIndex < text.length) {
      parts.push(...renderTextWithTables(text.slice(lastIndex), partKey));
    }
    return <>{parts}</>;
  }, []);

  // Parse markdown tables into styled HTML tables
  const renderTable = (tableText: string, key: number): React.ReactNode => {
    const lines = tableText.trim().split('\n').filter(l => l.trim());
    if (lines.length < 2) return null;

    const parseRow = (line: string) => line.split('|').map(c => c.trim()).filter(c => c !== '');
    const headers = parseRow(lines[0]);
    // Skip separator line (line[1] with dashes)
    const rows = lines.slice(2).map(parseRow);

    return (
      <table key={`tbl-${key}`} style={{ width: '100%', borderCollapse: 'collapse', margin: '8px 0', fontSize: 13 }}>
        <thead>
          <tr>
            {headers.map((h, i) => (
              <th key={i} style={{ textAlign: 'left', padding: '6px 12px', borderBottom: '1px solid rgba(168,85,247,0.2)', color: '#a855f7', fontWeight: 500, fontSize: 12 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri}>
              {row.map((cell, ci) => (
                <td key={ci} style={{ padding: '5px 12px', borderBottom: '1px solid rgba(168,85,247,0.06)', color: '#cdd6f4', fontSize: 12, fontWeight: 300 }}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    );
  };

  // Check if text contains a markdown table and split around it
  const renderTextWithTables = (text: string, baseKey: number): React.ReactNode[] => {
    const tableRegex = /(\|[^\n]+\|\n\|[-| :]+\|\n(?:\|[^\n]+\|\n?)+)/g;
    const parts: React.ReactNode[] = [];
    let lastIdx = 0;
    let match;
    let key = baseKey;

    while ((match = tableRegex.exec(text)) !== null) {
      if (match.index > lastIdx) {
        parts.push(<span key={key++}>{renderInlineMarkdown(text.slice(lastIdx, match.index))}</span>);
      }
      parts.push(renderTable(match[1], key++));
      lastIdx = match.index + match[0].length;
    }
    if (lastIdx < text.length) {
      parts.push(<span key={key++}>{renderInlineMarkdown(text.slice(lastIdx))}</span>);
    }
    return parts;
  };

  // Inline formatting: bold, italic, inline code
  const renderInlineFormatting = (text: string): React.ReactNode[] => {
    const nodes: React.ReactNode[] = [];
    const inlineRegex = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g;
    let lastIdx = 0;
    let m;
    let key = 0;
    while ((m = inlineRegex.exec(text)) !== null) {
      if (m.index > lastIdx) nodes.push(text.slice(lastIdx, m.index));
      const matched = m[0];
      if (matched.startsWith('`') && matched.endsWith('`')) {
        nodes.push(<code key={`ic-${key++}`} style={{ background: 'rgba(49, 34, 68, 0.5)', padding: '1px 6px', borderRadius: 4, fontSize: '0.9em', fontFamily: "'JetBrains Mono', monospace", color: '#f5c2e7' }}>{matched.slice(1, -1)}</code>);
      } else if (matched.startsWith('**') && matched.endsWith('**')) {
        nodes.push(<strong key={`b-${key++}`} style={{ color: '#cdd6f4', fontWeight: 600 }}>{matched.slice(2, -2)}</strong>);
      } else if (matched.startsWith('*') && matched.endsWith('*')) {
        nodes.push(<em key={`i-${key++}`} style={{ color: '#cdd6f4' }}>{matched.slice(1, -1)}</em>);
      }
      lastIdx = m.index + matched.length;
    }
    if (lastIdx < text.length) nodes.push(text.slice(lastIdx));
    return nodes;
  };

  // Block-level markdown: headings, lists, hr, paragraphs
  const renderInlineMarkdown = (text: string): React.ReactNode[] => {
    const lines = text.split('\n');
    const nodes: React.ReactNode[] = [];
    let key = 0;
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];

      // Horizontal rule
      if (/^---+$/.test(line.trim())) {
        nodes.push(<hr key={`hr-${key++}`} style={{ border: 'none', borderTop: '1px solid rgba(168,85,247,0.15)', margin: '12px 0' }} />);
        i++;
        continue;
      }

      // Headings
      if (line.startsWith('#### ')) {
        nodes.push(<div key={`h4-${key++}`} style={{ fontSize: 13, fontWeight: 600, color: '#cdd6f4', margin: '10px 0 4px' }}>{renderInlineFormatting(line.slice(5))}</div>);
        i++; continue;
      }
      if (line.startsWith('### ')) {
        nodes.push(<div key={`h3-${key++}`} style={{ fontSize: 14, fontWeight: 600, color: '#cdd6f4', margin: '14px 0 6px' }}>{renderInlineFormatting(line.slice(4))}</div>);
        i++; continue;
      }
      if (line.startsWith('## ')) {
        nodes.push(<div key={`h2-${key++}`} style={{ fontSize: 16, fontWeight: 600, color: '#e0b0ff', margin: '16px 0 8px' }}>{renderInlineFormatting(line.slice(3))}</div>);
        i++; continue;
      }
      if (line.startsWith('# ')) {
        nodes.push(<div key={`h1-${key++}`} style={{ fontSize: 18, fontWeight: 700, color: '#e0b0ff', margin: '18px 0 8px' }}>{renderInlineFormatting(line.slice(2))}</div>);
        i++; continue;
      }

      // Bullet list (- or * prefix)
      if (/^\s*[-*]\s/.test(line)) {
        const items: React.ReactNode[] = [];
        while (i < lines.length && /^\s*[-*]\s/.test(lines[i])) {
          const indent = lines[i].match(/^(\s*)/)?.[1].length || 0;
          const content = lines[i].replace(/^\s*[-*]\s+/, '');
          items.push(
            <div key={`li-${key++}`} style={{ display: 'flex', gap: 6, paddingLeft: indent > 1 ? 16 : 0, margin: '2px 0' }}>
              <span style={{ color: '#a855f7', flexShrink: 0 }}>{'\u2022'}</span>
              <span>{renderInlineFormatting(content)}</span>
            </div>
          );
          i++;
        }
        nodes.push(<div key={`ul-${key++}`} style={{ margin: '4px 0' }}>{items}</div>);
        continue;
      }

      // Numbered list
      if (/^\s*\d+\.\s/.test(line)) {
        const items: React.ReactNode[] = [];
        while (i < lines.length && /^\s*\d+\.\s/.test(lines[i])) {
          const num = lines[i].match(/^\s*(\d+)\./)?.[1] || '1';
          const content = lines[i].replace(/^\s*\d+\.\s+/, '');
          items.push(
            <div key={`oli-${key++}`} style={{ display: 'flex', gap: 6, margin: '2px 0' }}>
              <span style={{ color: '#a855f7', flexShrink: 0, fontWeight: 500, minWidth: 16 }}>{num}.</span>
              <span>{renderInlineFormatting(content)}</span>
            </div>
          );
          i++;
        }
        nodes.push(<div key={`ol-${key++}`} style={{ margin: '4px 0' }}>{items}</div>);
        continue;
      }

      // Empty line = paragraph break
      if (line.trim() === '') {
        nodes.push(<div key={`br-${key++}`} style={{ height: 6 }} />);
        i++; continue;
      }

      // Regular text
      nodes.push(<div key={`p-${key++}`} style={{ margin: '2px 0' }}>{renderInlineFormatting(line)}</div>);
      i++;
    }
    return nodes;
  };

  // ── Send message (local sidecar) ─────────────────────────────────────────
  const sendLocal = useCallback(async (text: string, attachments?: { name: string; dataUri: string; mimeType: string }[]) => {
    const sidecar = getSidecar();
    if (!sidecar.isReady) {
      setMessages((prev) => [...prev, {
        id: mkId(), role: 'error' as const,
        text: t('dash.chat.local_not_ready'),
        timestamp: Date.now(),
      }]);
      return;
    }

    setStreaming(true);

    // Create Ava response placeholder
    const avaMsg: ChatMessage = { id: mkId(), role: 'ava', text: '', timestamp: Date.now(), toolCalls: [] };
    setMessages((prev) => [...prev, avaMsg]);

    try {
      // Send full chat history so the sidecar sees the entire conversation
      const history = messages
        .filter(m => m.role === 'user' || m.role === 'ava')
        .map(m => ({ role: m.role === 'ava' ? 'assistant' : 'user', text: m.text }));
      await sidecar.sendMessage(text, attachments, history);
    } catch (err: any) {
      setMessages((prev) => [...prev, {
        id: mkId(), role: 'error' as const,
        text: t('dash.chat.sidecar_error').replace('{msg}', err.message || t('dash.chat.unknown_error')),
        timestamp: Date.now(),
      }]);
      setStreaming(false);
    }
  }, []);

  /* ── Cloud SSE fallback — disabled, all messages go through sidecar ──
  const _sendCloud_disabled = useCallback(async (_text: string, allMessages: ChatMessage[]) => {
    if (!connected) {
      setMessages((prev) => [...prev, {
        id: mkId(), role: 'error' as const,
        text: t('dash.chat.not_connected'),
        timestamp: Date.now(),
      }]);
      return;
    }

    setStreaming(true);
    const controller = new AbortController();
    abortRef.current = controller;

    const modeInfo = MODES.find((m) => m.id === mode)!;

    // Build API messages, applying mode prefix
    const apiMessages = allMessages.map((m) => ({
      role: m.role === 'user' ? 'user' : m.role === 'ava' ? 'assistant' : 'user',
      content: m.text,
    }));
    if (modeInfo.prefix && apiMessages.length > 0) {
      const last = apiMessages[apiMessages.length - 1];
      apiMessages[apiMessages.length - 1] = { ...last, content: modeInfo.prefix + last.content };
    }

    const avaMsg: ChatMessage = { id: mkId(), role: 'ava', text: '', timestamp: Date.now(), toolCalls: [] };
    setMessages((prev) => [...prev, avaMsg]);

    try {
      const key = getPlatformKey();
      const response = await fetch(apiStreamUrl('/chat'), {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json', 'X-Ava-Platform': 'ide', 'X-Ava-Device': localStorage.getItem('ava-ide-device-id') || '' },
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

      const contentType = response.headers.get('content-type') || '';

      // ── JSON response (non-streaming) ────────────────────────────────
      if (contentType.includes('application/json')) {
        const json = await response.json();
        const text = json.choices?.[0]?.message?.content
          || json.choices?.[0]?.delta?.content
          || json.content
          || json.text
          || json.response
          || (typeof json === 'string' ? json : '');

        if (json.error) {
          setMessages((prev) => {
            const copy = [...prev];
            const last = copy[copy.length - 1];
            if (last && last.role === 'ava') {
              copy[copy.length - 1] = { ...last, text: `Error: ${json.error.message || json.error}`, role: 'error' };
            }
            return copy;
          });
        } else if (text) {
          setMessages((prev) => {
            const copy = [...prev];
            const last = copy[copy.length - 1];
            if (last && last.role === 'ava') {
              copy[copy.length - 1] = { ...last, text };
            }
            return copy;
          });
        }

        if (json.usage) {
          const total = json.usage.total_tokens || (json.usage.prompt_tokens || 0) + (json.usage.completion_tokens || 0);
          setTokenCount((prev) => prev + total);
          trackTokenUsage(json.usage, model);
        }
        trackMessage(model);
      }
      // ── SSE streaming response ───────────────────────────────────────
      else {
        const reader = response.body?.getReader();
        if (!reader) {
          setMessages((prev) => {
            const copy = [...prev];
            const last = copy[copy.length - 1];
            if (last && last.role === 'ava') {
              copy[copy.length - 1] = { ...last, text: t('dash.chat.no_stream'), role: 'error' };
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

                if (json.usage) {
                  sessionTokens += json.usage.total_tokens || json.usage.completion_tokens || 0;
                  setTokenCount(sessionTokens);
                  trackTokenUsage(json.usage, model);
                  if (json.usage.prompt_tokens && json.usage.completion_tokens) {
                    const total = json.usage.prompt_tokens + json.usage.completion_tokens;
                    // Use model's actual context window for percentage
                    const MODEL_CTX: Record<string, number> = {
                      'qwen3.6-plus': 1048576, 'kimi-k2.5': 262144, 'MiniMax-M2.7': 204800, 'MiniMax-M2.5': 1048576,
                      'qwen3-omni-flash': 262144, 'qwen3.5-omni-plus': 262144, 'qwen3.5-plus': 1048576,
                      'qwen-flash': 262144, 'deepseek-chat': 131072, 'deepseek-reasoner': 131072,
                    };
                    const ctxWindow = MODEL_CTX[model] || 131072;
                    setContextPercent(Math.min(100, Math.round((total / ctxWindow) * 100)));
                  }
                }

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
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        setMessages((prev) => {
          const copy = [...prev];
          const last = copy[copy.length - 1];
          if (last && last.role === 'ava' && !last.text) {
            copy[copy.length - 1] = { ...last, text: t('dash.chat.cancelled'), role: 'system' };
          }
          return copy;
        });
      } else {
        setMessages((prev) => [...prev, {
          id: mkId(), role: 'error' as const,
          text: t('dash.chat.connection_error').replace('{msg}', err.message || t('dash.chat.unknown_error')),
          timestamp: Date.now(),
        }]);
      }
    }

    setStreaming(false);
    abortRef.current = null;
    textareaRef.current?.focus();
  }, [mode, model, connected]); */

  // ── Send dispatcher ──────────────────────────────────────────────────────
  const send = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed && pendingAttachments.length === 0) return;
    setInput('');
    if (textareaRef.current) { textareaRef.current.style.height = 'auto'; }

    // Inject secrets — replace @secret:Label with actual values before sending
    const { text: injectedText, usedSecrets } = injectSecrets(trimmed);

    // Show the raw user text (with @secret:Label visible as masked) in the chat UI
    // Replace @secret:Label with masked dots for display
    const displayText = trimmed.replace(/@secret:(\S+)/g, (_m, label) => {
      const s = secrets.find(sec => sec.label === label);
      return s ? '\u2022\u2022\u2022\u2022\u2022\u2022' : _m;
    });

    const userMsg: ChatMessage = {
      id: mkId(), role: 'user', text: displayText || t('dash.chat.image_attached'), timestamp: Date.now(),
      attachments: pendingAttachments.length > 0 ? [...pendingAttachments] : undefined,
    };

    // Track this message as having used secrets
    if (usedSecrets) {
      secretMsgIds.current.add(userMsg.id);
    }

    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setPendingAttachments([]);

    trackMessage(model);

    // Always use sidecar — both Local and Cloud modes run the full agent
    // Send the injected text (with real secret values) to the sidecar
    sendLocal(injectedText, userMsg.attachments);
  }, [input, messages, sendLocal, pendingAttachments, model, injectSecrets, secrets]);

  // ── Tool confirmation handlers ─────────────────────────────────────────
  const approveConfirm = useCallback(async () => {
    if (!pendingConfirm) return;
    const sidecar = getSidecar();
    const isAskUser = pendingConfirm.toolName === 'ask_user' || pendingConfirm.toolName === 'present_plan';
    if (isAskUser && confirmInput.trim()) {
      await sidecar.confirm(pendingConfirm.id, true, confirmInput.trim());
    } else {
      await sidecar.confirm(pendingConfirm.id, true);
    }
    setPendingConfirm(null);
    setConfirmInput('');
  }, [pendingConfirm, confirmInput]);

  const denyConfirm = useCallback(async () => {
    if (!pendingConfirm) return;
    const sidecar = getSidecar();
    await sidecar.confirm(pendingConfirm.id, false);
    setPendingConfirm(null);
    setConfirmInput('');
  }, [pendingConfirm]);

  // Always Allow — approve this category for the session (no longer switches to autonomous permanently)
  const approveAlwaysCategory = useCallback(async () => {
    if (!pendingConfirm) return;
    const sidecar = getSidecar();
    await sidecar.confirm(pendingConfirm.id, true, undefined, true);
    setPendingConfirm(null);
    setConfirmInput('');
  }, [pendingConfirm]);

  // ── Active mode info ──────────────────────────────────────────────────────
  const currentMode = MODES.find((m) => m.id === mode) || MODES[0];
  const activeModelName = useMemo(() => {
    if (model === 'auto') return '✦ Auto';
    if (model === 'qwen3.6-plus') return 'Qwen 3.6 Plus';
    if (model === 'qwen3-omni-flash') return 'Qwen Omni Flash';
    if (model === 'qwen3.5-omni-plus') return 'Qwen 3.5 Omni Plus';
    if (model === 'qwen-flash') return 'Qwen Flash';
    if (model === 'qwen3.5-plus') return 'Qwen 3.5 Plus';
    if (model === 'MiniMax-M2.7') return 'MiniMax M2.7';
    if (model === 'MiniMax-M2.5') return 'MiniMax M2.5';
    if (model === 'MiniMax-M2') return 'MiniMax M2';
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
    <div style={{ ...pageWrapper, padding: 0, display: 'flex', flexDirection: 'row', height: '100%', overflow: 'hidden' }}>
    {/* ── Main chat column ─────────────────────────────────────────────── */}
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', minWidth: 0 }}>
      <style>{keyframesStyle}</style>

      {/* ── Header Bar (48px) ───────────────────────────────────────────── */}
      <div style={{
        height: 48, minHeight: 48, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 16px', borderBottom: '1px solid rgba(168, 85, 247, 0.12)', background: 'rgba(26, 16, 40, 0.6)', flexShrink: 0,
      }}>
        {/* Left: Model selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div ref={modelMenuRef} style={{ position: 'relative' }}>
            <button
              onClick={() => setModelMenuOpen(!modelMenuOpen)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px',
                background: 'rgba(49, 34, 68, 0.5)', border: '1px solid rgba(168,85,247,0.2)', borderRadius: 8,
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
                background: 'rgba(26, 16, 40, 0.95)', border: '1px solid rgba(168, 85, 247, 0.12)', borderRadius: 10,
                padding: 6, minWidth: 240, boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
              }}>
                {/* Platform models header */}
                <div style={{ fontSize: 10, fontWeight: 600, color: '#6c7086', padding: '6px 10px 4px', textTransform: 'uppercase', letterSpacing: 0.8 }}>
                  Auto
                </div>
                <button
                  onClick={() => { setModel('auto'); setModelMenuOpen(false); }}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%',
                    padding: '8px 10px', background: model === 'auto' ? 'rgba(168,85,247,0.15)' : 'transparent',
                    border: 'none', borderRadius: 6, color: model === 'auto' ? '#e0b0ff' : '#cdd6f4',
                    fontSize: 12, cursor: 'pointer', textAlign: 'left',
                  }}
                  onMouseEnter={(e) => { if (model !== 'auto') e.currentTarget.style.background = 'rgba(168,85,247,0.08)'; }}
                  onMouseLeave={(e) => { if (model !== 'auto') e.currentTarget.style.background = 'transparent'; }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {model === 'auto' && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#a855f7' }} />}
                    ✦ Auto
                  </span>
                  <span style={{ fontSize: 10, color: '#a855f7' }}>Best model per task</span>
                </button>
                <div style={{ height: 1, background: 'rgba(49, 34, 68, 0.5)', margin: '6px 0' }} />
                {/* Qwen family */}
                <div style={{ fontSize: 9, fontWeight: 600, color: '#6c7086', padding: '8px 10px 4px', textTransform: 'uppercase', letterSpacing: 0.8 }}>Qwen</div>
                {[
                  { id: 'qwen3.6-plus', name: 'Qwen 3.6 Plus', tag: 'New' },
                  { id: 'qwen3.5-omni-plus', name: 'Qwen 3.5 Plus', tag: '' },
                  { id: 'qwen3-omni-flash', name: 'Qwen Omni Flash', tag: '' },
                  { id: 'qwen-flash', name: 'Qwen Flash', tag: '' },
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

                {/* MiniMax family */}
                <div style={{ fontSize: 9, fontWeight: 600, color: '#6c7086', padding: '8px 10px 4px', textTransform: 'uppercase', letterSpacing: 0.8 }}>MiniMax</div>
                {[
                  { id: 'MiniMax-M2.7', name: 'MiniMax M2.7', tag: '' },
                  { id: 'MiniMax-M2.5', name: 'MiniMax M2.5', tag: '' },
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
                    <div style={{ height: 1, background: 'rgba(49, 34, 68, 0.5)', margin: '6px 0' }} />
                    <div style={{ fontSize: 10, fontWeight: 600, color: '#6c7086', padding: '6px 10px 4px', textTransform: 'uppercase', letterSpacing: 0.8 }}>
                      {t('dash.chat.your_api_keys')}
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

          {/* Knowledge packs dropdown */}
          <div ref={packsMenuRef} style={{ position: 'relative' }}>
            <button
              onClick={() => setPacksMenuOpen(!packsMenuOpen)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px',
                background: enabledPacks.size > 0 ? 'rgba(168,85,247,0.1)' : 'rgba(49, 34, 68, 0.3)',
                border: `1px solid ${enabledPacks.size > 0 ? 'rgba(168,85,247,0.3)' : 'rgba(168,85,247,0.1)'}`,
                borderRadius: 8, color: enabledPacks.size > 0 ? '#a855f7' : '#6c7086',
                fontSize: 11, fontWeight: 600, cursor: 'pointer',
              }}
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                <path d="M14.5 2H9l-.35-.15-.65-.64-.65.64L7 2H1.5l-.5.5v10l.5.5h13l.5-.5v-10l-.5-.5zM7 3H2v9h5V3zm7 9H9V3h5v9z"/>
              </svg>
              {enabledPacks.size > 0 ? `${enabledPacks.size} pack${enabledPacks.size > 1 ? 's' : ''}` : 'Packs'}
              <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                style={{ transform: packsMenuOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', opacity: 0.5 }}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
              </svg>
            </button>

            {packsMenuOpen && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, marginTop: 4, zIndex: 999,
                background: 'rgba(26, 16, 40, 0.95)', border: '1px solid rgba(168, 85, 247, 0.12)', borderRadius: 10,
                padding: 6, minWidth: 240, boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
              }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: '#6c7086', padding: '6px 10px 4px', textTransform: 'uppercase', letterSpacing: 0.8 }}>
                  Knowledge Packs
                </div>
                {IDE_KNOWLEDGE_PACKS.map(pack => {
                  const enabled = enabledPacks.has(pack.id);
                  return (
                    <button
                      key={pack.id}
                      onClick={() => togglePack(pack.id)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '8px 10px',
                        background: 'transparent', border: 'none', borderRadius: 6, cursor: 'pointer', textAlign: 'left',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(168,85,247,0.08)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                    >
                      <span style={{ fontSize: 14 }}>{pack.icon}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 500, color: enabled ? '#cdd6f4' : '#6c7086' }}>{pack.name}</div>
                        <div style={{ fontSize: 10, color: '#6c7086', opacity: 0.6 }}>{pack.desc}</div>
                      </div>
                      <div style={{
                        width: 32, height: 16, borderRadius: 8, position: 'relative', transition: 'all 0.2s',
                        background: enabled ? '#a855f7' : 'rgba(108,112,134,0.3)',
                      }}>
                        <div style={{
                          position: 'absolute', top: 2, width: 12, height: 12, borderRadius: 6, background: '#fff',
                          transition: 'all 0.2s', left: enabled ? 16 : 2,
                        }} />
                      </div>
                    </button>
                  );
                })}
                <div style={{ fontSize: 10, color: '#6c7086', opacity: 0.4, padding: '6px 10px 4px', borderTop: '1px solid rgba(168,85,247,0.08)', marginTop: 2 }}>
                  Game projects auto-detect. Others enable here.
                </div>
              </div>
            )}
          </div>

          {/* Conversation title */}
          <span style={{ fontSize: 12, color: '#6c7086', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {conversationTitle}
          </span>
        </div>

        {/* Right: backend toggle + tokens + new chat */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* Local/Cloud toggle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button
              onClick={() => {
                if (!connected) return; // Can't switch to Cloud without an account
                setChatBackend(chatBackend === 'local' ? 'cloud' : 'local');
              }}
              style={{
                display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px',
                background: chatBackend === 'local' ? 'rgba(166,227,161,0.1)' : 'rgba(108,112,134,0.1)',
                border: `1px solid ${chatBackend === 'local' ? 'rgba(166,227,161,0.3)' : 'rgba(108,112,134,0.2)'}`,
                borderRadius: 6, fontSize: 10, fontWeight: 600,
                cursor: connected ? 'pointer' : 'not-allowed',
                color: chatBackend === 'local' ? '#a6e3a1' : '#6c7086',
                opacity: connected ? 1 : 0.5,
              }}
              title={!connected
                ? t('dash.chat.connect_for_cloud')
                : chatBackend === 'local'
                  ? t('dash.chat.local_mode_desc')
                  : t('dash.chat.cloud_mode_desc')}
            >
              <span style={{
                width: 6, height: 6, borderRadius: '50%',
                background: chatBackend === 'local'
                  ? (sidecarStatus === 'ready' ? '#a6e3a1' : sidecarStatus === 'starting' ? '#eab308' : '#ef4444')
                  : (connected ? '#a6e3a1' : '#6c7086'),
                ...(sidecarStatus === 'starting' ? { animation: 'avaPulse 1.5s infinite' } : {}),
              }} />
              {chatBackend === 'local' ? t('dash.chat.local') : t('dash.chat.cloud')}
            </button>
          </div>

          {/* Token display — platform balance or session count */}
          {platformBalance && connected ? (() => {
            const isAdmin = platformBalance.limit >= 999_999_999;
            if (isAdmin) return <span style={{ fontSize: 11, color: '#6c7086', fontFamily: 'monospace', opacity: 0.5 }} title="Unlimited tokens">∞ tokens</span>;
            const remaining = Math.max(0, platformBalance.limit - platformBalance.used);
            const pct = platformBalance.limit > 0 ? (platformBalance.used / platformBalance.limit) * 100 : 0;
            const color = pct >= 95 ? '#ef4444' : pct >= 80 ? '#eab308' : '#a6e3a1';
            return (
              <span style={{ fontSize: 11, fontFamily: 'monospace', fontWeight: 600, color }} title={`${remaining.toLocaleString()} of ${platformBalance.limit.toLocaleString()} tokens remaining (${Math.round(pct)}% used)`}>
                {fmtTokens(remaining)} left
              </span>
            );
          })() : (
            <span style={{ fontSize: 11, color: '#6c7086', fontFamily: 'monospace' }} title={`${tokenCount.toLocaleString()} tokens used this session`}>
              {tokenCount > 0 ? fmtTokens(tokenCount) + ' tokens' : '0 tokens'}
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
              <div style={{ position: 'relative', width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center' }} title={t('dash.chat.context').replace('{n}', String(contextPercent))}>
                <svg width="22" height="22" viewBox="0 0 22 22" style={{ transform: 'rotate(-90deg)' }}>
                  <circle cx="11" cy="11" r={r} fill="none" stroke="rgba(168, 85, 247, 0.12)" strokeWidth="2.5" />
                  <circle cx="11" cy="11" r={r} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round"
                    strokeDasharray={circumference} strokeDashoffset={dashOffset} style={{ transition: 'stroke-dashoffset 0.5s ease' }} />
                </svg>
                <span style={{ position: 'absolute', fontSize: 7, fontWeight: 700, color, fontFamily: 'monospace' }}>{contextPercent}</span>
              </div>
            );
          })()}

          {/* Tasks toggle */}
          <button
            onClick={() => setTasksPanelOpen(!tasksPanelOpen)}
            style={{
              display: 'flex', alignItems: 'center', gap: 5, padding: '6px 10px',
              background: tasksPanelOpen ? 'rgba(168,85,247,0.2)' : 'rgba(168,85,247,0.05)',
              border: `1px solid ${tasksPanelOpen ? 'rgba(168,85,247,0.4)' : 'rgba(168,85,247,0.15)'}`,
              borderRadius: 8, color: tasksPanelOpen ? '#a855f7' : '#6c7086',
              fontSize: 11, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s',
            }}
            title={t('dash.chat.toggle_tasks')}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <path d="M3.75 4.5a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5ZM6 3.5h8v1H6v-1Zm-2.25 5a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5ZM6 7.5h8v1H6v-1Zm-2.25 5a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5ZM6 11.5h8v1H6v-1Z"/>
            </svg>
            {t('dash.nav.tasks')}
            {sessionTasks.length > 0 && (
              <span style={{
                fontSize: 9, padding: '1px 5px', borderRadius: 8,
                background: 'rgba(168,85,247,0.25)', color: '#a855f7',
              }}>{sessionTasks.length}</span>
            )}
          </button>

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
            title={t('dash.chat.new_chat')}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            {t('dash.chat.new_chat')}
          </button>
        </div>
      </div>

      {/* ── Token usage bar ────────────────────────────────────────────── */}
      {platformBalance && connected && platformBalance.limit > 0 && platformBalance.limit < 999_999_999 && (() => {
        const remaining = Math.max(0, platformBalance.limit - platformBalance.used);
        const pct = Math.max(0, Math.min(100, (remaining / platformBalance.limit) * 100));
        const color = pct <= 5 ? '#ef4444' : pct <= 20 ? '#eab308' : '#a855f7';
        return (
          <div style={{ padding: '0 16px 6px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ flex: 1, height: 4, borderRadius: 4, overflow: 'hidden', background: 'rgba(168,85,247,0.08)' }}>
                <div style={{ width: `${pct}%`, height: '100%', borderRadius: 4, background: color, transition: 'width 0.5s' }} />
              </div>
              <span style={{ fontSize: 9, fontFamily: 'monospace', color, opacity: pct <= 20 ? 0.9 : 0.4, flexShrink: 0 }}>
                {fmtTokens(remaining)} left
              </span>
            </div>
          </div>
        );
      })()}

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
                  fontSize: 11, color: '#6c7086', background: 'rgba(26, 16, 40, 0.6)', border: '1px solid rgba(168, 85, 247, 0.12)',
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
              {/* Ava / User avatar */}
              {(isAva || isError) && (
                <div style={{
                  width: 32, height: 32, borderRadius: '50%', flexShrink: 0, marginRight: 10, marginTop: 4,
                  background: isError ? 'linear-gradient(135deg, #ef4444, #dc2626)' : (chatAiAvatar ? 'transparent' : 'linear-gradient(135deg, #a855f7, #6366f1)'),
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  overflow: 'hidden',
                }}>
                  {isError ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                  ) : chatAiAvatar ? (
                    <img src={chatAiAvatar} alt={t('dash.chat.ava')} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                    </svg>
                  )}
                </div>
              )}
              {isUser && (
                <div style={{
                  width: 32, height: 32, borderRadius: '50%', flexShrink: 0, marginLeft: 10, marginTop: 4,
                  background: chatUserAvatar ? 'transparent' : 'linear-gradient(135deg, #b4befe, #89b4fa)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  overflow: 'hidden', order: 1,
                }}>
                  {chatUserAvatar ? (
                    <img src={chatUserAvatar} alt={t('dash.chat.you')} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" />
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
                    {isUser ? t('dash.chat.you') : isError ? t('dash.chat.error') : t('dash.chat.ava')}
                  </span>
                  <span style={{ fontSize: 10, color: '#45475a' }}>{fmtTime(msg.timestamp)}</span>
                  {/* Secret lock indicator */}
                  {secretMsgIds.current.has(msg.id) && (
                    <span style={{ fontSize: 11, lineHeight: 1 }} title={t('dash.chat.secret_used')}>{'\uD83D\uDD12'}</span>
                  )}
                </div>

                {/* Message bubble */}
                <div style={{
                  padding: '10px 16px',
                  borderRadius: isUser ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                  background: isUser ? '#7c3aed' : isError ? 'rgba(239,68,68,0.1)' : '#181825',
                  color: isError ? '#fca5a5' : '#cdd6f4',
                  fontSize: 14, lineHeight: 1.65,
                  border: isUser ? 'none' : isError ? '1px solid rgba(239,68,68,0.25)' : '1px solid rgba(168, 85, 247, 0.12)',
                  position: 'relative',
                }}>
                  {/* Rendered text with markdown + inline secret reveal */}
                  <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                    {(() => {
                      const MASK = '\u2022\u2022\u2022\u2022\u2022\u2022';
                      const hasMask = msg.text.includes(MASK);
                      if (!hasMask) {
                        return isAva || isError ? renderMarkdown(msg.text) : msg.text;
                      }
                      // Split text on mask sequences and render with inline eye toggles
                      const parts = msg.text.split(MASK);
                      const reveals = inlineReveals[msg.id] || new Set<number>();
                      // Find original secret values for this message
                      const matchedSecretValues = secrets.map(s => s.value);
                      let maskIdx = 0;
                      const nodes: React.ReactNode[] = [];
                      for (let i = 0; i < parts.length; i++) {
                        if (i > 0) {
                          const currentMaskIdx = maskIdx++;
                          const isRevealed = reveals.has(currentMaskIdx);
                          const secretVal = matchedSecretValues[currentMaskIdx % matchedSecretValues.length] || MASK;
                          nodes.push(
                            <span key={`mask-${currentMaskIdx}`} style={{ position: 'relative', display: 'inline' }}>
                              <span style={{
                                background: 'rgba(168,85,247,0.15)', borderRadius: 4, padding: '1px 4px',
                                fontFamily: 'monospace', fontSize: 12, color: isRevealed ? '#f9e2af' : '#6c7086',
                              }}>
                                {isRevealed ? secretVal : MASK}
                              </span>
                              <button
                                onClick={() => {
                                  setInlineReveals(prev => {
                                    const s = new Set(prev[msg.id] || []);
                                    if (s.has(currentMaskIdx)) s.delete(currentMaskIdx); else s.add(currentMaskIdx);
                                    return { ...prev, [msg.id]: s };
                                  });
                                }}
                                style={{
                                  background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px',
                                  verticalAlign: 'middle', lineHeight: 1, color: '#6c7086', fontSize: 10,
                                }}
                                title={isRevealed ? 'Hide secret' : 'Reveal secret'}
                              >
                                {isRevealed ? (
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94" />
                                    <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19" />
                                    <line x1="1" y1="1" x2="23" y2="23" />
                                  </svg>
                                ) : (
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                    <circle cx="12" cy="12" r="3" />
                                  </svg>
                                )}
                              </button>
                            </span>
                          );
                        }
                        if (parts[i]) {
                          nodes.push(isAva || isError ? <span key={`t-${i}`}>{renderMarkdown(parts[i])}</span> : parts[i]);
                        }
                      }
                      return nodes;
                    })()}
                    {/* Blinking cursor while streaming empty message */}
                    {isAva && streaming && !msg.text && msg === messages[messages.length - 1] && (
                      <span style={{ opacity: 0.5 }}>{'\u2588'}</span>
                    )}
                  </div>

                  {/* Tool calls timeline */}
                  {msg.toolCalls && msg.toolCalls.length > 0 && (
                    <div style={{ marginTop: 10, borderTop: '1px solid rgba(168, 85, 247, 0.12)', paddingTop: 8 }}>
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
                            {tc.status === 'running' ? t('dash.chat.tool_running') : tc.status === 'done' ? t('dash.chat.tool_done') : t('dash.chat.tool_error')}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Inline TodoCard for todo_write */}
                  {msg.toolCalls?.filter(tc => tc.name === 'todo_write' && tc.args?.todos).map((tc, idx) => {
                    const todos: any[] = tc.args?.todos || [];
                    const done = todos.filter((t: any) => t.status === 'completed').length;
                    return (
                      <div key={`todo-${idx}`} style={{
                        marginTop: 8, background: 'rgba(10, 6, 18, 0.8)', border: '1px solid rgba(168, 85, 247, 0.12)',
                        borderRadius: 8, padding: '8px 12px', fontSize: 12,
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                          <span style={{ fontWeight: 600, color: '#cba6f7', fontSize: 11 }}>{t('dash.chat.tasks_progress').replace('{done}', String(done)).replace('{total}', String(todos.length))}</span>
                          <div style={{ height: 3, flex: 1, marginLeft: 10, background: 'rgba(49, 34, 68, 0.5)', borderRadius: 2, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${todos.length > 0 ? (done / todos.length) * 100 : 0}%`, background: '#a855f7', borderRadius: 2 }} />
                          </div>
                        </div>
                        {todos.map((t: any, ti: number) => (
                          <div key={ti} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2px 0', fontSize: 11 }}>
                            <span style={{
                              color: t.status === 'completed' ? '#a6e3a1' : t.status === 'in_progress' ? '#a855f7' : '#585b70',
                              fontSize: 10, width: 14, textAlign: 'center',
                            }}>
                              {t.status === 'completed' ? '✓' : t.status === 'in_progress' ? '◉' : '○'}
                            </span>
                            <span style={{
                              color: t.status === 'completed' ? '#6c7086' : '#cdd6f4',
                              textDecoration: t.status === 'completed' ? 'line-through' : 'none',
                            }}>
                              {t.content || t.title || ''}
                            </span>
                          </div>
                        ))}
                      </div>
                    );
                  })}

                  {/* Inline images */}
                  {msg.images && msg.images.length > 0 && (
                    <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {msg.images.map((img, idx) => (
                        <div key={idx} style={{ position: 'relative', borderRadius: 10, overflow: 'hidden', border: '1px solid rgba(168, 85, 247, 0.12)' }}>
                          <img
                            src={img.src}
                            alt={img.alt || t('dash.chat.generated_image')}
                            style={{ maxWidth: '100%', maxHeight: 300, display: 'block', borderRadius: 10 }}
                          />
                          <div style={{
                            position: 'absolute', bottom: 0, left: 0, right: 0,
                            padding: '20px 10px 8px', display: 'flex', gap: 6, justifyContent: 'flex-end',
                            background: 'linear-gradient(transparent, rgba(0,0,0,0.7))',
                          }}>
                            <a
                              href={img.src}
                              download={`ava-image-${idx + 1}.png`}
                              style={{
                                padding: '4px 10px', borderRadius: 6, fontSize: 10, fontWeight: 600,
                                background: 'rgba(168,85,247,0.8)', color: '#fff', textDecoration: 'none',
                                backdropFilter: 'blur(4px)',
                              }}
                            >{t('dash.chat.download')}</a>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Created files */}
                  {msg.files && msg.files.length > 0 && (
                    <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {msg.files.map((file, idx) => (
                        <div key={idx} style={{
                          display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                          background: 'rgba(10, 6, 18, 0.8)', border: '1px solid rgba(168, 85, 247, 0.12)', borderRadius: 8,
                        }}>
                          <span style={{ fontSize: 18 }}>
                            {file.name?.endsWith('.pptx') ? '\uD83D\uDCBB' :
                             file.name?.endsWith('.xlsx') ? '\uD83D\uDCCA' :
                             file.name?.endsWith('.pdf') ? '\uD83D\uDCC4' :
                             file.name?.endsWith('.docx') ? '\uD83D\uDCC4' : '\uD83D\uDCC1'}
                          </span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 12, fontWeight: 500, color: '#cdd6f4' }}>{file.name}</div>
                            {file.path && <div style={{ fontSize: 10, color: '#6c7086', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.path}</div>}
                          </div>
                          {file.url && (
                            <a href={file.url} target="_blank" rel="noopener noreferrer" style={{
                              padding: '4px 10px', borderRadius: 6, fontSize: 10, fontWeight: 600,
                              background: 'rgba(168,85,247,0.15)', color: '#a855f7', border: '1px solid rgba(168,85,247,0.25)',
                              textDecoration: 'none',
                            }}>{t('dash.chat.open')}</a>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* User attachments (pasted/dropped images) */}
                  {msg.attachments && msg.attachments.length > 0 && (
                    <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {msg.attachments.map((att, idx) => (
                        att.mimeType.startsWith('image/') ? (
                          <img key={idx} src={att.dataUri} alt={att.name} style={{
                            maxWidth: 200, maxHeight: 150, borderRadius: 8, border: '1px solid rgba(168, 85, 247, 0.12)',
                          }} />
                        ) : (
                          <div key={idx} style={{
                            display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px',
                            background: 'rgba(10, 6, 18, 0.8)', border: '1px solid rgba(168, 85, 247, 0.12)', borderRadius: 8,
                            fontSize: 11, color: '#6c7086',
                          }}>
                            {'\uD83D\uDCCE'} {att.name}
                          </div>
                        )
                      ))}
                    </div>
                  )}

                  {/* Copy button on hover for Ava messages */}
                  {isAva && msg.text && hoveredMsg === msg.id && (
                    <button
                      onClick={() => copyMessage(msg.id, msg.text)}
                      style={{
                        position: 'absolute', top: 6, right: 6, padding: '4px 8px',
                        background: 'rgba(49, 34, 68, 0.5)', border: '1px solid #45475a', borderRadius: 6,
                        color: copiedMsg === msg.id ? '#a6e3a1' : '#6c7086', fontSize: 10,
                        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                      }}
                      title={t('dash.chat.copy')}
                    >
                      {copiedMsg === msg.id ? (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                      ) : (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                        </svg>
                      )}
                      {copiedMsg === msg.id ? t('dash.chat.copied') : t('dash.chat.copy')}
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
            <span style={{ fontSize: 11, color: '#a6adc8', transition: 'opacity 0.3s' }}>{statusText || t('thinking.0')}</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* ── Tool Confirmation — inline banner above input ──────────────── */}
      {pendingConfirm && (
        <div style={{
          margin: '0 16px', padding: '12px 16px',
          background: 'rgba(26, 16, 40, 0.6)', border: '1px solid rgba(168,85,247,0.3)', borderRadius: 10,
          borderBottom: 'none', borderBottomLeftRadius: 0, borderBottomRightRadius: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#eab308', animation: 'avaPulse 1.5s infinite' }} />
              <span style={{ fontSize: 12, color: '#cdd6f4' }}>
                {t('dash.chat.ava_wants_to_run')} <span style={{ color: '#f5c2e7', fontFamily: 'monospace', fontWeight: 600 }}>{pendingConfirm.toolName}</span>
              </span>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                onClick={denyConfirm}
                style={{
                  padding: '4px 12px', background: 'transparent', border: '1px solid #45475a',
                  borderRadius: 6, color: '#6c7086', fontSize: 11, fontWeight: 500, cursor: 'pointer',
                }}
              >
                {t('tool.deny')}
              </button>
              <button
                onClick={approveConfirm}
                style={{
                  padding: '4px 12px', background: '#a855f7',
                  border: 'none', borderRadius: 6, color: '#fff', fontSize: 11,
                  fontWeight: 600, cursor: 'pointer',
                }}
              >
                {t('plan.approve')}
              </button>
              <button
                onClick={approveAlwaysCategory}
                style={{
                  padding: '4px 12px', background: 'transparent', border: '1px solid #a855f7',
                  borderRadius: 6, color: '#a855f7', fontSize: 11, fontWeight: 500, cursor: 'pointer',
                }}
                title="Auto-approve this tool category for the rest of the session"
              >
                Always Allow
              </button>
            </div>
          </div>

          {/* Collapsible args preview */}
          <details style={{ marginBottom: (pendingConfirm.toolName === 'ask_user' || pendingConfirm.toolName === 'present_plan') ? 8 : 0 }}>
            <summary style={{ fontSize: 10, color: '#585b70', cursor: 'pointer', userSelect: 'none' }}>{t('dash.chat.view_arguments')}</summary>
            <pre style={{
              fontSize: 10, color: '#6c7086', fontFamily: 'monospace',
              whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: '6px 0 0',
              maxHeight: 120, overflowY: 'auto', background: 'rgba(10, 6, 18, 0.8)',
              padding: '8px 10px', borderRadius: 6,
            }}>
              {JSON.stringify(pendingConfirm.args, null, 2)}
            </pre>
          </details>

          {/* Input for ask_user / present_plan */}
          {(pendingConfirm.toolName === 'ask_user' || pendingConfirm.toolName === 'present_plan') && (
            <input
              type="text"
              value={confirmInput}
              onChange={(e) => setConfirmInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') approveConfirm(); }}
              placeholder={pendingConfirm.toolName === 'ask_user' ? t('dash.chat.type_your_answer') : t('dash.chat.comment_optional')}
              autoFocus
              style={{
                width: '100%', padding: '6px 10px', background: 'rgba(10, 6, 18, 0.8)',
                border: '1px solid rgba(168, 85, 247, 0.12)', borderRadius: 6, color: '#cdd6f4',
                fontSize: 12, outline: 'none',
              }}
            />
          )}
        </div>
      )}

      {/* ── Input Bar (fixed at bottom) ─────────────────────────────────── */}
      <div style={{
        padding: '12px 24px 16px', borderTop: '1px solid rgba(168, 85, 247, 0.12)',
        background: 'rgba(26, 16, 40, 0.6)', flexShrink: 0,
      }}>
        <div style={{ width: '100%', position: 'relative' }}>
          {/* ── Secret Vault Panel (slides up from input) ─────────────────── */}
          <div
            ref={vaultPanelRef}
            style={{
              position: 'absolute', bottom: '100%', left: 0, right: 0,
              background: 'rgba(26, 16, 40, 0.6)', border: '1px solid rgba(168, 85, 247, 0.12)', borderBottom: 'none',
              borderRadius: '12px 12px 0 0',
              boxShadow: '0 -8px 32px rgba(0,0,0,0.4)',
              maxHeight: showVault ? 340 : 0,
              overflow: 'hidden',
              transition: 'max-height 0.3s ease-in-out',
              zIndex: 100,
            }}
          >
            {showVault && (
              <div style={{ padding: '16px 20px' }}>
                {/* Vault header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#a855f7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                      <path d="M7 11V7a5 5 0 0110 0v4" />
                    </svg>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#cdd6f4' }}>{t('dash.chat.secret_vault')}</span>
                    <span style={{ fontSize: 10, color: '#6c7086' }}>Use @secret:Label in messages</span>
                  </div>
                  <button
                    onClick={() => setShowVault(false)}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer', color: '#6c7086',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      width: 24, height: 24, borderRadius: 6,
                    }}
                    onMouseEnter={e => e.currentTarget.style.color = '#cdd6f4'}
                    onMouseLeave={e => e.currentTarget.style.color = '#6c7086'}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>

                {/* Secrets list */}
                <div style={{ maxHeight: 200, overflowY: 'auto', marginBottom: 12 }}>
                  {secrets.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '16px 0', color: '#585b70', fontSize: 12 }}>
                      No secrets stored yet. Add one below.
                    </div>
                  )}
                  {secrets.map(s => (
                    <div key={s.id} style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                      background: 'rgba(10, 6, 18, 0.8)', border: '1px solid rgba(168, 85, 247, 0.12)', borderRadius: 8,
                      marginBottom: 6,
                    }}>
                      <span style={{ fontSize: 12, fontWeight: 500, color: '#cba6f7', minWidth: 80 }}>{s.label}</span>
                      <span style={{
                        flex: 1, fontSize: 12, fontFamily: 'monospace', color: '#6c7086',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {vaultRevealIds.has(s.id) ? s.value : '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022'}
                      </span>
                      <button
                        onClick={() => toggleVaultReveal(s.id)}
                        style={{
                          background: 'none', border: 'none', cursor: 'pointer', color: '#6c7086',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 4,
                        }}
                        title={vaultRevealIds.has(s.id) ? 'Hide value' : 'Reveal value'}
                      >
                        {vaultRevealIds.has(s.id) ? (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94" />
                            <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19" />
                            <line x1="1" y1="1" x2="23" y2="23" />
                          </svg>
                        ) : (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                            <circle cx="12" cy="12" r="3" />
                          </svg>
                        )}
                      </button>
                      <button
                        onClick={() => deleteSecret(s.id)}
                        style={{
                          background: 'none', border: 'none', cursor: 'pointer', color: '#585b70',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 4,
                        }}
                        onMouseEnter={e => e.currentTarget.style.color = '#f38ba8'}
                        onMouseLeave={e => e.currentTarget.style.color = '#585b70'}
                        title={t('dash.chat.delete_secret')}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>

                {/* Add secret row */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '10px 12px', background: 'rgba(10, 6, 18, 0.8)', border: '1px solid rgba(168,85,247,0.2)',
                  borderRadius: 8,
                }}>
                  <input
                    type="text"
                    value={vaultNewLabel}
                    onChange={e => setVaultNewLabel(e.target.value)}
                    placeholder={t('dash.chat.secret_label')}
                    style={{
                      width: 100, height: 30, background: 'rgba(49, 34, 68, 0.5)', border: '1px solid rgba(168, 85, 247, 0.12)',
                      borderRadius: 6, padding: '0 10px', fontSize: 12, color: '#cdd6f4', outline: 'none',
                    }}
                    onFocus={e => e.currentTarget.style.borderColor = '#a855f7'}
                    onBlur={e => e.currentTarget.style.borderColor = 'rgba(168, 85, 247, 0.12)'}
                    onKeyDown={e => { if (e.key === 'Enter') addSecret(); }}
                  />
                  <input
                    type="password"
                    value={vaultNewValue}
                    onChange={e => setVaultNewValue(e.target.value)}
                    placeholder={t('dash.chat.secret_value')}
                    style={{
                      flex: 1, height: 30, background: 'rgba(49, 34, 68, 0.5)', border: '1px solid rgba(168, 85, 247, 0.12)',
                      borderRadius: 6, padding: '0 10px', fontSize: 12, color: '#cdd6f4', outline: 'none',
                    }}
                    onFocus={e => e.currentTarget.style.borderColor = '#a855f7'}
                    onBlur={e => e.currentTarget.style.borderColor = 'rgba(168, 85, 247, 0.12)'}
                    onKeyDown={e => { if (e.key === 'Enter') addSecret(); }}
                  />
                  <button
                    onClick={addSecret}
                    disabled={!vaultNewLabel.trim() || !vaultNewValue.trim()}
                    style={{
                      height: 30, padding: '0 14px', borderRadius: 6, border: 'none',
                      background: vaultNewLabel.trim() && vaultNewValue.trim() ? '#a855f7' : 'rgba(49, 34, 68, 0.5)',
                      color: vaultNewLabel.trim() && vaultNewValue.trim() ? '#fff' : '#585b70',
                      fontSize: 12, fontWeight: 600, cursor: vaultNewLabel.trim() && vaultNewValue.trim() ? 'pointer' : 'not-allowed',
                      flexShrink: 0,
                    }}
                  >
                    Save
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Input container with mode selector inside */}
          <div style={{
            display: 'flex', alignItems: 'flex-end', gap: 8,
            background: 'rgba(0,0,0,0.35)', border: '1.5px solid rgba(168,85,247,0.15)',
            borderRadius: 14, padding: '8px 8px 8px 8px',
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
            {/* Mode selector (left of input) */}
            <div ref={modeMenuRef} style={{ position: 'relative', flexShrink: 0, alignSelf: 'center' }}>
              <button
                onClick={() => setModeMenuOpen(!modeMenuOpen)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px',
                  background: 'linear-gradient(135deg, #a855f7, #7c3aed)', border: 'none',
                  borderRadius: 8, color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
                title={t('dash.chat.switch_mode')}
              >
                <span style={{ fontFamily: 'monospace', fontSize: 10, opacity: 0.7 }}>{currentMode.icon}</span>
                {currentMode.label}
                <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"
                  style={{ transform: modeMenuOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                </svg>
              </button>
              {modeMenuOpen && (
                <div style={{
                  position: 'absolute', bottom: '100%', left: 0, marginBottom: 8, zIndex: 999,
                  background: 'rgba(26, 16, 40, 0.95)', border: '1px solid rgba(168,85,247,0.2)', borderRadius: 10,
                  padding: 6, minWidth: 220, boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                }}>
                  {MODES.map((m, idx) => (
                    <button key={m.id} onClick={() => { setMode(m.id); setModeMenuOpen(false); }}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%',
                        padding: '8px 10px', background: mode === m.id ? 'rgba(168,85,247,0.2)' : 'transparent',
                        border: 'none', borderRadius: 6, color: mode === m.id ? '#fff' : '#cdd6f4',
                        fontSize: 12, fontWeight: mode === m.id ? 600 : 400, cursor: 'pointer', textAlign: 'left',
                      }}
                      onMouseEnter={(e) => { if (mode !== m.id) e.currentTarget.style.background = 'rgba(168,85,247,0.1)'; }}
                      onMouseLeave={(e) => { if (mode !== m.id) e.currentTarget.style.background = 'transparent'; }}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontFamily: 'monospace', fontSize: 10, opacity: 0.6 }}>{m.icon}</span>
                        {m.label}
                      </span>
                      <span style={{ fontSize: 9, opacity: 0.4, fontFamily: 'monospace' }}>Ctrl+Shift+{idx + 1}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
            >
              {/* Usage warning banner */}
              {usageWarning.level !== 'none' && usageWarning.message && (
                <div style={{
                  marginBottom: 6, padding: '6px 10px', borderRadius: 8, fontSize: 11, display: 'flex', alignItems: 'center', gap: 6,
                  background: usageWarning.level === 'exhausted' ? 'rgba(239,68,68,0.12)' : usageWarning.level === 'critical' ? 'rgba(249,115,22,0.12)' : 'rgba(234,179,8,0.08)',
                  color: usageWarning.level === 'exhausted' ? '#f38ba8' : usageWarning.level === 'critical' ? '#fab387' : '#f9e2af',
                  border: `1px solid ${usageWarning.level === 'exhausted' ? 'rgba(239,68,68,0.2)' : usageWarning.level === 'critical' ? 'rgba(249,115,22,0.2)' : 'rgba(234,179,8,0.15)'}`,
                }}>
                  <span>{usageWarning.level === 'exhausted' ? '\u26D4' : usageWarning.level === 'critical' ? '\u26A0' : '\u25CB'}</span>
                  <span style={{ flex: 1 }}>{usageWarning.message}</span>
                </div>
              )}
              {/* Pending attachments preview */}
              {pendingAttachments.length > 0 && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
                  {pendingAttachments.map((att, idx) => (
                    <div key={idx} style={{
                      position: 'relative', borderRadius: 8, overflow: 'hidden',
                      border: '1px solid rgba(168,85,247,0.3)', background: 'rgba(26, 16, 40, 0.6)',
                    }}>
                      {att.mimeType.startsWith('image/') && att.dataUri?.startsWith('data:') ? (
                        <div style={{ position: 'relative', height: 48, minWidth: 48, maxWidth: 100, overflow: 'hidden' }}>
                          <img
                            src={att.dataUri}
                            alt={att.name}
                            style={{ height: 48, maxWidth: 100, objectFit: 'cover', display: 'block' }}
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                          />
                          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '2px 4px', background: 'rgba(0,0,0,0.6)', fontSize: 9, color: '#a6adc8', textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {att.name}
                          </div>
                        </div>
                      ) : (
                        <div style={{ padding: '8px 12px', fontSize: 11, color: '#6c7086', display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span>📎</span> {att.name}
                        </div>
                      )}
                      <button
                        onClick={() => removeAttachment(idx)}
                        style={{
                          position: 'absolute', top: 2, right: 2, width: 16, height: 16,
                          borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,0.7)',
                          color: '#fff', fontSize: 10, cursor: 'pointer', display: 'flex',
                          alignItems: 'center', justifyContent: 'center', lineHeight: 1,
                        }}
                      >{'\u00D7'}</button>
                    </div>
                  ))}
                </div>
              )}

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
                onPaste={handlePaste}
                placeholder={
                  !canChat
                    ? chatInactiveReason
                    : chatBackend === 'local'
                      ? (sidecarReady ? currentMode.placeholder : t('dash.chat.starting_local'))
                      : currentMode.placeholder
                }
                disabled={!canChat}
                rows={1}
                style={{
                  flex: 1, resize: 'none', background: 'transparent', border: 'none', outline: 'none',
                  color: '#cdd6f4', fontSize: 14, lineHeight: 1.5, padding: '6px 0',
                  fontFamily: 'inherit', maxHeight: 160, minHeight: 24,
                  opacity: canChat ? 1 : 0.4,
                  cursor: canChat ? 'text' : 'not-allowed',
                }}
              />
            </div>

            {/* Attach file button */}
            <button
              onClick={() => {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = 'image/*,.pdf,.docx,.xlsx,.pptx,.csv,.txt,.md';
                input.multiple = true;
                input.onchange = () => {
                  if (!input.files) return;
                  for (const file of Array.from(input.files)) {
                    const reader = new FileReader();
                    reader.onload = () => {
                      setPendingAttachments((prev) => [...prev, {
                        name: file.name,
                        dataUri: reader.result as string,
                        mimeType: file.type,
                      }]);
                    };
                    reader.readAsDataURL(file);
                  }
                };
                input.click();
              }}
              style={{
                width: 36, height: 36, borderRadius: 8, border: '1px solid rgba(168,85,247,0.15)',
                background: 'rgba(168,85,247,0.05)', color: '#6c7086', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}
              title={t('dash.chat.attach_file')}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
              </svg>
            </button>

            {/* Secret Vault button */}
            <button
              ref={vaultBtnRef}
              onClick={() => setShowVault(!showVault)}
              style={{
                width: 36, height: 36, borderRadius: 8,
                border: showVault ? '1px solid rgba(168,85,247,0.5)' : '1px solid rgba(168,85,247,0.15)',
                background: showVault ? 'rgba(168,85,247,0.2)' : 'rgba(168,85,247,0.05)',
                color: showVault ? '#a855f7' : '#6c7086', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                transition: 'all 0.2s',
                position: 'relative',
              }}
              title={t('dash.chat.secret_vault')}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0110 0v4" />
              </svg>
              {secrets.length > 0 && (
                <span style={{
                  position: 'absolute', top: -4, right: -4, width: 14, height: 14,
                  borderRadius: '50%', background: '#a855f7', color: '#fff',
                  fontSize: 8, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {secrets.length}
                </span>
              )}
            </button>

            {/* Token balance in input bar */}
            {connected && platformBalance && (() => {
              const isAdmin = platformBalance.limit >= 999_999_999;
              if (isAdmin) return <span style={{ fontSize: 11, fontFamily: 'monospace', color: '#6c7086', opacity: 0.5, flexShrink: 0 }} title="Unlimited tokens">∞</span>;
              const remaining = Math.max(0, platformBalance.limit - platformBalance.used);
              const pct = platformBalance.limit > 0 ? (platformBalance.used / platformBalance.limit) * 100 : 0;
              const color = pct >= 95 ? '#ef4444' : pct >= 80 ? '#eab308' : '#a6e3a1';
              return (
                <span style={{ fontSize: 10, fontFamily: 'monospace', fontWeight: 600, color, flexShrink: 0 }} title={`${remaining.toLocaleString()} tokens remaining`}>
                  {fmtTokens(remaining)}
                </span>
              );
            })()}

            {/* Send / Interrupt button */}
            {streaming ? (
              <button
                onClick={cancelStream}
                onMouseDown={() => { stopTimerRef.current = setTimeout(hardStop, 800); }}
                onMouseUp={() => { if (stopTimerRef.current) { clearTimeout(stopTimerRef.current); stopTimerRef.current = null; } }}
                onMouseLeave={() => { if (stopTimerRef.current) { clearTimeout(stopTimerRef.current); stopTimerRef.current = null; } }}
                style={{
                  width: 36, height: 36, borderRadius: 8, border: '1px solid rgba(168,85,247,0.5)',
                  background: 'linear-gradient(135deg, #a855f7, #7c3aed)', color: '#fff',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0, boxShadow: '0 2px 8px rgba(168,85,247,0.35)',
                }}
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                  <rect x="3" y="3" width="4" height="10" rx="1" />
                  <rect x="9" y="3" width="4" height="10" rx="1" />
                </svg>
              </button>
            ) : (
              <button
                onClick={send}
                disabled={!canChat || !input.trim() || (chatBackend === 'local' ? !sidecarReady : !connected)}
                style={{
                  width: 36, height: 36, borderRadius: 8, flexShrink: 0,
                  border: canChat && input.trim() ? '1px solid rgba(168,85,247,0.5)' : '1px solid rgba(168,85,247,0.08)',
                  background: canChat && input.trim() ? 'linear-gradient(135deg, #a855f7, #7c3aed)' : 'transparent',
                  color: canChat && input.trim() ? '#fff' : '#6c7086',
                  cursor: canChat && input.trim() ? 'pointer' : 'not-allowed',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  opacity: canChat && input.trim() ? 1 : 0.15,
                  boxShadow: canChat && input.trim() ? '0 2px 8px rgba(168,85,247,0.4)' : 'none',
                  transition: 'all 0.2s',
                }}
                title={canChat ? t('dash.chat.send_enter') : t('dash.chat.add_key_or_connect')}
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
    {/* ── Tasks Panel (collapsible right sidebar) ───────────────────────── */}
    {tasksPanelOpen && (
      <IdeTasksPanel
        sessionTasks={sessionTasks}
        avaCompletedTasks={avaCompletedTasks}
        todayTasks={todayTasks}
        allTasks={allTasks}
        onClose={() => setTasksPanelOpen(false)}
        onToggleTask={handleToggleTask}
        width={tasksPanelWidth}
        onWidthChange={setTasksPanelWidth}
      />
    )}
    </div>
  );
}

/* ===== 2b. Chat History ===== */
export function ChatHistoryPage() {
  useLocale();
  const connected = checkConnected();
  const [conversations, setConversations] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'conversations' | 'usage'>('conversations');
  const { data: usage } = useApiData<any>('/usage/summary', null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('ava-ide-chat-history') || '[]';
      setConversations(JSON.parse(raw));
    } catch { setConversations([]); }
  }, []);

  const filtered = search
    ? conversations.filter(c => c.title?.toLowerCase().includes(search.toLowerCase()))
    : conversations;

  const deleteConversation = (id: string) => {
    const updated = conversations.filter(c => c.id !== id);
    setConversations(updated);
    try { localStorage.setItem('ava-ide-chat-history', JSON.stringify(updated)); } catch {}
  };

  // Usage analytics
  const period = usage?.period || {};
  const totals = usage?.totals || {};
  const freeUsed = period.free_tokens_used || 0;
  const freeLimit = period.free_tokens_limit || 3000000;
  const subUsed = period.tokens_used || 0;
  const subLimit = period.tokens_limit || 0;
  const isUnlimited = usage?.isUnlimited || false;
  const hasSub = subLimit > 0 && (usage?.tier || 'free') !== 'free';
  const balanceUsed = hasSub ? subUsed : freeUsed;
  const balanceLimit = hasSub ? subLimit : freeLimit;
  const balanceRemaining = Math.max(0, balanceLimit - balanceUsed);
  const remainPct = isUnlimited ? 100 : (balanceLimit > 0 ? Math.min((balanceRemaining / balanceLimit) * 100, 100) : 0);
  const daily: any[] = usage?.daily || [];
  const maxDaily = daily.length > 0 ? Math.max(...daily.map((d: any) => d.tokens || 0)) : 1;
  const today = new Date().toISOString().slice(0, 10);
  const models: any[] = usage?.models || [];
  const maxModelTokens = models.length > 0 ? Math.max(...models.map((m: any) => m.total_tokens || 0)) : 1;

  const tabStyle = (active: boolean) => ({
    padding: '6px 12px', fontSize: 12, fontWeight: 500 as const, cursor: 'pointer' as const,
    border: 'none', background: 'transparent', transition: 'all 0.15s',
    color: active ? '#cdd6f4' : '#585b70',
    borderBottom: active ? '2px solid #a855f7' : '2px solid transparent',
  });

  return (
    <div style={pageWrapper}>
      <div style={{ width: '100%' }}>
        <div style={pageTitle}>History</div>
        <div style={{ ...pageSubtitle, marginBottom: 16 }}>Tokens, sessions, models</div>

        {/* ── Tabs ───────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid rgba(168, 85, 247, 0.12)', marginBottom: 16, paddingBottom: 1 }}>
          <button style={tabStyle(activeTab === 'conversations')} onClick={() => setActiveTab('conversations')}>Conversations</button>
          <button style={tabStyle(activeTab === 'usage')} onClick={() => setActiveTab('usage')}>Usage</button>
        </div>

        {/* ── Usage Tab ──────────────────────────────────────────────── */}
        {activeTab === 'usage' && (
          <>
            {/* Token Balance */}
            {connected && usage && (
              <div style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase' as const, color: '#6c7086', marginBottom: 8 }}>Token Balance</div>
                <div style={{ background: 'rgba(26, 16, 40, 0.6)', border: '1px solid rgba(168, 85, 247, 0.12)', borderRadius: 12, padding: '16px 20px' }}>
                  {isUnlimited ? (
                    <>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 8 }}>
                        <span style={{ color: '#a6adc8' }}>Admin</span>
                        <span style={{ color: '#a855f7', fontWeight: 600 }}>Unlimited</span>
                      </div>
                      <div style={{ height: 12, borderRadius: 6, overflow: 'hidden', background: 'rgba(49, 34, 68, 0.5)' }}>
                        <div style={{ width: '100%', height: '100%', borderRadius: 6, background: 'linear-gradient(90deg, #a855f7, #6366f1)' }} />
                      </div>
                    </>
                  ) : (
                    <>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                        <span style={{ color: '#a6adc8' }}>Tokens Remaining</span>
                        <span style={{ color: '#cdd6f4', fontWeight: 600 }}>{formatTokens(balanceRemaining)}</span>
                      </div>
                      <div style={{ height: 12, borderRadius: 6, overflow: 'hidden', background: 'rgba(49, 34, 68, 0.5)' }}>
                        <div style={{
                          width: `${remainPct}%`, height: '100%', borderRadius: 6,
                          background: remainPct < 10 ? '#f87171' : remainPct < 30 ? '#f59e0b' : 'linear-gradient(90deg, #a855f7, #6366f1)',
                          transition: 'width 0.5s',
                        }} />
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#585b70', marginTop: 4 }}>
                        <span>{formatTokens(balanceUsed)} used</span>
                        <span>{formatTokens(balanceLimit)} limit</span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Overview Stats */}
            {connected && usage && (
              <div style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase' as const, color: '#6c7086', marginBottom: 8 }}>Overview</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
                  {[
                    { label: 'This Month', value: formatTokens(totals.tokens || 0) },
                    { label: 'Requests', value: String(totals.requests || 0) },
                    { label: 'Active Days', value: String(totals.active_days || 0) },
                    { label: 'Avg / Request', value: formatTokens(totals.requests > 0 ? Math.round((totals.tokens || 0) / totals.requests) : 0) },
                  ].map(s => (
                    <div key={s.label} style={{ background: 'rgba(26, 16, 40, 0.6)', border: '1px solid rgba(168, 85, 247, 0.12)', borderRadius: 10, padding: '14px 16px' }}>
                      <div style={{ fontSize: 10, color: '#6c7086', marginBottom: 6 }}>{s.label}</div>
                      <div style={{ fontSize: 18, fontWeight: 700, color: '#cdd6f4' }}>{s.value}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Daily Usage Chart */}
            {connected && daily.length > 0 && (
              <div style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase' as const, color: '#6c7086', marginBottom: 8 }}>Daily Usage (Last 14 Days)</div>
                <div style={{ background: 'rgba(26, 16, 40, 0.6)', border: '1px solid rgba(168, 85, 247, 0.12)', borderRadius: 12, padding: '16px 20px' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 80 }}>
                    {daily.map((d: any) => {
                      const h = maxDaily > 0 ? Math.max(2, (d.tokens / maxDaily) * 80) : 2;
                      const isToday = d.date === today;
                      return (
                        <div key={d.date} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }} title={`${d.date}: ${formatTokens(d.tokens)}`}>
                          <div style={{
                            width: '100%', height: h, borderRadius: 3,
                            background: isToday ? '#a855f7' : 'rgba(168, 85, 247, 0.3)',
                          }} />
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
                    <span style={{ fontSize: 9, color: '#585b70' }}>{daily[0]?.date?.slice(5)}</span>
                    <span style={{ fontSize: 9, color: '#585b70' }}>{daily[daily.length - 1]?.date?.slice(5)}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Most Used Models */}
            {connected && models.length > 0 && (
              <div style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase' as const, color: '#6c7086', marginBottom: 8 }}>Most Used Models</div>
                <div style={{ background: 'rgba(26, 16, 40, 0.6)', border: '1px solid rgba(168, 85, 247, 0.12)', borderRadius: 12, padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {models.slice(0, 5).map((m: any) => (
                    <div key={m.model}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
                        <span style={{ color: '#cdd6f4', fontWeight: 500 }}>{m.model}</span>
                        <span style={{ color: '#6c7086' }}>{formatTokens(m.total_tokens)} ({m.request_count} req)</span>
                      </div>
                      <div style={{ height: 6, borderRadius: 3, overflow: 'hidden', background: 'rgba(49, 34, 68, 0.5)' }}>
                        <div style={{ width: `${(m.total_tokens / maxModelTokens) * 100}%`, height: '100%', borderRadius: 3, background: 'linear-gradient(90deg, #a855f7, #6366f1)' }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {!connected && (
              <div style={{ background: 'rgba(26, 16, 40, 0.6)', border: '1px dashed rgba(168, 85, 247, 0.12)', borderRadius: 12, padding: '48px 20px', textAlign: 'center' }}>
                <div style={{ fontSize: 13, color: '#6c7086' }}>Connect your account to see usage analytics.</div>
              </div>
            )}
          </>
        )}

        {/* ── Conversations Tab ──────────────────────────────────────── */}
        {activeTab === 'conversations' && (
          <>


        {/* Search */}
        <div style={{ marginBottom: 20 }}>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={t('history.search')}
            style={{ ...inputStyle, maxWidth: 400, height: 38, borderRadius: 8 }}
          />
        </div>

        {filtered.length === 0 ? (
          <div style={{
            background: 'rgba(26, 16, 40, 0.6)', border: '1px dashed rgba(168, 85, 247, 0.12)', borderRadius: 12,
            padding: '48px 20px', textAlign: 'center',
          }}>
            <div style={{ fontSize: 28, marginBottom: 12 }}>💬</div>
            <div style={{ fontSize: 13, color: '#6c7086' }}>
              {search ? 'No conversations match your search.' : 'No conversations yet. Start chatting with Ava!'}
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filtered.map((conv: any) => {
              const msgCount = conv.messages?.length || 0;
              const date = conv.updatedAt ? new Date(conv.updatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
              const time = conv.updatedAt ? new Date(conv.updatedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }) : '';
              const preview = conv.messages?.find((m: any) => m.role === 'ava')?.text?.slice(0, 120) || '';

              return (
                <div key={conv.id} style={{
                  background: 'rgba(26, 16, 40, 0.6)', border: '1px solid rgba(168, 85, 247, 0.12)', borderRadius: 10,
                  padding: '14px 18px', cursor: 'pointer', transition: 'border-color 0.15s',
                }}
                  onClick={() => {
                    // Store the conversation to load, navigate to chat
                    localStorage.setItem('ava-ide-load-conversation', JSON.stringify(conv));
                    window.dispatchEvent(new CustomEvent('ava-load-conversation'));
                    window.dispatchEvent(new CustomEvent('ava-navigate-dashboard', { detail: 'ava-chat' }));
                  }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(168,85,247,0.3)')}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(168, 85, 247, 0.12)')}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#cdd6f4' }}>{conv.title || 'Untitled'}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 10, color: '#585b70' }}>{date} {time}</span>
                      <button
                        onClick={(e) => { e.stopPropagation(); deleteConversation(conv.id); }}
                        style={{ background: 'none', border: 'none', color: '#585b70', cursor: 'pointer', fontSize: 12, padding: '2px 4px' }}
                        title="Delete conversation"
                      >✕</button>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 10, color: '#6c7086', background: 'rgba(49, 34, 68, 0.5)', padding: '2px 8px', borderRadius: 4 }}>
                      {msgCount} messages
                    </span>
                    {conv.model && (
                      <span style={{ fontSize: 10, color: '#585b70' }}>{conv.model}</span>
                    )}
                  </div>
                  {preview && (
                    <div style={{ fontSize: 12, color: '#585b70', marginTop: 8, lineHeight: 1.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {preview}...
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
          </>
        )}
      </div>
    </div>
  );
}

/* ===== 3. Memory ===== */
const MEMORY_PAGE_SIZE = 100;

export function MemoryPage() {
  useLocale();
  const connected = checkConnected();
  const { data: rawMemories, loading, error } = useApiData<any[]>('/memories', []);
  const [memories, setMemories] = useState<any[]>([]);
  const [localMemories, setLocalMemories] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);
  const [deletingAll, setDeletingAll] = useState(false);
  const [displayLimit, setDisplayLimit] = useState(MEMORY_PAGE_SIZE);

  // Load local memories from ~/.ava/memory.json via Tauri FS
  useEffect(() => {
    (async () => {
      try {
        const { readTextFile, BaseDirectory } = await import('@tauri-apps/plugin-fs');
        const raw = await readTextFile('.ava/memory.json', { baseDir: BaseDirectory.Home });
        const parsed = JSON.parse(raw || '{}');
        const entries = parsed.entries || [];
        setLocalMemories(entries);
      } catch { /* file may not exist yet */ }
    })();
  }, []);

  // Merge cloud + local memories (deduplicated)
  useEffect(() => {
    const cloudList = Array.isArray(rawMemories) ? rawMemories : (rawMemories as any)?.entries || (rawMemories as any)?.memories || [];
    const cloudIds = new Set(cloudList.map((m: any) => m.id || m._id));
    const localOnly = localMemories.filter((m: any) => !cloudIds.has(m.id || m._id));
    const merged = [...cloudList, ...localOnly];
    if (merged.length > 0 || (!loading && localMemories.length === 0)) setMemories(merged);
  }, [rawMemories, loading, localMemories]);

  const CATEGORY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
    pattern:      { bg: 'rgba(59,130,246,0.10)', text: '#60a5fa', border: 'rgba(59,130,246,0.20)' },
    preference:   { bg: 'rgba(168,85,247,0.10)', text: '#a855f7', border: 'rgba(168,85,247,0.20)' },
    architecture: { bg: 'rgba(52,211,153,0.10)', text: '#34d399', border: 'rgba(52,211,153,0.20)' },
    'bug-fix':    { bg: 'rgba(239,68,68,0.10)',  text: '#f87171', border: 'rgba(239,68,68,0.20)' },
    convention:   { bg: 'rgba(245,158,11,0.10)', text: '#f59e0b', border: 'rgba(245,158,11,0.20)' },
    decision:     { bg: 'rgba(99,102,241,0.10)', text: '#818cf8', border: 'rgba(99,102,241,0.20)' },
    general:      { bg: 'rgba(107,114,128,0.10)',text: '#9ca3af', border: 'rgba(107,114,128,0.20)' },
  };

  const ALL_CATEGORIES = ['pattern', 'preference', 'architecture', 'bug-fix', 'convention', 'decision', 'general'];

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const m of memories) {
      const cat = m.category || 'general';
      counts[cat] = (counts[cat] || 0) + 1;
    }
    return counts;
  }, [memories]);

  const globalCount = memories.filter(m => m.scope === 'global').length;
  const projectCount = memories.filter(m => m.scope === 'project').length;

  const filtered = useMemo(() => {
    let result = memories;
    if (categoryFilter) result = result.filter(m => (m.category || 'general') === categoryFilter);
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(m =>
        (m.content || '').toLowerCase().includes(q) ||
        (m.title || '').toLowerCase().includes(q) ||
        (m.tags || []).some((t: string) => t.toLowerCase().includes(q))
      );
    }
    return result;
  }, [memories, categoryFilter, search]);

  // Reset display limit when filters change
  useEffect(() => { setDisplayLimit(MEMORY_PAGE_SIZE); }, [categoryFilter, search]);

  const displayed = filtered.slice(0, displayLimit);
  const hasMore = displayLimit < filtered.length;

  const formatDate = (dateStr: string | null | undefined): string => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const handleDelete = async (id: string | number) => {
    try {
      await apiFetch(`/memories/${id}`, { method: 'DELETE' });
      setMemories(prev => prev.filter(m => (m.id || m._id) !== id));
      setConfirmDeleteId(null);
    } catch (err: any) {
      alert(`Failed to delete: ${err.message}`);
    }
  };

  const deleteLocal = async () => {
    try {
      const { writeTextFile, BaseDirectory } = await import('@tauri-apps/plugin-fs');
      const emptyStore = JSON.stringify({ version: 2, lastModified: new Date().toISOString(), entries: [] });
      await writeTextFile('.ava/memory.json', emptyStore, { baseDir: BaseDirectory.Home }).catch(() => {});
    } catch { /* not in Tauri or fs plugin not available */ }
    try { window.dispatchEvent(new CustomEvent('ava-clear-memory')); } catch {}
  };

  const deleteCloud = async () => {
    try {
      const key = getPlatformKey();
      if (key) {
        const API = 'https://ava-supernova.com/api';
        const deviceId = localStorage.getItem('ava-ide-device-id') || '';
        for (let i = 0; i < 100; i++) {
          const res = await fetch(`${API}/memories`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json', 'X-Ava-Platform': 'ide', 'X-Ava-Device': deviceId },
          });
          const data = await res.json().catch(() => ({}));
          if (data?.remaining === 0 || data?.deleted === 0) break;
        }
      }
    } catch { /* best-effort */ }
  };

  const handleDeleteAll = async (scope: 'local' | 'cloud' | 'both') => {
    setDeletingAll(true);
    setConfirmDeleteAll(false);
    if (scope === 'local' || scope === 'both') await deleteLocal();
    if (scope === 'cloud' || scope === 'both') await deleteCloud();
    setMemories([]);
    setLocalMemories([]);
    setDeletingAll(false);
  };

  const handleRefresh = () => {
    window.location.reload();
  };

  const getCatStyle = (cat: string) => CATEGORY_COLORS[cat] || CATEGORY_COLORS.general;

  return (
    <div style={pageWrapper}>
      <div style={{ width: '100%' }}>
        {/* Header */}
        <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={pageTitle}>{t('dash.memory.title')}</div>
              <StorageBadge />
            </div>
            <div style={pageSubtitle}>{t('dash.memory.subtitle')}</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handleRefresh} style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid rgba(168,85,247,0.2)', background: 'transparent', color: '#9ca3af', fontSize: 12, cursor: 'pointer' }}>
              Refresh
            </button>
            {memories.length > 0 && !deletingAll && (
              <button onClick={() => setConfirmDeleteAll(true)} style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid rgba(239,68,68,0.2)', background: 'rgba(239,68,68,0.1)', color: '#f87171', fontSize: 12, cursor: 'pointer' }}>
                Delete All
              </button>
            )}
          </div>
        </div>

        {/* Delete All Confirmation */}
        {confirmDeleteAll && (
          <div style={{ marginBottom: 16, padding: 16, borderRadius: 10, border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.1)' }}>
            <p style={{ fontSize: 13, fontWeight: 500, color: '#f87171', marginBottom: 6 }}>Delete all memories?</p>
            <p style={{ fontSize: 11, color: '#9ca3af', marginBottom: 12 }}>This is permanent and cannot be undone.</p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button onClick={() => handleDeleteAll('local')} style={{ padding: '6px 14px', borderRadius: 8, background: 'rgba(166,227,161,0.15)', color: '#a6e3a1', fontSize: 12, border: '1px solid rgba(166,227,161,0.3)', cursor: 'pointer' }}>
                Local Only
              </button>
              {connected && (
                <button onClick={() => handleDeleteAll('cloud')} style={{ padding: '6px 14px', borderRadius: 8, background: 'rgba(96,165,250,0.15)', color: '#60a5fa', fontSize: 12, border: '1px solid rgba(96,165,250,0.3)', cursor: 'pointer' }}>
                  Cloud Only
                </button>
              )}
              {connected && (
                <button onClick={() => handleDeleteAll('both')} style={{ padding: '6px 14px', borderRadius: 8, background: '#ef4444', color: '#fff', fontSize: 12, border: 'none', cursor: 'pointer' }}>
                  Both
                </button>
              )}
              <button onClick={() => setConfirmDeleteAll(false)} style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid rgba(168,85,247,0.2)', background: 'transparent', color: '#9ca3af', fontSize: 12, cursor: 'pointer' }}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Deleting progress */}
        {deletingAll && (
          <div style={{ marginBottom: 16, padding: 16, borderRadius: 10, border: '1px solid rgba(245,158,11,0.3)', background: 'rgba(245,158,11,0.1)', display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid #f59e0b', borderTopColor: 'transparent', animation: 'spin 1s linear infinite' }} />
            <div>
              <p style={{ fontSize: 13, color: '#f59e0b' }}>Deleting all memories... This may take a moment.</p>
              <p style={{ fontSize: 11, color: 'rgba(245,158,11,0.6)', marginTop: 2 }}>Please stay on this page — leaving will interrupt the deletion.</p>
            </div>
          </div>
        )}


        {/* Stats row */}
        {memories.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10, marginBottom: 24 }}>
            {[
              { label: t('dash.memory.total'), value: memories.length, color: '#a855f7' },
              { label: t('dash.memory.global'), value: globalCount, color: '#60a5fa' },
              { label: t('dash.memory.project'), value: projectCount, color: '#34d399' },
              { label: t('dash.memory.categories'), value: Object.keys(categoryCounts).length, color: '#f59e0b' },
            ].map(s => (
              <div key={s.label} style={{
                background: 'rgba(26, 16, 40, 0.6)', border: '1px solid rgba(168, 85, 247, 0.12)', borderRadius: 10,
                padding: '14px 12px', textAlign: 'center',
              }}>
                <div style={{ fontSize: 20, fontWeight: 600, color: s.color }}>{s.value}</div>
                <div style={{ fontSize: 10, color: '#6c7086', marginTop: 2 }}>{s.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Search bar */}
        <div style={{ position: 'relative', marginBottom: 16 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6c7086" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            placeholder={t('dash.memory.search')}
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              ...inputStyle, paddingLeft: 38, height: 40, borderRadius: 10,
              background: 'rgba(49, 34, 68, 0.5)', border: '1px solid rgba(168, 85, 247, 0.12)',
            }}
            onFocus={e => { e.currentTarget.style.borderColor = '#a855f7'; }}
            onBlur={e => { e.currentTarget.style.borderColor = 'rgba(168, 85, 247, 0.12)'; }}
          />
        </div>

        {/* Category filter tabs */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
          <button
            onClick={() => setCategoryFilter(null)}
            style={{
              padding: '5px 14px', borderRadius: 20, fontSize: 11, fontWeight: 500, cursor: 'pointer',
              border: categoryFilter === null ? '1px solid #a855f7' : '1px solid rgba(168, 85, 247, 0.12)',
              background: categoryFilter === null ? 'rgba(168,85,247,0.15)' : 'transparent',
              color: categoryFilter === null ? '#a855f7' : '#6c7086',
            }}
          >
            {t('dash.memory.all')} ({memories.length})
          </button>
          {ALL_CATEGORIES.filter(c => categoryCounts[c]).map(cat => {
            const cs = getCatStyle(cat);
            const isActive = categoryFilter === cat;
            return (
              <button
                key={cat}
                onClick={() => setCategoryFilter(categoryFilter === cat ? null : cat)}
                style={{
                  padding: '5px 14px', borderRadius: 20, fontSize: 11, fontWeight: 500, cursor: 'pointer',
                  border: isActive ? `1px solid ${cs.border}` : '1px solid rgba(168, 85, 247, 0.12)',
                  background: isActive ? cs.bg : 'transparent',
                  color: isActive ? cs.text : '#6c7086',
                  textTransform: 'capitalize' as const,
                }}
              >
                {t(`dash.memory.cat.${cat.replace('-', '_')}`)} ({categoryCounts[cat]})
              </button>
            );
          })}
        </div>

        {/* Memory list */}
        {loading ? <LoadingSpinner /> : error ? <ErrorBanner message={error} /> : (
          <>
            {filtered.length === 0 ? (
              <div style={{
                background: 'rgba(26, 16, 40, 0.6)', border: '1px dashed rgba(168, 85, 247, 0.12)', borderRadius: 12,
                padding: '40px 20px', textAlign: 'center',
              }}>
                <div style={{ fontSize: 13, color: '#6c7086' }}>
                  {search || categoryFilter
                    ? t('dash.memory.no_match')
                    : t('dash.cc.no_memories')}
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {/* Showing count */}
                <div style={{ fontSize: 11, color: '#6c7086', textAlign: 'center', marginBottom: 4 }}>
                  Showing {Math.min(displayLimit, filtered.length)} of {filtered.length} memories
                </div>
                {displayed.map(m => {
                  const id = m.id || m._id;
                  const cat = m.category || 'general';
                  const cs = getCatStyle(cat);
                  const isExpanded = expandedId === id;
                  const content = m.content || m.title || '';
                  const preview = content.length > 160 ? content.slice(0, 160) + '...' : content;
                  const tags: string[] = m.tags || [];

                  return (
                    <div
                      key={id}
                      style={{
                        background: 'rgba(26, 16, 40, 0.6)', border: '1px solid rgba(168, 85, 247, 0.12)', borderRadius: 12,
                        padding: '18px 20px', cursor: 'pointer', transition: 'border-color 0.15s',
                      }}
                      onClick={() => setExpandedId(isExpanded ? null : id)}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(168,85,247,0.3)'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(168, 85, 247, 0.12)'; }}
                    >
                      {/* Header row: category badge + tags + actions */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                        <span style={{
                          display: 'inline-block', fontSize: 10, fontWeight: 600,
                          color: cs.text, background: cs.bg, border: `1px solid ${cs.border}`,
                          padding: '2px 10px', borderRadius: 12, textTransform: 'capitalize' as const,
                        }}>
                          {t(`dash.memory.cat.${cat.replace('-', '_')}`)}
                        </span>
                        {tags.map(tag => (
                          <span key={tag} style={{
                            fontSize: 10, color: '#6c7086', background: 'rgba(255,255,255,0.04)',
                            padding: '2px 8px', borderRadius: 4,
                          }}>
                            {tag}
                          </span>
                        ))}
                        {/* Delete button */}
                        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                          {confirmDeleteId === id ? (
                            <>
                              <button
                                onClick={() => handleDelete(id)}
                                style={{
                                  background: '#ef4444', border: 'none', borderRadius: 4,
                                  padding: '3px 10px', fontSize: 10, fontWeight: 600, color: '#fff', cursor: 'pointer',
                                }}
                              >
                                {t('dash.memory.confirm')}
                              </button>
                              <button
                                onClick={() => setConfirmDeleteId(null)}
                                style={{
                                  background: 'transparent', border: '1px solid rgba(168, 85, 247, 0.12)', borderRadius: 4,
                                  padding: '3px 10px', fontSize: 10, color: '#6c7086', cursor: 'pointer',
                                }}
                              >
                                {t('dash.memory.cancel')}
                              </button>
                            </>
                          ) : (
                            <button
                              onClick={() => setConfirmDeleteId(id)}
                              style={{
                                width: 26, height: 26, borderRadius: 6,
                                background: 'transparent', border: 'none',
                                color: '#6c7086', cursor: 'pointer',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                              }}
                              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#f87171'; }}
                              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = '#6c7086'; }}
                              title={t('dash.memory.delete_title')}
                            >
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" />
                              </svg>
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Content */}
                      <div style={{ fontSize: 13, color: '#cdd6f4', lineHeight: 1.7, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                        {isExpanded ? content : preview}
                      </div>

                      {/* Footer metadata */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 10, flexWrap: 'wrap' }}>
                        {m.created_at && (
                          <span style={{ fontSize: 10, color: '#6c7086' }}>{t('dash.memory.created').replace('{date}', formatDate(m.created_at))}</span>
                        )}
                        {m.updated_at && m.updated_at !== m.created_at && (
                          <span style={{ fontSize: 10, color: '#6c7086' }}>{t('dash.memory.updated').replace('{date}', formatDate(m.updated_at))}</span>
                        )}
                        {(m.recall_count || m.recallCount || 0) > 0 && (
                          <span style={{ fontSize: 10, color: '#6c7086' }}>{t('dash.memory.recalled').replace('{n}', String(m.recall_count || m.recallCount))}</span>
                        )}
                        {m.scope && (
                          <span style={{ fontSize: 10, color: '#45475a' }}>{m.scope === 'global' ? t('dash.memory.global') : m.scope === 'project' ? t('dash.memory.project') : m.scope}</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Load more */}
            {hasMore && (
              <button
                onClick={() => setDisplayLimit(prev => prev + MEMORY_PAGE_SIZE)}
                style={{
                  background: 'rgba(26, 16, 40, 0.6)', border: '1px solid rgba(168, 85, 247, 0.12)',
                  borderRadius: 10, padding: '12px 20px', fontSize: 12, fontWeight: 500,
                  color: '#a855f7', cursor: 'pointer', transition: 'border-color 0.15s',
                  textAlign: 'center', marginTop: 4, width: '100%',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(168,85,247,0.4)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(168, 85, 247, 0.12)'; }}
              >
                Load more ({filtered.length - displayLimit} remaining)
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* ===== 4. Tasks ===== */

const TASK_PRIORITY_DOT: Record<string, string> = {
  low: '#22c55e',
  medium: '#3b82f6',
  high: '#f59e0b',
  urgent: '#ef4444',
};

const TASK_PRIORITY_BG: Record<string, string> = {
  low: 'rgba(34,197,94,0.12)',
  medium: 'rgba(59,130,246,0.12)',
  high: 'rgba(245,158,11,0.12)',
  urgent: 'rgba(239,68,68,0.12)',
};

const TASK_CATEGORY_COLORS: Record<string, { bg: string; text: string }> = {
  work: { bg: 'rgba(168,85,247,0.12)', text: '#a855f7' },
  personal: { bg: 'rgba(236,72,153,0.12)', text: '#ec4899' },
  learning: { bg: 'rgba(14,165,233,0.12)', text: '#0ea5e9' },
  project: { bg: 'rgba(245,158,11,0.12)', text: '#f59e0b' },
};

type TaskFilter = 'all' | 'today' | 'overdue' | 'completed';

function isTaskOverdue(task: any): boolean {
  if (!task.due_date || task.done || task.status === 'done') return false;
  return task.due_date < new Date().toISOString().slice(0, 10);
}

function isTaskDueToday(task: any): boolean {
  if (!task.due_date) return false;
  return task.due_date === new Date().toISOString().slice(0, 10);
}

function formatTaskDate(dateStr: string | undefined): string {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export function TasksPage() {
  useLocale();
  const connected = checkConnected();
  const { data: rawTasks, loading, error } = useApiData<any>('/tasks', []);

  // Local-first: load from localStorage, always available
  const [tasks, setTasks] = useState<any[]>(() => {
    try { const saved = localStorage.getItem('ava-ide-tasks'); return saved ? JSON.parse(saved) : []; } catch { return []; }
  });
  const [filter, setFilter] = useState<TaskFilter>('all');
  const [showForm, setShowForm] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [hoverCardId, setHoverCardId] = useState<string | null>(null);
  const [hoverDeleteId, setHoverDeleteId] = useState<string | null>(null);

  // Form state
  const [formTitle, setFormTitle] = useState('');
  const [formPriority, setFormPriority] = useState('medium');
  const [formDueDate, setFormDueDate] = useState('');
  const [formCategory, setFormCategory] = useState('work');

  // Calendar date filter (set by sidebar calendar click)
  const [selectedCalDate, setSelectedCalDate] = useState<string | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      const date = (e as CustomEvent).detail;
      if (date) {
        setSelectedCalDate(date);
        setFilter('all');
      }
    };
    window.addEventListener('ava-task-date-selected', handler);
    return () => window.removeEventListener('ava-task-date-selected', handler);
  }, []);

  // Persist to localStorage on every change
  useEffect(() => {
    try { localStorage.setItem('ava-ide-tasks', JSON.stringify(tasks)); } catch {}
  }, [tasks]);

  // Merge cloud tasks when connected — add any cloud tasks not already local
  useEffect(() => {
    const cloudList = Array.isArray(rawTasks) ? rawTasks : rawTasks?.tasks || [];
    if (cloudList.length === 0 || loading) return;
    setTasks(prev => {
      const localIds = new Set(prev.map((t: any) => t.id || t._id));
      const newFromCloud = cloudList.filter((t: any) => !localIds.has(t.id || t._id));
      if (newFromCloud.length === 0) return prev;
      return [...prev, ...newFromCloud];
    });
  }, [rawTasks, loading]);

  const stats = useMemo(() => {
    return {
      all: tasks.filter((t: any) => !t.done && t.status !== 'done').length,
      today: tasks.filter((t: any) => isTaskDueToday(t) && !t.done && t.status !== 'done').length,
      overdue: tasks.filter((t: any) => isTaskOverdue(t)).length,
      completed: tasks.filter((t: any) => t.done || t.status === 'done').length,
    };
  }, [tasks]);

  const filtered = useMemo(() => {
    // If a calendar date is selected, show all tasks for that day
    if (selectedCalDate) {
      return tasks.filter((t: any) => t.due_date && t.due_date.slice(0, 10) === selectedCalDate);
    }
    switch (filter) {
      case 'today': return tasks.filter((t: any) => isTaskDueToday(t) && !t.done && t.status !== 'done');
      case 'overdue': return tasks.filter((t: any) => isTaskOverdue(t));
      case 'completed': return tasks.filter((t: any) => t.done || t.status === 'done');
      default: return tasks.filter((t: any) => !t.done && t.status !== 'done');
    }
  }, [tasks, filter, selectedCalDate]);

  const resetForm = () => {
    setFormTitle('');
    setFormPriority('medium');
    setFormDueDate('');
    setFormCategory('work');
    setShowForm(false);
  };

  const addTask = async () => {
    if (!formTitle.trim()) return;
    const newTask: any = {
      id: String(Date.now()),
      title: formTitle.trim(),
      priority: formPriority,
      due_date: formDueDate || undefined,
      category: formCategory,
      done: false,
      status: 'todo',
    };
    if (!connected) {
      setTasks((t) => [...t, newTask]);
      resetForm();
      return;
    }
    try {
      const created = await apiFetch('/tasks', {
        method: 'POST',
        body: JSON.stringify({
          title: formTitle.trim(),
          priority: formPriority,
          due_date: formDueDate || undefined,
          category: formCategory,
        }),
      });
      setTasks((t) => [...t, created]);
      resetForm();
    } catch {
      setTasks((t) => [...t, newTask]);
      resetForm();
    }
  };

  const toggleTask = async (task: any) => {
    const id = task.id || task._id;
    const newDone = !(task.done || task.status === 'done');
    setTasks((t) =>
      t.map((tt) =>
        (tt.id || tt._id) === id
          ? { ...tt, done: newDone, status: newDone ? 'done' : 'todo' }
          : tt
      )
    );
    if (connected) {
      try {
        await apiFetch(`/tasks/${id}`, {
          method: 'PATCH',
          body: JSON.stringify({ status: newDone ? 'done' : 'todo', done: newDone }),
        });
      } catch { /* local toggle stands */ }
    }
  };

  const deleteTask = async (task: any) => {
    const id = task.id || task._id;
    setTasks((t) => t.filter((tt) => (tt.id || tt._id) !== id));
    setConfirmDeleteId(null);
    if (connected) {
      try { await apiFetch(`/tasks/${id}`, { method: 'DELETE' }); } catch { /* */ }
    }
  };

  const filterTabs: { key: TaskFilter; label: string; count: number }[] = [
    { key: 'all', label: t('dash.tasks.active'), count: stats.all },
    { key: 'today', label: t('dash.tasks.today'), count: stats.today },
    { key: 'overdue', label: t('dash.tasks.overdue'), count: stats.overdue },
    { key: 'completed', label: t('dash.tasks.completed'), count: stats.completed },
  ];

  return (
    <div style={pageWrapper}>
      <div style={{ width: '100%' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={pageTitle}>{t('dash.tasks.title')}</div>
            <StorageBadge />
          </div>
          <button
            onClick={() => { resetForm(); setShowForm(!showForm); }}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: 'rgba(168,85,247,0.1)', border: '1px solid rgba(168,85,247,0.4)',
              borderRadius: 8, padding: '7px 14px', fontSize: 12, fontWeight: 500,
              color: '#a855f7', cursor: 'pointer',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(168,85,247,0.2)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(168,85,247,0.1)'; }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            {t('dash.tasks.new_task')}
          </button>
        </div>
        <div style={pageSubtitle}>{t('dash.tasks.subtitle')}</div>

        {/* Stats bar */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10, marginBottom: 24 }}>
          {[
            { label: t('dash.tasks.active'), value: stats.all, color: '#3b82f6' },
            { label: t('dash.tasks.today'), value: stats.today, color: '#f59e0b' },
            { label: t('dash.tasks.overdue'), value: stats.overdue, color: stats.overdue > 0 ? '#ef4444' : '#6c7086' },
            { label: t('dash.tasks.completed'), value: stats.completed, color: '#22c55e' },
          ].map((s) => (
            <div key={s.label} style={{
              background: 'rgba(26, 16, 40, 0.6)', border: '1px solid rgba(168, 85, 247, 0.12)', borderRadius: 10,
              padding: '14px 12px', textAlign: 'center',
            }}>
              <div style={{ fontSize: 20, fontWeight: 600, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 10, color: '#6c7086', marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Add Task Form */}
        {showForm && (
          <div style={{
            background: 'rgba(26, 16, 40, 0.6)', border: '1px solid rgba(168, 85, 247, 0.12)', borderRadius: 10,
            padding: 20, marginBottom: 20,
          }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#cdd6f4', marginBottom: 14 }}>{t('dash.tasks.new_task')}</div>
            <input
              type="text"
              placeholder={t('dash.tasks.title_placeholder')}
              value={formTitle}
              onChange={(e) => setFormTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') addTask(); }}
              style={{
                ...inputStyle, marginBottom: 12, height: 40,
              }}
              onFocus={(e) => { e.currentTarget.style.borderColor = '#a855f7'; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = 'rgba(168, 85, 247, 0.12)'; }}
              autoFocus
            />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 14 }}>
              {/* Priority */}
              <div style={{ flex: 1, minWidth: 120 }}>
                <div style={{ fontSize: 10, color: '#6c7086', marginBottom: 6 }}>{t('dash.tasks.label_priority')}</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {(['low', 'medium', 'high', 'urgent'] as const).map((p) => (
                    <button
                      key={p}
                      onClick={() => setFormPriority(p)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 5,
                        padding: '5px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer',
                        border: formPriority === p ? `1px solid ${TASK_PRIORITY_DOT[p]}` : '1px solid rgba(168, 85, 247, 0.12)',
                        background: formPriority === p ? TASK_PRIORITY_BG[p] : 'rgba(49, 34, 68, 0.5)',
                        color: formPriority === p ? TASK_PRIORITY_DOT[p] : '#a6adc8',
                        fontWeight: formPriority === p ? 600 : 400,
                      }}
                    >
                      <span style={{
                        width: 8, height: 8, borderRadius: '50%',
                        background: TASK_PRIORITY_DOT[p], display: 'inline-block',
                      }} />
                      {t(`dash.tasks.priority_${p}`)}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 14 }}>
              {/* Due date */}
              <div style={{ minWidth: 160 }}>
                <div style={{ fontSize: 10, color: '#6c7086', marginBottom: 6 }}>{t('dash.tasks.label_due_date')}</div>
                <input
                  type="date"
                  value={formDueDate}
                  onChange={(e) => setFormDueDate(e.target.value)}
                  style={{
                    ...inputStyle, height: 34, width: '100%',
                    colorScheme: 'dark',
                  }}
                />
              </div>
              {/* Category */}
              <div style={{ minWidth: 140 }}>
                <div style={{ fontSize: 10, color: '#6c7086', marginBottom: 6 }}>{t('dash.tasks.label_category')}</div>
                <CustomSelect
                  value={formCategory}
                  onChange={setFormCategory}
                  height={34}
                  options={[
                    { value: 'work', label: t('dash.tasks.cat.work') },
                    { value: 'personal', label: t('dash.tasks.cat.personal') },
                    { value: 'learning', label: t('dash.tasks.cat.learning') },
                    { value: 'project', label: t('dash.tasks.cat.project') },
                  ]}
                />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={addTask}
                disabled={!formTitle.trim()}
                style={{
                  ...btnPrimary, opacity: formTitle.trim() ? 1 : 0.4,
                  padding: '8px 18px', fontSize: 12,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#9333ea'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = '#a855f7'; }}
              >
                {t('dash.tasks.add')}
              </button>
              <button
                onClick={resetForm}
                style={{ ...btnSecondary, padding: '8px 14px', fontSize: 12 }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#45475a'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(49, 34, 68, 0.5)'; }}
              >
                {t('dash.tasks.cancel')}
              </button>
            </div>
          </div>
        )}

        {/* Filter tabs */}
        <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid rgba(168, 85, 247, 0.12)', marginBottom: 20 }}>
          {filterTabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => { setFilter(tab.key); setSelectedCalDate(null); }}
              style={{
                padding: '10px 16px', fontSize: 12, fontWeight: 500, cursor: 'pointer',
                background: 'transparent', border: 'none',
                borderBottom: filter === tab.key && !selectedCalDate ? '2px solid #a855f7' : '2px solid transparent',
                color: filter === tab.key && !selectedCalDate ? '#cdd6f4' : '#6c7086',
                display: 'flex', alignItems: 'center', gap: 6,
              }}
            >
              {tab.label}
              {tab.count > 0 && (
                <span style={{
                  fontSize: 10, fontWeight: 600, minWidth: 18, height: 18,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  borderRadius: 9,
                  background: tab.key === 'overdue' && tab.count > 0 ? 'rgba(239,68,68,0.15)' : 'rgba(255,255,255,0.06)',
                  color: tab.key === 'overdue' && tab.count > 0 ? '#ef4444' : '#a6adc8',
                  padding: '0 5px',
                }}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Calendar date filter indicator */}
        {selectedCalDate && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '8px 14px', marginBottom: 12, borderRadius: 8,
            background: 'rgba(168,85,247,0.08)', border: '1px solid rgba(168,85,247,0.2)',
          }}>
            <span style={{ fontSize: 12, color: '#a855f7' }}>
              Showing tasks for {new Date(selectedCalDate + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </span>
            <button
              onClick={() => setSelectedCalDate(null)}
              style={{ background: 'none', border: 'none', color: '#6c7086', cursor: 'pointer', fontSize: 11 }}
            >
              Clear
            </button>
          </div>
        )}

        {/* Task list */}
        {loading ? <LoadingSpinner /> : error ? <ErrorBanner message={error} /> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filtered.length === 0 ? (
              <div style={{
                ...card, textAlign: 'center', padding: '40px 20px',
              }}>
                <div style={{ fontSize: 13, color: '#6c7086' }}>
                  {filter === 'all' ? t('dash.tasks.empty_active') :
                   filter === 'today' ? t('dash.tasks.empty_today') :
                   filter === 'overdue' ? t('dash.tasks.empty_overdue') :
                   t('dash.tasks.empty_completed')}
                </div>
              </div>
            ) : (
              filtered.map((task: any) => {
                const id = task.id || task._id;
                const isDone = task.done || task.status === 'done';
                const overdue = isTaskOverdue(task);
                const dueToday = isTaskDueToday(task);
                const catColors = TASK_CATEGORY_COLORS[task.category] || TASK_CATEGORY_COLORS.work;
                const isHovered = hoverCardId === id;

                return (
                  <div
                    key={id}
                    style={{
                      background: 'rgba(26, 16, 40, 0.6)',
                      border: `1px solid ${overdue ? 'rgba(239,68,68,0.3)' : isHovered ? 'rgba(168,85,247,0.3)' : 'rgba(168, 85, 247, 0.12)'}`,
                      borderRadius: 10, padding: '16px 20px',
                      display: 'flex', alignItems: 'flex-start', gap: 14,
                      transition: 'border-color 0.15s',
                      opacity: isDone ? 0.6 : 1,
                    }}
                    onMouseEnter={() => setHoverCardId(id)}
                    onMouseLeave={() => { setHoverCardId(null); setHoverDeleteId(null); }}
                  >
                    {/* Checkbox */}
                    <div
                      onClick={() => toggleTask(task)}
                      style={{
                        width: 22, height: 22, borderRadius: 6, flexShrink: 0, marginTop: 1,
                        border: isDone ? '2px solid #22c55e' : '2px solid rgba(168, 85, 247, 0.12)',
                        background: isDone ? 'rgba(34,197,94,0.15)' : 'transparent',
                        cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        transition: 'all 0.15s',
                      }}
                    >
                      {isDone && (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </div>

                    {/* Content */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                        <span style={{
                          fontSize: 14, fontWeight: 500,
                          color: isDone ? '#6c7086' : '#cdd6f4',
                          textDecoration: isDone ? 'line-through' : 'none',
                        }}>
                          {task.title}
                        </span>
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
                        {/* Priority badge */}
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                          fontSize: 10, fontWeight: 600,
                          color: TASK_PRIORITY_DOT[task.priority] || TASK_PRIORITY_DOT.medium,
                          background: TASK_PRIORITY_BG[task.priority] || TASK_PRIORITY_BG.medium,
                          padding: '2px 8px', borderRadius: 4,
                        }}>
                          <span style={{
                            width: 6, height: 6, borderRadius: '50%', display: 'inline-block',
                            background: TASK_PRIORITY_DOT[task.priority] || TASK_PRIORITY_DOT.medium,
                          }} />
                          {t(`dash.tasks.priority_${task.priority || 'medium'}`)}
                        </span>

                        {/* Category badge */}
                        {task.category && (
                          <span style={{
                            fontSize: 10, fontWeight: 500,
                            color: catColors.text,
                            background: catColors.bg,
                            padding: '2px 8px', borderRadius: 4,
                          }}>
                            {t(`dash.tasks.cat.${task.category}`)}
                          </span>
                        )}

                        {/* Due date badge */}
                        {task.due_date && (
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 4,
                            fontSize: 10,
                            color: overdue ? '#ef4444' : dueToday ? '#f59e0b' : '#6c7086',
                            fontWeight: overdue ? 600 : 400,
                          }}>
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
                            </svg>
                            {overdue && t('dash.tasks.overdue_prefix')}{dueToday ? t('dash.tasks.due_today') : formatTaskDate(task.due_date)}
                          </span>
                        )}

                        {/* Overdue red label */}
                        {overdue && !task.due_date && (
                          <span style={{ fontSize: 10, fontWeight: 600, color: '#ef4444' }}>{t('dash.tasks.overdue')}</span>
                        )}
                      </div>
                    </div>

                    {/* Actions — visible on hover */}
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0,
                      opacity: isHovered ? 1 : 0, transition: 'opacity 0.15s',
                    }}>
                      {confirmDeleteId === id ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <button
                            onClick={() => deleteTask(task)}
                            style={{
                              background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)',
                              borderRadius: 4, padding: '3px 8px', fontSize: 10, fontWeight: 600,
                              color: '#ef4444', cursor: 'pointer',
                            }}
                          >
                            {t('dash.tasks.delete')}
                          </button>
                          <button
                            onClick={() => setConfirmDeleteId(null)}
                            style={{
                              background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(168, 85, 247, 0.12)',
                              borderRadius: 4, padding: '3px 8px', fontSize: 10,
                              color: '#6c7086', cursor: 'pointer',
                            }}
                          >
                            {t('dash.tasks.cancel')}
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmDeleteId(id)}
                          onMouseEnter={() => setHoverDeleteId(id)}
                          onMouseLeave={() => setHoverDeleteId(null)}
                          style={{
                            width: 28, height: 28, borderRadius: 6, background: 'transparent',
                            border: 'none', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: hoverDeleteId === id ? '#ef4444' : '#6c7086',
                            transition: 'color 0.15s',
                          }}
                          title={t('dash.tasks.delete_task_title')}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ===== 5. Journal ===== */

const MOOD_EMOJIS = ['', '\uD83D\uDE14', '\uD83D\uDE15', '\uD83D\uDE10', '\uD83D\uDE0A', '\uD83D\uDE04'];
const MOOD_LABEL_KEYS = ['', 'dash.journal.mood_rough', 'dash.journal.mood_low', 'dash.journal.mood_okay', 'dash.journal.mood_good', 'dash.journal.mood_great'];
const MOOD_COLORS_MAP = ['', '#ef4444', '#f59e0b', '#6b7280', '#3b82f6', '#34d399'];

type JournalTab = 'user' | 'ava';

export function JournalPage() {
  useLocale();
  const [dateOffset, setDateOffset] = useState(0);
  const [tab, setTab] = useState<JournalTab>('user');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [pickerDate, setPickerDate] = useState('');
  const connected = checkConnected();

  const targetDate = new Date();
  targetDate.setDate(targetDate.getDate() + dateOffset);
  const yyyy = targetDate.getFullYear();
  const mm = String(targetDate.getMonth() + 1).padStart(2, '0');
  const dd = String(targetDate.getDate()).padStart(2, '0');
  const isoDate = `${yyyy}-${mm}-${dd}`;
  const dateStr = targetDate.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const isToday = dateOffset === 0;

  const { data: journalData, loading } = useApiData<any>(`/journal?date=${isoDate}`, null);

  // Extract user/ava entries — handle both { user_entry, ava_entry } and flat formats
  const userEntry = journalData?.user_entry || (journalData?.content ? journalData : null);
  const avaEntry = journalData?.ava_entry || (journalData?.ava_observation ? { content: journalData.ava_observation } : null);

  const [entry, setEntry] = useState('');
  const [mood, setMood] = useState<number | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');

  // Local-first: load from localStorage, merge with cloud if available
  useEffect(() => {
    // Cloud data takes priority if available, otherwise load local
    const cloudContent = userEntry?.content || journalData?.content || journalData?.entry || '';
    const cloudMood = userEntry?.mood || journalData?.mood || undefined;
    if (cloudContent) {
      setEntry(cloudContent);
      setMood(cloudMood);
    } else {
      // Load from localStorage
      try {
        const local = localStorage.getItem(`ava-ide-journal-${isoDate}`);
        if (local) {
          const parsed = JSON.parse(local);
          setEntry(parsed.content || '');
          setMood(parsed.mood || undefined);
        } else {
          setEntry('');
          setMood(undefined);
        }
      } catch { setEntry(''); setMood(undefined); }
    }
  }, [journalData, isoDate]);

  const saveEntry = async () => {
    // Always save locally first
    try { localStorage.setItem(`ava-ide-journal-${isoDate}`, JSON.stringify({ content: entry, mood, date: isoDate })); } catch {}

    setSaving(true);
    setSaveMsg('');
    if (connected) {
      try {
        await apiFetch('/journal', {
          method: 'POST',
          body: JSON.stringify({ date: isoDate, content: entry, mood }),
        });
        setSaveMsg(t('dash.journal.saved'));
      } catch (err: any) {
        setSaveMsg(t('dash.journal.saved') + ' (local)');
      }
    } else {
      setSaveMsg(t('dash.journal.saved') + ' (local)');
    }
    setTimeout(() => setSaveMsg(''), 2000);
    setSaving(false);
  };

  const handleDatePickerChange = (val: string) => {
    setPickerDate(val);
    setShowDatePicker(false);
    if (!val) return;
    const picked = new Date(val + 'T00:00:00');
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const diffMs = picked.getTime() - now.getTime();
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
    setDateOffset(diffDays);
  };

  // Mini calendar state
  const calendarMonth = targetDate.getMonth();
  const calendarYear = targetDate.getFullYear();
  const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();
  const firstDayOfWeek = new Date(calendarYear, calendarMonth, 1).getDay();
  const calendarDays = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const monthLabel = new Date(calendarYear, calendarMonth).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

  return (
    <div style={{ ...pageWrapper, display: 'flex', gap: 24 }}>
      {/* Main content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={pageTitle}>{t('dash.journal.title')}</div>
          <StorageBadge />
        </div>
        <div style={pageSubtitle}>{t('dash.journal.subtitle')}</div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid rgba(168, 85, 247, 0.12)', marginBottom: 20 }}>
          <button
            onClick={() => setTab('user')}
            style={{
              padding: '10px 20px', fontSize: 13, fontWeight: 500, cursor: 'pointer',
              background: 'transparent', border: 'none',
              borderBottom: tab === 'user' ? '2px solid #a855f7' : '2px solid transparent',
              color: tab === 'user' ? '#cdd6f4' : '#6c7086',
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            {t('dash.journal.your_entries')}
            {userEntry && (
              <span style={{
                width: 6, height: 6, borderRadius: '50%', background: '#cdd6f4', display: 'inline-block',
              }} />
            )}
          </button>
          <button
            onClick={() => setTab('ava')}
            style={{
              padding: '10px 20px', fontSize: 13, fontWeight: 500, cursor: 'pointer',
              background: 'transparent', border: 'none',
              borderBottom: tab === 'ava' ? '2px solid #a855f7' : '2px solid transparent',
              color: tab === 'ava' ? '#a855f7' : '#6c7086',
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            {t('dash.journal.ava_entries')}
            {avaEntry && (
              <span style={{
                width: 6, height: 6, borderRadius: '50%', background: '#a855f7', display: 'inline-block',
              }} />
            )}
          </button>
          <div style={{ flex: 1 }} />
          <span style={{ alignSelf: 'center', fontSize: 11, color: '#6c7086', paddingRight: 4 }}>
            {dd}/{mm}/{yyyy}
          </span>
        </div>

        {/* Date navigation */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <button
            onClick={() => setDateOffset((d) => d - 1)}
            style={{ ...btnSecondary, display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', fontSize: 12 }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#45475a'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(49, 34, 68, 0.5)'; }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            {t('dash.journal.prev')}
          </button>
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => { setPickerDate(isoDate); setShowDatePicker(!showDatePicker); }}
              style={{
                background: 'transparent', border: 'none', cursor: 'pointer',
                fontSize: 14, fontWeight: 500, color: '#cdd6f4',
                display: 'flex', alignItems: 'center', gap: 8,
              }}
            >
              {dateStr}
              {isToday && <span style={{ ...badge('#a855f7'), marginLeft: 4 }}>{t('dash.journal.today')}</span>}
            </button>
            {showDatePicker && (
              <div style={{
                position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)',
                marginTop: 8, zIndex: 10,
                background: 'rgba(26, 16, 40, 0.6)', border: '1px solid rgba(168, 85, 247, 0.12)', borderRadius: 8,
                padding: 12, boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
              }}>
                <input
                  type="date"
                  value={pickerDate}
                  onChange={(e) => handleDatePickerChange(e.target.value)}
                  style={{ ...inputStyle, height: 32, colorScheme: 'dark' }}
                  autoFocus
                />
              </div>
            )}
          </div>
          <button
            onClick={() => setDateOffset((d) => Math.min(d + 1, 0))}
            style={{
              ...btnSecondary, display: 'flex', alignItems: 'center', gap: 6,
              padding: '7px 14px', fontSize: 12,
              opacity: isToday ? 0.4 : 1, pointerEvents: isToday ? 'none' : 'auto',
            }}
            onMouseEnter={(e) => { if (!isToday) e.currentTarget.style.background = '#45475a'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(49, 34, 68, 0.5)'; }}
          >
            {t('dash.journal.next')}
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </div>

        {loading ? <LoadingSpinner /> : (
          <>
            {/* Tab: Your Journal */}
            {tab === 'user' && (
              <div style={{ ...card, padding: 24 }}>
                {/* Mood selector */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 16 }}>
                  <span style={{ fontSize: 11, color: '#6c7086', marginRight: 8 }}>{t('dash.journal.mood')}</span>
                  {[1, 2, 3, 4, 5].map((m) => (
                    <button
                      key={m}
                      onClick={() => setMood(mood === m ? undefined : m)}
                      style={{
                        width: 36, height: 36, borderRadius: '50%', cursor: 'pointer',
                        border: mood === m ? `2px solid ${MOOD_COLORS_MAP[m]}` : '2px solid transparent',
                        background: mood === m ? `${MOOD_COLORS_MAP[m]}18` : 'transparent',
                        fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        transition: 'all 0.15s',
                        filter: mood === m ? 'none' : 'grayscale(0.5)',
                        opacity: mood === m ? 1 : 0.6,
                      }}
                      title={t(MOOD_LABEL_KEYS[m])}
                    >
                      {MOOD_EMOJIS[m]}
                    </button>
                  ))}
                  {mood && (
                    <span style={{
                      fontSize: 11, fontWeight: 600, marginLeft: 8,
                      color: MOOD_COLORS_MAP[mood],
                    }}>
                      {t(MOOD_LABEL_KEYS[mood])}
                    </span>
                  )}
                </div>

                {/* Textarea */}
                <textarea
                  value={entry}
                  onChange={(e) => setEntry(e.target.value)}
                  placeholder={t('dash.journal.write')}
                  style={{
                    width: '100%', minHeight: 200, background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(168,85,247,0.15)',
                    borderRadius: 8, padding: 16, fontSize: 14, color: '#cdd6f4', outline: 'none',
                    resize: 'vertical', lineHeight: 1.7, fontFamily: 'inherit',
                  }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(168,85,247,0.4)'; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = 'rgba(168,85,247,0.15)'; }}
                />

                {/* Save button */}
                {connected && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14 }}>
                    <button
                      onClick={saveEntry}
                      disabled={saving}
                      style={{
                        ...btnPrimary, padding: '8px 20px', fontSize: 13,
                        opacity: saving ? 0.6 : 1,
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = '#9333ea'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = '#a855f7'; }}
                    >
                      {saving ? t('dash.journal.saving') : t('dash.journal.save_entry')}
                    </button>
                    {saveMsg && (
                      <span style={{
                        fontSize: 12,
                        color: saveMsg.startsWith('Error') ? '#f38ba8' : '#a6e3a1',
                      }}>
                        {saveMsg}
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Tab: Ava's Journal */}
            {tab === 'ava' && (
              <div style={{
                ...card, padding: 24,
                borderColor: 'rgba(168,85,247,0.2)',
              }}>
                {avaEntry ? (
                  <>
                    <div style={{
                      fontSize: 14, color: '#a6adc8', lineHeight: 1.8,
                      fontStyle: 'italic', whiteSpace: 'pre-wrap',
                      borderLeft: '3px solid rgba(168,85,247,0.3)',
                      paddingLeft: 16,
                    }}>
                      {avaEntry.content || avaEntry}
                    </div>
                    {avaEntry.tags && avaEntry.tags.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 16 }}>
                        {avaEntry.tags.map((tag: string) => (
                          <span key={tag} style={{
                            fontSize: 10, fontWeight: 500,
                            color: '#a855f7', background: 'rgba(168,85,247,0.1)',
                            padding: '2px 8px', borderRadius: 4,
                          }}>
                            #{tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <div style={{ textAlign: 'center', padding: '32px 20px' }}>
                    <div style={{ marginBottom: 12 }}>
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#a855f7" strokeWidth="1.5" style={{ opacity: 0.3 }}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
                      </svg>
                    </div>
                    <div style={{ fontSize: 14, color: '#6c7086' }}>
                      {t('dash.journal.ava_no_entry')}
                    </div>
                    <div style={{ fontSize: 11, color: '#6c7086', marginTop: 6, opacity: 0.6 }}>
                      {t('dash.journal.ava_session_note')}
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Mini Calendar */}
      <div style={{ width: 220, flexShrink: 0 }}>
        <div style={{ ...card, padding: 14 }}>
          {/* Month nav */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <button onClick={() => setDateOffset((d) => d - 30)} style={{ background: 'transparent', border: 'none', color: '#6c7086', cursor: 'pointer', fontSize: 14 }}>{'\u25C0'}</button>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#cdd6f4' }}>{monthLabel}</span>
            <button onClick={() => setDateOffset((d) => d + 30)} style={{ background: 'transparent', border: 'none', color: '#6c7086', cursor: 'pointer', fontSize: 14 }}>{'\u25B6'}</button>
          </div>
          {/* Day headers */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, textAlign: 'center', marginBottom: 4 }}>
            {[t('dash.journal.day_su'), t('dash.journal.day_mo'), t('dash.journal.day_tu'), t('dash.journal.day_we'), t('dash.journal.day_th'), t('dash.journal.day_fr'), t('dash.journal.day_sa')].map((d) => (
              <span key={d} style={{ fontSize: 9, color: '#45475a', fontWeight: 600 }}>{d}</span>
            ))}
          </div>
          {/* Day grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
            {/* Empty cells for offset */}
            {Array.from({ length: firstDayOfWeek }).map((_, i) => <div key={`e-${i}`} />)}
            {calendarDays.map((day) => {
              const isSelected = day === targetDate.getDate();
              const todayDate = new Date();
              const isCurrentDay = day === todayDate.getDate() && calendarMonth === todayDate.getMonth() && calendarYear === todayDate.getFullYear();
              return (
                <button
                  key={day}
                  onClick={() => {
                    const clicked = new Date(calendarYear, calendarMonth, day);
                    const now = new Date(); now.setHours(0, 0, 0, 0);
                    setDateOffset(Math.round((clicked.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
                  }}
                  style={{
                    width: 28, height: 28, borderRadius: '50%', border: 'none', cursor: 'pointer',
                    background: isSelected ? '#a855f7' : isCurrentDay ? 'rgba(168,85,247,0.2)' : 'transparent',
                    color: isSelected ? '#fff' : isCurrentDay ? '#a855f7' : '#a6adc8',
                    fontSize: 11, fontWeight: isSelected || isCurrentDay ? 600 : 400,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >{day}</button>
              );
            })}
          </div>
          {/* Legend */}
          <div style={{ display: 'flex', gap: 12, marginTop: 10, justifyContent: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 9, color: '#6c7086' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#cdd6f4' }} /> {t('dash.journal.your_entry_legend')}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 9, color: '#6c7086' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#a855f7' }} /> {t('dash.journal.ava_entry_legend')}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ===== 6. Learning ===== */
export function LearningPage() {
  useLocale();
  const { data: rawData, loading, error } = useApiData<any>('/learning', null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set());

  // Local-first: load from localStorage, merge with cloud
  const [localCurricula] = useState<any[]>(() => {
    try { const saved = localStorage.getItem('ava-ide-learning'); return saved ? JSON.parse(saved) : []; } catch { return []; }
  });

  const cloudCurricula: any[] = Array.isArray(rawData) ? rawData : rawData?.curricula || rawData?.courses || [];

  // Merge: cloud + local (deduplicated by id)
  const curricula: any[] = useMemo(() => {
    if (cloudCurricula.length === 0) return localCurricula;
    const cloudIds = new Set(cloudCurricula.map((c: any) => c.id || c._id));
    const localOnly = localCurricula.filter((c: any) => !cloudIds.has(c.id || c._id));
    return [...cloudCurricula, ...localOnly];
  }, [cloudCurricula, localCurricula]);

  // Persist to localStorage on change
  useEffect(() => {
    if (curricula.length > 0) {
      try { localStorage.setItem('ava-ide-learning', JSON.stringify(curricula)); } catch {}
    }
  }, [curricula]);

  const levelColors: Record<string, { color: string; bg: string }> = {
    beginner:     { color: '#34d399', bg: 'rgba(52,211,153,0.10)' },
    intermediate: { color: '#60a5fa', bg: 'rgba(96,165,250,0.10)' },
    advanced:     { color: '#fbbf24', bg: 'rgba(251,191,36,0.10)' },
    mixed:        { color: '#a78bfa', bg: 'rgba(167,139,250,0.10)' },
  };

  const typeIcons: Record<string, string> = {
    concept: '\uD83D\uDCD6', exercise: '\uD83D\uDCBB', project: '\uD83D\uDEE0', quiz: '\u2753', recap: '\uD83D\uDD04',
  };

  const inProgress = curricula.filter((c: any) => c.status === 'active' || c.status === 'in_progress').length;
  const completedCount = curricula.filter((c: any) => c.status === 'completed').length;
  const totalLessons = curricula.reduce((sum: number, c: any) => {
    const modules: any[] = c.modules || [];
    return sum + modules.reduce((ms: number, mod: any) => ms + (mod.lessons?.length || 0), c.total_lessons || c.lessons || 0);
  }, 0);

  const toggleModule = (id: string) => {
    setExpandedModules(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selected = curricula.find((c: any) => (c.id || c._id) === selectedId);

  // Detail view
  if (selected) {
    const modules: any[] = selected.modules || [];
    const progress = selected.progress_percent ?? selected.progress ?? 0;
    const lc = levelColors[selected.level] || levelColors.mixed;

    return (
      <div style={pageWrapper}>
        <div style={{ width: '100%' }}>
          <button
            onClick={() => { setSelectedId(null); setExpandedModules(new Set()); }}
            style={{
              background: 'transparent', border: 'none', color: '#6c7086',
              fontSize: 12, cursor: 'pointer', marginBottom: 16, padding: 0,
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#cdd6f4'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = '#6c7086'; }}
          >
            &larr; Back to Learning
          </button>

          <div style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{
                fontSize: 9, fontWeight: 700, textTransform: 'uppercase' as const,
                color: lc.color, background: lc.bg, padding: '3px 10px', borderRadius: 12,
              }}>
                {selected.level || 'mixed'}
              </span>
              {selected.estimated_hours && (
                <span style={{ fontSize: 10, color: '#6c7086' }}>~{selected.estimated_hours}h</span>
              )}
              {selected.subject && (
                <span style={{ fontSize: 10, color: '#6c7086' }}>{selected.subject}</span>
              )}
            </div>
            <div style={{ fontSize: 18, fontWeight: 600, color: '#cdd6f4' }}>{selected.title}</div>
            {selected.description && (
              <div style={{ fontSize: 12, color: '#a6adc8', marginTop: 4 }}>{selected.description}</div>
            )}
            {/* Progress bar */}
            <div style={{ marginTop: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 10, color: '#6c7086' }}>Progress</span>
                <span style={{ fontSize: 10, fontWeight: 600, color: '#cdd6f4' }}>{Math.round(progress)}%</span>
              </div>
              <div style={{ height: 6, background: 'rgba(49, 34, 68, 0.5)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{
                  width: `${progress}%`, height: '100%', borderRadius: 3,
                  background: 'linear-gradient(90deg, #a855f7, #6366f1)',
                  transition: 'width 0.3s',
                }} />
              </div>
            </div>
          </div>

          {/* Modules */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {modules.map((mod: any, mi: number) => {
              const modId = mod.id || `mod-${mi}`;
              const isOpen = expandedModules.has(modId);
              const modProgress = mod.progress_percent ?? mod.progress ?? 0;
              const lessons: any[] = mod.lessons || [];

              return (
                <div key={modId} style={{
                  background: 'rgba(26, 16, 40, 0.6)', border: '1px solid rgba(168, 85, 247, 0.12)', borderRadius: 10, overflow: 'hidden',
                }}>
                  <button
                    onClick={() => toggleModule(modId)}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '12px 16px', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left',
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(49, 34, 68, 0.5)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: '#6c7086', width: 16 }}>{mi + 1}</span>
                      <span style={{ fontSize: 13, fontWeight: 500, color: '#cdd6f4' }}>{mod.title}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {mod.status === 'completed' && <span style={{ fontSize: 10, color: '#34d399' }}>&#10003;</span>}
                      {mod.status === 'locked' && <span style={{ fontSize: 10, color: '#6c7086' }}>&#x1F512;</span>}
                      {mod.status === 'in_progress' && <span style={{ fontSize: 10, color: '#a855f7' }}>{Math.round(modProgress)}%</span>}
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#6c7086" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                        style={{ transition: 'transform 0.2s', transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                        <path d="M6 9l6 6 6-6" />
                      </svg>
                    </div>
                  </button>

                  {isOpen && lessons.length > 0 && (
                    <div style={{ borderTop: '1px solid rgba(168, 85, 247, 0.12)' }}>
                      {lessons.map((lesson: any) => (
                        <div
                          key={lesson.id || lesson.title}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 8,
                            padding: '8px 16px', fontSize: 11,
                            borderBottom: '1px solid rgba(49,50,68,0.5)',
                          }}
                        >
                          <span>{typeIcons[lesson.type] || '\uD83D\uDCD6'}</span>
                          <span style={{
                            color: lesson.status === 'completed' ? '#6c7086' : '#cdd6f4',
                            textDecoration: lesson.status === 'completed' ? 'line-through' : 'none',
                            flex: 1,
                          }}>
                            {lesson.title}
                          </span>
                          {lesson.status === 'completed' && <span style={{ color: '#34d399' }}>&#10003;</span>}
                          {lesson.score != null && <span style={{ color: '#6c7086', marginLeft: 'auto' }}>{lesson.score}%</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // List view
  return (
    <div style={pageWrapper}>
      <div style={{ width: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={pageTitle}>{t('dash.learning.title')}</div>
          <StorageBadge />
        </div>
        <div style={pageSubtitle}>{t('dash.learning.subtitle')}</div>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10, marginBottom: 28 }}>
          {[
            { label: t('dash.learning.total_curricula'), value: curricula.length, color: '#a855f7' },
            { label: t('dash.learning.in_progress'), value: inProgress, color: '#60a5fa' },
            { label: t('dash.learning.completed'), value: completedCount, color: '#34d399' },
            { label: t('dash.learning.total_lessons'), value: totalLessons, color: '#f59e0b' },
          ].map(s => (
            <div key={s.label} style={{
              background: 'rgba(26, 16, 40, 0.6)', border: '1px solid rgba(168, 85, 247, 0.12)', borderRadius: 10,
              padding: '14px 12px', textAlign: 'center',
            }}>
              <div style={{ fontSize: 20, fontWeight: 600, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 10, color: '#6c7086', marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {loading ? <LoadingSpinner /> : error ? <ErrorBanner message={error} /> : (
          <>
            {curricula.length === 0 ? (
              <>
                {/* How it works */}
                <div style={{ ...card, marginBottom: 16 }}>
                  <div style={{ ...sectionTitle, marginBottom: 14 }}>{t('dash.learning.how_it_works')}</div>
                  {[
                    { icon: '\uD83D\uDCAC', title: t('dash.learning.step1'), desc: t('dash.learning.step1_desc') },
                    { icon: '\uD83E\uDDE0', title: t('dash.learning.step2'), desc: t('dash.learning.step2_desc') },
                    { icon: '\uD83D\uDCDA', title: t('dash.learning.step3'), desc: t('dash.learning.step3_desc') },
                    { icon: '\uD83C\uDF93', title: t('dash.learning.step4'), desc: t('dash.learning.step4_desc') },
                  ].map(step => (
                    <div key={step.title} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 10 }}>
                      <span style={{ fontSize: 16, flexShrink: 0 }}>{step.icon}</span>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 500, color: '#cdd6f4' }}>{step.title}</div>
                        <div style={{ fontSize: 10, color: '#6c7086', marginTop: 2 }}>{step.desc}</div>
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{
                  background: 'rgba(26, 16, 40, 0.6)', border: '1px dashed rgba(168, 85, 247, 0.12)', borderRadius: 12,
                  padding: '24px 20px', textAlign: 'center',
                }}>
                  <div style={{ fontSize: 13, color: '#6c7086' }}>
                    {t('dash.learning.empty')}
                  </div>
                </div>
              </>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {curricula.map((curr: any) => {
                  const id = curr.id || curr._id;
                  const progress = curr.progress_percent ?? curr.progress ?? 0;
                  const lc = levelColors[curr.level] || levelColors.mixed;
                  const modules: any[] = curr.modules || [];
                  const moduleCount = modules.length;
                  const lessonCount = modules.reduce((s: number, mod: any) => s + (mod.lessons?.length || 0), curr.total_lessons || curr.lessons || 0);

                  return (
                    <button
                      key={id}
                      onClick={() => { setSelectedId(id); setExpandedModules(new Set()); }}
                      style={{
                        width: '100%', background: 'rgba(26, 16, 40, 0.6)', border: '1px solid rgba(168, 85, 247, 0.12)', borderRadius: 12,
                        padding: '16px 20px', textAlign: 'left', cursor: 'pointer', transition: 'border-color 0.15s',
                      }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(168,85,247,0.3)'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(168, 85, 247, 0.12)'; }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <span style={{
                          fontSize: 8, fontWeight: 700, textTransform: 'uppercase' as const,
                          color: lc.color, background: lc.bg, padding: '2px 8px', borderRadius: 10,
                        }}>
                          {curr.level || 'mixed'}
                        </span>
                        {curr.subject && <span style={{ fontSize: 10, color: '#6c7086' }}>{curr.subject}</span>}
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 500, color: '#cdd6f4', marginBottom: 8 }}>{curr.title}</div>

                      {/* Progress bar */}
                      <div style={{ height: 4, background: 'rgba(49, 34, 68, 0.5)', borderRadius: 2, overflow: 'hidden', marginBottom: 6 }}>
                        <div style={{
                          width: `${progress}%`, height: '100%', borderRadius: 2,
                          background: 'linear-gradient(90deg, #a855f7, #6366f1)',
                          transition: 'width 0.3s',
                        }} />
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <span style={{ fontSize: 9, color: '#6c7086' }}>
                          {curr.status === 'completed' ? 'Completed' : `${Math.round(progress)}% complete`}
                        </span>
                        {moduleCount > 0 && <span style={{ fontSize: 9, color: '#6c7086' }}>{moduleCount} {t('dash.learning.modules')}</span>}
                        {lessonCount > 0 && <span style={{ fontSize: 9, color: '#6c7086' }}>{lessonCount} {t('dash.learning.lessons')}</span>}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* ===== 7. Library ===== */
type LibraryFileType = 'image' | 'document' | 'spreadsheet' | 'presentation';
interface LibraryFile {
  name: string;
  path: string;
  folder: string;
  type: LibraryFileType;
  size: number;
  modified: string;
  url?: string; // platform URL for images
}

const FILE_TYPE_EXTENSIONS: Record<string, LibraryFileType> = {
  '.png': 'image', '.jpg': 'image', '.jpeg': 'image', '.gif': 'image',
  '.webp': 'image', '.svg': 'image', '.ico': 'image', '.bmp': 'image',
  '.docx': 'document', '.doc': 'document', '.pdf': 'document',
  '.txt': 'document', '.md': 'document', '.rtf': 'document', '.html': 'document',
  '.xlsx': 'spreadsheet', '.xls': 'spreadsheet', '.csv': 'spreadsheet',
  '.pptx': 'presentation', '.ppt': 'presentation',
};

const FILE_TYPE_ICONS: Record<LibraryFileType, string> = {
  image: '\uD83D\uDDBC\uFE0F',
  document: '\uD83D\uDCC4',
  spreadsheet: '\uD83D\uDCCA',
  presentation: '\uD83D\uDCBB',
};

const FILE_TYPE_COLORS: Record<LibraryFileType, { bg: string; text: string; border: string }> = {
  image: { bg: 'rgba(168,85,247,0.10)', text: '#c084fc', border: 'rgba(168,85,247,0.25)' },
  document: { bg: 'rgba(59,130,246,0.10)', text: '#60a5fa', border: 'rgba(59,130,246,0.25)' },
  spreadsheet: { bg: 'rgba(34,197,94,0.10)', text: '#4ade80', border: 'rgba(34,197,94,0.25)' },
  presentation: { bg: 'rgba(249,115,22,0.10)', text: '#fb923c', border: 'rgba(249,115,22,0.25)' },
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/* ===== 6b. Learning Library ===== */
export function LearningLibraryPage() {
  useLocale();
  const { data, loading } = useApiData<{ paths: any[]; total: number }>('/learning/library?limit=30', { paths: [], total: 0 });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<any>(null);
  const [search, setSearch] = useState('');
  const [subjectFilter, setSubjectFilter] = useState('all');
  const [levelFilter, setLevelFilter] = useState('all');
  const [sort, setSort] = useState('popular');
  const [forking, setForking] = useState(false);

  const paths: any[] = data?.paths || [];
  const subjects = useMemo(() => {
    const set = new Set(paths.map((p: any) => p.subject).filter(Boolean));
    return ['all', ...Array.from(set).sort()];
  }, [paths]);
  const filtered = paths.filter(p => {
    if (subjectFilter !== 'all' && p.subject !== subjectFilter) return false;
    if (levelFilter !== 'all' && p.level !== levelFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return p.title.toLowerCase().includes(q) || p.description?.toLowerCase().includes(q) || p.subject?.toLowerCase().includes(q);
    }
    return true;
  });

  const handleSelect = async (id: string) => {
    setSelectedId(id);
    try {
      const res = await fetch(`https://ava-supernova.com/api/learning/library/${id}`);
      const d = await res.json();
      if (d?.id) setDetail(d);
    } catch { /* */ }
  };

  const handleFork = async (id: string) => {
    setForking(true);
    try {
      const key = getPlatformKey();
      if (!key) return;
      await apiFetch(`/learning/library/${id}/fork`, { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' } });
    } catch { /* */ }
    setForking(false);
  };

  const levelColors: Record<string, { color: string; bg: string }> = {
    beginner: { color: '#34d399', bg: 'rgba(52,211,153,0.10)' },
    intermediate: { color: '#60a5fa', bg: 'rgba(96,165,250,0.10)' },
    advanced: { color: '#fbbf24', bg: 'rgba(251,191,36,0.10)' },
    mixed: { color: '#a78bfa', bg: 'rgba(167,139,250,0.10)' },
  };

  // Detail view
  if (selectedId && detail && detail.id === selectedId) {
    const lc = levelColors[detail.level] || levelColors.beginner;
    const modules = detail.content?.modules || [];
    return (
      <div style={pageWrapper}>
        <button onClick={() => { setSelectedId(null); setDetail(null); }} style={{ background: 'none', border: 'none', color: '#6c7086', cursor: 'pointer', fontSize: 13, marginBottom: 16, padding: 0 }}>
          &larr; Back to Library
        </button>
        <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
          <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 600, textTransform: 'uppercase' as const, color: detail.source === 'curated' ? '#a855f7' : '#60a5fa', background: detail.source === 'curated' ? 'rgba(168,85,247,0.1)' : 'rgba(96,165,250,0.1)' }}>
            {detail.source === 'curated' ? 'Curated by Ava' : 'Community'}
          </span>
          <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 600, textTransform: 'uppercase' as const, color: lc.color, background: lc.bg }}>{detail.level}</span>
          {detail.estimated_hours && <span style={{ fontSize: 11, color: '#6c7086' }}>{detail.estimated_hours}h</span>}
        </div>
        <div style={{ ...pageTitle, marginBottom: 4 }}>{detail.title}</div>
        {detail.author_name && <div style={{ fontSize: 12, color: '#6c7086', marginBottom: 8 }}>by {detail.author_name}</div>}
        <div style={{ fontSize: 13, color: '#a6adc8', lineHeight: 1.6, marginBottom: 16 }}>{detail.description}</div>
        <div style={{ display: 'flex', gap: 16, marginBottom: 20, fontSize: 12, color: '#6c7086' }}>
          <span>{detail.fork_count} learner{detail.fork_count !== 1 ? 's' : ''}</span>
          {detail.rating_count > 0 && <span>{(detail.rating_sum / detail.rating_count).toFixed(1)}/5 rating</span>}
          <span>{modules.length} modules</span>
          <span>{modules.reduce((s: number, m: any) => s + (m.lessons?.length || 0), 0)} lessons</span>
        </div>
        {detail.learning_objectives?.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={sectionTitle}>What you will learn</div>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: '#a6adc8', lineHeight: 1.8 }}>
              {detail.learning_objectives.map((obj: string, i: number) => <li key={i}>{obj}</li>)}
            </ul>
          </div>
        )}
        <div style={{ marginBottom: 20 }}>
          <div style={sectionTitle}>Curriculum</div>
          {modules.map((mod: any, mi: number) => (
            <div key={mi} style={{ ...card, marginBottom: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#cdd6f4', marginBottom: 4 }}>Module {mi + 1}: {mod.title}</div>
              {mod.description && <div style={{ fontSize: 11, color: '#6c7086', marginBottom: 6 }}>{mod.description}</div>}
              {(mod.lessons || []).map((l: any, li: number) => (
                <div key={li} style={{ fontSize: 12, color: '#a6adc8', padding: '2px 0', display: 'flex', gap: 6 }}>
                  <span>{l.type === 'concept' ? '\uD83D\uDCD6' : l.type === 'exercise' ? '\uD83D\uDCBB' : l.type === 'project' ? '\uD83D\uDEE0' : l.type === 'quiz' ? '\u2753' : '\uD83D\uDD04'}</span>
                  <span>{l.title}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
        <button onClick={() => handleFork(detail.id)} disabled={forking} style={{ padding: '10px 24px', borderRadius: 8, border: 'none', cursor: forking ? 'wait' : 'pointer', background: 'linear-gradient(135deg, #a855f7, #7c3aed)', color: '#fff', fontSize: 14, fontWeight: 500 }}>
          {forking ? 'Starting...' : 'Start Learning'}
        </button>
      </div>
    );
  }

  // List view
  return (
    <div style={pageWrapper}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <div style={pageTitle}>Learning Library</div>
        <button onClick={() => window.dispatchEvent(new CustomEvent('ava-navigate-dashboard', { detail: 'learning' }))} style={{ background: 'none', border: '1px solid rgba(168,85,247,0.12)', borderRadius: 6, padding: '4px 12px', color: '#a6adc8', cursor: 'pointer', fontSize: 11 }}>
          My Learning
        </button>
      </div>
      <div style={pageSubtitle}>Curated and community learning paths. Free for everyone.</div>

      <input
        type="text"
        placeholder="Search paths..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        style={{ ...inputStyle, marginBottom: 12 }}
      />

      {/* Subject filter tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' as const }}>
        {subjects.map(sub => (
          <button
            key={sub}
            onClick={() => setSubjectFilter(sub)}
            style={{
              padding: '4px 12px', borderRadius: 12, border: '1px solid rgba(168,85,247,0.12)', cursor: 'pointer',
              background: subjectFilter === sub ? 'linear-gradient(135deg, #a855f7, #7c3aed)' : 'transparent',
              color: subjectFilter === sub ? '#fff' : '#a6adc8',
              fontSize: 11, fontWeight: 500, transition: 'all 0.15s',
            }}
          >
            {sub === 'all' ? 'All' : sub}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <CustomSelect
          value={levelFilter}
          onChange={setLevelFilter}
          options={[
            { value: 'all', label: 'All levels' },
            { value: 'beginner', label: 'Beginner' },
            { value: 'intermediate', label: 'Intermediate' },
            { value: 'advanced', label: 'Advanced' },
            { value: 'mixed', label: 'Mixed' },
          ]}
          width={140}
          height={30}
        />
        <CustomSelect
          value={sort}
          onChange={setSort}
          options={[
            { value: 'popular', label: 'Most Popular' },
            { value: 'newest', label: 'Newest' },
            { value: 'rating', label: 'Highest Rated' },
          ]}
          width={140}
          height={30}
        />
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#6c7086' }}>Loading...</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#6c7086' }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>{'\uD83D\uDCDA'}</div>
          <div style={{ fontSize: 13 }}>No paths found.</div>
          <div style={{ fontSize: 11, marginTop: 4 }}>Try a different search or ask Ava to create a custom path.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map((p: any) => {
            const lc = levelColors[p.level] || levelColors.beginner;
            const avgRating = p.rating_count > 0 ? (p.rating_sum / p.rating_count).toFixed(1) : null;
            return (
              <button
                key={p.id}
                onClick={() => handleSelect(p.id)}
                style={{ ...card, textAlign: 'left' as const, cursor: 'pointer', border: '1px solid rgba(168,85,247,0.12)', transition: 'border-color 0.2s' }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(168,85,247,0.3)')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(168,85,247,0.12)')}
              >
                <div style={{ display: 'flex', gap: 6, marginBottom: 6, flexWrap: 'wrap' as const }}>
                  <span style={{ padding: '1px 6px', borderRadius: 3, fontSize: 9, fontWeight: 600, textTransform: 'uppercase' as const, color: p.source === 'curated' ? '#a855f7' : '#60a5fa', background: p.source === 'curated' ? 'rgba(168,85,247,0.1)' : 'rgba(96,165,250,0.1)' }}>
                    {p.source === 'curated' ? 'Curated' : 'Community'}
                  </span>
                  <span style={{ padding: '1px 6px', borderRadius: 3, fontSize: 9, fontWeight: 600, textTransform: 'uppercase' as const, color: lc.color, background: lc.bg }}>{p.level}</span>
                  {p.subject && (
                    <span style={{ padding: '1px 6px', borderRadius: 3, fontSize: 9, fontWeight: 500, color: '#cdd6f4', background: 'rgba(205,214,244,0.08)', border: '1px solid rgba(205,214,244,0.1)' }}>{p.subject}</span>
                  )}
                </div>
                <div style={{ fontSize: 14, fontWeight: 500, color: '#cdd6f4', marginBottom: 4 }}>{p.title}</div>
                <div style={{ fontSize: 12, color: '#a6adc8', lineHeight: 1.5, marginBottom: 8 }}>{p.description?.slice(0, 120)}{(p.description?.length || 0) > 120 ? '...' : ''}</div>
                <div style={{ display: 'flex', gap: 12, fontSize: 11, color: '#6c7086' }}>
                  {p.estimated_hours && <span>{p.estimated_hours}h</span>}
                  <span>{p.fork_count} learner{p.fork_count !== 1 ? 's' : ''}</span>
                  {avgRating && <span>{'\u2605'} {avgRating}/5</span>}
                  {p.author_name && <span>by {p.author_name}</span>}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function LibraryPage() {
  useLocale();
  const [, setAuthKey] = useState(0);
  useEffect(() => {
    const handler = () => { if (!checkConnected()) { setFiles([]); setSelectedFile(null); } setAuthKey(k => k + 1); };
    window.addEventListener('ava-auth-changed', handler);
    return () => window.removeEventListener('ava-auth-changed', handler);
  }, []);
  const connected = checkConnected();
  const [files, setFiles] = useState<LibraryFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<LibraryFileType | 'all'>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedFile, setSelectedFile] = useState<LibraryFile | null>(null);

  // Fetch files from platform API
  useEffect(() => {
    if (!connected) { setLoading(false); return; }
    setLoading(true);
    apiFetch('/library')
      .then((res) => res.json())
      .then((data) => {
        const items = Array.isArray(data) ? data : data?.files || [];
        setFiles(items.map((f: any) => ({
          name: f.name || f.filename || '',
          path: f.path || f.url || '',
          folder: f.folder || f.directory || '',
          type: f.type || f.fileType || detectFileType(f.name || f.filename || ''),
          size: f.size || 0,
          modified: f.modified || f.updated_at || f.created_at || '',
          url: f.url || f.download_url || '',
        })));
      })
      .catch(() => setFiles([]))
      .finally(() => setLoading(false));
  }, [connected]);

  const detectFileType = (name: string): LibraryFileType => {
    const ext = '.' + name.split('.').pop()?.toLowerCase();
    return FILE_TYPE_EXTENSIONS[ext] || 'document';
  };

  const filtered = filter === 'all' ? files : files.filter((f) => f.type === filter);

  const typeCounts = useMemo(() => ({
    all: files.length,
    image: files.filter((f) => f.type === 'image').length,
    document: files.filter((f) => f.type === 'document').length,
    spreadsheet: files.filter((f) => f.type === 'spreadsheet').length,
    presentation: files.filter((f) => f.type === 'presentation').length,
  }), [files]);

  return (
    <div style={{ ...pageWrapper, display: 'flex', flexDirection: 'column', gap: 0, padding: 0, height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '24px 32px 0', flexShrink: 0 }}>
        <h1 style={pageTitle}>{t('dash.library.title')}</h1>
        <p style={{ ...pageSubtitle, marginBottom: 20 }}>{t('dash.library.subtitle')}</p>

        {/* Filter tabs + view toggle */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div style={{ display: 'flex', gap: 6 }}>
            {([
              { id: 'all', label: t('dash.library.all'), count: typeCounts.all },
              { id: 'image', label: t('dash.library.images'), count: typeCounts.image },
              { id: 'document', label: t('dash.library.docs'), count: typeCounts.document },
              { id: 'spreadsheet', label: t('dash.library.sheets'), count: typeCounts.spreadsheet },
              { id: 'presentation', label: t('dash.library.slides'), count: typeCounts.presentation },
            ] as { id: LibraryFileType | 'all'; label: string; count: number }[]).map((tab) => (
              <button
                key={tab.id}
                onClick={() => setFilter(tab.id)}
                style={{
                  padding: '6px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
                  fontSize: 12, fontWeight: filter === tab.id ? 600 : 400,
                  background: filter === tab.id ? 'rgba(168,85,247,0.2)' : 'rgba(26, 16, 40, 0.6)',
                  color: filter === tab.id ? '#e0b0ff' : '#6c7086',
                  display: 'flex', alignItems: 'center', gap: 6,
                }}
              >
                {tab.label}
                <span style={{
                  fontSize: 10, padding: '1px 6px', borderRadius: 10,
                  background: filter === tab.id ? 'rgba(168,85,247,0.3)' : 'rgba(49, 34, 68, 0.5)',
                  color: filter === tab.id ? '#fff' : '#6c7086',
                }}>{tab.count}</span>
              </button>
            ))}
          </div>

          {/* View toggle */}
          <div style={{ display: 'flex', gap: 4, background: 'rgba(26, 16, 40, 0.6)', borderRadius: 8, padding: 3 }}>
            {(['grid', 'list'] as const).map((v) => (
              <button
                key={v}
                onClick={() => setViewMode(v)}
                style={{
                  padding: '5px 10px', borderRadius: 6, border: 'none', cursor: 'pointer',
                  background: viewMode === v ? 'rgba(168,85,247,0.2)' : 'transparent',
                  color: viewMode === v ? '#e0b0ff' : '#6c7086', fontSize: 11, fontWeight: 500,
                }}
              >
                {v === 'grid' ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
                    <rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
                  </svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" />
                    <line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
                  </svg>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 32px 32px' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#6c7086' }}>
            <div style={{ fontSize: 13 }}>{t('dash.library.scanning')}</div>
          </div>
        ) : !connected ? (
          <div style={{ ...card, textAlign: 'center', padding: 60 }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>{'\uD83D\uDDBC\uFE0F'}</div>
            <div style={{ fontSize: 14, color: '#cdd6f4', fontWeight: 500, marginBottom: 6 }}>{t('dash.library.connect')}</div>
            <div style={{ fontSize: 12, color: '#6c7086' }}>{t('dash.library.empty')}</div>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ ...card, textAlign: 'center', padding: 60 }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>{filter === 'all' ? '\uD83D\uDCC1' : FILE_TYPE_ICONS[filter as LibraryFileType]}</div>
            <div style={{ fontSize: 14, color: '#cdd6f4', fontWeight: 500, marginBottom: 6 }}>
              {t('dash.library.no_files')}
            </div>
            <div style={{ fontSize: 12, color: '#6c7086' }}>
              {t('dash.library.ask_ava')}
            </div>
          </div>
        ) : viewMode === 'grid' ? (
          /* Grid view */
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
            {filtered.map((file, i) => {
              const colors = FILE_TYPE_COLORS[file.type];
              const isSelected = selectedFile?.path === file.path;
              return (
                <div
                  key={i}
                  onClick={() => setSelectedFile(isSelected ? null : file)}
                  style={{
                    background: 'rgba(26, 16, 40, 0.6)', border: `1px solid ${isSelected ? colors.border : 'rgba(168, 85, 247, 0.12)'}`,
                    borderRadius: 10, overflow: 'hidden', cursor: 'pointer',
                    transition: 'border-color 0.2s, transform 0.15s',
                  }}
                >
                  {/* Thumbnail area */}
                  <div style={{
                    height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: colors.bg, position: 'relative',
                  }}>
                    {file.type === 'image' && file.url ? (
                      <img src={file.url} alt={file.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <span style={{ fontSize: 36 }}>{FILE_TYPE_ICONS[file.type]}</span>
                    )}
                    {/* Type badge */}
                    <span style={{
                      position: 'absolute', top: 8, right: 8, fontSize: 9, fontWeight: 600,
                      padding: '2px 8px', borderRadius: 6, background: 'rgba(0,0,0,0.6)',
                      color: colors.text, textTransform: 'uppercase', letterSpacing: 0.5,
                    }}>{file.type}</span>
                  </div>
                  {/* File info */}
                  <div style={{ padding: '10px 12px' }}>
                    <div style={{
                      fontSize: 12, fontWeight: 500, color: '#cdd6f4',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 4,
                    }}>{file.name}</div>
                    <div style={{ fontSize: 10, color: '#6c7086', display: 'flex', justifyContent: 'space-between' }}>
                      <span>{formatFileSize(file.size)}</span>
                      {file.modified && <span>{new Date(file.modified).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })}</span>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* List view */
          <div style={{ background: 'rgba(26, 16, 40, 0.6)', border: '1px solid rgba(168, 85, 247, 0.12)', borderRadius: 10, overflow: 'hidden' }}>
            {filtered.map((file, i) => {
              const colors = FILE_TYPE_COLORS[file.type];
              const isSelected = selectedFile?.path === file.path;
              return (
                <div
                  key={i}
                  onClick={() => setSelectedFile(isSelected ? null : file)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px',
                    borderBottom: i < filtered.length - 1 ? '1px solid rgba(168, 85, 247, 0.12)' : 'none',
                    background: isSelected ? 'rgba(168,85,247,0.08)' : 'transparent',
                    cursor: 'pointer', transition: 'background 0.15s',
                  }}
                >
                  {/* Icon */}
                  <div style={{
                    width: 36, height: 36, borderRadius: 8, flexShrink: 0,
                    background: colors.bg, border: `1px solid ${colors.border}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18,
                  }}>{FILE_TYPE_ICONS[file.type]}</div>
                  {/* Name + folder */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 13, fontWeight: 500, color: '#cdd6f4',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>{file.name}</div>
                    {file.folder && (
                      <div style={{ fontSize: 11, color: '#6c7086', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {file.folder}
                      </div>
                    )}
                  </div>
                  {/* Type badge */}
                  <span style={{
                    fontSize: 10, fontWeight: 500, padding: '3px 8px', borderRadius: 6,
                    background: colors.bg, color: colors.text, border: `1px solid ${colors.border}`,
                    textTransform: 'capitalize', flexShrink: 0,
                  }}>{file.type}</span>
                  {/* Size */}
                  <span style={{ fontSize: 11, color: '#6c7086', fontFamily: 'monospace', flexShrink: 0, width: 60, textAlign: 'right' }}>
                    {formatFileSize(file.size)}
                  </span>
                  {/* Date */}
                  <span style={{ fontSize: 11, color: '#6c7086', flexShrink: 0, width: 80, textAlign: 'right' }}>
                    {file.modified ? new Date(file.modified).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }) : ''}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Selected file detail panel */}
      {selectedFile && (
        <div style={{
          borderTop: '1px solid rgba(168, 85, 247, 0.12)', background: 'rgba(26, 16, 40, 0.6)', padding: '16px 32px',
          flexShrink: 0, display: 'flex', alignItems: 'center', gap: 16,
        }}>
          <div style={{
            width: 48, height: 48, borderRadius: 10, flexShrink: 0,
            background: FILE_TYPE_COLORS[selectedFile.type].bg,
            border: `1px solid ${FILE_TYPE_COLORS[selectedFile.type].border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24,
          }}>{FILE_TYPE_ICONS[selectedFile.type]}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#cdd6f4', marginBottom: 2 }}>{selectedFile.name}</div>
            <div style={{ fontSize: 11, color: '#6c7086', display: 'flex', gap: 16 }}>
              <span>{selectedFile.type}</span>
              <span>{formatFileSize(selectedFile.size)}</span>
              {selectedFile.folder && <span>{selectedFile.folder}</span>}
              {selectedFile.modified && <span>{new Date(selectedFile.modified).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })}</span>}
            </div>
          </div>
          {selectedFile.url && (
            <a
              href={selectedFile.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                background: 'linear-gradient(135deg, #a855f7, #7c3aed)', color: '#fff',
                textDecoration: 'none', flexShrink: 0,
              }}
            >
              {t('dash.library.open')}
            </a>
          )}
          <button
            onClick={() => setSelectedFile(null)}
            style={{
              padding: '8px 12px', borderRadius: 8, border: '1px solid #45475a',
              background: 'transparent', color: '#6c7086', fontSize: 12, cursor: 'pointer',
              flexShrink: 0,
            }}
          >{t('dash.library.close')}</button>
        </div>
      )}
    </div>
  );
}

/* ===== 8. Personality ===== */
export function PersonalityPage() {
  useLocale();
  const [authKey, setAuthKey] = useState(0);
  useEffect(() => {
    const handler = () => {
      if (!checkConnected()) { setTone('warm'); setEnergy('enthusiastic'); setStyle('conversational'); setDescription(''); }
      setAuthKey(k => k + 1);
    };
    window.addEventListener('ava-auth-changed', handler);
    return () => window.removeEventListener('ava-auth-changed', handler);
  }, []);
  void authKey;
  const connected = checkConnected();
  const [tone, setTone] = useState('warm');
  const [energy, setEnergy] = useState('enthusiastic');
  const [style, setStyle] = useState('conversational');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const TONES = [
    { value: 'warm', label: t('dash.personality.tone.warm'), desc: t('dash.personality.tone.warm_desc') },
    { value: 'direct', label: t('dash.personality.tone.direct'), desc: t('dash.personality.tone.direct_desc') },
    { value: 'playful', label: t('dash.personality.tone.playful'), desc: t('dash.personality.tone.playful_desc') },
    { value: 'professional', label: t('dash.personality.tone.professional'), desc: t('dash.personality.tone.professional_desc') },
    { value: 'dry-wit', label: t('dash.personality.tone.dry'), desc: t('dash.personality.tone.dry_desc') },
  ];

  const ENERGIES = [
    { value: 'calm', label: t('dash.personality.energy.calm'), desc: t('dash.personality.energy.calm_desc') },
    { value: 'enthusiastic', label: t('dash.personality.energy.enthusiastic'), desc: t('dash.personality.energy.enthusiastic_desc') },
    { value: 'measured', label: t('dash.personality.energy.measured'), desc: t('dash.personality.energy.measured_desc') },
    { value: 'excitable', label: t('dash.personality.energy.excitable'), desc: t('dash.personality.energy.excitable_desc') },
  ];

  const STYLES = [
    { value: 'concise', label: t('dash.personality.style.concise'), desc: t('dash.personality.style.concise_desc') },
    { value: 'detailed', label: t('dash.personality.style.detailed'), desc: t('dash.personality.style.detailed_desc') },
    { value: 'conversational', label: t('dash.personality.style.conversational'), desc: t('dash.personality.style.conversational_desc') },
    { value: 'structured', label: t('dash.personality.style.structured'), desc: t('dash.personality.style.structured_desc') },
  ];

  // Local-first: load from localStorage, then override with cloud if available
  useEffect(() => {
    try {
      const local = localStorage.getItem('ava-ide-personality');
      if (local) {
        const p = JSON.parse(local);
        if (p.tone) setTone(p.tone);
        if (p.energy) setEnergy(p.energy);
        if (p.style) setStyle(p.style);
        if (p.description) setDescription(p.description);
      }
    } catch {}
    if (!connected) { setLoading(false); return; }
    apiFetch('/settings')
      .then((data: any) => {
        const p = data.personality || data;
        if (p.tone) setTone(p.tone);
        if (p.energy) setEnergy(p.energy);
        if (p.style || p.communication_style) setStyle(p.style || p.communication_style);
        if (p.description) setDescription(p.description);
        setLoading(false);
      })
      .catch(() => { setLoading(false); });
  }, [connected]);

  const handleSave = async () => {
    // Always save locally
    try { localStorage.setItem('ava-ide-personality', JSON.stringify({ tone, energy, style, description })); } catch {}

    setSaving(true);
    if (connected) {
      try {
        await apiFetch('/settings', {
          method: 'POST',
          body: JSON.stringify({
            personality: { name: 'Ava', pronouns: 'she/her', tone, energy, style, description },
            personality_name: 'Ava',
            pronouns: 'she/her', tone, energy,
            communication_style: style,
            description,
          }),
        });
      } catch { /* local save stands */ }
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
    setSaving(false);
  };

  const handleReset = async () => {
    setTone('warm');
    setEnergy('enthusiastic');
    setStyle('conversational');
    setDescription('');
    if (connected) {
      try {
        await apiFetch('/settings', {
          method: 'POST',
          body: JSON.stringify({
            personality: { name: 'Ava', pronouns: 'she/her', tone: 'warm', energy: 'enthusiastic', style: 'conversational', description: '' },
          }),
        });
      } catch { /* ignore */ }
    }
  };

  const toneLabel = TONES.find(t => t.value === tone)?.label?.toLowerCase() ?? tone;
  const energyLabel = ENERGIES.find(e => e.value === energy)?.label?.toLowerCase() ?? energy;
  const styleLabel = STYLES.find(s => s.value === style)?.label?.toLowerCase() ?? style;

  const sectionLabelStyle: React.CSSProperties = {
    fontSize: 10, fontWeight: 600, color: '#6c7086',
    textTransform: 'uppercase' as const, letterSpacing: 1.2, marginBottom: 10,
  };

  const optionCard = (selected: boolean): React.CSSProperties => ({
    display: 'flex', flexDirection: 'column', alignItems: 'flex-start', position: 'relative',
    padding: '14px 16px', borderRadius: 12, cursor: 'pointer', textAlign: 'left',
    border: selected ? '1px solid #a855f7' : '1px solid rgba(168, 85, 247, 0.12)',
    background: selected ? 'rgba(168,85,247,0.08)' : 'rgba(49, 34, 68, 0.5)',
    boxShadow: selected ? '0 0 16px rgba(168,85,247,0.15)' : 'none',
    transition: 'all 0.15s',
  });

  if (loading) return <div style={pageWrapper}><LoadingSpinner /></div>;

  return (
    <div style={pageWrapper}>
      <div style={{ width: '100%' }}>
        {/* Header */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ fontSize: 22, fontWeight: 600, color: '#cdd6f4' }}>{t('dash.personality.title')}</div>
          <div style={{ fontSize: 13, color: '#6c7086', marginTop: 4 }}>
            {t('dash.personality.subtitle')}
          </div>
        </div>

        {!connected && <NotConnectedBanner />}

        {/* Tone */}
        <div style={{ marginBottom: 24 }}>
          <div style={sectionLabelStyle}>{t('dash.personality.tone')}</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            {TONES.map(t => (
              <button key={t.value} onClick={() => setTone(t.value)} style={optionCard(tone === t.value)}>
                <span style={{ fontSize: 13, fontWeight: 600, color: tone === t.value ? '#fff' : '#a6adc8' }}>{t.label}</span>
                <span style={{ fontSize: 11, color: '#6c7086', marginTop: 4, lineHeight: 1.4 }}>{t.desc}</span>
                {tone === t.value && (
                  <span style={{
                    position: 'absolute', right: 10, top: 10, width: 16, height: 16,
                    borderRadius: '50%', background: '#a855f7',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Energy */}
        <div style={{ marginBottom: 24 }}>
          <div style={sectionLabelStyle}>{t('dash.personality.energy')}</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {ENERGIES.map(e => (
              <button key={e.value} onClick={() => setEnergy(e.value)} style={optionCard(energy === e.value)}>
                <span style={{ fontSize: 13, fontWeight: 600, color: energy === e.value ? '#fff' : '#a6adc8' }}>{e.label}</span>
                <span style={{ fontSize: 11, color: '#6c7086', marginTop: 4, lineHeight: 1.4 }}>{e.desc}</span>
                {energy === e.value && (
                  <span style={{
                    position: 'absolute', right: 10, top: 10, width: 16, height: 16,
                    borderRadius: '50%', background: '#a855f7',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Communication Style */}
        <div style={{ marginBottom: 24 }}>
          <div style={sectionLabelStyle}>{t('dash.personality.style')}</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {STYLES.map(s => (
              <button key={s.value} onClick={() => setStyle(s.value)} style={optionCard(style === s.value)}>
                <span style={{ fontSize: 13, fontWeight: 600, color: style === s.value ? '#fff' : '#a6adc8' }}>{s.label}</span>
                <span style={{ fontSize: 11, color: '#6c7086', marginTop: 4, lineHeight: 1.4 }}>{s.desc}</span>
                {style === s.value && (
                  <span style={{
                    position: 'absolute', right: 10, top: 10, width: 16, height: 16,
                    borderRadius: '50%', background: '#a855f7',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Description */}
        <div style={{ marginBottom: 24 }}>
          <div style={sectionLabelStyle}>Description</div>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="e.g. Like a patient older brother who's been coding for 20 years"
            rows={3}
            style={{
              width: '100%', background: 'rgba(49, 34, 68, 0.5)', border: '1px solid rgba(168, 85, 247, 0.12)', borderRadius: 10,
              padding: '12px 14px', fontSize: 13, color: '#cdd6f4', outline: 'none', resize: 'none',
              lineHeight: 1.6, fontFamily: 'inherit',
            }}
            onFocus={e => { e.currentTarget.style.borderColor = '#a855f7'; }}
            onBlur={e => { e.currentTarget.style.borderColor = 'rgba(168, 85, 247, 0.12)'; }}
          />
          <div style={{ fontSize: 11, color: '#6c7086', marginTop: 6 }}>
            Optional. Describe the vibe in your own words and your AI will embody it.
          </div>
        </div>

        {/* Live Preview */}
        <div style={{
          background: 'rgba(49, 34, 68, 0.5)', border: '1px solid rgba(168, 85, 247, 0.12)', borderRadius: 12,
          padding: '20px', marginBottom: 28,
        }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: '#6c7086', textTransform: 'uppercase' as const, letterSpacing: 1.2, marginBottom: 8 }}>
            Preview
          </div>
          <div style={{ fontSize: 13, color: '#cdd6f4' }}>
            <span style={{ fontWeight: 600, color: '#a855f7' }}>Ava</span>{' '}
            will be {toneLabel}, {energyLabel}, and {styleLabel}.
          </div>
          {description && (
            <div style={{ fontSize: 12, color: '#a6adc8', fontStyle: 'italic', marginTop: 8 }}>
              &ldquo;{description}&rdquo;
            </div>
          )}
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={handleSave}
            disabled={saving || !connected}
            style={{
              ...btnPrimary, padding: '10px 24px', fontSize: 13, borderRadius: 10,
              opacity: (saving || !connected) ? 0.6 : 1,
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#9333ea'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#a855f7'; }}
          >
            {saved ? t('dash.personality.saved') : saving ? t('dash.personality.saving') : t('dash.personality.save')}
          </button>
          <button
            onClick={handleReset}
            style={{
              ...btnSecondary, padding: '10px 20px', fontSize: 13, borderRadius: 10,
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = '#6c7086'; (e.currentTarget as HTMLElement).style.color = '#cdd6f4'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(168, 85, 247, 0.12)'; (e.currentTarget as HTMLElement).style.color = '#a6adc8'; }}
          >
            {t('dash.personality.reset')}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ===== 8. Cloud Sync ===== */
export function CloudSyncPage() {
  useLocale();
  const [authKey, setAuthKey] = useState(0);
  useEffect(() => {
    const handler = () => {
      if (!checkConnected()) { setCounts({}); setSyncResults({}); setSyncingTypes(new Set()); }
      setAuthKey(k => k + 1);
    };
    window.addEventListener('ava-auth-changed', handler);
    return () => window.removeEventListener('ava-auth-changed', handler);
  }, []);
  void authKey;
  const connected = checkConnected();
  const [syncingTypes, setSyncingTypes] = useState<Set<string>>(new Set());
  const [syncResults, setSyncResults] = useState<Record<string, { success: boolean; count?: number; error?: string }>>({});

  // Per-section sync toggles (local-first, persisted to localStorage)
  const [syncPrefs, setSyncPrefs] = useState<Record<string, boolean>>(() => {
    try { const raw = localStorage.getItem('ava-ide-sync-prefs'); return raw ? JSON.parse(raw) : {}; } catch { return {}; }
  });
  const togglePref = (key: string) => {
    setSyncPrefs(prev => {
      const next = { ...prev, [key]: !(prev[key] ?? (key === 'shared' ? false : true)) };
      try { localStorage.setItem('ava-ide-sync-prefs', JSON.stringify(next)); } catch {}
      return next;
    });
  };
  const isSyncEnabled = (key: string) => syncPrefs[key] ?? (key === 'shared' ? false : true);

  const DATA_TYPES = [
    { key: 'memory',      label: t('dash.sync.memory'),           icon: '\uD83E\uDDE0', description: t('dash.sync.memory_desc'),    endpoint: '/memories' },
    { key: 'tasks',       label: t('dash.sync.tasks'),            icon: '\u2713',       description: t('dash.sync.tasks_desc'),     endpoint: '/tasks' },
    { key: 'journal',     label: t('dash.sync.journal'),          icon: '\uD83D\uDCD6', description: t('dash.sync.journal_desc'), endpoint: '/journal' },
    { key: 'learning',    label: t('dash.nav.learning'),         icon: '\uD83C\uDF93', description: t('dash.nav.learning_desc'),              endpoint: '/learning' },
    { key: 'history',     label: t('dash.sync.chat_history'),     icon: '\uD83D\uDCAC', description: t('dash.sync.chat_history_desc'),                          endpoint: '/history' },
    { key: 'settings',    label: t('dash.sync.settings'),         icon: '\u2699',       description: t('dash.sync.settings_desc'),           endpoint: '/settings' },
    { key: 'personality', label: t('dash.sync.personality'),      icon: '\uD83C\uDFAD', description: t('dash.sync.personality_desc'),       endpoint: '/settings' },
    { key: 'shared',      label: t('dash.sync.shared_learnings'), icon: '\uD83D\uDCA1', description: t('dash.sync.shared_learnings_desc'),        endpoint: '/shared-learnings' },
  ];

  const [counts, setCounts] = useState<Record<string, { local: number; cloud: number; lastSynced?: string }>>({});

  useEffect(() => {
    if (!connected) return;
    const fetchCounts = async () => {
      const results: Record<string, { local: number; cloud: number; lastSynced?: string }> = {};
      for (const dt of DATA_TYPES) {
        try {
          const data = await apiFetch(dt.endpoint);
          const count = Array.isArray(data) ? data.length : (data?.count || data?.total || (data ? 1 : 0));
          results[dt.key] = { local: count, cloud: count, lastSynced: new Date().toISOString() };
        } catch {
          results[dt.key] = { local: 0, cloud: 0 };
        }
      }
      setCounts(results);
    };
    fetchCounts();
  }, [connected]);

  const handlePush = async (key: string, endpoint: string) => {
    if (!connected) return;
    setSyncingTypes(prev => new Set(prev).add(key));
    try {
      const data = await apiFetch(endpoint);
      const count = Array.isArray(data) ? data.length : (data?.count || data?.total || 1);
      setSyncResults(prev => ({ ...prev, [key]: { success: true, count } }));
      setCounts(prev => ({
        ...prev,
        [key]: { ...prev[key], local: count, cloud: count, lastSynced: new Date().toISOString() },
      }));
    } catch (err: any) {
      setSyncResults(prev => ({ ...prev, [key]: { success: false, error: err.message || 'Failed' } }));
    }
    setSyncingTypes(prev => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  };

  const handlePushAll = () => {
    for (const dt of DATA_TYPES) {
      if (!isSyncEnabled(dt.key)) continue; // Respect toggles
      const c = counts[dt.key];
      if (c && c.local > 0) {
        handlePush(dt.key, dt.endpoint);
      }
    }
  };

  return (
    <div style={pageWrapper}>
      <div style={{ width: '100%' }}>
        <div style={{ marginBottom: 8 }}>
          <div style={pageTitle}>{t('dash.sync.title')}</div>
          <div style={pageSubtitle}>
            {t('dash.sync.subtitle')}
          </div>
        </div>

        {!connected && (
          <div style={{
            background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.20)',
            borderRadius: 10, padding: '12px 16px', fontSize: 12, color: '#f59e0b', marginBottom: 20,
          }}>
            {t('dash.sync.connect_to_sync')}
          </div>
        )}

        {/* Data type rows */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {DATA_TYPES.map(({ key, label, icon, description, endpoint }) => {
            const c = counts[key] || { local: 0, cloud: 0 };
            const isSyncing = syncingTypes.has(key);
            const result = syncResults[key];
            const isUpToDate = c.local > 0 && c.local === c.cloud && c.lastSynced;
            const lastSynced = c.lastSynced;

            return (
              <div key={key} style={{
                background: 'rgba(26, 16, 40, 0.6)', border: '1px solid rgba(168, 85, 247, 0.12)', borderRadius: 10,
                padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
                  {/* Sync toggle */}
                  <button
                    onClick={() => togglePref(key)}
                    style={{
                      width: 32, height: 18, borderRadius: 9, flexShrink: 0, position: 'relative', cursor: 'pointer', border: 'none',
                      background: isSyncEnabled(key) ? '#a855f7' : 'rgba(49, 34, 68, 0.5)', transition: 'background 0.2s',
                    }}
                    title={isSyncEnabled(key) ? `Disable ${label} sync` : `Enable ${label} sync`}
                  >
                    <div style={{
                      width: 14, height: 14, borderRadius: '50%', background: '#fff', position: 'absolute', top: 2,
                      left: isSyncEnabled(key) ? 16 : 2, transition: 'left 0.2s',
                    }} />
                  </button>
                  <span style={{ fontSize: 20, flexShrink: 0, width: 28, textAlign: 'center', opacity: isSyncEnabled(key) ? 1 : 0.3 }}>{icon}</span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 13, fontWeight: 500, color: '#cdd6f4' }}>{label}</span>
                      {isUpToDate && (
                        <span style={{
                          fontSize: 10, color: '#34d399', background: 'rgba(52,211,153,0.10)',
                          padding: '2px 8px', borderRadius: 4,
                        }}>
                          &#10003; Up to date
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                      <span style={{
                        fontSize: 10, color: '#6c7086', background: 'rgba(49, 34, 68, 0.5)',
                        padding: '2px 8px', borderRadius: 4,
                      }}>
                        Your device: {c.local}
                      </span>
                      <span style={{
                        fontSize: 10, color: '#6c7086', background: 'rgba(49, 34, 68, 0.5)',
                        padding: '2px 8px', borderRadius: 4,
                      }}>
                        Cloud: {c.cloud}
                      </span>
                    </div>
                    <div style={{ fontSize: 11, color: '#6c7086', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {description}
                      {lastSynced && (
                        <span style={{ opacity: 0.6, marginLeft: 4 }}>
                          &middot; Last synced {new Date(lastSynced).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, marginLeft: 16 }}>
                  {result && !isSyncing && (
                    <span style={{ fontSize: 11, color: result.success ? '#34d399' : '#f87171' }}>
                      {result.success ? `Synced ${result.count ?? 0}` : (result.error || 'Failed')}
                    </span>
                  )}
                  <button
                    onClick={() => handlePush(key, endpoint)}
                    disabled={!connected || isSyncing || c.local === 0 || !isSyncEnabled(key)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      background: '#a855f7', border: 'none', borderRadius: 8,
                      padding: '7px 14px', fontSize: 12, fontWeight: 500, color: '#fff',
                      cursor: 'pointer', opacity: (!connected || isSyncing || c.local === 0) ? 0.3 : 1,
                      transition: 'opacity 0.15s',
                    }}
                    onMouseEnter={e => { if (connected && !isSyncing) (e.currentTarget as HTMLElement).style.background = '#9333ea'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#a855f7'; }}
                  >
                    {isSyncing ? (
                      <>
                        <div style={{
                          width: 12, height: 12, border: '2px solid rgba(255,255,255,0.3)',
                          borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite',
                        }} />
                        Pushing...
                      </>
                    ) : isUpToDate ? (
                      <>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M4.5 12.75l6 6 9-13.5" />
                        </svg>
                        Synced
                      </>
                    ) : (
                      <>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z" />
                        </svg>
                        {t('dash.sync.sync_now')}
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Push All */}
        {connected && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
            <button
              onClick={handlePushAll}
              disabled={syncingTypes.size > 0}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                background: 'rgba(168,85,247,0.08)', border: '1px solid rgba(168,85,247,0.30)',
                borderRadius: 10, padding: '9px 18px', fontSize: 12, fontWeight: 500,
                color: '#a855f7', cursor: 'pointer', opacity: syncingTypes.size > 0 ? 0.3 : 1,
                transition: 'all 0.15s',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(168,85,247,0.15)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(168,85,247,0.08)'; }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z" />
              </svg>
              Push All to Cloud
            </button>
          </div>
        )}

        {/* How it works */}
        <div style={{
          background: 'rgba(26, 16, 40, 0.6)', border: '1px solid rgba(168, 85, 247, 0.12)', borderRadius: 10,
          padding: '16px 20px', marginTop: 28,
        }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#cdd6f4', marginBottom: 8 }}>How it works</div>
          <ul style={{ margin: 0, paddingLeft: 16 }}>
            {[
              'All data is saved locally by default \u2014 nothing leaves your machine automatically',
              'Push to Cloud sends your local data to the platform for cross-device access',
              'Your companion app and web dashboard will show the synced data',
              'You control what syncs and when \u2014 complete privacy by default',
            ].map((text, i) => (
              <li key={i} style={{ fontSize: 11, color: '#6c7086', lineHeight: 1.8 }}>{text}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

/* ===== 9. Usage ===== */
export function UsagePage() {
  useLocale();
  const connected = checkConnected();
  const [activeTab, setActiveTab] = useState<'session' | 'alltime' | 'audit'>('session');
  const { data: usage, loading, error } = useApiData<any>('/usage/summary', null);

  // Audit log state
  const [auditEntries, setAuditEntries] = useState<any[]>([]);
  const [auditExpanded, setAuditExpanded] = useState<number | null>(null);

  // Listen for audit events forwarded from sidecar event handler
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.event === 'audit_log' && Array.isArray(detail.entries)) {
        setAuditEntries(detail.entries);
      }
      if (detail?.event === 'audit_entry' && detail.entry) {
        setAuditEntries(prev => [...prev, detail.entry].slice(-500));
      }
    };
    window.addEventListener('ava-audit-event', handler);
    return () => window.removeEventListener('ava-audit-event', handler);
  }, []);

  // Live session stats from shared store
  const [session, setSession] = useState<SessionStats>(getSessionStats);
  useEffect(() => {
    const handler = (e: Event) => setSession({ ...(e as CustomEvent).detail });
    window.addEventListener('ava-session-stats', handler);
    return () => window.removeEventListener('ava-session-stats', handler);
  }, []);

  // Map from unified /usage/summary response (for All-Time tab)
  const period = usage?.period || {};
  const totals = usage?.totals || {};

  // Session tab uses live local data; All-Time uses API
  const totalTokens = activeTab === 'session' ? session.totalTokens : (period.free_tokens_used || 0) + (period.tokens_used || 0);
  const inputTokens = activeTab === 'session' ? session.inputTokens : Math.round(totalTokens * 0.6);
  const outputTokens = activeTab === 'session' ? session.outputTokens : totalTokens - inputTokens;
  const messages = activeTab === 'session' ? session.messages : (period.requests_count || totals.requests || 0);
  const toolCalls = activeTab === 'session' ? session.toolCalls : 0;

  // All-time from totals
  const freeUsed = period.free_tokens_used || 0;
  const freeLimit = period.free_tokens_limit || 3000000;
  const subUsed = period.tokens_used || 0;
  const subLimit = period.tokens_limit || 0;
  const tokensMonth = totals.tokens || 0;
  const tokensLastMonth = 0; // not in API yet
  const avgPerSession = messages > 0 ? Math.round(tokensMonth / Math.max(messages, 1)) : 0;
  const totalSessions = totals.requests || 0;

  // Session tab: model breakdown from local tracking; All-Time: from API
  const sessionModels = Object.entries(session.models).map(([name, m]) => ({
    model: name, input_tokens: m.input, output_tokens: m.output, requests: m.requests,
  }));
  const models: any[] = activeTab === 'session' ? sessionModels : (usage?.models || []);
  const daily: any[] = usage?.daily || [];
  const maxDaily = daily.length > 0 ? Math.max(...daily.map((d: any) => d.tokens || 0)) : 1;
  const today = new Date().toISOString().slice(0, 10);

  // Balance — free tier shows free pool only, paid tiers show subscription pool
  const isUnlimited = usage?.isUnlimited || false;
  const hasSub = subLimit > 0 && (usage?.tier || 'free') !== 'free';
  const balanceUsed = hasSub ? subUsed : freeUsed;
  const balanceLimit = hasSub ? subLimit : freeLimit;
  const balanceRemaining = Math.max(0, balanceLimit - balanceUsed);
  const remainPct = isUnlimited ? 100 : (balanceLimit > 0 ? Math.min((balanceRemaining / balanceLimit) * 100, 100) : 0);

  // Cost estimate
  const MODEL_PRICING: Record<string, { input: number; output: number }> = {
    'qwen3-omni-flash': { input: 0.065, output: 0.26 },
    'qwen3.5-omni-plus': { input: 0.26, output: 1.56 },
    'qwen3.5-plus': { input: 0.20, output: 1.20 },
    'qwen-flash': { input: 0.05, output: 0.40 },
    'MiniMax-M2.7': { input: 0.30, output: 1.20 },
    'MiniMax-M2.5': { input: 0.15, output: 1.20 },
    'deepseek-chat': { input: 0.14, output: 0.28 },
  };
  const DEFAULT_PRICING = { input: 0.20, output: 1.20 };
  const estimateCost = (inp: number, out: number, model: string) => {
    const p = MODEL_PRICING[model] || DEFAULT_PRICING;
    return (inp / 1_000_000) * p.input + (out / 1_000_000) * p.output;
  };

  const totalCost = useMemo(() => {
    return models.reduce((sum: number, m: any) => {
      return sum + estimateCost(m.input_tokens || 0, m.output_tokens || 0, m.model || m.name || '');
    }, estimateCost(inputTokens, outputTokens, ''));
  }, [models, inputTokens, outputTokens]);

  const costColour = (cost: number) => {
    if (cost < 0.10) return '#34d399';
    if (cost < 0.50) return '#fbbf24';
    if (cost < 1.00) return '#f59e0b';
    return '#f87171';
  };

  const monthChange = tokensLastMonth > 0
    ? ((tokensMonth - tokensLastMonth) / tokensLastMonth * 100).toFixed(0)
    : null;

  return (
    <div style={pageWrapper}>
      <div style={{ width: '100%' }}>
        <div style={{ marginBottom: 8 }}>
          <div style={pageTitle}>{t('dash.usage.title')}</div>
          <div style={pageSubtitle}>{t('dash.usage.subtitle')}</div>
        </div>

        {!connected && <NotConnectedBanner />}

        {/* Tab Toggle */}
        <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid rgba(168, 85, 247, 0.12)', marginBottom: 16, paddingBottom: 1 }}>
          {(['session', 'alltime', 'audit'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => {
                setActiveTab(tab);
                if (tab === 'audit') {
                  try { getSidecar().getAuditLog(); } catch { /* */ }
                }
              }}
              style={{
                padding: '6px 12px', fontSize: 12, fontWeight: 500,
                border: 'none', cursor: 'pointer', background: 'transparent',
                color: activeTab === tab ? '#cdd6f4' : '#585b70',
                borderBottom: activeTab === tab ? '2px solid #a855f7' : '2px solid transparent',
                transition: 'all 0.15s',
              }}
            >
              {tab === 'session' ? t('dash.usage.session') : tab === 'alltime' ? t('dash.usage.all_time') : 'Audit'}
            </button>
          ))}
        </div>

        {loading ? <LoadingSpinner /> : error ? <ErrorBanner message={error} /> : (
          <>
            {activeTab === 'session' ? (
              <>
                {/* Session Summary */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 20 }}>
                  {[
                    { label: t('dash.usage.input_tokens'), value: formatTokens(inputTokens), color: '' },
                    { label: t('dash.usage.output_tokens'), value: formatTokens(outputTokens), color: '' },
                    { label: t('dash.usage.total_tokens'), value: formatTokens(totalTokens), color: '#a855f7', highlight: true },
                    { label: t('dash.usage.messages'), value: String(messages), color: '' },
                    { label: t('dash.usage.tool_calls'), value: String(toolCalls), color: '' },
                    { label: t('dash.usage.est_cost'), value: `$${totalCost.toFixed(4)}`, color: costColour(totalCost) },
                  ].map(s => (
                    <div key={s.label} style={{
                      background: 'rgba(26, 16, 40, 0.6)', border: '1px solid rgba(168, 85, 247, 0.12)', borderRadius: 12, padding: '16px',
                    }}>
                      <div style={{ fontSize: 10, color: '#6c7086' }}>{s.label}</div>
                      <div style={{
                        fontSize: 18, fontWeight: 600, marginTop: 4,
                        color: s.color || '#cdd6f4',
                        ...(s.highlight ? {
                          background: 'linear-gradient(90deg, #a855f7, #6366f1)',
                          WebkitBackgroundClip: 'text',
                          WebkitTextFillColor: 'transparent',
                        } as any : {}),
                      }}>
                        {s.value}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Model Breakdown */}
                {models.length > 0 && (
                  <div style={{ ...card }}>
                    <div style={sectionTitle}>Models Used</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {models.map((m: any, i: number) => {
                        const mTotal = (m.input_tokens || 0) + (m.output_tokens || 0);
                        const mTokens = m.tokens || m.total_tokens || mTotal;
                        const maxModel = Math.max(...models.map((mm: any) => (mm.input_tokens || 0) + (mm.output_tokens || 0) || mm.tokens || mm.total_tokens || 0));
                        const pct = maxModel > 0 ? (mTokens / maxModel) * 100 : 0;
                        const cost = estimateCost(m.input_tokens || 0, m.output_tokens || 0, m.model || m.name || '');
                        return (
                          <div key={m.model || m.name || i} style={{
                            background: 'rgba(26, 16, 40, 0.6)', border: '1px solid rgba(168, 85, 247, 0.12)', borderRadius: 12, padding: '16px',
                          }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                              <span style={{ fontSize: 12, fontWeight: 500, color: '#cdd6f4' }}>{m.model || m.name}</span>
                              <div style={{ display: 'flex', gap: 12 }}>
                                <span style={{ fontSize: 10, fontWeight: 500, color: costColour(cost) }}>${cost.toFixed(4)}</span>
                                <span style={{ fontSize: 10, color: '#6c7086' }}>{m.requests || 0} reqs</span>
                              </div>
                            </div>
                            <div style={{ height: 8, background: 'rgba(49, 34, 68, 0.5)', borderRadius: 4, overflow: 'hidden', marginBottom: 8 }}>
                              <div style={{
                                width: `${pct}%`, height: '100%', borderRadius: 4,
                                background: 'linear-gradient(90deg, #a855f7, #6366f1)',
                              }} />
                            </div>
                            <div style={{ display: 'flex', gap: 12, fontSize: 10, color: '#6c7086' }}>
                              <span>In: {formatTokens(m.input_tokens || 0)}</span>
                              <span>Out: {formatTokens(m.output_tokens || 0)}</span>
                              <span>Total: {formatTokens(mTokens)}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {!models.length && connected && (
                  <div style={{
                    background: 'rgba(26, 16, 40, 0.6)', border: '1px solid rgba(168, 85, 247, 0.12)', borderRadius: 12,
                    padding: '32px 20px', textAlign: 'center',
                  }}>
                    <div style={{ fontSize: 13, color: '#6c7086' }}>No usage this session yet. Start chatting with Ava!</div>
                  </div>
                )}
              </>
            ) : activeTab === 'audit' ? (
              <>
                {/* Audit Trail */}
                {auditEntries.length === 0 ? (
                  <div style={{
                    background: 'rgba(26, 16, 40, 0.6)', border: '1px dashed rgba(168, 85, 247, 0.12)', borderRadius: 12,
                    padding: '32px 20px', textAlign: 'center',
                  }}>
                    <div style={{ fontSize: 28, opacity: 0.3, marginBottom: 8 }}>📋</div>
                    <div style={{ fontSize: 13, color: '#6c7086' }}>No tool calls recorded this session.</div>
                  </div>
                ) : (
                  <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
                    {/* Header row */}
                    <div style={{
                      display: 'grid', gridTemplateColumns: '60px 1fr 80px 60px 90px 60px',
                      gap: 8, padding: '8px 12px',
                      borderBottom: '1px solid rgba(168,85,247,0.12)',
                      fontSize: 9, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' as const, color: '#6c7086',
                    }}>
                      <span>Time</span><span>Tool</span><span>Category</span><span>Risk</span><span>Approval</span><span>Status</span>
                    </div>
                    {/* Entries — newest first */}
                    {[...auditEntries].reverse().map((entry: any, i: number) => {
                      const time = new Date(entry.timestamp).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                      const isExp = auditExpanded === i;
                      const approvalColors: Record<string, string> = { 'auto': '#34d399', 'first-time': '#60a5fa', 'user-approved': '#fbbf24', 'denied': '#f87171' };
                      const statusColors: Record<string, string> = { 'success': '#34d399', 'failed': '#f87171', 'denied': '#f87171' };
                      const riskColors: Record<string, string> = { 'safe': '#34d399', 'write': '#fbbf24', 'dangerous': '#f87171' };
                      const catLabels: Record<string, string> = { file_ops: 'File Ops', shell: 'Shell', git: 'Git', web: 'Web', media: 'Media', database: 'Database', system: 'System', documents: 'Docs', memory: 'Memory', learning: 'Learning' };
                      return (
                        <div key={i}>
                          <button
                            onClick={() => setAuditExpanded(isExp ? null : i)}
                            style={{
                              display: 'grid', gridTemplateColumns: '60px 1fr 80px 60px 90px 60px',
                              gap: 8, width: '100%', padding: '8px 12px', textAlign: 'left',
                              fontSize: 11, border: 'none', background: 'transparent', cursor: 'pointer',
                            }}
                          >
                            <span style={{ color: '#6c7086', fontFamily: 'monospace' }}>{time}</span>
                            <span style={{ color: '#cdd6f4', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.toolName}</span>
                            <span style={{ color: '#a6adc8' }}>{catLabels[entry.category] || entry.category}</span>
                            <span style={{ color: riskColors[entry.riskLevel] || '#6c7086', fontSize: 10, fontWeight: 500 }}>{entry.riskLevel}</span>
                            <span style={{ color: approvalColors[entry.approvalMethod] || '#6c7086', fontSize: 10, fontWeight: 500 }}>{entry.approvalMethod}</span>
                            <span style={{ color: statusColors[entry.status] || '#6c7086', fontSize: 10, fontWeight: 500 }}>{entry.status}</span>
                          </button>
                          {isExp && (
                            <div style={{ padding: '0 12px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                              <div style={{ background: 'rgba(49,34,68,0.3)', borderRadius: 8, padding: 10 }}>
                                <div style={{ fontSize: 9, fontWeight: 700, color: '#6c7086', marginBottom: 4 }}>Arguments</div>
                                <pre style={{ fontSize: 10, color: '#a6adc8', fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: 160, overflowY: 'auto', margin: 0 }}>
                                  {entry.fullArgs ? JSON.stringify(entry.fullArgs, null, 2) : entry.argsSummary}
                                </pre>
                              </div>
                              {entry.result && (
                                <div style={{ background: 'rgba(49,34,68,0.3)', borderRadius: 8, padding: 10 }}>
                                  <div style={{ fontSize: 9, fontWeight: 700, color: '#6c7086', marginBottom: 4 }}>Result</div>
                                  <pre style={{ fontSize: 10, color: '#a6adc8', fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: 160, overflowY: 'auto', margin: 0 }}>
                                    {entry.result}
                                  </pre>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            ) : (
              <>
                {/* Token Balance */}
                {usage && (
                  <div style={{ ...card }}>
                    <div style={sectionTitle}>Token Balance</div>
                    {isUnlimited ? (
                      <>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 8 }}>
                          <span style={{ color: '#a6adc8' }}>Admin tier</span>
                          <span style={{ fontWeight: 500, color: '#a855f7' }}>Unlimited</span>
                        </div>
                        <div style={{ height: 12, background: 'rgba(49, 34, 68, 0.5)', borderRadius: 6, overflow: 'hidden' }}>
                          <div style={{ width: '100%', height: '100%', borderRadius: 6, background: 'linear-gradient(90deg, #a855f7, #6366f1)' }} />
                        </div>
                      </>
                    ) : (
                      <>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                          <span style={{ color: '#a6adc8' }}>Tokens Remaining</span>
                          <span style={{ color: '#cdd6f4', fontWeight: 600 }}>{formatTokens(balanceRemaining)}</span>
                        </div>
                        <div style={{ height: 12, background: 'rgba(49, 34, 68, 0.5)', borderRadius: 6, overflow: 'hidden' }}>
                          <div style={{
                            width: `${remainPct}%`, height: '100%', borderRadius: 6,
                            background: remainPct < 10 ? '#f87171' : remainPct < 30 ? '#f59e0b' : 'linear-gradient(90deg, #a855f7, #6366f1)',
                            transition: 'width 0.5s',
                          }} />
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#585b70', marginTop: 4 }}>
                          <span>{formatTokens(balanceUsed)} used</span>
                          <span>{formatTokens(balanceLimit)} limit</span>
                        </div>
                      </>
                    )}
                  </div>
                )}

                {/* Overview Stats */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10, marginBottom: 20 }}>
                  {[
                    { label: t('dash.usage.this_month'), value: formatTokens(tokensMonth), sub: monthChange !== null ? `${Number(monthChange) >= 0 ? '+' : ''}${monthChange}% ${t('dash.usage.vs_last')}` : t('dash.usage.first_month') },
                    { label: t('dash.usage.last_month'), value: formatTokens(tokensLastMonth) },
                    { label: t('dash.usage.avg_session'), value: formatTokens(avgPerSession) },
                    { label: t('dash.usage.total_sessions'), value: String(totalSessions) },
                  ].map(s => (
                    <div key={s.label} style={{
                      background: 'rgba(26, 16, 40, 0.6)', border: '1px solid rgba(168, 85, 247, 0.12)', borderRadius: 12, padding: '16px',
                    }}>
                      <div style={{ fontSize: 10, color: '#6c7086' }}>{s.label}</div>
                      <div style={{ fontSize: 18, fontWeight: 600, color: '#cdd6f4', marginTop: 4 }}>{s.value}</div>
                      {s.sub && <div style={{ fontSize: 10, color: '#6c7086', marginTop: 2 }}>{s.sub}</div>}
                    </div>
                  ))}
                </div>

                {/* Daily Usage Chart */}
                {daily.length > 0 && (
                  <div style={{ ...card }}>
                    <div style={sectionTitle}>Daily Usage (Last 14 Days)</div>
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 120 }}>
                      {daily.map((d: any, i: number) => {
                        const tokens = d.tokens || d.total_tokens || 0;
                        const heightPct = maxDaily > 0 ? (tokens / maxDaily) * 100 : 0;
                        const isToday = (d.date || '') === today;
                        const dayLabel = d.date ? new Date(d.date + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric' }) : (d.day || '');
                        return (
                          <div key={d.date || d.day || i} style={{
                            flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                          }} title={`${d.date || d.day}: ${formatTokens(tokens)} tokens`}>
                            <div style={{ width: '100%', display: 'flex', alignItems: 'flex-end', height: 90 }}>
                              <div style={{
                                width: '100%', borderRadius: '3px 3px 0 0', transition: 'all 0.2s',
                                height: `${Math.max(heightPct, tokens > 0 ? 4 : 2)}%`, minHeight: 2,
                                background: isToday ? '#a855f7'
                                  : tokens > 0 ? 'linear-gradient(180deg, #a855f7, #6366f1)' : 'rgba(49, 34, 68, 0.5)',
                                opacity: isToday ? 1 : tokens > 0 ? 0.7 : 1,
                              }} />
                            </div>
                            <span style={{
                              fontSize: 8,
                              color: isToday ? '#a855f7' : '#6c7086',
                              fontWeight: isToday ? 700 : 400,
                            }}>
                              {dayLabel}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Most Used Models */}
                {models.length > 0 && (
                  <div style={{ ...card }}>
                    <div style={sectionTitle}>Most Used Models</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {models.map((m: any, i: number) => {
                        const mTokens = m.tokens || m.total_tokens || ((m.input_tokens || 0) + (m.output_tokens || 0));
                        const topTokens = models[0]?.tokens || models[0]?.total_tokens || ((models[0]?.input_tokens || 0) + (models[0]?.output_tokens || 0));
                        const pct = topTokens > 0 ? (mTokens / topTokens) * 100 : 0;
                        return (
                          <div key={m.model || m.name || i}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                              <span style={{ fontSize: 12, fontWeight: 500, color: '#cdd6f4' }}>{m.model || m.name}</span>
                              <span style={{ fontSize: 10, color: '#6c7086' }}>{formatTokens(mTokens)}</span>
                            </div>
                            <div style={{ height: 8, background: 'rgba(49, 34, 68, 0.5)', borderRadius: 4, overflow: 'hidden' }}>
                              <div style={{
                                width: `${pct}%`, height: '100%', borderRadius: 4,
                                background: 'linear-gradient(90deg, #a855f7, #6366f1)',
                              }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {!daily.length && !models.length && connected && (
                  <div style={{
                    background: 'rgba(26, 16, 40, 0.6)', border: '1px dashed rgba(168, 85, 247, 0.12)', borderRadius: 12,
                    padding: '32px 20px', textAlign: 'center',
                  }}>
                    <div style={{ fontSize: 13, color: '#6c7086' }}>
                      No usage data available yet. Start using Ava to see your stats here.
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* ===== 10. Settings ===== */
export function SettingsPage() {
  useLocale();
  const defaultSettings = {
    autoMemory: true,
    memoryLocalOnly: false,
    contributeSharedLearning: false,
    permissionMode: 'balanced',
    streamResponses: true,
    language: 'auto',
    temperature: 0.7,
    maxTokens: 8192,
  };
  const [authKey, setAuthKey] = useState(0);
  useEffect(() => {
    const handler = () => {
      if (!checkConnected()) {
        setSettings(defaultSettings);
        setPersonality(null);
        setUserAvatar('');
        setAiAvatar('');
        setProviderKeys({});
      }
      setAuthKey(k => k + 1);
    };
    window.addEventListener('ava-auth-changed', handler);
    return () => window.removeEventListener('ava-auth-changed', handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  void authKey;
  const connected = checkConnected();
  const [settings, setSettings] = useState<any>(defaultSettings);
  const [personality, setPersonality] = useState<any>(null);
  const [userAvatar, setUserAvatar] = useState<string>(() => localStorage.getItem('ava-ide-user-avatar') || '');
  const [aiAvatar, setAiAvatar] = useState<string>(() => localStorage.getItem('ava-ide-ai-avatar') || '');

  // Resize image to max 128x128 and compress as JPEG for storage efficiency
  const resizeAvatar = useCallback((dataUri: string): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const size = 128;
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d')!;
        // Center crop
        const scale = Math.max(size / img.width, size / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      };
      img.onerror = () => resolve(dataUri);
      img.src = dataUri;
    });
  }, []);

  const saveAvatar = useCallback(async (type: 'user' | 'ai', dataUri: string) => {
    const resized = await resizeAvatar(dataUri);
    const key = type === 'user' ? 'ava-ide-user-avatar' : 'ava-ide-ai-avatar';
    localStorage.setItem(key, resized);
    if (type === 'user') setUserAvatar(resized); else setAiAvatar(resized);
    // Sync to platform if connected
    if (connected) {
      apiFetch('/settings', {
        method: 'POST',
        body: JSON.stringify({ [`${type}_avatar`]: resized }),
      }).catch(() => {});
    }
    return resized;
  }, [connected, resizeAvatar]);

  const removeAvatar = useCallback((type: 'user' | 'ai') => {
    const key = type === 'user' ? 'ava-ide-user-avatar' : 'ava-ide-ai-avatar';
    localStorage.removeItem(key);
    if (type === 'user') setUserAvatar(''); else setAiAvatar('');
    if (connected) {
      apiFetch('/settings', {
        method: 'POST',
        body: JSON.stringify({ [`${type}_avatar`]: null }),
      }).catch(() => {});
    }
  }, [connected]);
  const [providerKeys, setProviderKeys] = useState<Record<string, boolean>>({});
  const [providerInputs, setProviderInputs] = useState<Record<string, string>>({});
  const [editingProvider, setEditingProvider] = useState<string | null>(null);
  const [savingProvider, setSavingProvider] = useState<string | null>(null);
  const [apiKeysOpen, setApiKeysOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const PROVIDERS = [
    { id: 'anthropic', name: 'Anthropic (Claude)', placeholder: 'sk-ant-...', signupUrl: 'https://console.anthropic.com', description: 'Claude Opus 4.6, Sonnet 4.6, Haiku 4.5' },
    { id: 'deepseek', name: 'DeepSeek', placeholder: 'sk-...', signupUrl: 'https://platform.deepseek.com', description: 'DeepSeek V3 and R1 \u2014 best price/performance' },
    { id: 'kimi', name: 'Kimi (Moonshot)', placeholder: 'sk-...', signupUrl: 'https://platform.moonshot.cn', description: 'Kimi K2.5 \u2014 best multi-step tool calling' },
    { id: 'minimax', name: 'MiniMax', placeholder: 'sk-api-...', signupUrl: 'https://platform.minimax.io', description: 'M2.7 self-evolving, M2.5 best tool calling' },
    { id: 'glm', name: 'GLM (Zhipu AI)', placeholder: '...', signupUrl: 'https://open.bigmodel.cn', description: 'GLM-5, GLM-4.7 \u2014 best tool-call reliability' },
    { id: 'qwen', name: 'Qwen (Alibaba)', placeholder: 'sk-...', signupUrl: 'https://dashscope.console.aliyun.com', description: 'Qwen 3.5 Omni Plus and Omni Flash — multimodal' },
    { id: 'mistral', name: 'Mistral AI', placeholder: '...', signupUrl: 'https://console.mistral.ai', description: 'Mistral Large 3, Codestral, Devstral 2' },
  ];

  const LANGUAGES = [
    { value: 'auto', label: t('dash.settings.auto_detect') }, { value: 'en', label: 'English' },
    { value: 'zh-CN', label: '\u4e2d\u6587\uff08\u7b80\u4f53\uff09' }, { value: 'es', label: 'Espa\u00f1ol' },
    { value: 'fr', label: 'Fran\u00e7ais' }, { value: 'de', label: 'Deutsch' },
    { value: 'ja', label: '\u65e5\u672c\u8a9e' }, { value: 'ko', label: '\ud55c\uad6d\uc5b4' },
    { value: 'pt', label: 'Portugu\u00eas' }, { value: 'ru', label: '\u0420\u0443\u0441\u0441\u043a\u0438\u0439' },
    { value: 'ar', label: '\u0627\u0644\u0639\u0631\u0628\u064a\u0629' }, { value: 'hi', label: '\u0939\u093f\u0928\u094d\u0926\u0940' },
  ];


  useEffect(() => {
    if (!connected) return;
    apiFetch('/settings')
      .then((data: any) => {
        if (data) {
          setSettings((prev: any) => ({ ...prev, ...data }));
          if (data.personality) setPersonality(data.personality);
          if (data.providerKeys) setProviderKeys(data.providerKeys);
          // Load avatars from platform (overrides local if present)
          if (data.user_avatar) { setUserAvatar(data.user_avatar); localStorage.setItem('ava-ide-user-avatar', data.user_avatar); }
          if (data.ai_avatar) { setAiAvatar(data.ai_avatar); localStorage.setItem('ava-ide-ai-avatar', data.ai_avatar); }
        }
      })
      .catch(() => {});
  }, [connected]);

  const saveImmediate = (key: string, value: any) => {
    const updated = { ...settings, [key]: value };
    setSettings(updated);
    // Persist specific keys to localStorage for sidecar access
    if (key === 'language') {
      localStorage.setItem('ava-ide-language', value);
      import('../lib/i18n').then(({ initLocale }) => initLocale(value)).catch(() => {});
    }
    if (key === 'holoApiKey') {
      localStorage.setItem('ava-ide-holo-key', value || '');
    }
    if (connected) {
      apiFetch('/settings', {
        method: 'POST',
        body: JSON.stringify(updated),
      }).catch(() => {});
    }
  };

  const handleSaveProviderKey = (providerId: string) => {
    const key = providerInputs[providerId]?.trim();
    if (!key) return;
    setSavingProvider(providerId);
    if (connected) {
      apiFetch('/settings/provider-key', {
        method: 'POST',
        body: JSON.stringify({ provider: providerId, apiKey: key }),
      }).catch(() => {});
    }
    setProviderKeys(prev => ({ ...prev, [providerId]: true }));
    setProviderInputs(prev => ({ ...prev, [providerId]: '' }));
    setEditingProvider(null);
    setTimeout(() => setSavingProvider(null), 1500);
  };

  const handleRemoveProviderKey = (providerId: string) => {
    if (connected) {
      apiFetch('/settings/provider-key', {
        method: 'DELETE',
        body: JSON.stringify({ provider: providerId }),
      }).catch(() => {});
    }
    setProviderKeys(prev => ({ ...prev, [providerId]: false }));
  };

  const configuredCount = Object.values(providerKeys).filter(Boolean).length;

  const ToggleSwitch = ({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) => (
    <div
      onClick={() => onChange(!value)}
      role="switch"
      style={{
        width: 44, height: 24, borderRadius: 12,
        background: value ? '#a855f7' : 'rgba(49, 34, 68, 0.5)',
        cursor: 'pointer', position: 'relative', flexShrink: 0,
        transition: 'background 0.2s',
      }}
    >
      <div style={{
        width: 20, height: 20, borderRadius: '50%',
        background: '#fff', position: 'absolute', top: 2,
        left: value ? 22 : 2, transition: 'left 0.2s',
      }} />
    </div>
  );

  const sLabel: React.CSSProperties = {
    fontSize: 10, fontWeight: 600, color: '#6c7086',
    textTransform: 'uppercase' as const, letterSpacing: 1.5, marginBottom: 8, paddingLeft: 4,
  };

  const divider: React.CSSProperties = {
    borderTop: '1px solid rgba(168, 85, 247, 0.12)', margin: '16px 0',
  };

  return (
    <div style={pageWrapper}>
      <div style={{ width: '100%', paddingBottom: 48 }}>
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 22, fontWeight: 600, color: '#cdd6f4' }}>{t('dash.settings.title')}</div>
          <div style={{ fontSize: 13, color: '#6c7086', marginTop: 4 }}>
            {t('dash.settings.subtitle')}
          </div>
        </div>

        {/* 1. Your AI */}
        <div style={sLabel}>{t('dash.settings.section.your_ai')}</div>
        <div style={{
          background: 'rgba(26, 16, 40, 0.6)', border: '1px solid rgba(168, 85, 247, 0.12)', borderRadius: 12,
          padding: '18px 20px', marginBottom: 16,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 40, height: 40, borderRadius: '50%',
                background: 'rgba(168,85,247,0.20)', display: 'flex',
                alignItems: 'center', justifyContent: 'center', fontSize: 18, color: '#a855f7',
              }}>
                {(personality?.name || 'A')[0].toUpperCase()}
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#cdd6f4' }}>Ava</div>
                <div style={{ fontSize: 11, color: '#6c7086' }}>
                  {personality ? `${personality.tone} / ${personality.energy} / ${personality.style}` : t('dash.settings.default_personality')}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 2. Avatars */}
        <div style={sLabel}>{t('dash.settings.section.avatars')}</div>
        <div style={{
          background: 'rgba(26, 16, 40, 0.6)', border: '1px solid rgba(168, 85, 247, 0.12)', borderRadius: 12,
          padding: '18px 20px', marginBottom: 16,
        }}>
          <div style={{ display: 'flex', gap: 32 }}>
            {/* User Avatar */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
              <div style={{ fontSize: 11, color: '#6c7086', fontWeight: 500 }}>{t('dash.settings.avatar_you')}</div>
              <div
                onClick={() => {
                  const input = document.createElement('input');
                  input.type = 'file';
                  input.accept = 'image/*';
                  input.onchange = () => {
                    const file = input.files?.[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = () => saveAvatar('user', reader.result as string);
                    reader.readAsDataURL(file);
                  };
                  input.click();
                }}
                style={{
                  width: 64, height: 64, borderRadius: '50%', cursor: 'pointer',
                  border: '2px dashed rgba(168,85,247,0.3)',
                  background: userAvatar ? 'transparent' : 'rgba(10, 6, 18, 0.8)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  overflow: 'hidden', position: 'relative',
                }}
                title={t('dash.settings.avatar_upload_hint')}
              >
                {userAvatar ? (
                  <img src={userAvatar} alt={t('dash.settings.avatar_you')} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6c7086" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" />
                  </svg>
                )}
              </div>
              {userAvatar && (
                <button onClick={() => removeAvatar('user')}
                  style={{ fontSize: 10, color: '#6c7086', background: 'transparent', border: 'none', cursor: 'pointer' }}>{t('dash.settings.remove')}</button>
              )}
            </div>

            {/* AI Avatar */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
              <div style={{ fontSize: 11, color: '#6c7086', fontWeight: 500 }}>Ava</div>
              <div
                onClick={() => {
                  const input = document.createElement('input');
                  input.type = 'file';
                  input.accept = 'image/*';
                  input.onchange = () => {
                    const file = input.files?.[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = () => saveAvatar('ai', reader.result as string);
                    reader.readAsDataURL(file);
                  };
                  input.click();
                }}
                style={{
                  width: 64, height: 64, borderRadius: '50%', cursor: 'pointer',
                  border: '2px dashed rgba(168,85,247,0.3)',
                  background: aiAvatar ? 'transparent' : 'linear-gradient(135deg, rgba(168,85,247,0.2), rgba(99,102,241,0.2))',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  overflow: 'hidden',
                }}
                title={t('dash.settings.avatar_upload_ai_hint')}
              >
                {aiAvatar ? (
                  <img src={aiAvatar} alt="Ava" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#a855f7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                  </svg>
                )}
              </div>
              {aiAvatar && (
                <button onClick={() => removeAvatar('ai')}
                  style={{ fontSize: 10, color: '#6c7086', background: 'transparent', border: 'none', cursor: 'pointer' }}>{t('dash.settings.remove')}</button>
              )}
            </div>
          </div>
          <div style={{ fontSize: 11, color: '#45475a', marginTop: 10 }}>{t('dash.settings.avatar_stored_locally')}</div>
        </div>


        {/* 3. Privacy & Data */}
        <div style={sLabel}>{t('dash.settings.section.privacy')}</div>
        <div style={{
          background: 'rgba(26, 16, 40, 0.6)', border: '1px solid rgba(168, 85, 247, 0.12)', borderRadius: 12,
          padding: '18px 20px', marginBottom: 16,
        }}>
          {/* Auto Memory */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 16 }}>{'\uD83E\uDDE0'}</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#cdd6f4' }}>{t('dash.settings.auto_memory')}</div>
                <div style={{ fontSize: 11, color: '#6c7086', marginTop: 2 }}>{t('dash.settings.auto_memory_desc')}</div>
              </div>
            </div>
            <ToggleSwitch value={settings.autoMemory} onChange={v => saveImmediate('autoMemory', v)} />
          </div>
          <div style={divider} />
          {/* Local Only */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 16 }}>{'\uD83D\uDD12'}</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#cdd6f4' }}>{t('dash.settings.local_only')}</div>
                <div style={{ fontSize: 11, color: '#6c7086', marginTop: 2 }}>{t('dash.settings.local_only_desc')}</div>
              </div>
            </div>
            <ToggleSwitch value={settings.memoryLocalOnly} onChange={v => saveImmediate('memoryLocalOnly', v)} />
          </div>
          <div style={divider} />
          {/* Shared Learning */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 16 }}>{'\uD83D\uDCA1'}</span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#cdd6f4' }}>{t('dash.settings.shared_learning')}</div>
                  <div style={{ fontSize: 11, color: '#6c7086', marginTop: 2 }}>{t('dash.settings.shared_learning_desc')}</div>
                </div>
              </div>
              <ToggleSwitch value={settings.contributeSharedLearning} onChange={v => saveImmediate('contributeSharedLearning', v)} />
            </div>
            <div style={{
              fontSize: 11, marginTop: 8, paddingLeft: 32,
              color: settings.contributeSharedLearning ? '#34d399' : '#6c7086',
            }}>
              {settings.contributeSharedLearning ? t('dash.settings.contributing') : t('dash.settings.learnings_local')}
            </div>
          </div>
        </div>

        {/* 4. Behavior */}
        <div style={sLabel}>{t('dash.settings.section.behavior')}</div>
        <div style={{
          background: 'rgba(26, 16, 40, 0.6)', border: '1px solid rgba(168, 85, 247, 0.12)', borderRadius: 12,
          padding: '18px 20px', marginBottom: 16,
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#cdd6f4', marginBottom: 2 }}>{t('dash.settings.permission')}</div>
          <div style={{ fontSize: 11, color: '#6c7086', marginBottom: 14 }}>{t('dash.settings.permission_desc')}</div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 16 }}>
            {([
              { key: 'strict', icon: '\uD83D\uDEE1\uFE0F', label: t('dash.settings.permission.strict'), desc: t('dash.settings.permission.strict_desc') },
              { key: 'balanced', icon: '\u2696\uFE0F', label: t('dash.settings.permission.balanced'), desc: t('dash.settings.permission.balanced_desc') },
              { key: 'autonomous', icon: '\uD83D\uDE80', label: t('dash.settings.permission.autonomous'), desc: t('dash.settings.permission.autonomous_desc') },
            ] as const).map(pm => {
              const sel = settings.permissionMode === pm.key;
              return (
                <button
                  key={pm.key}
                  onClick={() => saveImmediate('permissionMode', pm.key)}
                  style={{
                    background: sel ? 'rgba(168,85,247,0.08)' : 'rgba(26, 16, 40, 0.6)',
                    border: sel ? '1px solid rgba(168,85,247,0.6)' : '1px solid rgba(168, 85, 247, 0.12)',
                    borderRadius: 10, padding: '12px', textAlign: 'left', cursor: 'pointer',
                    boxShadow: sel ? '0 0 12px rgba(168,85,247,0.15)' : 'none',
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => { if (!sel) (e.currentTarget as HTMLElement).style.borderColor = '#45475a'; }}
                  onMouseLeave={e => { if (!sel) (e.currentTarget as HTMLElement).style.borderColor = 'rgba(168, 85, 247, 0.12)'; }}
                >
                  <div style={{ fontSize: 18, marginBottom: 6 }}>{pm.icon}</div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: sel ? '#a855f7' : '#a6adc8' }}>{pm.label}</div>
                  <div style={{ fontSize: 10, color: '#6c7086', marginTop: 4, lineHeight: 1.4 }}>{pm.desc}</div>
                </button>
              );
            })}
          </div>

          {/* Custom mode indicator */}
          {settings.permissionMode === 'custom' && (
            <div style={{ marginBottom: 12, borderRadius: 8, border: '1px solid rgba(168,85,247,0.3)', background: 'rgba(168,85,247,0.05)', padding: '8px 12px', fontSize: 11, color: '#c4b5fd' }}>
              Custom — you've adjusted individual categories. Select a preset above to reset.
            </div>
          )}

          {/* Category-level permissions */}
          <details style={{ marginBottom: 16 }}>
            <summary style={{ cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#a6adc8', userSelect: 'none' }}>
              Customise by Category
            </summary>
            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {([
                { id: 'file_ops', icon: '📁', label: 'File Operations', desc: 'read, write, edit, glob, grep' },
                { id: 'shell', icon: '💻', label: 'Shell', desc: 'bash, test_run, test_generate' },
                { id: 'git', icon: '🔀', label: 'Git', desc: 'status, diff, commit, PR, rollback' },
                { id: 'web', icon: '🌐', label: 'Web', desc: 'search, http_request, browser' },
                { id: 'media', icon: '🎨', label: 'Media', desc: 'screenshot, generate_image' },
                { id: 'database', icon: '🗄️', label: 'Database', desc: 'database_query' },
                { id: 'system', icon: '🖥️', label: 'System', desc: 'computer_use' },
                { id: 'documents', icon: '📄', label: 'Documents', desc: 'docs, presentations, reports' },
                { id: 'memory', icon: '🧠', label: 'Memory', desc: 'save, recall, update, delete' },
                { id: 'learning', icon: '🎓', label: 'Learning', desc: 'create, teach, progress' },
              ] as const).map(cat => {
                const currentPerm = (settings as any).categoryPermissions?.[cat.id] || 'auto';
                return (
                  <div key={cat.id} style={{ display: 'flex', alignItems: 'center', gap: 12, borderRadius: 8, border: '1px solid rgba(168,85,247,0.12)', background: 'rgba(49,34,68,0.3)', padding: '8px 12px' }}>
                    <span style={{ fontSize: 14 }}>{cat.icon}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 11, fontWeight: 500, color: '#a6adc8' }}>{cat.label}</div>
                      <div style={{ fontSize: 9, color: '#6c7086', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cat.desc}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 2, borderRadius: 6, border: '1px solid rgba(168,85,247,0.12)', background: 'rgba(26,16,40,0.6)', padding: 2 }}>
                      {(['auto', 'first_time', 'always_ask'] as const).map(perm => (
                        <button
                          key={perm}
                          onClick={() => {
                            const updated = { ...(settings as any).categoryPermissions, [cat.id]: perm };
                            saveImmediate('categoryPermissions' as any, updated);
                            getSidecar().setCategoryPermission(cat.id, perm).catch(() => {});
                          }}
                          style={{
                            padding: '2px 8px', borderRadius: 4, border: 'none', cursor: 'pointer', fontSize: 9, fontWeight: 500,
                            background: currentPerm === perm ? '#a855f7' : 'transparent',
                            color: currentPerm === perm ? '#fff' : '#6c7086',
                            transition: 'all 0.15s',
                          }}
                        >
                          {perm === 'auto' ? 'Auto' : perm === 'first_time' ? 'First Time' : 'Always Ask'}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </details>

          <div style={divider} />

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#cdd6f4' }}>{t('dash.settings.stream_responses')}</div>
              <div style={{ fontSize: 11, color: '#6c7086', marginTop: 2 }}>{t('dash.settings.stream_responses_desc')}</div>
            </div>
            <ToggleSwitch value={settings.streamResponses} onChange={v => saveImmediate('streamResponses', v)} />
          </div>
        </div>

        {/* 5. Language */}
        <div style={sLabel}>{t('dash.settings.language')}</div>
        <div style={{
          background: 'rgba(26, 16, 40, 0.6)', border: '1px solid rgba(168, 85, 247, 0.12)', borderRadius: 12,
          padding: '18px 20px', marginBottom: 16,
        }}>
          <CustomSelect
            value={settings.language}
            onChange={v => saveImmediate('language', v)}
            width={280}
            height={38}
            options={LANGUAGES}
          />
        </div>

        {/* 6. API Keys (collapsible) */}
        <div style={sLabel}>{t('dash.settings.section.api_keys')}</div>
        <div style={{
          background: 'rgba(26, 16, 40, 0.6)', border: '1px solid rgba(168, 85, 247, 0.12)', borderRadius: 12,
          marginBottom: 16, overflow: 'hidden',
        }}>
          <button
            onClick={() => setApiKeysOpen(!apiKeysOpen)}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '18px 20px', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left',
            }}
          >
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#cdd6f4' }}>{t('dash.settings.provider_api_keys')}</div>
              <div style={{ fontSize: 11, color: '#6c7086' }}>
                {configuredCount === 0 ? t('dash.settings.no_providers') : t('dash.settings.providers_configured', { count: configuredCount, total: PROVIDERS.length })}
              </div>
            </div>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6c7086" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              style={{ transition: 'transform 0.2s', transform: apiKeysOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>

          {apiKeysOpen && (
            <div style={{ borderTop: '1px solid rgba(168, 85, 247, 0.12)', padding: '0 20px 20px' }}>
              {PROVIDERS.map((provider, i) => (
                <div key={provider.id}>
                  {i > 0 && <div style={divider} />}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 0' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: '#cdd6f4' }}>{provider.name}</div>
                      <div style={{ fontSize: 10, color: '#6c7086' }}>{provider.description}</div>
                    </div>
                    {providerKeys[provider.id] ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        {savingProvider === provider.id ? (
                          <span style={{ fontSize: 11, color: '#34d399' }}>{t('dash.settings.saved')}</span>
                        ) : (
                          <>
                            <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#6c7086' }}>&bull;&bull;&bull;&bull;&bull;&bull;</span>
                            <button
                              onClick={() => handleRemoveProviderKey(provider.id)}
                              style={{
                                background: 'transparent', border: 'none', fontSize: 10,
                                color: '#f87171', cursor: 'pointer', padding: '4px 8px', borderRadius: 4,
                              }}
                              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(248,113,113,0.1)'; }}
                              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                            >
                              {t('dash.settings.remove')}
                            </button>
                          </>
                        )}
                      </div>
                    ) : editingProvider === provider.id ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <input
                          type="password"
                          value={providerInputs[provider.id] || ''}
                          onChange={e => setProviderInputs(prev => ({ ...prev, [provider.id]: e.target.value }))}
                          placeholder={provider.placeholder}
                          style={{
                            width: 180, height: 30, background: 'rgba(49, 34, 68, 0.5)', border: '1px solid rgba(168, 85, 247, 0.12)',
                            borderRadius: 6, padding: '0 10px', fontFamily: 'monospace', fontSize: 11,
                            color: '#cdd6f4', outline: 'none',
                          }}
                          onFocus={e => { e.currentTarget.style.borderColor = '#a855f7'; }}
                          onBlur={e => { e.currentTarget.style.borderColor = 'rgba(168, 85, 247, 0.12)'; }}
                          autoFocus
                        />
                        <button
                          onClick={() => handleSaveProviderKey(provider.id)}
                          disabled={!providerInputs[provider.id]?.trim()}
                          style={{
                            ...btnPrimary, padding: '5px 12px', fontSize: 10, borderRadius: 6,
                            opacity: providerInputs[provider.id]?.trim() ? 1 : 0.4,
                          }}
                        >
                          {t('dash.settings.save')}
                        </button>
                        <button
                          onClick={() => { setEditingProvider(null); setProviderInputs(prev => ({ ...prev, [provider.id]: '' })); }}
                          style={{ background: 'transparent', border: 'none', fontSize: 10, color: '#6c7086', cursor: 'pointer' }}
                        >
                          {t('dash.settings.cancel')}
                        </button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 11, color: '#6c7086' }}>{t('dash.settings.not_set')}</span>
                        <button
                          onClick={() => setEditingProvider(provider.id)}
                          style={{
                            ...btnSecondary, padding: '5px 12px', fontSize: 10, borderRadius: 6,
                          }}
                          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = '#a855f7'; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(168, 85, 247, 0.12)'; }}
                        >
                          {t('dash.settings.edit')}
                        </button>
                      </div>
                    )}
                  </div>
                  {!providerKeys[provider.id] && editingProvider !== provider.id && (
                    <a
                      href={provider.signupUrl}
                      target="_blank" rel="noopener noreferrer"
                      style={{ fontSize: 10, color: '#a855f7', textDecoration: 'none' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.textDecoration = 'underline'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.textDecoration = 'none'; }}
                    >
                      {t('dash.settings.get_api_key')} &rarr;
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 7. Advanced (collapsible) */}
        <div style={sLabel}>{t('dash.settings.section.advanced')}</div>
        <div style={{
          background: 'rgba(26, 16, 40, 0.6)', border: '1px solid rgba(168, 85, 247, 0.12)', borderRadius: 12,
          marginBottom: 16, overflow: 'hidden',
        }}>
          <button
            onClick={() => setAdvancedOpen(!advancedOpen)}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '18px 20px', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left',
            }}
          >
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#cdd6f4' }}>{t('dash.settings.advanced_settings')}</div>
              <div style={{ fontSize: 11, color: '#6c7086' }}>{t('dash.settings.advanced_hint')}</div>
            </div>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6c7086" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              style={{ transition: 'transform 0.2s', transform: advancedOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>

          {advancedOpen && (
            <div style={{ borderTop: '1px solid rgba(168, 85, 247, 0.12)', padding: '20px' }}>
              {/* Temperature */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#cdd6f4' }}>{t('dash.settings.temperature')}</div>
                  <span style={{
                    background: 'rgba(49, 34, 68, 0.5)', padding: '2px 10px', borderRadius: 6,
                    fontFamily: 'monospace', fontSize: 12, color: '#a6adc8',
                  }}>
                    {settings.temperature.toFixed(1)}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 10, color: '#6c7086' }}>{t('dash.settings.precise')}</span>
                  <input
                    type="range" min={0} max={2} step={0.1}
                    value={settings.temperature}
                    onChange={e => saveImmediate('temperature', parseFloat(e.target.value))}
                    style={{ flex: 1, accentColor: '#a855f7' }}
                  />
                  <span style={{ fontSize: 10, color: '#6c7086' }}>{t('dash.settings.creative')}</span>
                </div>
              </div>
              <div style={divider} />
              {/* Max Tokens */}
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#cdd6f4', marginBottom: 8 }}>{t('dash.settings.max_tokens')}</div>
                <input
                  type="number" min={256} max={65536} step={256}
                  value={settings.maxTokens}
                  onChange={e => {
                    const v = parseInt(e.target.value);
                    if (!isNaN(v) && v >= 256 && v <= 65536) saveImmediate('maxTokens', v);
                  }}
                  style={{
                    ...inputStyle, maxWidth: 200, height: 38, borderRadius: 8,
                    fontFamily: 'monospace',
                  }}
                  onFocus={e => { e.currentTarget.style.borderColor = '#a855f7'; }}
                  onBlur={e => { e.currentTarget.style.borderColor = 'rgba(168, 85, 247, 0.12)'; }}
                />
              </div>
            </div>
          )}
        </div>

        {/* 8. Computer Use — Coming Soon */}
        <div style={sLabel}>COMPUTER USE</div>
        <div style={{
          background: 'rgba(26, 16, 40, 0.6)', border: '1px solid rgba(168, 85, 247, 0.12)', borderRadius: 12,
          padding: '18px 20px', marginBottom: 16,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 24 }}>🖥️</span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#cdd6f4' }}>Desktop Automation</div>
              <div style={{ fontSize: 11, color: '#6c7086', marginTop: 2 }}>
                Let Ava see your screen and interact with desktop apps. Currently being rebuilt with improved vision and accuracy.
              </div>
            </div>
            <span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 600, color: '#f59e0b', background: 'rgba(245,158,11,0.12)', padding: '3px 10px', borderRadius: 6 }}>Coming Soon</span>
          </div>
        </div>

        {/* 9. Danger Zone */}
        {connected && (
          <>
            <div style={sLabel}>{t('dash.settings.section.danger_zone')}</div>
            <div style={{
              background: 'rgba(26, 16, 40, 0.6)', border: '1px solid rgba(248,113,113,0.30)',
              borderRadius: 12, padding: '18px 20px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#f87171' }}>{t('dash.settings.disconnect_account')}</div>
                  <div style={{ fontSize: 11, color: 'rgba(248,113,113,0.7)', marginTop: 2 }}>
                    {t('dash.settings.disconnect_desc')}
                  </div>
                </div>
                <button
                  onClick={() => { disconnectAccount(); window.location.reload(); }}
                  style={{
                    background: 'transparent', border: '1px solid rgba(248,113,113,0.40)',
                    borderRadius: 8, padding: '8px 16px', fontSize: 12, fontWeight: 600,
                    color: '#f87171', cursor: 'pointer', flexShrink: 0,
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(248,113,113,0.08)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                >
                  {t('dash.settings.disconnect')}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ===== 11. Billing ===== */
export function BillingPage() {
  useLocale();
  const connected = checkConnected();
  const { data: usage, loading } = useApiData<any>('/usage/summary', null);
  const tier = localStorage.getItem('ava-ide-tier') || 'free';

  const tierConfig: Record<string, { label: string; color: string; bg: string; limit: string }> = {
    free:       { label: t('dash.billing.plan.free'), color: '#a6e3a1', bg: 'rgba(166,227,161,0.10)', limit: t('dash.billing.tokens.free') },
    pro:        { label: t('dash.billing.plan.pro'), color: '#89b4fa', bg: 'rgba(137,180,250,0.10)', limit: t('dash.billing.tokens.pro') },
    ultra:      { label: t('dash.billing.plan.ultra'), color: '#cba6f7', bg: 'rgba(203,166,247,0.10)', limit: t('dash.billing.tokens.ultra') },
    enterprise: { label: t('dash.billing.plan.enterprise'), color: '#f9e2af', bg: 'rgba(249,226,175,0.10)', limit: t('dash.billing.tokens.enterprise') },
    admin:      { label: t('dash.billing.plan.admin'), color: '#f38ba8', bg: 'rgba(243,139,168,0.10)', limit: t('dash.billing.tokens.admin') },
  };
  const tc = tierConfig[tier] || tierConfig.free;

  const freeUsed = usage?.period?.free_tokens_used || 0;
  const freeLimit = usage?.period?.free_tokens_limit || 3000000;
  const planUsed = usage?.period?.plan_tokens_used || 0;
  const planLimit = usage?.period?.plan_tokens_limit || 0;
  const topUpBalance = usage?.period?.topup_tokens_remaining || 0;

  const fmtTokens = (n: number) => n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}K` : `${n}`;
  const pct = (used: number, limit: number) => limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;

  return (
    <div style={pageWrapper}>
      <h1 style={pageTitle}>{t('dash.billing.title')}</h1>
      <p style={pageSubtitle}>{t('dash.billing.subtitle')}</p>

      {!connected ? (
        <div style={{ ...card, textAlign: 'center', padding: 60 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>{'\uD83D\uDCB3'}</div>
          <div style={{ fontSize: 14, color: '#cdd6f4', fontWeight: 500, marginBottom: 6 }}>Connect to view billing</div>
          <div style={{ fontSize: 12, color: '#6c7086' }}>Sign in with your platform key in the sidebar</div>
        </div>
      ) : loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#6c7086' }}>Loading billing data...</div>
      ) : (
        <>
          {/* Current Plan */}
          <div style={{ ...card, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 12, color: '#6c7086', marginBottom: 4 }}>{t('dash.billing.current_plan')}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 20, fontWeight: 700, color: '#cdd6f4' }}>{tc.label}</span>
                <span style={{ padding: '3px 10px', borderRadius: 8, fontSize: 11, fontWeight: 600, color: tc.color, background: tc.bg }}>{tc.limit}</span>
              </div>
            </div>
            <a href="https://ava-supernova.com/dashboard/billing" target="_blank" rel="noopener noreferrer" style={{
              padding: '8px 18px', borderRadius: 8, fontSize: 12, fontWeight: 600,
              background: 'linear-gradient(135deg, #a855f7, #7c3aed)', color: '#fff', textDecoration: 'none',
            }}>Manage Plan</a>
          </div>

          {/* Token Pools */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 16 }}>
            {/* Free Pool */}
            <div style={card}>
              <div style={{ fontSize: 12, color: '#6c7086', marginBottom: 8 }}>Free Tokens</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#a6e3a1', marginBottom: 4 }}>{fmtTokens(freeLimit - freeUsed)}</div>
              <div style={{ fontSize: 11, color: '#45475a', marginBottom: 10 }}>of {fmtTokens(freeLimit)} remaining</div>
              <div style={{ height: 6, background: 'rgba(49, 34, 68, 0.5)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${pct(freeUsed, freeLimit)}%`, background: 'linear-gradient(90deg, #a6e3a1, #94e2d5)', borderRadius: 3, transition: 'width 0.5s' }} />
              </div>
            </div>
            {/* Plan Pool */}
            <div style={card}>
              <div style={{ fontSize: 12, color: '#6c7086', marginBottom: 8 }}>Plan Tokens</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#89b4fa', marginBottom: 4 }}>{planLimit > 0 ? fmtTokens(planLimit - planUsed) : '—'}</div>
              <div style={{ fontSize: 11, color: '#45475a', marginBottom: 10 }}>{planLimit > 0 ? `of ${fmtTokens(planLimit)} remaining` : 'Upgrade for plan tokens'}</div>
              <div style={{ height: 6, background: 'rgba(49, 34, 68, 0.5)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${pct(planUsed, planLimit)}%`, background: 'linear-gradient(90deg, #89b4fa, #74c7ec)', borderRadius: 3, transition: 'width 0.5s' }} />
              </div>
            </div>
          </div>

          {/* Top-Up Balance */}
          {topUpBalance > 0 && (
            <div style={{ ...card, marginTop: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 12, color: '#6c7086', marginBottom: 4 }}>Top-Up Balance</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#f9e2af' }}>{fmtTokens(topUpBalance)}</div>
              </div>
              <span style={{ padding: '3px 10px', borderRadius: 8, fontSize: 10, color: '#f9e2af', background: 'rgba(249,226,175,0.10)' }}>Active</span>
            </div>
          )}

          {/* Top-Up Packages */}
          <h2 style={{ fontSize: 15, fontWeight: 600, color: '#cdd6f4', marginTop: 24, marginBottom: 12 }}>Top-Up Packages</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            {[
              { tokens: '3M', price: '$3', desc: 'Quick boost' },
              { tokens: '10M', price: '$8', desc: 'Best value', popular: true },
              { tokens: '25M', price: '$15', desc: 'Power user' },
            ].map((pkg) => (
              <div key={pkg.tokens} style={{
                ...card, textAlign: 'center', padding: '20px 16px', position: 'relative',
                borderColor: pkg.popular ? 'rgba(168,85,247,0.4)' : 'rgba(49, 34, 68, 0.5)',
              }}>
                {pkg.popular && <span style={{ position: 'absolute', top: -8, right: 12, fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: '#a855f7', color: '#fff' }}>POPULAR</span>}
                <div style={{ fontSize: 24, fontWeight: 700, color: '#cdd6f4', marginBottom: 2 }}>{pkg.tokens}</div>
                <div style={{ fontSize: 11, color: '#6c7086', marginBottom: 10 }}>{pkg.desc}</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#a855f7', marginBottom: 12 }}>{pkg.price}</div>
                <a href="https://ava-supernova.com/dashboard/billing" target="_blank" rel="noopener noreferrer" style={{
                  display: 'block', padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                  background: pkg.popular ? 'linear-gradient(135deg, #a855f7, #7c3aed)' : 'rgba(168,85,247,0.1)',
                  color: pkg.popular ? '#fff' : '#a855f7', border: pkg.popular ? 'none' : '1px solid rgba(168,85,247,0.25)',
                  textDecoration: 'none', textAlign: 'center',
                }}>Buy</a>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ===== 12. Connections ===== */
export function ConnectionsPage() {
  useLocale();
  const services = [
    { icon: '\uD83D\uDC19', name: t('dash.connections.github'), desc: t('dash.connections.github_desc') },
    { icon: '\u2709\uFE0F', name: t('dash.connections.email'), desc: t('dash.connections.email_desc') },
    { icon: '\uD83D\uDCAC', name: t('dash.connections.slack'), desc: t('dash.connections.slack_desc') },
    { icon: '\uD83C\uDFAE', name: t('dash.connections.discord'), desc: t('dash.connections.discord_desc') },
  ];

  return (
    <div style={pageWrapper}>
      <h1 style={pageTitle}>{t('dash.connections.title')}</h1>
      <p style={pageSubtitle}>{t('dash.connections.subtitle')}</p>

      <div style={{ ...card, textAlign: 'center', padding: '32px 20px', marginBottom: 24 }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>{'\uD83D\uDD17'}</div>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#cdd6f4', marginBottom: 4 }}>{t('dash.connections.coming_soon')}</div>
        <div style={{ fontSize: 12, color: '#6c7086' }}>{t('dash.connections.coming_soon_desc')}</div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {services.map((svc) => (
          <div key={svc.name} style={{ ...card, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12, opacity: 0.5 }}>
            <span style={{ fontSize: 22 }}>{svc.icon}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#cdd6f4' }}>{svc.name}</div>
              <div style={{ fontSize: 11, color: '#6c7086' }}>{svc.desc}</div>
            </div>
            <span style={{ fontSize: 10, fontWeight: 600, padding: '3px 10px', borderRadius: 6, background: 'rgba(108,112,134,0.10)', color: '#6c7086' }}>{t('dash.connections.inactive')}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* Full ConnectionsPage implementation preserved in git — swap back when backend is ready */

/* ===== 13. Support (Live Chat) ===== */
export function SupportPage() {
  useLocale();
  const [, setAuthKey] = useState(0);
  useEffect(() => {
    const handler = () => {
      if (!checkConnected()) { setConversations([]); setMessages([]); setActiveConvId(null); setInput(''); }
      setAuthKey(k => k + 1);
    };
    window.addEventListener('ava-auth-changed', handler);
    return () => window.removeEventListener('ava-auth-changed', handler);
  }, []);
  const connected = checkConnected();
  const [conversations, setConversations] = useState<any[]>([]);
  const [messages, setMessages] = useState<any[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load conversations on mount (and re-fetch on auth change)
  useEffect(() => {
    if (!connected) { setLoading(false); return; }
    apiFetch('/support/conversations')
      .then((data: any) => {
        const convs = data?.conversations || [];
        setConversations(convs);
        // Update unread badge in sidebar
        const unread = convs.reduce((sum: number, c: any) => sum + (c.unread_user || 0), 0);
        try { localStorage.setItem('ava-support-unread', String(unread)); } catch { /* */ }
      })
      .catch(() => setConversations([]))
      .finally(() => setLoading(false));
  }, [connected]);

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const loadMessages = useCallback(async (convId: string) => {
    try {
      const data: any = await apiFetch(`/support/conversations/${convId}/messages`);
      setMessages(data?.messages || []);
      setActiveConvId(convId);
      // Mark as read
      apiFetch(`/support/conversations/${convId}/read`, { method: 'POST' }).catch(() => {});
    } catch { setMessages([]); }
  }, []);

  // Poll for new messages every 10 seconds
  useEffect(() => {
    if (!activeConvId) return;
    const interval = setInterval(() => {
      apiFetch(`/support/conversations/${activeConvId}/messages`)
        .then((data: any) => { if (data?.messages) setMessages(data.messages); })
        .catch(() => {});
    }, 10_000);
    return () => clearInterval(interval);
  }, [activeConvId]);

  const handleSend = useCallback(async () => {
    if (!input.trim() || sending) return;
    const text = input.trim();
    setInput('');
    setSending(true);
    try {
      if (activeConvId) {
        await apiFetch(`/support/conversations/${activeConvId}/messages`, {
          method: 'POST', body: JSON.stringify({ message: text }),
        });
        // Reload messages after a delay (Ava responds async)
        setTimeout(() => loadMessages(activeConvId), 1500);
      } else {
        const data: any = await apiFetch('/support/conversations', {
          method: 'POST', body: JSON.stringify({ message: text, platform: 'ide' }),
        });
        if (data?.conversation) {
          setActiveConvId(data.conversation.id);
          setTimeout(() => loadMessages(data.conversation.id), 1500);
          // Refresh list
          apiFetch('/support/conversations').then((d: any) => setConversations(d?.conversations || [])).catch(() => {});
        }
      }
    } catch { /* */ }
    setSending(false);
  }, [input, sending, activeConvId, loadMessages]);

  if (!connected) {
    const openExternal = (url: string) => {
      import('@tauri-apps/plugin-opener').then(({ openUrl }) => openUrl(url)).catch(() => window.open(url, '_blank'));
    };
    const linkCard: React.CSSProperties = {
      ...card, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer', border: '1px solid rgba(168,85,247,0.12)',
    };
    return (
      <div style={pageWrapper}>
        <div style={{ maxWidth: 480, margin: '0 auto', padding: '40px 0' }}>
          <div style={{ fontSize: 28, marginBottom: 16, textAlign: 'center' }}>Need help?</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={linkCard} onClick={() => openExternal('https://github.com/AugmentedValueAcceleration/ava-supernova/issues')}>
              <span style={{ fontSize: 24 }}>🐙</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#cdd6f4' }}>GitHub Issues</div>
                <div style={{ fontSize: 11, color: '#6c7086', marginTop: 2 }}>Report bugs, request features, or ask questions</div>
              </div>
            </div>
            <div style={linkCard} onClick={() => openExternal('https://discord.gg/tuHZzUGxA6')}>
              <span style={{ fontSize: 24 }}>💬</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#cdd6f4' }}>Community</div>
                <div style={{ fontSize: 11, color: '#6c7086', marginTop: 2 }}>Join the community for help and discussion</div>
              </div>
            </div>
            <div style={linkCard} onClick={() => window.dispatchEvent(new CustomEvent('ava-support-nav-docs'))}>
              <span style={{ fontSize: 24 }}>📖</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#cdd6f4' }}>Documentation</div>
                <div style={{ fontSize: 11, color: '#6c7086', marginTop: 2 }}>Guides, setup instructions, and API reference</div>
              </div>
            </div>
          </div>
          <div style={{ textAlign: 'center', marginTop: 20, fontSize: 11, color: '#585b70' }}>
            Connect your account for live chat support with the team
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      {/* Conversation list */}
      <div style={{ width: 200, borderRight: '1px solid rgba(168,85,247,0.12)', overflowY: 'auto', padding: 8 }}>
        <button
          onClick={() => { setActiveConvId(null); setMessages([]); }}
          style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(168,85,247,0.2)', background: 'transparent', color: '#a855f7', fontSize: 11, cursor: 'pointer', marginBottom: 8 }}
        >+ New chat</button>
        {conversations.map((conv: any) => (
          <button
            key={conv.id}
            onClick={() => loadMessages(conv.id)}
            style={{
              width: '100%', textAlign: 'left', padding: '10px 12px', borderRadius: 8, border: 'none', cursor: 'pointer', marginBottom: 4,
              background: activeConvId === conv.id ? 'rgba(168,85,247,0.1)' : 'transparent',
              borderLeft: activeConvId === conv.id ? '2px solid #a855f7' : '2px solid transparent',
            }}
          >
            <div style={{ fontSize: 10, color: '#585b70', marginBottom: 2 }}>
              {new Date(conv.last_message_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
              {conv.unread_user > 0 && (
                <span style={{ float: 'right', background: '#a855f7', color: '#fff', borderRadius: '50%', width: 14, height: 14, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 700 }}>{conv.unread_user}</span>
              )}
            </div>
            <div style={{ fontSize: 11, color: '#a6adc8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {conv.lastMessage?.preview || conv.summary || 'New conversation'}
            </div>
          </button>
        ))}
      </div>

      {/* Chat area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {activeConvId || messages.length > 0 ? (
          <>
            {/* Messages */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {messages.map((msg: any) => {
                const isUser = msg.sender_type === 'user';
                const time = new Date(msg.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
                return (
                  <div key={msg.id} style={{ display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start' }}>
                    <div style={{
                      maxWidth: '75%', borderRadius: 12, padding: '10px 14px',
                      background: isUser ? '#a855f7' : 'rgba(49, 34, 68, 0.5)',
                      color: isUser ? '#fff' : '#a6adc8',
                    }}>
                      {!isUser && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                          <span style={{ fontSize: 10, fontWeight: 600, color: '#cdd6f4' }}>{msg.sender_name}</span>
                          {msg.is_ava && (
                            <span style={{ fontSize: 7, fontWeight: 700, color: '#a855f7', background: 'rgba(168,85,247,0.15)', padding: '1px 5px', borderRadius: 4, textTransform: 'uppercase', letterSpacing: 1 }}>Ava</span>
                          )}
                        </div>
                      )}
                      <div style={{ fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{msg.body}</div>
                      <div style={{ fontSize: 9, marginTop: 4, opacity: 0.5 }}>{time}</div>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>
            {/* Input */}
            <div style={{ borderTop: '1px solid rgba(168,85,247,0.12)', padding: 12, display: 'flex', gap: 8 }}>
              <textarea
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                placeholder="Type a message..."
                rows={1}
                style={{ flex: 1, padding: '8px 14px', background: 'rgba(10,6,18,0.8)', border: '1px solid rgba(168,85,247,0.12)', borderRadius: 8, color: '#cdd6f4', fontSize: 13, outline: 'none', resize: 'none', fontFamily: 'inherit' }}
              />
              <button onClick={handleSend} disabled={!input.trim() || sending} style={{ padding: '8px 18px', borderRadius: 8, border: 'none', fontSize: 12, fontWeight: 600, background: '#a855f7', color: '#fff', cursor: 'pointer', opacity: !input.trim() || sending ? 0.3 : 1 }}>Send</button>
            </div>
          </>
        ) : (
          /* Empty state */
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 40 }}>
            <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'rgba(168,85,247,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16, fontSize: 24 }}>💬</div>
            <div style={{ fontSize: 14, fontWeight: 500, color: '#cdd6f4', marginBottom: 4 }}>Need a hand?</div>
            <div style={{ fontSize: 12, color: '#6c7086', marginBottom: 20, maxWidth: 280, textAlign: 'center' }}>
              Just type your question below. Ava will try to help first — and if she can't, the team will jump in.
            </div>
            <div style={{ display: 'flex', gap: 8, width: '100%', maxWidth: 360 }}>
              <textarea
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                placeholder="What's up?"
                rows={1}
                style={{ flex: 1, padding: '8px 14px', background: 'rgba(10,6,18,0.8)', border: '1px solid rgba(168,85,247,0.12)', borderRadius: 8, color: '#cdd6f4', fontSize: 13, outline: 'none', resize: 'none', fontFamily: 'inherit' }}
              />
              <button onClick={handleSend} disabled={!input.trim() || sending} style={{ padding: '8px 18px', borderRadius: 8, border: 'none', fontSize: 12, fontWeight: 600, background: '#a855f7', color: '#fff', cursor: 'pointer', opacity: !input.trim() || sending ? 0.3 : 1 }}>Send</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ===== 14. Documentation ===== */
interface DocSection {
  id: string;
  title: string;
  content: React.ReactNode;
}

export function DocumentationPage() {
  useLocale();
  const [activeSection, setActiveSection] = useState<string>('getting-started');
  const [searchQuery, setSearchQuery] = useState('');

  const docSections: DocSection[] = [
    {
      id: 'getting-started', title: t('dash.docs.getting_started'),
      content: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <p style={{ color: '#a6adc8', lineHeight: 1.7 }}>
            {t('dash.docs.getting_started_intro')}
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            {[
              { step: '1', title: t('dash.docs.step1_title'), desc: t('dash.docs.step1_desc') },
              { step: '2', title: t('dash.docs.step2_title'), desc: t('dash.docs.step2_desc') },
              { step: '3', title: t('dash.docs.step3_title'), desc: t('dash.docs.step3_desc') },
            ].map((s) => (
              <div key={s.step} style={{ ...card, padding: 16 }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'linear-gradient(135deg, #a855f7, #7c3aed)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 10 }}>{s.step}</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#cdd6f4', marginBottom: 6 }}>{s.title}</div>
                <div style={{ fontSize: 12, color: '#6c7086', lineHeight: 1.6 }}>{s.desc}</div>
              </div>
            ))}
          </div>
        </div>
      ),
    },
    {
      id: 'local-vs-cloud', title: t('dash.docs.local_vs_cloud'),
      content: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={{ ...card, padding: 16, borderColor: 'rgba(166,227,161,0.3)' }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#a6e3a1', marginBottom: 8 }}>{t('dash.docs.local_mode')}</div>
              <ul style={{ fontSize: 12, color: '#a6adc8', lineHeight: 1.8, paddingLeft: 16, margin: 0 }}>
                <li>{t('dash.docs.local_mode_1')}</li>
                <li>{t('dash.docs.local_mode_2')}</li>
                <li>{t('dash.docs.local_mode_3')}</li>
                <li>{t('dash.docs.local_mode_4')}</li>
                <li>{t('dash.docs.local_mode_5')}</li>
                <li>{t('dash.docs.local_mode_6')}</li>
              </ul>
            </div>
            <div style={{ ...card, padding: 16, borderColor: 'rgba(168,85,247,0.3)' }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#a855f7', marginBottom: 8 }}>{t('dash.docs.cloud_mode')}</div>
              <ul style={{ fontSize: 12, color: '#a6adc8', lineHeight: 1.8, paddingLeft: 16, margin: 0 }}>
                <li>{t('dash.docs.cloud_mode_1')}</li>
                <li>{t('dash.docs.cloud_mode_2')}</li>
                <li>{t('dash.docs.cloud_mode_3')}</li>
                <li>{t('dash.docs.cloud_mode_4')}</li>
                <li>{t('dash.docs.cloud_mode_5')}</li>
                <li>{t('dash.docs.cloud_mode_6')}</li>
              </ul>
            </div>
          </div>
        </div>
      ),
    },
    {
      id: 'modes', title: t('dash.docs.modes'),
      content: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p style={{ color: '#a6adc8', lineHeight: 1.7 }}>{t('dash.docs.modes_intro')}</p>
          {[
            { icon: '>>', name: t('dash.docs.mode_work'), desc: t('dash.docs.mode_work_desc'), key: 'Ctrl+Shift+1' },
            { icon: '::', name: t('dash.docs.mode_plan'), desc: t('dash.docs.mode_plan_desc'), key: 'Ctrl+Shift+2' },
            { icon: '..', name: t('dash.docs.mode_chat'), desc: t('dash.docs.mode_chat_desc'), key: 'Ctrl+Shift+3' },
            { icon: '??', name: t('dash.docs.mode_teach'), desc: t('dash.docs.mode_teach_desc'), key: 'Ctrl+Shift+4' },
            { icon: '!!', name: t('dash.docs.mode_security'), desc: t('dash.docs.mode_security_desc'), key: 'Ctrl+Shift+5' },
            { icon: '**', name: t('dash.docs.mode_brainstorm'), desc: t('dash.docs.mode_brainstorm_desc'), key: 'Ctrl+Shift+6' },
          ].map((m) => (
            <div key={m.name} style={{ ...card, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 14 }}>
              <span style={{ fontFamily: 'monospace', fontSize: 14, color: '#a855f7', fontWeight: 700, width: 28 }}>{m.icon}</span>
              <div style={{ flex: 1 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#cdd6f4' }}>{m.name}</span>
                <span style={{ fontSize: 12, color: '#6c7086', marginLeft: 8 }}>{m.desc}</span>
              </div>
              <span style={{ fontSize: 10, color: '#45475a', fontFamily: 'monospace' }}>{m.key}</span>
            </div>
          ))}
        </div>
      ),
    },
    {
      id: 'tools', title: t('dash.docs.tools'),
      content: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p style={{ color: '#a6adc8', lineHeight: 1.7 }}>{t('dash.docs.tools_intro')}</p>
          {[
            { cat: t('dash.docs.tools_cat_file'), tools: 'file_read, file_write, file_edit, glob, grep, list_directory, find_symbol, project_index' },
            { cat: t('dash.docs.tools_cat_shell'), tools: 'bash, git_status, git_diff, git_commit, git_create_pr, rollback' },
            { cat: t('dash.docs.tools_cat_web'), tools: 'web_search, http_request, browser' },
            { cat: t('dash.docs.tools_cat_media'), tools: 'screenshot, generate_image, remove_background' },
            { cat: t('dash.docs.tools_cat_memory'), tools: 'memory_save, memory_recall, memory_update, memory_delete' },
            { cat: t('dash.docs.tools_cat_planning'), tools: 'present_plan, todo_write, task_manage' },
            { cat: t('dash.docs.tools_cat_office'), tools: 'document_manage (.docx/.pdf/.csv/.md), presentation_create (.pptx), email_draft, report_generate' },
            { cat: t('dash.docs.tools_cat_learning'), tools: 'learning_create, learning_teach, learning_progress' },
            { cat: t('dash.docs.tools_cat_testing'), tools: 'test_run, test_generate, analyze_architecture, doc_generate, audit_dependencies, benchmark' },
            { cat: t('dash.docs.tools_cat_utility'), tools: 'ask_user, get_datetime, detect_language, weather, news, journal_write, self_inspect, release_notes' },
          ].map((g) => (
            <div key={g.cat} style={{ ...card, padding: '10px 16px' }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#a855f7', marginBottom: 4 }}>{g.cat}</div>
              <div style={{ fontSize: 11, color: '#6c7086', fontFamily: 'monospace', lineHeight: 1.8 }}>{g.tools}</div>
            </div>
          ))}
        </div>
      ),
    },
    {
      id: 'library', title: t('dash.docs.library'),
      content: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p style={{ color: '#a6adc8', lineHeight: 1.7 }}>
            {t('dash.docs.library_intro')}
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {[
              { title: t('dash.docs.library_grid'), desc: t('dash.docs.library_grid_desc') },
              { title: t('dash.docs.library_filter'), desc: t('dash.docs.library_filter_desc') },
              { title: t('dash.docs.library_details'), desc: t('dash.docs.library_details_desc') },
              { title: t('dash.docs.library_preview'), desc: t('dash.docs.library_preview_desc') },
            ].map((f) => (
              <div key={f.title} style={{ ...card, padding: 14 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#cdd6f4', marginBottom: 4 }}>{f.title}</div>
                <div style={{ fontSize: 12, color: '#6c7086', lineHeight: 1.6 }}>{f.desc}</div>
              </div>
            ))}
          </div>
        </div>
      ),
    },
    {
      id: 'images-files', title: t('dash.docs.images_files'),
      content: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p style={{ color: '#a6adc8', lineHeight: 1.7 }}>{t('dash.docs.images_intro')}</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {[
              { title: t('dash.docs.images_paste'), desc: t('dash.docs.images_paste_desc') },
              { title: t('dash.docs.images_drag'), desc: t('dash.docs.images_drag_desc') },
              { title: t('dash.docs.images_attach'), desc: t('dash.docs.images_attach_desc') },
              { title: t('dash.docs.images_display'), desc: t('dash.docs.images_display_desc') },
            ].map((f) => (
              <div key={f.title} style={{ ...card, padding: 14 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#cdd6f4', marginBottom: 4 }}>{f.title}</div>
                <div style={{ fontSize: 12, color: '#6c7086', lineHeight: 1.6 }}>{f.desc}</div>
              </div>
            ))}
          </div>
        </div>
      ),
    },
    {
      id: 'personas', title: t('dash.docs.personas'),
      content: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p style={{ color: '#a6adc8', lineHeight: 1.7 }}>{t('dash.docs.personas_intro')}</p>
          {[
            { mode: t('dash.docs.mode_work'), team: 'Scout, Architect, Verifier, Sequencer, Challenger, Builder' },
            { mode: t('dash.docs.mode_plan'), team: 'Researcher, Architect, Challenger' },
            { mode: t('dash.docs.mode_teach'), team: 'Curriculum Architect, Content Writer, Fact Checker, Quiz Master, Tutor' },
            { mode: t('dash.docs.mode_security'), team: 'Recon, Scanner, CVE Researcher, Verifier, Reporter' },
            { mode: t('dash.docs.mode_brainstorm'), team: 'Explorer, Researcher, Ideator, Challenger, Refiner' },
          ].map((p) => (
            <div key={p.mode} style={{ ...card, padding: '10px 16px' }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#a855f7' }}>{p.mode}:</span>
              <span style={{ fontSize: 12, color: '#6c7086', marginLeft: 8 }}>{p.team}</span>
            </div>
          ))}
          <p style={{ fontSize: 11, color: '#45475a' }}>{t('dash.docs.personas_chat_note')}</p>
        </div>
      ),
    },
    {
      id: 'memory', title: t('dash.docs.memory'),
      content: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p style={{ color: '#a6adc8', lineHeight: 1.7 }}>{t('dash.docs.memory_intro')}</p>
          {[
            { layer: t('dash.docs.memory_l1'), desc: t('dash.docs.memory_l1_desc') },
            { layer: t('dash.docs.memory_l2'), desc: t('dash.docs.memory_l2_desc') },
            { layer: t('dash.docs.memory_l3'), desc: t('dash.docs.memory_l3_desc') },
            { layer: t('dash.docs.memory_l4'), desc: t('dash.docs.memory_l4_desc') },
            { layer: t('dash.docs.memory_l5'), desc: t('dash.docs.memory_l5_desc') },
          ].map((l) => (
            <div key={l.layer} style={{ ...card, padding: '10px 16px' }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#a855f7' }}>{l.layer}</div>
              <div style={{ fontSize: 12, color: '#6c7086' }}>{l.desc}</div>
            </div>
          ))}
        </div>
      ),
    },
    {
      id: 'shortcuts', title: t('dash.docs.shortcuts'),
      content: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[
            { keys: 'Ctrl+Shift+1-6', action: t('dash.docs.shortcuts_modes') },
            { keys: 'Enter', action: t('dash.docs.shortcuts_send') },
            { keys: 'Shift+Enter', action: t('dash.docs.shortcuts_newline') },
            { keys: 'Ctrl+V', action: t('dash.docs.shortcuts_paste') },
            { keys: 'F12', action: t('dash.docs.shortcuts_devtools') },
          ].map((s) => (
            <div key={s.keys} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: '1px solid rgba(168, 85, 247, 0.12)' }}>
              <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#f5c2e7', background: 'rgba(49, 34, 68, 0.5)', padding: '3px 10px', borderRadius: 6, flexShrink: 0 }}>{s.keys}</span>
              <span style={{ fontSize: 12, color: '#6c7086' }}>{s.action}</span>
            </div>
          ))}
        </div>
      ),
    },
    {
      id: 'tasks-panel', title: t('dash.docs.tasks_panel'),
      content: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p style={{ color: '#a6adc8', lineHeight: 1.7 }}>
            {t('dash.docs.tasks_intro')}
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={{ ...card, padding: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#a855f7', marginBottom: 6 }}>{t('dash.docs.tasks_ava_tab')}</div>
              <div style={{ fontSize: 12, color: '#6c7086', lineHeight: 1.6 }}>
                {t('dash.docs.tasks_ava_desc')}
              </div>
            </div>
            <div style={{ ...card, padding: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#a855f7', marginBottom: 6 }}>{t('dash.docs.tasks_my_tab')}</div>
              <div style={{ fontSize: 12, color: '#6c7086', lineHeight: 1.6 }}>
                {t('dash.docs.tasks_my_desc')}
              </div>
            </div>
          </div>
          <p style={{ color: '#6c7086', fontSize: 12 }}>
            {t('dash.docs.tasks_resize')}
          </p>
        </div>
      ),
    },
    {
      id: 'dashboard', title: t('dash.docs.dashboard'),
      content: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p style={{ color: '#a6adc8', lineHeight: 1.7 }}>{t('dash.docs.dashboard_intro')}</p>
          {[
            { section: t('dash.docs.dashboard_main'), pages: t('dash.docs.dashboard_main_pages') },
            { section: t('dash.docs.dashboard_workspace'), pages: t('dash.docs.dashboard_workspace_pages') },
            { section: t('dash.docs.dashboard_personalise'), pages: t('dash.docs.dashboard_personalise_pages') },
            { section: t('dash.docs.dashboard_account'), pages: t('dash.docs.dashboard_account_pages') },
            { section: t('dash.docs.dashboard_help'), pages: t('dash.docs.dashboard_help_pages') },
          ].map(s => (
            <div key={s.section} style={{ display: 'flex', gap: 10, padding: '6px 0', borderBottom: '1px solid rgba(168, 85, 247, 0.12)' }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#cba6f7', minWidth: 90 }}>{s.section}</span>
              <span style={{ fontSize: 12, color: '#6c7086' }}>{s.pages}</span>
            </div>
          ))}
          <p style={{ color: '#6c7086', fontSize: 12 }}>
            {t('dash.docs.dashboard_collapse_note')}
          </p>
        </div>
      ),
    },
    {
      id: 'session-stats', title: t('dash.docs.session_stats'),
      content: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p style={{ color: '#a6adc8', lineHeight: 1.7 }}>
            {t('dash.docs.session_stats_intro')}
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            {[t('dash.docs.session_stats_1'), t('dash.docs.session_stats_2'), t('dash.docs.session_stats_3')].map(item => (
              <div key={item} style={{ ...card, padding: 12, fontSize: 12, color: '#6c7086', lineHeight: 1.5 }}>{item}</div>
            ))}
          </div>
          <p style={{ color: '#6c7086', fontSize: 12 }}>
            {t('dash.docs.session_stats_note')}
          </p>
        </div>
      ),
    },
    {
      id: 'unified-panel', title: 'Unified Panel',
      content: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p style={{ color: '#a6adc8', lineHeight: 1.7 }}>
            Chat and Dashboard are merged into one unified app inside a single editor panel. No more switching between separate views.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={{ ...card, padding: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#cdd6f4', marginBottom: 8 }}>Sidebar Controls</div>
              <ul style={{ fontSize: 12, color: '#a6adc8', lineHeight: 1.8, paddingLeft: 16, margin: 0 }}>
                <li>Collapse/expand toggle</li>
                <li>Flip between left and right</li>
                <li>Task calendar always visible</li>
                <li>Persisted across sessions</li>
              </ul>
            </div>
            <div style={{ ...card, padding: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#cdd6f4', marginBottom: 8 }}>Chat Header</div>
              <ul style={{ fontSize: 12, color: '#a6adc8', lineHeight: 1.8, paddingLeft: 16, margin: 0 }}>
                <li>Model selector</li>
                <li>Local/Cloud &amp; Provider toggles</li>
                <li>Session token counter</li>
                <li>Context usage ring (80%/90% warnings)</li>
              </ul>
            </div>
          </div>
          <p style={{ color: '#6c7086', fontSize: 12 }}>
            All thinking, tool calls, and text appear in one cohesive bubble per response. Identical layout across VS Code extension and IDE.
          </p>
        </div>
      ),
    },
    {
      id: 'local-cloud-sync', title: 'Local/Cloud Data Sync',
      content: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p style={{ color: '#a6adc8', lineHeight: 1.7 }}>
            Your data, your choice. Ava is local-first by default — nothing leaves your machine unless you choose it.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={{ ...card, padding: 16, borderColor: 'rgba(166,227,161,0.3)' }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#a6e3a1', marginBottom: 8 }}>Local (Default)</div>
              <p style={{ fontSize: 12, color: '#a6adc8', lineHeight: 1.6 }}>Data stays on your machine. Nothing syncs. Full privacy.</p>
            </div>
            <div style={{ ...card, padding: 16, borderColor: 'rgba(137,180,250,0.3)' }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#89b4fa', marginBottom: 8 }}>Cloud</div>
              <p style={{ fontSize: 12, color: '#a6adc8', lineHeight: 1.6 }}>Auto-syncs every 15 minutes. Memory, tasks, journal, learning, history, settings, personality.</p>
            </div>
          </div>
          <p style={{ color: '#6c7086', fontSize: 12 }}>
            Toggle in the chat header. Only visible when connected to a platform account. BYOK users without an account never see it.
          </p>
        </div>
      ),
    },
    {
      id: 'interjection', title: 'Mid-Task Interjection',
      content: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p style={{ color: '#a6adc8', lineHeight: 1.7 }}>
            Get Ava{"'"}s attention while she{"'"}s working without losing progress.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            {[
              { title: 'Pause', desc: 'Tap the pause button. Ava stops, acknowledges, and asks what you need. She remembers what she was doing.' },
              { title: 'Type While Running', desc: 'Your message is injected as an interjection. Ava sees it mid-run and adjusts her work.' },
              { title: 'Hard Stop', desc: 'Hold the stop button 800ms. Kills the current run completely. Use when something went wrong.' },
            ].map(s => (
              <div key={s.title} style={{ ...card, padding: 16 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#cdd6f4', marginBottom: 8 }}>{s.title}</div>
                <p style={{ fontSize: 12, color: '#6c7086', lineHeight: 1.6 }}>{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      ),
    },
    {
      id: 'creative-studio', title: 'Creative Studio',
      content: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p style={{ color: '#a6adc8', lineHeight: 1.7 }}>
            Generate images, music, voice, and video directly from the IDE using MiniMax's AI models. All generated assets are saved locally to <code style={{ color: '#a855f7', background: 'rgba(168,85,247,0.1)', padding: '1px 4px', borderRadius: 3 }}>~/.ava/creative/</code>.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {[
              { icon: '\uD83D\uDDBC\uFE0F', title: 'Images', desc: 'Generate images from text prompts. Choose aspect ratio (1:1, 3:4, 4:3).' },
              { icon: '\uD83C\uDFB5', title: 'Audio / Music', desc: 'Generate music with optional lyrics. Full songs or instrumentals.' },
              { icon: '\uD83C\uDF99\uFE0F', title: 'Voice', desc: 'Text-to-speech with multiple voice styles and speed control.' },
              { icon: '\uD83C\uDFAC', title: 'Video', desc: 'Generate short videos from text prompts. 6 or 10 second clips.' },
            ].map(s => (
              <div key={s.title} style={{ ...card, padding: 14 }}>
                <div style={{ fontSize: 20, marginBottom: 6 }}>{s.icon}</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#cdd6f4', marginBottom: 4 }}>{s.title}</div>
                <div style={{ fontSize: 11, color: '#6c7086', lineHeight: 1.5 }}>{s.desc}</div>
              </div>
            ))}
          </div>
          <p style={{ fontSize: 11, color: '#585b70' }}>
            Requires a connected account with available tokens. Generated assets are stored locally in the Library tab and can optionally be synced to cloud.
          </p>
        </div>
      ),
    },
    {
      id: 'release-notes', title: t('dash.docs.release_notes'),
      content: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p style={{ color: '#a6adc8', lineHeight: 1.7 }}>
            {t('dash.docs.release_notes_intro')}
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {[
              { label: t('dash.releases.core'), color: '#89b4fa' },
              { label: t('dash.releases.extension'), color: '#a855f7' },
              { label: t('dash.releases.ide'), color: '#a6e3a1' },
              { label: t('dash.releases.companion'), color: '#fab387' },
            ].map(p => (
              <span key={p.label} style={{ fontSize: 11, fontWeight: 600, color: p.color, background: `${p.color}18`, padding: '4px 12px', borderRadius: 6 }}>{p.label}</span>
            ))}
          </div>
          <p style={{ color: '#6c7086', fontSize: 12 }}>
            {t('dash.docs.release_notes_note')}
          </p>
        </div>
      ),
    },
  ];

  const filteredSections = searchQuery
    ? docSections.filter((s) => s.title.toLowerCase().includes(searchQuery.toLowerCase()))
    : docSections;

  return (
    <div style={{ ...pageWrapper, display: 'flex', gap: 0, padding: 0, height: '100%', overflow: 'hidden' }}>
      {/* Sidebar nav */}
      <div style={{
        width: 200, flexShrink: 0, borderRight: '1px solid rgba(168, 85, 247, 0.12)', background: 'rgba(26, 16, 40, 0.6)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        <div style={{ padding: '16px 12px 8px' }}>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('dash.docs.search_placeholder')}
            style={{
              width: '100%', padding: '6px 10px', background: 'rgba(10, 6, 18, 0.8)', border: '1px solid rgba(168, 85, 247, 0.12)',
              borderRadius: 6, color: '#cdd6f4', fontSize: 12, outline: 'none',
            }}
          />
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '4px 8px' }}>
          {filteredSections.map((s) => (
            <button
              key={s.id}
              onClick={() => { setActiveSection(s.id); document.getElementById(`doc-${s.id}`)?.scrollIntoView({ behavior: 'smooth' }); }}
              style={{
                display: 'block', width: '100%', textAlign: 'left', padding: '7px 10px',
                borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12,
                background: activeSection === s.id ? 'rgba(168,85,247,0.15)' : 'transparent',
                color: activeSection === s.id ? '#e0b0ff' : '#6c7086',
                fontWeight: activeSection === s.id ? 600 : 400,
                marginBottom: 2,
              }}
            >{s.title}</button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '32px 40px' }}>
        <h1 style={pageTitle}>{t('dash.docs.title')}</h1>
        <p style={{ ...pageSubtitle, marginBottom: 32 }}>{t('dash.docs.subtitle')}</p>

        {filteredSections.map((s) => (
          <div key={s.id} id={`doc-${s.id}`} style={{ marginBottom: 40 }}>
            <h2 style={{ fontSize: 18, fontWeight: 600, color: '#cdd6f4', marginBottom: 16, paddingBottom: 8, borderBottom: '1px solid rgba(168, 85, 247, 0.12)' }}>{s.title}</h2>
            {s.content}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ===== 12. Release Notes ===== */
const PLATFORM_COLOURS: Record<string, string> = {
  core: '#89b4fa',
  extension: '#a855f7',
  ide: '#a6e3a1',
  companion: '#fab387',
};
const PLATFORM_LABELS: Record<string, string> = {
  core: t('dash.releases.core'),
  extension: t('dash.releases.extension'),
  ide: t('dash.releases.ide'),
  companion: t('dash.releases.companion'),
};

export function ReleaseNotesPage() {
  useLocale();
  const connected = checkConnected();
  const [apiReleases, setApiReleases] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    setLoading(true);
    fetchReleasesDirect(getLocale(), 50).then(d => {
      setApiReleases(Array.isArray(d) ? d : []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState('');
  const [platformTab, setPlatformTab] = useState<string>('all');

  const fallbackReleases = [
    {
      id: 'v0.12.0', version: '0.12.0', title: 'Security Hardening + Local-First Architecture', published_at: '2026-04-08',
      tool_count: 59, body: 'Security hardening, local-first architecture, token display consistency across all platforms.', platform: 'ide',
      highlights: ['Security: shell execute removed, XSS fixed, CSP tightened', 'Local-first: Tasks, Journal, Learning, Memory persist locally', 'Token bars show remaining consistently', 'Creative Studio token bar with subscription awareness', 'Help page: Docs tab, Support links for unconnected users'],
    },
    {
      id: 'v0.11.0', version: '0.11.0', title: 'Qwen 3.6 Plus + Security Fixes', published_at: '2026-04-07',
      tool_count: 59, body: 'Qwen 3.6 Plus as conductor model, security fixes for path traversal and cwd fallback.', platform: 'ide',
      highlights: ['Qwen 3.6 Plus as sole reasoning model', 'Path traversal security fix', 'Category permissions with audit trail'],
    },
    {
      id: 'v0.34.5', version: '0.34.5', title: 'Creative Studio + Token Balance', published_at: '2026-04-06',
      tool_count: 59, body: 'Creative Studio with image, music, voice, and video generation via MiniMax.', platform: 'extension',
      highlights: ['Creative Studio: image, music, voice, video generation', 'Token balance bar in Creative Studio', 'Live chat support'],
    },
    {
      id: 'v0.20.0', version: '0.20.0', title: 'Persona System', published_at: '2026-03-17',
      tool_count: 59, body: '24 specialist personas orchestrated across 5 modes.', platform: 'core',
      highlights: ['24 specialist personas across 5 modes', 'Persona orchestration via Conductor'],
    },
    {
      id: 'v0.19.0', version: '0.19.0', title: 'Companion Overhaul', published_at: '2026-03-15',
      tool_count: 59, body: 'Full companion redesign with real-time sync.', platform: 'companion',
      highlights: ['Companion app overhaul', 'Real-time sync', 'Mobile-optimised chat'],
    },
  ];

  const releases: any[] = (connected && apiReleases && apiReleases.length > 0) ? apiReleases : fallbackReleases;

  // Auto-expand latest on first load
  useEffect(() => {
    if (releases.length > 0 && expanded === null) {
      const first = releases[0];
      setExpanded(first.id || first.version);
      const d = new Date(first.published_at || first.date);
      setSelectedMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
  }, [releases.length]);

  const getMonthKey = (dateStr: string) => {
    const d = new Date(dateStr);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  };

  const formatMonth = (date: Date) => {
    return date.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  };

  const months = useMemo(() => {
    const seen = new Map<string, string>();
    for (const r of releases) {
      const dateStr = r.published_at || r.date;
      if (!dateStr) continue;
      const key = getMonthKey(dateStr);
      if (!seen.has(key)) seen.set(key, formatMonth(new Date(dateStr)));
    }
    return Array.from(seen.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [releases]);

  const filtered = useMemo(() => {
    let list = releases;
    if (platformTab !== 'all') list = list.filter((r: any) => (r.platform || 'extension') === platformTab);
    if (selectedMonth) list = list.filter((r: any) => getMonthKey(r.published_at || r.date) === selectedMonth);
    return list;
  }, [releases, selectedMonth, platformTab]);

  const platformTabs = ['all', 'core', 'extension', 'ide', 'companion'];

  return (
    <div style={pageWrapper}>
      <div style={{ width: '100%' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <div style={pageTitle}>{t('dash.releases.title')}</div>
            <div style={pageSubtitle}>{t('dash.releases.subtitle')}</div>
          </div>
          <CustomSelect
            value={selectedMonth}
            onChange={setSelectedMonth}
            width={180}
            placeholder={t('dash.releases.all_months')}
            options={[{ value: '', label: t('dash.releases.all_months') }, ...months.map(([key, label]) => ({ value: key, label }))]}
          />
        </div>

        {/* Platform tabs */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 20, flexWrap: 'wrap' }}>
          {platformTabs.map(tab => {
            const isActive = platformTab === tab;
            const colour = tab === 'all' ? '#a855f7' : PLATFORM_COLOURS[tab];
            return (
              <button
                key={tab}
                onClick={() => setPlatformTab(tab)}
                style={{
                  padding: '5px 14px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                  border: 'none', cursor: 'pointer', transition: 'all 0.15s',
                  background: isActive ? colour : 'rgba(49, 34, 68, 0.5)',
                  color: isActive ? (tab === 'all' || tab === 'ide' || tab === 'companion' ? '#11111b' : '#fff') : '#6c7086',
                }}
              >
                {tab === 'all' ? t('dash.releases.all') : PLATFORM_LABELS[tab]}
              </button>
            );
          })}
        </div>

        {loading ? <LoadingSpinner /> : (
          <>
            {filtered.length === 0 ? (
              <div style={{
                background: 'rgba(26, 16, 40, 0.6)', border: '1px dashed rgba(168, 85, 247, 0.12)', borderRadius: 12,
                padding: '40px 20px', textAlign: 'center',
              }}>
                <div style={{ fontSize: 13, color: '#6c7086' }}>{t('dash.releases.no_releases')}</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {filtered.map((r: any) => {
                  const releaseId = r.id || r.version;
                  const isExpanded = expanded === releaseId;
                  const isLatest = releaseId === (releases[0]?.id || releases[0]?.version);
                  const version = r.version?.startsWith('v') ? r.version : `v${r.version}`;
                  const dateStr = r.published_at || r.date;
                  const highlights: string[] = Array.isArray(r.highlights) ? r.highlights : [];
                  const body = r.body || r.description || '';
                  const toolCount = r.tool_count || r.tools || null;
                  const title = r.title || '';

                  return (
                    <div key={releaseId} style={{
                      background: 'rgba(26, 16, 40, 0.6)',
                      border: `1px solid ${isLatest ? 'rgba(168,85,247,0.30)' : 'rgba(168, 85, 247, 0.12)'}`,
                      borderRadius: 10, overflow: 'hidden', transition: 'border-color 0.15s',
                    }}>
                      {/* Header button */}
                      <button
                        onClick={() => setExpanded(isExpanded ? null : releaseId)}
                        style={{
                          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          padding: '14px 18px', background: 'transparent', border: 'none',
                          cursor: 'pointer', textAlign: 'left',
                        }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(49, 34, 68, 0.5)'; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span style={{ fontSize: 14, fontWeight: 700, color: '#cdd6f4' }}>{version}</span>
                          {(() => {
                            const plat = r.platform || 'extension';
                            const platColour = PLATFORM_COLOURS[plat] || '#6c7086';
                            return (
                              <span style={{
                                fontSize: 9, fontWeight: 700, color: platColour,
                                background: `${platColour}18`, padding: '2px 8px',
                                borderRadius: 4, letterSpacing: 0.5, textTransform: 'uppercase' as const,
                              }}>
                                {PLATFORM_LABELS[plat] || plat}
                              </span>
                            );
                          })()}
                          {isLatest && (
                            <span style={{
                              fontSize: 9, fontWeight: 700, color: '#a855f7',
                              background: 'rgba(168,85,247,0.10)', padding: '2px 8px',
                              borderRadius: 4, letterSpacing: 0.8, textTransform: 'uppercase' as const,
                            }}>
                              {t('dash.releases.latest')}
                            </span>
                          )}
                          {title && <span style={{ fontSize: 13, color: '#a6adc8' }}>{title}</span>}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          {toolCount && (
                            <span style={{
                              fontSize: 10, color: '#6c7086', background: 'rgba(49, 34, 68, 0.5)',
                              padding: '2px 8px', borderRadius: 4,
                            }}>
                              {t('dash.releases.tools_count').replace('{count}', String(toolCount))}
                            </span>
                          )}
                          <span style={{ fontSize: 10, color: '#6c7086' }}>
                            {dateStr ? new Date(dateStr).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }) : ''}
                          </span>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6c7086" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                            style={{ transition: 'transform 0.2s', transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                            <path d="M6 9l6 6 6-6" />
                          </svg>
                        </div>
                      </button>

                      {/* Expanded content */}
                      {isExpanded && (
                        <div style={{ padding: '0 18px 18px', borderTop: '1px solid rgba(168, 85, 247, 0.12)' }}>
                          {/* Highlights */}
                          {highlights.length > 0 && (
                            <div style={{
                              background: 'rgba(49, 34, 68, 0.5)', borderRadius: 8, padding: '12px 14px',
                              marginTop: 12, marginBottom: 14,
                            }}>
                              <div style={{ fontSize: 12, fontWeight: 600, color: '#cdd6f4', marginBottom: 8 }}>{t('dash.releases.highlights')}</div>
                              <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                                {highlights.map((h: string, i: number) => (
                                  <li key={i} style={{
                                    display: 'flex', alignItems: 'flex-start', gap: 8,
                                    fontSize: 12, color: '#a6adc8', lineHeight: 1.6, marginBottom: 4,
                                  }}>
                                    <span style={{ color: '#a855f7', marginTop: 2, flexShrink: 0 }}>&bull;</span>
                                    {h}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {/* Body */}
                          {body && (
                            <div style={{
                              fontSize: 12, color: '#a6adc8', lineHeight: 1.7,
                              whiteSpace: 'pre-wrap',
                            }}>
                              {body}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* ===== Roadmap ===== */

const ROADMAP_THEMES = [
  { title: 'Intelligence', icon: '\uD83E\uDDE0', color: '#a855f7', colorBg: 'rgba(168,85,247,0.08)', items: [
    { label: 'Core agent loop with 56 tools', shipped: true }, { label: '6 thinking modes', shipped: true },
    { label: '24 specialist personas with conductor', shipped: true }, { label: '5-layer memory with TF-IDF recall', shipped: true },
    { label: 'Memory Agent — curated briefs, not raw dumps', shipped: true },
    { label: 'Auto Mode — best model per task routing', shipped: true },
    { label: 'Self-inspect — Ava reads her own code from Supabase', shipped: true },
    { label: '10 knowledge packs (game dev, web, mobile, API, DevOps, systems, data science)', shipped: true },
    { label: 'Self-improvement vault', shipped: true }, { label: 'Flat system prompt (80% token reduction)', shipped: true },
    { label: 'Direct mode — no auto-orchestration', shipped: true }, { label: 'Qwen 3.6 + MiniMax M2.7 multimodal', shipped: true },
    { label: 'Intent detection (thinking out loud vs instruction)', shipped: true },
    { label: 'Voice system (Kokoro TTS)', shipped: false },
    { label: 'Computer use (browser + desktop)', shipped: false },
  ]},
  { title: 'Surfaces', icon: '\uD83D\uDCBB', color: '#f97316', colorBg: 'rgba(249,115,22,0.08)', items: [
    { label: 'VS Code extension (unified panel)', shipped: true }, { label: 'Ava IDE (Tauri desktop)', shipped: true },
    { label: 'Companion web/mobile app', shipped: true }, { label: 'CLI agent', shipped: true },
    { label: 'Consolidated sidebar — 7 items, identical across extension + IDE', shipped: true },
    { label: 'IDE file explorer with syntax highlighting', shipped: true },
    { label: 'Resizable sidebar with flip', shipped: true }, { label: 'Single-bubble responses', shipped: true },
    { label: 'Data portability (export/import)', shipped: true }, { label: 'Game engine integrations', shipped: false },
    { label: 'Plugin marketplace', shipped: false }, { label: 'Code signing', shipped: false },
  ]},
  { title: 'Education', icon: '\uD83C\uDF93', color: '#3b82f6', colorBg: 'rgba(59,130,246,0.08)', items: [
    { label: 'Teach mode with curriculums', shipped: true }, { label: 'Spaced repetition', shipped: true },
    { label: 'Fact-checked content', shipped: true }, { label: '20 language support', shipped: true },
    { label: 'Game dev knowledge pack', shipped: true }, { label: 'AI-era learning paths', shipped: false },
    { label: 'Community knowledge packs', shipped: false },
  ]},
  { title: 'Privacy & Security', icon: '\uD83D\uDD12', color: '#10b981', colorBg: 'rgba(16,185,129,0.08)', items: [
    { label: 'Local-first architecture', shipped: true }, { label: 'Cloud sync opt-in', shipped: true },
    { label: 'BYOK fully private', shipped: true }, { label: 'Secret vault', shipped: true },
    { label: 'Security audit mode (OWASP)', shipped: true }, { label: 'Atomic token enforcement', shipped: true },
    { label: '3-layer hub auth', shipped: true }, { label: 'Independent security audit', shipped: false },
    { label: 'E2E encryption for cloud sync', shipped: false },
  ]},
  { title: 'Platform & Business', icon: '\uD83D\uDE80', color: '#ec4899', colorBg: 'rgba(236,72,153,0.08)', items: [
    { label: 'Web platform with auth', shipped: true }, { label: 'Company hub (Tauri admin)', shipped: true },
    { label: 'Qwen partnership (50% pricing)', shipped: true }, { label: 'Qwen 3.6 Plus — primary model', shipped: true },
    { label: '10 providers, 15+ models', shipped: true },
    { label: '3M free Qwen tokens for all', shipped: true }, { label: 'Device sessions (1 key, 3 platforms)', shipped: true },
    { label: 'Creative studio', shipped: true }, { label: 'Delete all memories (local + platform)', shipped: true },
    { label: 'Live chat support — Ava first-line triage', shipped: true }, { label: 'Token usage bar with real-time deduction', shipped: true },
    { label: 'Period rollover for paid plans', shipped: true }, { label: 'Contributor marketplace — users get paid', shipped: false },
    { label: 'Paid plans (Pro, Ultra, Enterprise)', shipped: false }, { label: 'Token top-ups', shipped: false },
    { label: 'OAuth connections', shipped: false }, { label: 'Ava Foundation (40% of earnings)', shipped: false },
  ]},
];

/* ═══════════════════════════════════════════════════════════════════
 * CONSOLIDATED PAGES — match extension sidebar layout
 * ═══════════════════════════════════════════════════════════════════ */

export function PlannerPage() {
  const [tab, setTab] = useState<'tasks' | 'journal' | 'learning'>('tasks');
  const tabs = [
    { key: 'tasks' as const, icon: '\u2713', label: 'Tasks' },
    { key: 'journal' as const, icon: '\u270E', label: 'Journal' },
    { key: 'learning' as const, icon: '\u2605', label: 'Learning' },
  ];
  return (
    <div style={pageWrapper}>
      <div style={{ marginBottom: 16 }}>
        <h2 style={pageTitle}>Planner</h2>
        <p style={{ fontSize: 12, color: '#585b70', marginTop: 2 }}>Tasks, reflections, and learning paths</p>
      </div>
      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid rgba(168, 85, 247, 0.12)', marginBottom: 16, paddingBottom: 1 }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding: '6px 12px', fontSize: 12, fontWeight: 500, border: 'none', cursor: 'pointer',
            background: 'transparent', color: tab === t.key ? '#cdd6f4' : '#585b70',
            borderBottom: tab === t.key ? '2px solid #a855f7' : '2px solid transparent',
            transition: 'all 0.15s',
          }}>{t.icon} {t.label}</button>
        ))}
      </div>
      {tab === 'tasks' && <TasksPageInner />}
      {tab === 'journal' && <JournalPageInner />}
      {tab === 'learning' && <LearningPageInner />}
    </div>
  );
}

// Inner components — reuse existing page content without the outer wrapper
function TasksPageInner() { return <TasksPage />; }
function JournalPageInner() { return <JournalPage />; }
function LearningPageInner() { return <LearningPage />; }

export function AccountPage() {
  const [tab, setTab] = useState<'settings' | 'billing' | 'connections' | 'personality' | 'sync'>('settings');
  const connected = typeof window !== 'undefined' && !!localStorage.getItem('ava-platform-key');
  const tabs = [
    { key: 'settings' as const, label: 'Settings' },
    ...(connected ? [{ key: 'billing' as const, label: 'Billing' }] : []),
    { key: 'connections' as const, label: 'Connections' },
    { key: 'personality' as const, label: "Ava's Style" },
    ...(connected ? [{ key: 'sync' as const, label: 'Sync' }] : []),
  ];
  return (
    <div style={pageWrapper}>
      <div style={{ marginBottom: 16 }}>
        <h2 style={pageTitle}>Account</h2>
        <p style={{ fontSize: 12, color: '#585b70', marginTop: 2 }}>Settings, billing, connections, and personalisation</p>
      </div>
      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid rgba(168, 85, 247, 0.12)', marginBottom: 16, paddingBottom: 1 }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding: '6px 12px', fontSize: 12, fontWeight: 500, border: 'none', cursor: 'pointer',
            background: 'transparent', color: tab === t.key ? '#cdd6f4' : '#585b70',
            borderBottom: tab === t.key ? '2px solid #a855f7' : '2px solid transparent',
            transition: 'all 0.15s',
          }}>{t.label}</button>
        ))}
      </div>
      {tab === 'settings' && <SettingsPage />}
      {tab === 'billing' && <BillingPage />}
      {tab === 'connections' && <ConnectionsPage />}
      {tab === 'personality' && <PersonalityPage />}
      {tab === 'sync' && <CloudSyncPage />}
    </div>
  );
}

export function HelpPage() {
  const [tab, setTab] = useState<'support' | 'docs' | 'releases' | 'roadmap'>('support');
  useEffect(() => {
    const handler = () => setTab('docs');
    window.addEventListener('ava-support-nav-docs', handler);
    return () => window.removeEventListener('ava-support-nav-docs', handler);
  }, []);
  const tabs = [
    { key: 'support' as const, label: 'Support' },
    { key: 'docs' as const, label: 'Docs' },
    { key: 'releases' as const, label: 'Releases' },
    { key: 'roadmap' as const, label: 'Roadmap' },
  ];
  return (
    <div style={pageWrapper}>
      <div style={{ marginBottom: 16 }}>
        <h2 style={pageTitle}>Help</h2>
        <p style={{ fontSize: 12, color: '#585b70', marginTop: 2 }}>Support, documentation, release notes, and roadmap</p>
      </div>
      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid rgba(168, 85, 247, 0.12)', marginBottom: 16, paddingBottom: 1 }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding: '6px 12px', fontSize: 12, fontWeight: 500, border: 'none', cursor: 'pointer',
            background: 'transparent', color: tab === t.key ? '#cdd6f4' : '#585b70',
            borderBottom: tab === t.key ? '2px solid #a855f7' : '2px solid transparent',
            transition: 'all 0.15s',
          }}>{t.label}</button>
        ))}
      </div>
      {tab === 'support' && <SupportPage />}
      {tab === 'docs' && <DocumentationPage />}
      {tab === 'releases' && <ReleaseNotesPage />}
      {tab === 'roadmap' && <RoadmapInner />}
    </div>
  );
}

function RoadmapInner() { return <RoadmapPage />; }

export function RoadmapPage() {
  useLocale();
  const totalShipped = ROADMAP_THEMES.reduce((s, t) => s + t.items.filter(i => i.shipped).length, 0);
  const totalAll = ROADMAP_THEMES.reduce((s, t) => s + t.items.length, 0);
  const pctAll = Math.round((totalShipped / totalAll) * 100);
  return (
    <div style={pageWrapper}>
      <div style={{ width: '100%', maxWidth: 700 }}>
        <div style={pageTitle}>Roadmap</div>
        <div style={{ ...pageSubtitle, marginBottom: 24 }}>Where Ava has been and where she is heading.</div>
        <div style={{ display: 'flex', gap: 32, marginBottom: 32 }}>
          <div><div style={{ fontSize: 28, fontWeight: 300, color: '#a855f7' }}>{pctAll}%</div><div style={{ fontSize: 10, color: '#6c7086', textTransform: 'uppercase', letterSpacing: 1 }}>Complete</div></div>
          <div><div style={{ fontSize: 28, fontWeight: 300, color: '#a6e3a1' }}>{totalShipped}</div><div style={{ fontSize: 10, color: '#6c7086', textTransform: 'uppercase', letterSpacing: 1 }}>Shipped</div></div>
          <div><div style={{ fontSize: 28, fontWeight: 300, color: '#89b4fa' }}>{totalAll - totalShipped}</div><div style={{ fontSize: 10, color: '#6c7086', textTransform: 'uppercase', letterSpacing: 1 }}>Coming</div></div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {ROADMAP_THEMES.map(theme => {
            const shipped = theme.items.filter(i => i.shipped).length;
            const total = theme.items.length;
            const themePct = Math.round((shipped / total) * 100);
            return (
              <div key={theme.title} style={{ ...card, overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px' }}>
                  <span style={{ fontSize: 20 }}>{theme.icon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ fontSize: 14, fontWeight: 400, color: '#cdd6f4' }}>{theme.title}</span><span style={{ fontSize: 10, color: '#6c7086' }}>{shipped}/{total}</span></div>
                    <div style={{ marginTop: 6, height: 4, width: '100%', borderRadius: 2, background: theme.colorBg }}><div style={{ height: '100%', borderRadius: 2, background: theme.color, width: themePct + '%' }} /></div>
                  </div>
                </div>
                <div style={{ padding: '0 20px 16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                  {theme.items.map(item => (
                    <div key={item.label} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '6px 8px', borderRadius: 6, background: item.shipped ? 'transparent' : theme.colorBg }}>
                      {item.shipped
                        ? <svg width="12" height="12" viewBox="0 0 16 16" style={{ marginTop: 2, flexShrink: 0, color: theme.color }}><path fill="currentColor" d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z"/></svg>
                        : <span style={{ marginTop: 2, width: 12, height: 12, borderRadius: '50%', border: '1.5px solid ' + theme.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><span style={{ width: 4, height: 4, borderRadius: '50%', background: theme.color, opacity: 0.5 }} /></span>}
                      <span style={{ fontSize: 11, fontWeight: 300, lineHeight: 1.4, color: item.shipped ? '#6c7086' : '#cdd6f4' }}>{item.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ── Themed Audio Player ─────────────────────────────────────────────────── */

function AvaAudioPlayer({ src }: { src: string }) {
  const ref = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);

  const toggle = () => {
    if (!ref.current) return;
    if (playing) ref.current.pause(); else ref.current.play();
    setPlaying(!playing);
  };

  const fmt = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
      borderRadius: 10, background: 'rgba(26, 16, 40, 0.8)',
      border: '1px solid rgba(168, 85, 247, 0.12)',
    }}>
      <audio ref={ref} src={src} preload="metadata"
        onLoadedMetadata={() => setDuration(ref.current?.duration || 0)}
        onTimeUpdate={() => setProgress(ref.current?.currentTime || 0)}
        onEnded={() => setPlaying(false)}
      />
      <button onClick={toggle} style={{
        width: 32, height: 32, borderRadius: '50%',
        background: playing ? 'rgba(168,85,247,0.3)' : 'rgba(168,85,247,0.15)',
        border: '1px solid rgba(168,85,247,0.3)', color: '#a855f7',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', fontSize: 12, flexShrink: 0,
      }}>
        {playing ? '\u23F8' : '\u25B6'}
      </button>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
        <div style={{
          height: 4, borderRadius: 2, background: 'rgba(168,85,247,0.12)',
          overflow: 'hidden', cursor: 'pointer',
        }} onClick={e => {
          if (!ref.current || !duration) return;
          const rect = e.currentTarget.getBoundingClientRect();
          ref.current.currentTime = ((e.clientX - rect.left) / rect.width) * duration;
        }}>
          <div style={{
            height: '100%', width: `${duration ? (progress / duration) * 100 : 0}%`,
            background: '#a855f7', borderRadius: 2, transition: 'width 0.1s',
          }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: '#6c7086' }}>
          <span>{fmt(progress)}</span>
          <span>{fmt(duration)}</span>
        </div>
      </div>
    </div>
  );
}

/* ===== Creative Studio ===== */

const csCard: React.CSSProperties = {
  background: 'rgba(26, 16, 40, 0.6)',
  border: '1px solid rgba(168, 85, 247, 0.12)',
  borderRadius: 12,
  padding: 16,
};

const csInput: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: 8,
  border: '1px solid rgba(168,85,247,0.12)',
  background: 'rgba(49,34,68,0.5)',
  color: '#cdd6f4',
  fontSize: 13,
  fontWeight: 300,
  outline: 'none',
  resize: 'vertical' as const,
  fontFamily: 'inherit',
  boxSizing: 'border-box' as const,
};

const csLabel: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: 1.5,
  textTransform: 'uppercase' as const,
  color: '#6c7086',
  margin: '0 0 8px 0',
};

const csPrimaryBtn: React.CSSProperties = {
  width: '100%',
  padding: '12px 16px',
  borderRadius: 10,
  border: 'none',
  background: '#a855f7',
  color: '#fff',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
  transition: 'opacity 0.15s',
};

const csPrimaryBtnDisabled: React.CSSProperties = {
  ...csPrimaryBtn,
  opacity: 0.5,
  cursor: 'not-allowed',
};

const PLATFORM_API = 'https://ava-supernova.com/api';

function CSTokenBar({ refreshKey }: { refreshKey: number }) {
  const [bal, setBal] = useState<{ used: number; limit: number; isUnlimited: boolean } | null>(null);
  const [authKey, setAuthKey] = useState(0);
  const connected = checkConnected();

  // Clear on logout
  useEffect(() => {
    const handler = () => { if (!checkConnected()) setBal(null); setAuthKey(k => k + 1); };
    window.addEventListener('ava-auth-changed', handler);
    return () => window.removeEventListener('ava-auth-changed', handler);
  }, []);

  useEffect(() => {
    if (!connected) return;
    apiFetch('/usage/summary').then((res: any) => {
      if (res?.period) {
        const freeUsed = res.period.free_tokens_used || 0;
        const freeLimit = res.period.free_tokens_limit || 3000000;
        const subUsed = res.period.tokens_used || 0;
        const subLimit = res.period.tokens_limit || 0;
        const isUnlimited = res.isUnlimited || false;
        const hasSub = subLimit > 0 && (res.tier || 'free') !== 'free';
        setBal({ used: hasSub ? subUsed : freeUsed, limit: hasSub ? subLimit : freeLimit, isUnlimited });
      }
    }).catch(() => {});
  }, [connected, refreshKey, authKey]);
  if (!connected) return (
    <div style={{ fontSize: 10, color: '#585b70' }}>Connect account for token tracking</div>
  );
  if (!bal) return null;
  if (bal.isUnlimited) return (
    <div style={{ width: 180, flexShrink: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#6c7086', marginBottom: 4 }}>
        <span>Tokens</span><span style={{ color: '#a855f7', fontWeight: 600 }}>Unlimited</span>
      </div>
      <div style={{ height: 6, borderRadius: 3, overflow: 'hidden', background: 'rgba(49,34,68,0.5)' }}>
        <div style={{ height: '100%', borderRadius: 3, width: '100%', background: 'linear-gradient(90deg, #a855f7, #6366f1)' }} />
      </div>
    </div>
  );
  const rem = Math.max(0, bal.limit - bal.used);
  const pct = bal.limit > 0 ? (rem / bal.limit) * 100 : 0;
  const fmt = (n: number) => n >= 1000000 ? `${(n / 1000000).toFixed(1)}M` : `${Math.round(n / 1000)}K`;
  return (
    <div style={{ width: 180, flexShrink: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#6c7086', marginBottom: 4 }}>
        <span>Tokens Remaining</span><span>{fmt(rem)}</span>
      </div>
      <div style={{ height: 6, borderRadius: 3, background: 'rgba(168,85,247,0.08)', overflow: 'hidden' }}>
        <div style={{ height: '100%', borderRadius: 3, transition: 'width 0.5s', width: `${pct}%`,
          background: pct < 10 ? '#ef4444' : pct < 30 ? '#eab308' : '#a855f7' }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: '#585b70', marginTop: 2 }}>
        <span>{fmt(bal.used)} used</span><span>{fmt(bal.limit)} limit</span>
      </div>
    </div>
  );
}

export function CreativeStudioPage() {
  useLocale();

  const [tab, setTab] = useState<'images' | 'audio' | 'voice' | 'sfx' | 'video' | 'library'>('images');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // Images state
  const [imagePrompt, setImagePrompt] = useState('');
  const [imageSize, setImageSize] = useState<'1:1' | '3:4' | '4:3'>('1:1');
  const [lastImage, setLastImage] = useState<string | null>(null);

  // Audio state
  const [musicPrompt, setMusicPrompt] = useState('');
  const [musicLyrics, setMusicLyrics] = useState('');
  const [lastAudio, setLastAudio] = useState<string | null>(null);

  // Voice state
  const [voiceText, setVoiceText] = useState('');
  const [voiceId, setVoiceId] = useState('Calm_Woman');
  const [voiceSpeed, setVoiceSpeed] = useState(1.0);
  const [lastVoice, setLastVoice] = useState<string | null>(null);

  // SFX state
  const [sfxPrompt, setSfxPrompt] = useState('');
  const [lastSfx, setLastSfx] = useState<string | null>(null);

  // Video state
  const [videoPrompt, setVideoPrompt] = useState('');
  const [videoDuration, setVideoDuration] = useState<6 | 10>(6);
  const [lastVideo, setLastVideo] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Save asset to local ~/.ava/creative/ and update metadata.json
  const saveToLocal = async (type: 'images' | 'audio' | 'video' | 'voice' | 'sfx', url: string, title: string, prompt: string) => {
    try {
      const { writeTextFile, writeFile, readTextFile, mkdir, BaseDirectory } = await import('@tauri-apps/plugin-fs');
      await import('@tauri-apps/api/path');
      const dir = `.ava/creative/${type}`;
      await mkdir(dir, { baseDir: BaseDirectory.Home, recursive: true }).catch(() => {});

      const id = `${type}_${Date.now()}`;
      const ext = type === 'images' ? 'jpg' : type === 'video' ? 'mp4' : 'mp3';
      const filename = `${id}.${ext}`;
      const filePath = `${dir}/${filename}`;

      let savedUrl = url;

      // If data URI, write binary to disk but keep data URI for playback
      if (url.startsWith('data:')) {
        try {
          const base64 = url.split(',')[1];
          const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
          await writeFile(filePath, bytes, { baseDir: BaseDirectory.Home });
          // Keep the data URI for playback — Tauri WebView can't load file:// URLs
          // but data URIs work fine for audio/video elements
          savedUrl = url;
        } catch (e) {
          console.warn('[creative] Failed to write binary file:', e);
          savedUrl = url;
        }
      }

      // Read existing metadata
      const raw = await readTextFile('.ava/creative/metadata.json', { baseDir: BaseDirectory.Home }).catch(() => '[]');
      const metadata: any[] = JSON.parse(raw || '[]');

      metadata.unshift({
        id,
        type: type === 'images' ? 'image' : type === 'audio' ? 'music' : type,
        asset_type: type === 'images' ? 'image' : type === 'audio' ? 'music' : type,
        filename,
        title,
        prompt,
        url: savedUrl,
        created_at: new Date().toISOString(),
      });

      // Save metadata
      await mkdir('.ava/creative', { baseDir: BaseDirectory.Home, recursive: true }).catch(() => {});
      await writeTextFile('.ava/creative/metadata.json', JSON.stringify(metadata, null, 2), { baseDir: BaseDirectory.Home });
    } catch (e) {
      console.warn('[creative] Failed to save locally:', e);
    }
  };

  // Clear error when switching tabs
  useEffect(() => { setError(null); }, [tab]);

  // Elapsed timer for video generation
  useEffect(() => {
    if (generating && tab === 'video') {
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed(p => p + 1), 1000);
    } else {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
      setElapsed(0);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [generating, tab]);

  function authHeaders(): Record<string, string> {
    const key = getPlatformKey();
    return {
      'Content-Type': 'application/json',
      ...(key ? { Authorization: `Bearer ${key}` } : {}),
    };
  }

  function requiresAuth(): boolean {
    const key = getPlatformKey();
    if (!key) {
      setError('Creative Studio requires a platform account or MiniMax API key. Connect your account in Settings or add a MiniMax key under BYOK.');
      return false;
    }
    return true;
  }

  /* ---------- Image generation ---------- */
  const handleGenerateImage = async () => {
    if (!imagePrompt.trim() || generating) return;
    if (!requiresAuth()) return;
    setGenerating(true);
    setError(null);
    try {
      const sizeMap: Record<string, string> = { '1:1': '1280*1280', '3:4': '768*1280', '4:3': '1280*768' };
      const res = await fetch(`${PLATFORM_API}/generate-image`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ prompt: imagePrompt.trim(), size: sizeMap[imageSize], model: 'minimax' }),
      });
      if (!res.ok) throw new Error(`Image generation failed (${res.status})`);
      const data = await res.json();
      if (data.url) {
        setLastImage(data.url);
        await saveToLocal('images', data.url, imagePrompt.slice(0, 60), imagePrompt);
      } else throw new Error(data.error || 'No image URL returned');
    } catch (e: any) {
      setError(e.message || 'Image generation failed');
    }
    setGenerating(false); setRefreshKey(k => k + 1);
  };

  /* ---------- Music generation ---------- */
  const handleGenerateMusic = async () => {
    if (!musicPrompt.trim() || generating) return;
    if (!requiresAuth()) return;
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch(`${PLATFORM_API}/generate-music`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ prompt: musicPrompt.trim(), lyrics: musicLyrics.trim() || undefined }),
      });
      if (!res.ok) throw new Error(`Music generation failed (${res.status})`);
      const data = await res.json();
      if (data.url) {
        setLastAudio(data.url);
        await saveToLocal('audio', data.url, musicPrompt.slice(0, 60), musicPrompt);
      } else throw new Error(data.error || 'No audio URL returned');
    } catch (e: any) {
      setError(e.message || 'Music generation failed');
    }
    setGenerating(false); setRefreshKey(k => k + 1);
  };

  /* ---------- Voice generation ---------- */
  const handleGenerateVoice = async () => {
    if (!voiceText.trim() || generating) return;
    if (!requiresAuth()) return;
    setGenerating(true); setError(null);
    try {
      const headers = authHeaders();
      const res = await fetch(`${PLATFORM_API}/generate-voice`, {
        method: 'POST', headers,
        body: JSON.stringify({ text: voiceText, voice_id: voiceId, speed: voiceSpeed }),
      });
      if (!res.ok) throw new Error(`Voice generation failed (${res.status})`);
      const data = await res.json();
      if (data.url) {
        setLastVoice(data.url);
        await saveToLocal('voice', data.url, voiceText.slice(0, 60), voiceText);
      } else throw new Error(data.error || 'No voice URL returned');
    } catch (e: any) {
      setError(e.message || 'Voice generation failed');
    }
    setGenerating(false); setRefreshKey(k => k + 1);
  };

  /* ---------- SFX generation ---------- */
  const handleGenerateSfx = async () => {
    if (!sfxPrompt.trim() || generating) return;
    if (!requiresAuth()) return;
    setGenerating(true); setError(null);
    try {
      const headers = authHeaders();
      const res = await fetch(`${PLATFORM_API}/generate-music`, {
        method: 'POST', headers,
        body: JSON.stringify({ prompt: `[SFX] ${sfxPrompt}. CRITICAL: This is a sound effect, NOT a song. Maximum 3 seconds. One single isolated sound only. No melody, no beat, no rhythm, no music, no vocals, no loops. Just the raw sound effect once, then silence.` }),
      });
      if (!res.ok) throw new Error(`SFX generation failed (${res.status})`);
      const data = await res.json();
      if (data.url) {
        setLastSfx(data.url);
        await saveToLocal('sfx', data.url, sfxPrompt.slice(0, 60), sfxPrompt);
      } else throw new Error(data.error || 'No SFX URL returned');
    } catch (e: any) {
      setError(e.message || 'SFX generation failed');
    }
    setGenerating(false); setRefreshKey(k => k + 1);
  };

  /* ---------- Video generation ---------- */
  const handleGenerateVideo = async () => {
    if (!videoPrompt.trim() || generating) return;
    if (!requiresAuth()) return;
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch(`${PLATFORM_API}/generate-video`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ prompt: videoPrompt.trim(), duration: videoDuration }),
      });
      if (!res.ok) throw new Error(`Video generation failed (${res.status})`);
      const data = await res.json();
      if (data.url) {
        setLastVideo(data.url);
        await saveToLocal('video', data.url, videoPrompt.slice(0, 60), videoPrompt);
      } else throw new Error(data.error || 'No video URL returned');
    } catch (e: any) {
      setError(e.message || 'Video generation failed');
    }
    setGenerating(false); setRefreshKey(k => k + 1);
  };

  /* ---------- Shared UI helpers ---------- */
  const sizeBtn = (_value: string, active: boolean): React.CSSProperties => ({
    flex: 1,
    padding: '7px 0',
    borderRadius: 8,
    fontSize: 12,
    fontWeight: 500,
    border: 'none',
    cursor: 'pointer',
    background: active ? '#a855f7' : 'rgba(49,34,68,0.5)',
    color: active ? '#fff' : '#6c7086',
    transition: 'all 0.15s',
  });

  const tabBtn = (_value: string, active: boolean): React.CSSProperties => ({
    padding: '6px 12px',
    fontSize: 12,
    fontWeight: 500,
    border: 'none',
    cursor: 'pointer',
    background: 'transparent',
    color: active ? '#cdd6f4' : '#585b70',
    borderBottom: active ? '2px solid #a855f7' : '2px solid transparent',
    transition: 'all 0.15s',
  });

  const errorBox = error ? (
    <div style={{
      padding: '10px 12px', borderRadius: 8,
      background: 'rgba(243,139,168,0.08)', border: '1px solid rgba(243,139,168,0.2)',
      fontSize: 12, color: '#f38ba8', lineHeight: 1.5,
    }}>
      {error}
    </div>
  ) : null;

  /* ---------- Images tab ---------- */
  const renderImagesGenerate = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={csCard}>
        <div style={csLabel}>Prompt</div>
        <textarea
          value={imagePrompt}
          onChange={e => setImagePrompt(e.target.value)}
          placeholder="Describe the image you want to create..."
          rows={5}
          style={{ ...csInput, height: 120, resize: 'vertical' as const }}
        />
      </div>
      <div style={csCard}>
        <div style={csLabel}>Size</div>
        <div style={{ display: 'flex', gap: 4 }}>
          {(['1:1', '3:4', '4:3'] as const).map(s => (
            <button key={s} onClick={() => setImageSize(s)} style={sizeBtn(s, imageSize === s)}>
              {s === '1:1' ? 'Square 1:1' : s === '3:4' ? 'Portrait 3:4' : 'Landscape 4:3'}
            </button>
          ))}
        </div>
      </div>
      {errorBox}
      <button
        onClick={handleGenerateImage}
        disabled={!imagePrompt.trim() || generating}
        style={!imagePrompt.trim() || generating ? csPrimaryBtnDisabled : csPrimaryBtn}
      >
        {generating ? 'Generating...' : 'Generate Image'}
      </button>
    </div>
  );

  const renderImagesResults = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {lastImage ? (
        <div style={csCard}>
          <img
            src={lastImage}
            alt="Generated image"
            style={{ width: '100%', borderRadius: 10, display: 'block' }}
          />
          <div style={{ marginTop: 10, fontSize: 11, color: '#6c7086' }}>Generated image</div>
          <div style={{ marginTop: 4, fontSize: 12, color: '#a6adc8', lineHeight: 1.5 }}>{imagePrompt}</div>
          <a
            href={lastImage}
            download
            target="_blank"
            rel="noreferrer"
            style={{
              display: 'inline-block', marginTop: 10, padding: '6px 14px',
              borderRadius: 6, fontSize: 11, fontWeight: 500,
              background: 'rgba(49,34,68,0.5)', color: '#cdd6f4',
              textDecoration: 'none', border: '1px solid rgba(168,85,247,0.12)',
            }}
          >
            Download
          </a>
        </div>
      ) : (
        <div style={{ ...csCard, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 200, color: '#585b70', fontSize: 13 }}>
          Generated images will appear here
        </div>
      )}
    </div>
  );

  /* ---------- Audio tab ---------- */
  const renderAudioGenerate = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={csCard}>
        <div style={csLabel}>Prompt</div>
        <textarea
          value={musicPrompt}
          onChange={e => setMusicPrompt(e.target.value)}
          placeholder="Describe the music — genre, mood, instruments..."
          rows={4}
          style={{ ...csInput, height: 100, resize: 'vertical' as const }}
        />
      </div>
      <div style={csCard}>
        <div style={csLabel}>Lyrics (optional)</div>
        <textarea
          value={musicLyrics}
          onChange={e => setMusicLyrics(e.target.value)}
          placeholder="Add lyrics for a vocal track (optional)"
          rows={4}
          style={{ ...csInput, height: 100, resize: 'vertical' as const }}
        />
      </div>
      {errorBox}
      <button
        onClick={handleGenerateMusic}
        disabled={!musicPrompt.trim() || generating}
        style={!musicPrompt.trim() || generating ? csPrimaryBtnDisabled : csPrimaryBtn}
      >
        {generating ? 'Generating...' : 'Generate Music'}
      </button>
    </div>
  );

  const renderAudioResults = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {lastAudio ? (
        <div style={csCard}>
          <AvaAudioPlayer src={lastAudio} />
          <div style={{ marginTop: 10, fontSize: 11, color: '#6c7086' }}>Generated audio</div>
          <div style={{ marginTop: 4, fontSize: 12, color: '#a6adc8', lineHeight: 1.5 }}>{musicPrompt}</div>
          <a
            href={lastAudio}
            download
            target="_blank"
            rel="noreferrer"
            style={{
              display: 'inline-block', marginTop: 10, padding: '6px 14px',
              borderRadius: 6, fontSize: 11, fontWeight: 500,
              background: 'rgba(49,34,68,0.5)', color: '#cdd6f4',
              textDecoration: 'none', border: '1px solid rgba(168,85,247,0.12)',
            }}
          >
            Download
          </a>
        </div>
      ) : (
        <div style={{ ...csCard, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 200, color: '#585b70', fontSize: 13 }}>
          Generated audio will appear here
        </div>
      )}
    </div>
  );

  /* ---------- Voice tab ---------- */
  const VOICES = [
    { id: 'Calm_Woman', label: 'Calm Woman' },
    { id: 'Wise_Woman', label: 'Wise Woman' },
    { id: 'Friendly_Person', label: 'Friendly' },
    { id: 'Inspirational_girl', label: 'Inspirational' },
    { id: 'Deep_Voice_Man', label: 'Deep Voice' },
    { id: 'Calm_Man', label: 'Calm Man' },
    { id: 'Newsman', label: 'Newscaster' },
    { id: 'Lively_Girl', label: 'Lively' },
    { id: 'Patient_Man', label: 'Patient' },
    { id: 'Determined_Man', label: 'Determined' },
  ];

  const renderVoiceGenerate = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={csCard}>
        <div style={csLabel}>Text</div>
        <textarea
          placeholder="Enter text to speak..."
          value={voiceText}
          onChange={e => setVoiceText(e.target.value)}
          rows={5}
          style={{ ...csInput, height: 120, resize: 'vertical' as const }}
        />
      </div>
      <div style={csCard}>
        <div style={csLabel}>Voice</div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {VOICES.map(v => (
            <button key={v.id} onClick={() => setVoiceId(v.id)} style={{
              padding: '4px 10px', borderRadius: 6, border: 'none', fontSize: 10, fontWeight: 500, cursor: 'pointer',
              background: voiceId === v.id ? '#a855f7' : 'rgba(49,34,68,0.5)',
              color: voiceId === v.id ? '#fff' : '#6c7086', transition: 'all 0.15s',
            }}>{v.label}</button>
          ))}
        </div>
      </div>
      <div style={csCard}>
        <div style={csLabel}>Speed</div>
        <div style={{ display: 'flex', gap: 4 }}>
          {[0.8, 1.0, 1.2, 1.5].map(s => (
            <button key={s} onClick={() => setVoiceSpeed(s)} style={{
              padding: '4px 12px', borderRadius: 6, border: 'none', fontSize: 11, fontWeight: 500, cursor: 'pointer',
              background: voiceSpeed === s ? '#a855f7' : 'rgba(49,34,68,0.5)',
              color: voiceSpeed === s ? '#fff' : '#6c7086', transition: 'all 0.15s',
            }}>{s}x</button>
          ))}
        </div>
      </div>
      {errorBox}
      <button onClick={handleGenerateVoice} disabled={!voiceText.trim() || generating}
        style={!voiceText.trim() || generating ? csPrimaryBtnDisabled : csPrimaryBtn}>
        {generating ? 'Generating...' : 'Generate Voice'}
      </button>
    </div>
  );

  const renderVoiceResults = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {lastVoice ? (
        <div style={csCard}>
          <AvaAudioPlayer src={lastVoice} />
          <div style={{ marginTop: 10, fontSize: 11, color: '#6c7086' }}>Generated voice — {VOICES.find(v => v.id === voiceId)?.label || voiceId}</div>
          <div style={{ marginTop: 4, fontSize: 12, color: '#a6adc8', lineHeight: 1.5 }}>{voiceText}</div>
        </div>
      ) : (
        <div style={{ ...csCard, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 200, color: '#585b70', fontSize: 13 }}>
          Generated voice will appear here
        </div>
      )}
    </div>
  );

  /* ---------- SFX tab ---------- */
  const renderSfxGenerate = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={csCard}>
        <div style={csLabel}>Sound Effect</div>
        <textarea
          placeholder="Describe the sound... e.g. 'door slam', 'rain on window', 'sci-fi laser'"
          value={sfxPrompt}
          onChange={e => setSfxPrompt(e.target.value)}
          rows={4}
          style={{ ...csInput, height: 100, resize: 'vertical' as const }}
        />
      </div>
      {errorBox}
      <button onClick={handleGenerateSfx} disabled={!sfxPrompt.trim() || generating}
        style={!sfxPrompt.trim() || generating ? csPrimaryBtnDisabled : csPrimaryBtn}>
        {generating ? 'Generating...' : 'Generate SFX'}
      </button>
    </div>
  );

  const renderSfxResults = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {lastSfx ? (
        <div style={csCard}>
          <AvaAudioPlayer src={lastSfx} />
          <div style={{ marginTop: 10, fontSize: 11, color: '#6c7086' }}>Generated sound effect</div>
          <div style={{ marginTop: 4, fontSize: 12, color: '#a6adc8', lineHeight: 1.5 }}>{sfxPrompt}</div>
        </div>
      ) : (
        <div style={{ ...csCard, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 200, color: '#585b70', fontSize: 13 }}>
          Generated sound effects will appear here
        </div>
      )}
    </div>
  );

  /* ---------- Video tab ---------- */
  const renderVideoGenerate = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={csCard}>
        <div style={csLabel}>Prompt</div>
        <textarea
          value={videoPrompt}
          onChange={e => setVideoPrompt(e.target.value)}
          placeholder="Describe the video scene..."
          rows={5}
          style={{ ...csInput, height: 120, resize: 'vertical' as const }}
        />
      </div>
      <div style={csCard}>
        <div style={csLabel}>Duration</div>
        <div style={{ display: 'flex', gap: 4 }}>
          <button onClick={() => setVideoDuration(6)} style={sizeBtn('6', videoDuration === 6)}>6s 1080P</button>
          <button onClick={() => setVideoDuration(10)} style={sizeBtn('10', videoDuration === 10)}>10s 768P</button>
        </div>
      </div>
      {errorBox}
      <button
        onClick={handleGenerateVideo}
        disabled={!videoPrompt.trim() || generating}
        style={!videoPrompt.trim() || generating ? csPrimaryBtnDisabled : csPrimaryBtn}
      >
        {generating ? 'Generating...' : 'Generate Video'}
      </button>
      {generating && tab === 'video' && (
        <div style={{
          padding: '10px 12px', borderRadius: 8,
          background: 'rgba(168,85,247,0.06)', border: '1px solid rgba(168,85,247,0.12)',
          fontSize: 12, color: '#a6adc8', textAlign: 'center' as const,
        }}>
          Generating... {elapsed}s
        </div>
      )}
    </div>
  );

  const renderVideoResults = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {lastVideo ? (
        <div style={csCard}>
          <video controls src={lastVideo} style={{ width: '100%', borderRadius: 10, display: 'block' }} />
          <div style={{ marginTop: 10, fontSize: 11, color: '#6c7086' }}>Generated video</div>
          <div style={{ marginTop: 4, fontSize: 12, color: '#a6adc8', lineHeight: 1.5 }}>{videoPrompt}</div>
          <a
            href={lastVideo}
            download
            target="_blank"
            rel="noreferrer"
            style={{
              display: 'inline-block', marginTop: 10, padding: '6px 14px',
              borderRadius: 6, fontSize: 11, fontWeight: 500,
              background: 'rgba(49,34,68,0.5)', color: '#cdd6f4',
              textDecoration: 'none', border: '1px solid rgba(168,85,247,0.12)',
            }}
          >
            Download
          </a>
        </div>
      ) : (
        <div style={{ ...csCard, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 200, color: '#585b70', fontSize: 13 }}>
          Generated videos will appear here
        </div>
      )}
    </div>
  );

  return (
    <div style={{ ...pageWrapper, display: 'flex', flexDirection: 'column' }}>
      <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={pageTitle}>Creative Studio</div>
          <div style={pageSubtitle}>Generate images, music, and video with MiniMax</div>
        </div>
        <CSTokenBar refreshKey={refreshKey} />
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid rgba(168, 85, 247, 0.12)', marginBottom: 16, paddingBottom: 1 }}>
        {/* SFX tab hidden — in development. MiniMax music model doesn't support short isolated sound effects yet. */}
        {(['images', 'audio', 'voice', /* 'sfx', */ 'video', 'library'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={tabBtn(t, tab === t)}>
            {t === 'images' ? '\uD83D\uDDBC\uFE0F Images' : t === 'audio' ? '\uD83C\uDFB5 Audio' : t === 'voice' ? '\uD83C\uDF99\uFE0F Voice' : t === 'video' ? '\uD83C\uDFAC Video' : '\uD83D\uDCDA Library'}
          </button>
        ))}
      </div>

      {tab === 'library' ? (
        <CreativeLibraryTab />
      ) : (
        <div style={{ display: 'flex', gap: 16, flex: 1, minHeight: 0 }}>
          {/* LEFT: Generate panel */}
          <div style={{ width: 320, flexShrink: 0, overflowY: 'auto' }}>
            {tab === 'images' && renderImagesGenerate()}
            {tab === 'audio' && renderAudioGenerate()}
            {tab === 'voice' && renderVoiceGenerate()}
            {tab === 'sfx' && renderSfxGenerate()}
            {tab === 'video' && renderVideoGenerate()}
          </div>

          {/* RIGHT: Results */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {tab === 'images' && renderImagesResults()}
            {tab === 'audio' && renderAudioResults()}
            {tab === 'voice' && renderVoiceResults()}
            {tab === 'sfx' && renderSfxResults()}
            {tab === 'video' && renderVideoResults()}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Creative Studio — Library Tab ──────────────────────────────────────── */

type CreativeLibFilter = 'all' | 'images' | 'music' | 'video' | 'voice' | 'sfx' | 'documents' | 'spreadsheets' | 'presentations';

function CreativeLibraryTab() {
  const [filter, setFilter] = useState<CreativeLibFilter>('all');
  const [assets, setAssets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const connected = checkConnected();
  const [source, setSource] = useState<'local' | 'cloud'>('local');
  const [selected, setSelected] = useState<any>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Reset to local on logout
  useEffect(() => {
    const handler = () => { if (!checkConnected()) { setSource('local'); setAssets([]); setSelected(null); } };
    window.addEventListener('ava-auth-changed', handler);
    return () => window.removeEventListener('ava-auth-changed', handler);
  }, []);

  const FILTERS: { key: CreativeLibFilter; label: string; icon: string }[] = [
    { key: 'all', label: 'All', icon: '📋' },
    { key: 'images', label: 'Images', icon: '🖼️' },
    { key: 'music', label: 'Music', icon: '🎵' },
    { key: 'video', label: 'Video', icon: '🎬' },
    { key: 'voice', label: 'Voice', icon: '🎙️' },
    /* { key: 'sfx', label: 'SFX', icon: '🔊' }, — in development */
    { key: 'documents', label: 'Documents', icon: '📄' },
    { key: 'spreadsheets', label: 'Spreadsheets', icon: '📊' },
    { key: 'presentations', label: 'Presentations', icon: '📽️' },
  ];

  // Fetch assets based on source toggle
  useEffect(() => {
    setLoading(true);
    setAssets([]);
    (async () => {
      if (source === 'local') {
        try {
          const { readTextFile, BaseDirectory } = await import('@tauri-apps/plugin-fs');
          const raw = await readTextFile('.ava/creative/metadata.json', { baseDir: BaseDirectory.Home }).catch(() => '[]');
          setAssets(JSON.parse(raw || '[]'));
        } catch { setAssets([]); }
      } else if (connected) {
        try {
          const data = await apiFetch('/library');
          const list = Array.isArray(data) ? data : (data?.files || data?.assets || data?.items || []);
          setAssets(list);
        } catch { setAssets([]); }
      }
      setLoading(false);
    })();
  }, [source, connected]);

  const filtered = filter === 'all' ? assets : assets.filter((a: any) => {
    const aType = (a.asset_type || a.type || '').toLowerCase();
    const ext = (a.name || a.title || '').split('.').pop()?.toLowerCase() || '';
    if (filter === 'images') return ['image', 'graphic'].includes(aType) || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext);
    if (filter === 'music') return aType === 'music';
    if (filter === 'video') return aType === 'video' || ['mp4', 'webm', 'mov'].includes(ext);
    if (filter === 'voice') return aType === 'voice';
    if (filter === 'sfx') return aType === 'sfx';
    if (filter === 'documents') return ['document', 'content'].includes(aType) || ['docx', 'pdf', 'md', 'txt', 'csv'].includes(ext);
    if (filter === 'spreadsheets') return aType === 'spreadsheet' || ['xlsx', 'xls'].includes(ext);
    if (filter === 'presentations') return aType === 'presentation' || ['pptx', 'ppt'].includes(ext);
    return false;
  });

  const typeIcon = (type: string): string => {
    if (['image', 'graphic'].includes(type)) return '🖼️';
    if (type === 'music') return '🎵';
    if (type === 'video') return '🎬';
    if (type === 'voice') return '🎙️';
    if (type === 'sfx') return '🔊';
    if (type === 'presentation') return '📽️';
    if (['document', 'content'].includes(type)) return '📄';
    if (type === 'spreadsheet') return '📊';
    return '📁';
  };

  const typeColor = (type: string): string => {
    if (['image', 'graphic'].includes(type)) return '#60a5fa';
    if (type === 'music') return '#f97316';
    if (type === 'video') return '#a855f7';
    if (type === 'voice') return '#ec4899';
    if (type === 'sfx') return '#f59e0b';
    if (['document', 'content'].includes(type)) return '#22c55e';
    if (type === 'presentation') return '#eab308';
    if (type === 'spreadsheet') return '#06b6d4';
    return '#6c7086';
  };

  return (
    <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Source toggle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <button
          onClick={() => setSource('local')}
          style={{
            padding: '4px 12px', borderRadius: 6, border: 'none', fontSize: 11, fontWeight: 500, cursor: 'pointer',
            background: source === 'local' ? 'rgba(168,85,247,0.2)' : 'transparent',
            color: source === 'local' ? '#cdd6f4' : '#585b70', transition: 'all 0.15s',
          }}
        >
          Local
        </button>
        <button
          onClick={() => { if (connected) setSource('cloud'); }}
          style={{
            padding: '4px 12px', borderRadius: 6, border: 'none', fontSize: 11, fontWeight: 500,
            cursor: connected ? 'pointer' : 'not-allowed',
            background: source === 'cloud' ? 'rgba(168,85,247,0.2)' : 'transparent',
            color: source === 'cloud' ? '#cdd6f4' : '#585b70',
            opacity: connected ? 1 : 0.3, transition: 'all 0.15s',
          }}
          title={connected ? 'Browse cloud assets' : 'Connect account to access cloud'}
        >
          Cloud
        </button>
        {!connected && <span style={{ fontSize: 9, color: '#585b70' }}>Connect account for cloud</span>}
      </div>

      {/* Filter pills */}
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {FILTERS.map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)} style={{
            padding: '5px 12px', borderRadius: 6, border: 'none', fontSize: 11, fontWeight: 400, cursor: 'pointer',
            background: filter === f.key ? 'rgba(168,85,247,0.2)' : 'transparent',
            color: filter === f.key ? '#cdd6f4' : '#585b70', transition: 'all 0.15s',
          }}>
            {f.icon} {f.label}
          </button>
        ))}
      </div>

      <div style={{ fontSize: 11, color: '#6c7086' }}>{filtered.length} {filter === 'all' ? 'assets' : filter}</div>

      {loading && <div style={{ padding: 24, textAlign: 'center' as const, color: '#6c7086', fontSize: 12 }}>Loading assets...</div>}

      {!loading && filtered.length === 0 && (
        <div style={{ ...card, padding: 24, textAlign: 'center' as const }}>
          <div style={{ fontSize: 28, opacity: 0.3, marginBottom: 8 }}>✨</div>
          <div style={{ fontSize: 13, color: '#6c7086' }}>{filter === 'all' ? 'No assets yet. Ask Ava to create something!' : `No ${filter} found.`}</div>
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <div style={{ display: 'flex', gap: 16, flex: 1, minHeight: 0 }}>
          {/* Asset grid */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10 }}>
              {filtered.map((asset: any, i: number) => (
                <div
                  key={asset.id || i}
                  onClick={() => setSelected(selected?.id === asset.id ? null : asset)}
                  style={{
                    ...card, padding: 10, cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 6,
                    border: selected?.id === asset.id ? '1px solid #a855f7' : '1px solid rgba(168, 85, 247, 0.12)',
                  }}
                >
                  {['image', 'graphic'].includes(asset.asset_type || '') && (asset.thumbnail_url || asset.url) ? (
                    <img src={asset.thumbnail_url || asset.url} alt="" style={{ width: '100%', height: 100, objectFit: 'cover', borderRadius: 8 }} />
                  ) : (
                    <div style={{ width: '100%', height: 100, borderRadius: 8, background: 'rgba(49,34,68,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, opacity: 0.4 }}>
                      {typeIcon(asset.asset_type || asset.type || '')}
                    </div>
                  )}
                  <div style={{ fontSize: 10, fontWeight: 500, color: '#cdd6f4', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
                    {asset.title || asset.name || 'Untitled'}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 8, fontWeight: 500, padding: '1px 5px', borderRadius: 4, background: `${typeColor(asset.asset_type || '')}15`, color: typeColor(asset.asset_type || '') }}>
                      {asset.asset_type || asset.type || 'file'}
                    </span>
                    <span style={{ fontSize: 8, color: '#585b70' }}>
                      {asset.created_at ? new Date(asset.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : ''}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Detail panel */}
          {selected && (
            <div style={{ width: 300, flexShrink: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* Preview */}
              <div style={{ ...card, padding: 12 }}>
                {['image', 'graphic'].includes(selected.asset_type || '') && (selected.thumbnail_url || selected.url) ? (
                  <img src={selected.thumbnail_url || selected.url} alt="" style={{ width: '100%', borderRadius: 8, marginBottom: 10 }} />
                ) : ['music', 'voice'].includes(selected.asset_type || '') && selected.url ? (
                  <div style={{ marginBottom: 10 }}><AvaAudioPlayer src={selected.url} /></div>
                ) : ['video'].includes(selected.asset_type || '') && selected.url ? (
                  <video controls src={selected.url} style={{ width: '100%', borderRadius: 8, marginBottom: 10 }} />
                ) : (
                  <div style={{ width: '100%', height: 80, borderRadius: 8, background: 'rgba(49,34,68,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, opacity: 0.4, marginBottom: 10 }}>
                    {typeIcon(selected.asset_type || selected.type || '')}
                  </div>
                )}

                <div style={{ fontSize: 14, fontWeight: 500, color: '#cdd6f4', marginBottom: 4 }}>
                  {selected.title || selected.name || 'Untitled'}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span style={{ fontSize: 9, fontWeight: 500, padding: '2px 8px', borderRadius: 4, background: `${typeColor(selected.asset_type || '')}15`, color: typeColor(selected.asset_type || '') }}>
                    {selected.asset_type || selected.type || 'file'}
                  </span>
                  <span style={{ fontSize: 10, color: '#585b70' }}>
                    {selected.created_at ? new Date(selected.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : ''}
                  </span>
                </div>
              </div>

              {/* Prompt */}
              {selected.prompt && (
                <div style={{ ...card, padding: 12 }}>
                  <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: 1.5, textTransform: 'uppercase' as const, color: '#6c7086', marginBottom: 6 }}>Prompt</div>
                  <div style={{ fontSize: 11, color: '#a6adc8', lineHeight: 1.5, whiteSpace: 'pre-wrap' as const }}>
                    {selected.prompt}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div style={{ display: 'flex', gap: 8 }}>
                {selected.url && (
                  <a
                    href={selected.url}
                    download={selected.title || 'download'}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      flex: 1, padding: '8px 0', borderRadius: 8, fontSize: 11, fontWeight: 500,
                      background: '#a855f7', color: '#fff', textAlign: 'center' as const,
                      textDecoration: 'none', cursor: 'pointer',
                    }}
                  >
                    Download
                  </a>
                )}
                <button
                  onClick={() => setConfirmDelete(true)}
                  style={{
                    flex: 1, padding: '8px 0', borderRadius: 8, fontSize: 11, fontWeight: 500,
                    background: 'rgba(239,68,68,0.15)', color: '#f87171', border: 'none', cursor: 'pointer',
                  }}
                >
                  Delete
                </button>
              </div>

              {/* Delete confirmation */}
              {confirmDelete && (
                <div style={{
                  ...card, padding: 16, border: '1px solid rgba(239,68,68,0.3)',
                  background: 'rgba(239,68,68,0.05)',
                }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: '#f87171', marginBottom: 6 }}>Delete this asset?</div>
                  <div style={{ fontSize: 11, color: '#a6adc8', marginBottom: 12, lineHeight: 1.4 }}>
                    "{selected.title || 'Untitled'}" will be permanently removed. This cannot be undone.
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => setConfirmDelete(false)}
                      style={{
                        flex: 1, padding: '8px 0', borderRadius: 8, fontSize: 11, fontWeight: 500,
                        background: 'rgba(49,34,68,0.5)', color: '#a6adc8', border: 'none', cursor: 'pointer',
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => {
                        const deleteId = selected.id;
                        setAssets(prev => prev.filter(a => a.id !== deleteId));
                        setSelected(null);
                        setConfirmDelete(false);
                        (async () => {
                          try {
                            const { writeTextFile, readTextFile, BaseDirectory } = await import('@tauri-apps/plugin-fs');
                            const raw = await readTextFile('.ava/creative/metadata.json', { baseDir: BaseDirectory.Home }).catch(() => '[]');
                            const meta = JSON.parse(raw || '[]').filter((a: any) => a.id !== deleteId);
                            await writeTextFile('.ava/creative/metadata.json', JSON.stringify(meta, null, 2), { baseDir: BaseDirectory.Home });
                          } catch { /* */ }
                        })();
                      }}
                      style={{
                        flex: 1, padding: '8px 0', borderRadius: 8, fontSize: 11, fontWeight: 500,
                        background: '#ef4444', color: '#fff', border: 'none', cursor: 'pointer',
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
