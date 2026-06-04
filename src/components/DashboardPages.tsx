import { useState, useEffect, useRef, useCallback, useMemo, Fragment } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
// Phosphor icons (duotone weight) — distinctive layered fill that reads
// as a crafted product instead of a generic SaaS dashboard. Same author
// quality as Lucide but with 6 weights; duotone is the one that wins
// design reviews.
import {
  Image as PhImage,
  MusicNotes as PhMusic,
  Microphone as PhVoice,
  FilmReel as PhVideo,
  FileText as PhDocument,
  GridFour as PhSpreadsheet,
  PresentationChart as PhPresentation,
  FolderOpen as PhFolder,
  Confetti as PhConfetti,
  NotePencil as PhNote,
  BookOpen as PhBook,
  Key as PhKey,
  Lock as PhLock,
  Brain as PhBrain,
  Lightbulb as PhLightbulb,
  TestTube as PhTestTube,
  CreditCard as PhCreditCard,
  Link as PhLink,
  CloudSun as PhWeather,
  Clock as PhClock,
  Rocket as PhRocket,
  CaretRight as PhCaretRight,
  Stack as PhStack,
  ArrowSquareOut as PhArrowSquareOut,
} from '@phosphor-icons/react';
import { t, useLocale, getLocale } from '../lib/i18n';
import { buildPaletteDirective, filterPaletteActions, type PaletteTool, type PaletteAction } from '../lib/palette-directives';
import { apiFetch, getPlatformKey, isConnected as checkConnected, disconnectAccount, trackTokenUsage, trackMessage, trackToolCall, getSessionStats, resetSessionStats, updateDisplayName, refreshDisplayName, type SessionStats } from '../lib/api';
import { useModeAvailability, modeSubtitle } from '../lib/mode-availability';
import { getSidecar, type SidecarEvent, type SidecarConfig } from '../lib/sidecar';
import { useDesktopPermLevel } from '../lib/useDesktopPermLevel';
import { Tooltip } from './Tooltip';
import { LessonPlayer, SAMPLE_LESSON, type PlayableLesson, type LessonStep } from './LessonPlayer';
import { readLocalLearning } from '../lib/learning-store';
import IdeTasksPanel, { IdeTasksSpine, type SessionTaskUI, type AvaCompletedTaskUI, type TodayTaskUI } from './IdeTasksPanel';
import { readLocalTasks, createLocalTask, toggleLocalTask } from '../lib/task-store';
import { DocumentationPage } from './DocumentationPage';
import { LibraryPapersPage } from './LibraryPapersPage';
import { ContextBar } from './ContextBar';
import { getToolHeader } from './tool-header';
import {
  loadDatasetConfig as fsLoadDatasetConfig,
  saveDatasetConfig as fsSaveDatasetConfig,
  ALL_AVA_MODES as DC_ALL_MODES,
  ALL_DATASETS as DC_ALL_DATASETS,
  type DatasetConfig as DatasetCfg,
  type AvaMode as DCAvaMode,
  type DatasetName as DCDatasetName,
} from '../lib/dataset-config';
// Canonical plan + top-up data + website redirect helpers.
// Browser-safe subpath so we don't drag node-side tool code into the Tauri
// renderer bundle. One source of truth across web, extension, and IDE —
// any pricing change on the website automatically flows through here.
import {
  PLANS,
  CREDIT_TOPUPS,
  dashboardBillingUrl,
  creditsForTurn,
  type PlanTier as AvaPlanTier,
} from '@ava/core/billing';
import {
  fetchPublicLeaderboard as fetchPublicBenchLeaderboard,
  getCachedLeaderboard as getCachedBenchLeaderboard,
  isCacheStale as isCachedBenchLeaderboardStale,
  BENCH_CATEGORY_LABELS,
  type BenchLeaderboard as BenchLeaderboardType,
  type BenchModelScores as BenchModelScoresType,
} from '@ava/core/benchmarks';
import { IdePurchaseCard } from './_IdePurchaseCard';
// Cloud-sync gate — every cloud write must check cloudSyncEnabled()
// before calling apiFetch. Data is always saved locally; this only
// governs the optional cloud copy. The binary "Cloud sync" toggle in
// the chat header calls setCloudSync(); a single localStorage value is
// the source of truth across the IDE.
import { cloudSyncEnabled } from '../lib/data-mode';
import { useCreativeGallery, type GalleryItem } from '../lib/creative-gallery';
import { HealthDashboard } from './HealthDashboard';
import HealthPlansPage from './HealthPlansPage';
import { CreativeGalleryStrip } from './CreativeOutputCard';

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

  // Refresh on chat-turn end. The chat handler dispatches
  // 'ava-usage-refresh' after every stream completes, so usage / balance /
  // tasks / journal panels mounted via useApiData stay in sync with what
  // the server has actually charged. Without this hook the dashboard only
  // refreshes on mount and the operator sees a frozen snapshot.
  useEffect(() => {
    const handler = () => { if (checkConnected()) fetch_(); };
    window.addEventListener('ava-usage-refresh', handler);
    return () => window.removeEventListener('ava-usage-refresh', handler);
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
    // Cloud sync only when Data Mode allows it.
    if (checkConnected() && cloudSyncEnabled()) {
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

// Escape raw HTML before any markdown conversion. The companion's
// renderer already does this; the IDE article reader didn't because
// its input (news articles) is admin-curated and trusted. Defence in
// depth: if the news_articles table is ever compromised, or a third-
// party feed is ever plugged in, HTML / event-handler / <script>
// injection doesn't reach dangerouslySetInnerHTML.
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderMarkdown(md: string): string {
  let html = escapeHtml(md)
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
              <p style={{ fontSize: 9, color: '#6c7086', margin: 0 }}>Ava Supernova Commentary</p>
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
          ? 'This article was AI-curated by Ava Supernova. All credit belongs to the original authors and publications listed above.'
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
    if (!cloudSyncEnabled()) {
      onRefresh();
      return;
    }
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
          <span style={{ marginBottom: 8, color: '#a855f7', opacity: 0.5 }}><PhConfetti size={32} weight="duotone" /></span>
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
          <span style={{ marginBottom: 8, color: '#a855f7', opacity: 0.5 }}><PhNote size={32} weight="duotone" /></span>
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
          <span style={{ marginBottom: 8, color: '#a855f7', opacity: 0.5 }}><PhBook size={32} weight="duotone" /></span>
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

type CcTab = 'daily' | 'briefing' | 'reflect' | 'health';

export function CommandCentrePage() {
  useLocale();
  const hour = new Date().getHours();
  const greeting = hour < 12 ? t('dash.cc.greeting_morning') : hour < 18 ? t('dash.cc.greeting_afternoon') : t('dash.cc.greeting_evening');

  // Inner tab state — persists so the user lands back on whichever lens
  // they last had open instead of always hitting Daily.
  const [tab, setTab] = useState<CcTab>(() => {
    try { const stored = localStorage.getItem('ava-ide-cc-tab'); return (stored === 'briefing' || stored === 'reflect' || stored === 'health') ? stored : 'daily'; }
    catch { return 'daily'; }
  });
  const switchTab = (next: CcTab) => {
    setTab(next);
    try { localStorage.setItem('ava-ide-cc-tab', next); } catch { /* quota / disabled */ }
  };

  // Working-hours readout for the hero pill — same localStorage keys
  // WorkingHoursClock writes to so the pill and the full widget stay
  // in sync without prop threading.
  const workStart = Number(typeof localStorage !== 'undefined' ? localStorage.getItem('ava-ide-work-start') : null) || 9;
  const workEnd = Number(typeof localStorage !== 'undefined' ? localStorage.getItem('ava-ide-work-end') : null) || 17;

  // Re-render on auth changes (login/logout)
  const [authRefresh, setAuthRefresh] = useState(0);
  useEffect(() => {
    const handler = () => setAuthRefresh(n => n + 1);
    window.addEventListener('ava-auth-changed', handler);
    return () => window.removeEventListener('ava-auth-changed', handler);
  }, []);
  void authRefresh;

  const connected = checkConnected();
  const dateStr = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  // ── Editable display name ────────────────────────────────────────────
  // Source-of-truth for what Ava calls the user. `ava-ide-user-name` is
  // the same key used by the chat panel's seeded welcome (line ~1997)
  // and the trajectory event payload (line ~2692), so editing it here
  // updates the greeting everywhere. Falls back to the email local-part
  // when no custom name has been set.
  const resolveUserName = (): string => {
    const stored = (localStorage.getItem('ava-ide-user-name') ?? '').trim();
    if (stored) return stored;
    return (localStorage.getItem('ava-ide-email')?.split('@')[0] ?? '').trim();
  };
  const [userName, setUserName] = useState<string>(resolveUserName);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [nameHover, setNameHover] = useState(false);
  useEffect(() => {
    const refresh = () => setUserName(resolveUserName());
    window.addEventListener('ava-auth-changed', refresh);
    window.addEventListener('ava-ide-name-changed', refresh);
    // On mount, pull the name from the platform if signed in. The
    // helper writes localStorage + dispatches the event when the value
    // changes, which the listener above already picks up — keeps the
    // sync flow single-direction at this surface.
    refreshDisplayName().catch(() => { /* offline / not signed in is fine */ });
    return () => {
      window.removeEventListener('ava-auth-changed', refresh);
      window.removeEventListener('ava-ide-name-changed', refresh);
    };
  }, []);
  const saveUserName = () => {
    const next = nameInput.trim();
    if (next) {
      localStorage.setItem('ava-ide-user-name', next);
      setUserName(next);
      // Push to the platform so the extension / companion / dashboard
      // pick up the same name on their next refresh. Fire-and-forget;
      // local-first means the UI commits the change regardless. Failure
      // (network down, API error, not signed in) is silent — local
      // value still applies on this surface.
      updateDisplayName(next).catch(() => { /* local-first */ });
    } else {
      // Empty input clears the custom name; greeting falls back to email prefix.
      localStorage.removeItem('ava-ide-user-name');
      setUserName((localStorage.getItem('ava-ide-email')?.split('@')[0] ?? '').trim());
      // Don't push empties to the platform — the API rejects them and
      // there's no clear-name path yet. Leaving the platform record at
      // its previous value is acceptable; the local greeting is what
      // matters here, other surfaces will keep showing the platform
      // value until the user picks a new name on this surface.
    }
    window.dispatchEvent(new CustomEvent('ava-ide-name-changed'));
    setEditingName(false);
  };

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
  // Learning is local-first — read the shared ~/.ava/learning.json (no account needed).
  const [curriculums, setCurriculums] = useState<LearningCurriculum[]>([]);
  const [learningLoading, setLearningLoading] = useState(true);
  useEffect(() => { void readLocalLearning().then(c => { setCurriculums(c as LearningCurriculum[]); setLearningLoading(false); }); }, []);
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

  // ── Hero strip pill ────────────────────────────────────────────────
  const HeroPill = ({ icon, text, title }: { icon: React.ReactNode; text: string; title?: string }) => (
    <div title={title} style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '4px 10px', borderRadius: 999,
      background: 'rgba(168,85,247,0.08)', border: '1px solid rgba(168,85,247,0.18)',
      color: '#cdd6f4', fontSize: 11, fontWeight: 500,
    }}>
      <span style={{ display: 'inline-flex', color: '#cba6f7' }}>{icon}</span>
      {text}
    </div>
  );

  // ── Inner-tab button ──────────────────────────────────────────────
  const TabBtn = ({ id, label }: { id: CcTab; label: string }) => {
    const active = tab === id;
    return (
      <button
        type="button"
        onClick={() => switchTab(id)}
        style={{
          padding: '8px 16px', borderRadius: 0, border: 'none', cursor: 'pointer',
          fontSize: 13, fontWeight: active ? 600 : 500,
          background: 'transparent',
          color: active ? '#cba6f7' : '#6c7086',
          borderBottom: active ? '2px solid #a855f7' : '2px solid transparent',
          marginBottom: -1,
          transition: 'color 0.15s, border-color 0.15s',
        }}
      >
        {label}
      </button>
    );
  };

  return (
    <div style={pageWrapper}>
      <div style={{ width: '100%' }}>
        {/* Spin animation */}
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

        {/* ── Hero strip — always visible across tabs ─────────────────── */}
        <div style={{
          display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between',
          gap: 16, marginBottom: 20,
        }}>
          <div>
            <div style={{ fontSize: 28, fontWeight: 300, color: '#cdd6f4', marginBottom: 4, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 4 }}>
              <span>{greeting}{userName || editingName ? ',' : ''}</span>
              {editingName ? (
                <input
                  autoFocus
                  value={nameInput}
                  onChange={e => setNameInput(e.target.value)}
                  onBlur={saveUserName}
                  onKeyDown={e => {
                    if (e.key === 'Enter') { e.preventDefault(); saveUserName(); }
                    else if (e.key === 'Escape') { setEditingName(false); setNameInput(''); }
                  }}
                  placeholder="What should Ava call you?"
                  maxLength={40}
                  style={{
                    fontSize: 28, fontWeight: 300, color: '#cdd6f4',
                    background: 'rgba(168,85,247,0.08)',
                    border: '1px solid rgba(168,85,247,0.3)',
                    borderRadius: 6,
                    padding: '0 8px',
                    outline: 'none',
                    fontFamily: 'inherit',
                    minWidth: 220,
                  }}
                />
              ) : userName ? (
                <span
                  onClick={() => { setNameInput(userName); setEditingName(true); }}
                  onMouseEnter={() => setNameHover(true)}
                  onMouseLeave={() => setNameHover(false)}
                  title="Click to change what Ava calls you"
                  style={{
                    cursor: 'pointer',
                    borderBottom: nameHover ? '1px dashed #a855f7' : '1px dashed transparent',
                    transition: 'border-color 0.15s',
                  }}
                >
                  {userName}
                </span>
              ) : (
                <span
                  onClick={() => { setNameInput(''); setEditingName(true); }}
                  title="Tell Ava what to call you"
                  style={{ cursor: 'pointer', color: '#a855f7', fontSize: 18, marginLeft: 4 }}
                >
                  + add name
                </span>
              )}
            </div>
            <div style={{ fontSize: 13, color: '#6c7086' }}>{dateStr}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {weather && !weatherLoading && (
              <HeroPill
                icon={<PhWeather size={14} weight="duotone" />}
                text={`${Math.round((weather as { temp_c?: number }).temp_c ?? 0)}° ${(weather as { condition?: string }).condition ?? ''}`.trim()}
                title="Weather — see Daily for details"
              />
            )}
            <HeroPill
              icon={<PhClock size={14} weight="duotone" />}
              text={`${workStart}:00 - ${workEnd}:00`}
              title="Working hours — change on Daily tab"
            />
            {latestRelease && (
              <HeroPill
                icon={<PhRocket size={14} weight="duotone" />}
                text={`v${(latestRelease as { version?: string }).version ?? ''}`}
                title="Latest release — full notes on Briefing tab"
              />
            )}
          </div>
        </div>

        {!connected && (
          <div style={{
            ...card, padding: '16px 20px', marginBottom: 16,
            background: 'linear-gradient(135deg, rgba(168,85,247,0.08), rgba(99,102,241,0.05))',
            border: '1px solid rgba(168,85,247,0.2)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ color: '#f9e2af' }}><PhKey size={26} weight="duotone" /></div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#cdd6f4' }}>{t('dash.cc.byok_mode')}</div>
                <div style={{ fontSize: 11, color: '#6c7086' }}>
                  {t('dash.cc.byok_desc')}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Tab nav ───────────────────────────────────────────────── */}
        <div style={{
          display: 'flex', gap: 4, marginBottom: 20,
          borderBottom: '1px solid rgba(168,85,247,0.12)',
        }}>
          <TabBtn id="daily" label="Daily" />
          <TabBtn id="briefing" label="Briefing" />
          <TabBtn id="reflect" label="Reflect" />
          <TabBtn id="health" label="Health" />
        </div>

        {/* ── Daily tab ─────────────────────────────────────────────── */}
        {tab === 'daily' && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16, marginBottom: 16 }}>
              {connected ? (
                <CCTasksWidget tasks={tasks} loading={tasksLoading} onRefresh={refetchTasks} />
              ) : (
                <WidgetCard title={t('dash.cc.todays_tasks')} icon={'✅'}>
                  <CCNotConnectedPlaceholder widgetName={t('dash.cc.widget_tasks')} />
                </WidgetCard>
              )}
              {connected ? (
                <CCJournalWidget journalDay={journalDay} loading={journalLoading} />
              ) : (
                <WidgetCard title={t('dash.cc.todays_journal')} icon={'📓'}>
                  <CCNotConnectedPlaceholder widgetName={t('dash.cc.widget_journal')} />
                </WidgetCard>
              )}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <WorkingHoursClock />
              <CCWeatherWidget weather={weather} loading={weatherLoading} onRefresh={loadWeather} />
            </div>
          </>
        )}

        {/* ── Briefing tab ──────────────────────────────────────────── */}
        {tab === 'briefing' && (
          <>
            <div style={{ marginBottom: 16 }}>
              <CCNewsWidget
                articles={newsArticles}
                loading={newsLoading}
                onCategoryChange={handleNewsCategory}
                selectedCategory={newsCategory}
                onRefresh={() => loadNews(newsCategory)}
                onOpenArticle={openArticle}
              />
            </div>
            <CCReleaseWidget release={latestRelease} loading={releaseLoading} onRefresh={refetchRelease} />
          </>
        )}

        {/* ── Reflect tab ───────────────────────────────────────────── */}
        {tab === 'reflect' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {connected ? (
              <CCMemoryWidget memories={memories} loading={memoriesLoading} />
            ) : (
              <WidgetCard title={t('dash.cc.memory')} icon={'🧠'}>
                <CCNotConnectedPlaceholder widgetName={t('dash.cc.widget_memories')} />
              </WidgetCard>
            )}
            {connected ? (
              <CCLearningWidget curriculums={curriculums} loading={learningLoading} />
            ) : (
              <WidgetCard title={t('dash.cc.learning')} icon={'🎓'}>
                <CCNotConnectedPlaceholder widgetName={t('dash.cc.widget_learning')} />
              </WidgetCard>
            )}
          </div>
        )}

        {/* ── Health tab ────────────────────────────────────────────── */}
        {tab === 'health' && <HealthDashboard />}
      </div>
    </div>
  );
}

/* ===== 2. Ava Chat ===== */
export function AvaChatPage() {
  useLocale();
  // ── Types ──────────────────────────────────────────────────────────────────
  type AvaMode = 'work' | 'plan' | 'chat' | 'teach' | 'security' | 'brainstorm' | 'desktop';
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

  // ── Knowledge-pack list removed in v0.59.2 ─────────────────────────────────
  // Frontier models cover the builtin domain content from training; the
  // silent injection broke the post-rebalance ~1-credit chat promise.
  // The const block below was the IDE pack catalogue — kept here as a
  // tombstone comment since it was the only IDE-side reference.

  // ── Sidecar model mapping (single source of truth) ─────────────────────────
  const SIDECAR_MODEL_MAP: Record<string, string> = {
    // Orchestrated modes — the sidecar handles these by id, no provider prefix.
    // Without this row, the fallback in setModel adds `platform:` (or worse,
    // `qwen:` on the init path) and the resolver dies trying to find a model
    // literally called 'supernova', then silently degrades to qwen3.5-flash.
    'auto': 'auto',
    'supernova': 'supernova',
    'aurora': 'aurora',
    'qwen3.6-plus': 'platform:qwen3.6-plus',
    'kimi-k2.6': 'kimi:kimi-k2.6',
    'kimi-k2.5': 'kimi:kimi-k2.5',
    'qwen3.5-omni-flash': 'platform:qwen3.5-omni-flash',
    'qwen3.5-omni-plus': 'platform:qwen3.5-omni-plus',
    'qwen3.5-plus': 'platform:qwen3.5-plus',
    'qwen3.5-flash': 'platform:qwen-flash',
    'deepseek-chat': 'deepseek:deepseek-chat',
    'deepseek-reasoner': 'deepseek:deepseek-reasoner',
    'moonshot-v1-128k': 'kimi:moonshot-v1-128k',
    'glm-4-plus': 'zhipu:glm-4-plus',
    'mistral-large': 'mistral:mistral-large-3',
  };

  // ── Mode definitions ───────────────────────────────────────────────────────
  const MODES: { id: AvaMode; label: string; icon: string; prefix: string; placeholder: string }[] = [
    { id: 'work', label: t('mode.work'), icon: '>>', prefix: '', placeholder: t('mode.work.placeholder') },
    { id: 'plan', label: t('mode.plan'), icon: '::', prefix: '[Plan Mode] ', placeholder: t('mode.plan.placeholder') },
    { id: 'chat', label: t('mode.chat'), icon: '..', prefix: '[Chat Mode] ', placeholder: t('mode.chat.placeholder') },
    { id: 'teach', label: t('mode.teach'), icon: '??', prefix: '[Teach Mode] ', placeholder: t('mode.teach.placeholder') },
    { id: 'security', label: t('mode.security'), icon: '!!', prefix: '[Security Audit Mode] ', placeholder: t('mode.security.placeholder') },
    { id: 'brainstorm', label: t('mode.brainstorm'), icon: '**', prefix: '[Brainstorm Mode] ', placeholder: t('mode.brainstorm.placeholder') },
    { id: 'desktop', label: 'Desktop Automation', icon: '@@', prefix: '[Desktop Automation Mode] ', placeholder: 'Open Notepad, launch Chrome, control your screen...' },
  ];

  // ── Desktop-capable model IDs ─────────────────────────────────────────────
  // Mirrors the `desktopCapable: true` flag set in @ava/core's model
  // definitions. Models clicking, typing, and launching apps need (a)
  // reliable native tool-call argument formatting, (b) fast enough latency
  // for a 6-step plan to feel responsive. Flash-class models drop tool-call
  // args under sequential pressure; media models (MiniMax) aren't agentic
  // coordinators. Both are excluded.
  //
  // 'auto' (Maestro), 'supernova' and 'aurora' resolve to known coordinators
  // server-side (Qwen 3.6 Plus / DeepSeek V4 Pro / Mistral Large 3), all
  // desktop-capable, so they count.
  const DESKTOP_CAPABLE_MODEL_IDS = new Set<string>([
    'auto', 'supernova', 'aurora',
    // Platform / Qwen direct
    'qwen3.7-max', 'qwen3.6-plus', 'qwen3.5-plus', 'qwen3.5-omni-plus',
    // Platform DeepSeek (admin-gated)
    'deepseek-v4-pro-platform', 'deepseek-v4-pro',
    // Platform Mistral (Aurora's fleet, available on platform)
    'mistral-large-3-platform', 'mistral-small-4-platform',
    // Anthropic
    'claude-opus-4-8', 'claude-opus-4-7', 'claude-opus-4-6', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001',
    // Kimi
    'kimi-k2.6', 'kimi-k2.5',
    // Mistral
    'mistral-large-3', 'mistral-medium-3.5', 'mistral-small-4',
    'codestral-latest', 'devstral-latest',
    // Zhipu / GLM
    'glm-5.1', 'glm-5', 'glm-4.7',
    // Xiaomi MiMo
    'mimo-v2.5-pro', 'mimo-v2.5',
  ]);
  const isDesktopCapable = (modelId: string | undefined): boolean =>
    !!modelId && DESKTOP_CAPABLE_MODEL_IDS.has(modelId);

  // ── BYOK model map — fetched from platform, fallback to hardcoded ──────────
  const BYOK_MODELS_FALLBACK: Record<string, { id: string; name: string }[]> = {
    DeepSeek: [{ id: 'deepseek-chat', name: 'DeepSeek V3.2' }, { id: 'deepseek-reasoner', name: 'DeepSeek Reasoner' }],
    Qwen: [{ id: 'qwen3.7-max', name: 'Qwen 3.7 Max' }, { id: 'qwen3.6-plus', name: 'Qwen 3.6 Plus' }, { id: 'qwen3.5-omni-plus', name: 'Qwen 3.5 Omni Plus' }, { id: 'qwen3.5-flash', name: 'Qwen 3.5 Flash' }],
    MiniMax: [{ id: 'MiniMax-M3', name: 'MiniMax M3' }, { id: 'MiniMax-M2.7', name: 'MiniMax M2.7' }, { id: 'MiniMax-M2.7-highspeed', name: 'MiniMax M2.7 HighSpeed' }],
    Moonshot: [{ id: 'kimi-k2.6', name: 'Kimi K2.6' }, { id: 'kimi-k2.5', name: 'Kimi K2.5' }],
    Zhipu: [{ id: 'glm-5.1', name: 'GLM-5.1' }, { id: 'glm-5', name: 'GLM-5' }, { id: 'glm-4.7', name: 'GLM-4.7' }, { id: 'glm-4.5-air', name: 'GLM-4.5 Air' }],
    Mistral: [{ id: 'mistral-large-3', name: 'Mistral Large 3' }, { id: 'mistral-medium-3.5', name: 'Mistral Medium 3.5' }, { id: 'mistral-small-4', name: 'Mistral Small 4' }, { id: 'codestral-latest', name: 'Codestral' }, { id: 'devstral-latest', name: 'Devstral 2' }],
    Anthropic: [{ id: 'claude-opus-4-8', name: 'Claude Opus 4.8' }, { id: 'claude-opus-4-7', name: 'Claude Opus 4.7' }, { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6' }, { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5' }],
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

  // ── State ──────────────────────────────────────────────────────────────────
  // Re-render on auth changes — reset to local-first state on logout
  const [authRefreshChat, setAuthRefreshChat] = useState(0);
  useEffect(() => {
    const handler = () => {
      setAuthRefreshChat(n => n + 1);
      if (!checkConnected()) {
        // Clear cloud state — snap back to local-first
        setCreditBalance(null);
        setUsageWarning({ level: 'none', message: '' });
        setChatBackend('local');
        setMessages([{ id: `msg-reset-${Date.now()}`, role: 'ava' as const, text: buildIdeWelcome(), timestamp: Date.now() }]);
        setConversationTitle(t('dash.chat.new_chat'));
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

  // Build the dynamic welcome at first-mount so the seeded message
  // reflects the operator's actual time-of-day and name. Mirrors the
  // extension chat panel's buildSeededWelcome — first-person from Ava,
  // partner-voice rather than generic-chatbot. localStorage `ava-ide-user-name`
  // is the same key used by the dataset trajectory event (line 2671).
  const buildIdeWelcome = (): string => {
    const userName = (localStorage.getItem('ava-ide-user-name') ?? localStorage.getItem('ava-ide-email')?.split('@')[0] ?? '').trim() || null;
    const now = new Date();
    const h = now.getHours();
    const day = now.toLocaleDateString('en-GB', { weekday: 'long' });
    const namePart = userName ? `, ${userName}` : '';
    if (h >= 5 && h < 12) return `Morning${namePart}. It's ${day} — what are we tackling today?`;
    if (h >= 12 && h < 18) return `Afternoon${namePart}. ${day} — what can I get into for you?`;
    if (h >= 18 && h < 23) return `Evening${namePart}. Pull up a chair — what are we working on?`;
    return `Late one${namePart ? '' : ' here'}${namePart}. I'm awake if you are — what's on your mind?`;
  };

  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    try {
      const saved = localStorage.getItem('ava-ide-chat-current');
      if (saved) { const parsed = JSON.parse(saved); if (Array.isArray(parsed) && parsed.length > 0) return parsed; }
    } catch { /* */ }
    return [
      { id: mkId(), role: 'ava' as const, text: buildIdeWelcome(), timestamp: Date.now() },
    ];
  });
  const [input, setInput] = useState('');
  const [model, setModel] = useState<string>(() => {
    const stored = localStorage.getItem('ava-ide-chat-model') || 'auto';
    // Migration: MiniMax is reserved for Creative Studio — never as chat coordinator.
    // Reset any stuck MiniMax value so the sidecar resolver picks the right Qwen fallback.
    if (stored.toLowerCase().includes('minimax')) {
      localStorage.setItem('ava-ide-chat-model', 'auto');
      return 'auto';
    }
    // Migration: pre-fix builds wrote `qwen:supernova` / `qwen:auto` because
    // the init fallback prefixed every bare orchestrator id with `qwen:`.
    // Resolve to the real orchestrated mode so AutoCoordinator picks up.
    if (stored === 'qwen:supernova' || stored === 'qwen:auto' || stored.startsWith('qwen:supernova') || stored.startsWith('qwen:auto')) {
      const fixed = stored.includes('supernova') ? 'supernova' : 'auto';
      localStorage.setItem('ava-ide-chat-model', fixed);
      return fixed;
    }
    return stored;
  });
  const [mode, setMode] = useState<AvaMode>(() => (localStorage.getItem('ava-ide-chat-mode') as AvaMode) || 'work');
  // Desktop permission level — shared with the Settings page via a hook
  // backed by localStorage + a window event. Either picker (chat-bar pill
  // or Settings page) updates both. 'watch' = narrate only, 'ask' = confirm
  // each mutative tool (default), 'drive' = run reversible plan steps
  // silently after one approval; irreversibles always re-prompt regardless.
  const [desktopPermLevel, setDesktopPermLevel] = useDesktopPermLevel();
  // Desktop-mode model-capability warning — set on entering desktop mode
  // while the active coordinator isn't desktop-capable. The modal offers
  // one-click switch to a recommended coordinator; no silent autoswitch.
  const [desktopModelWarn, setDesktopModelWarn] = useState<{ currentName: string } | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [hoveredMsg, setHoveredMsg] = useState<string | null>(null);
  const [copiedMsg, setCopiedMsg] = useState<string | null>(null);
  const [modeMenuOpen, setModeMenuOpen] = useState(false);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  // packsMenuOpen removed with knowledge-pack feature in v0.59.2.
  // Tier read for Supernova admin gating in the model dropdown. Mirrors
  // the extension's account?.tier === 'admin' check. Listens to the
  // 'ava-tier-changed' event so the gate flips when the user signs in
  // or refreshes their account info without a panel re-mount.
  // Unified mode-availability hook — single source of truth for the
  // 3 orchestrated modes (Aurora / Supernova / Maestro). Recomputes on
  // ava-auth-changed (sign in/out), ava-byok-changed (key add/remove),
  // and ava-tier-changed (admin promotion). Tier-gating, platform-key
  // detection, and BYOK-key detection all flow through this hook —
  // see lib/mode-availability.ts.
  const { state: modeState, availability: modeAvailability } = useModeAvailability();
  // Knowledge-pack enabled state removed in v0.59.2. localStorage key
  // 'ava-knowledge-packs' from prior installs is harmless if it lingers.
  const [tokenCount, setTokenCount] = useState(0);
  // Platform credit balance — combined free + subscription pool. The shape
  // {used, limit} survives the rename from the old token-system state for
  // tick-engine localStorage compatibility, but the values are credits.
  const [creditBalance, setCreditBalance] = useState<{ used: number; limit: number } | null>(null);
  // First-load gates. Mirror the extension's chat panel — locks the chat
  // surface while the account fetch is still in flight on a connected
  // session so users don't see a half-populated state (Free → Pro flash,
  // empty conversations list that reads as "no chats" before localStorage
  // is drained). Both flip false in one sweep when their respective
  // signals resolve. Local-only / no-account paths skip both gates by
  // initialising false (see effect below).
  const [accountLoading, setAccountLoading] = useState<boolean>(() => !!getPlatformKey());
  const [historyLoading, setHistoryLoading] = useState<boolean>(true);
  const [conversationTitle, setConversationTitle] = useState(t('dash.chat.new_chat'));
  // Tracks which saved conversation (by id) is currently rendered in the
  // chat panel. null = fresh / unsaved chat. Used by the history-delete
  // listener so we can reset when the operator deletes the conv they're
  // currently looking at, in addition to the all-cleared case.
  const [currentConvId, setCurrentConvId] = useState<string | null>(null);
  const [contextPercent, setContextPercent] = useState(0);

  // ── Load conversation from history ──────────────────────────────────────
  // Race-condition note: AvaChatPage and ChatHistoryPage are sibling routes
  // — only one is mounted at a time. When the operator clicks a conversation
  // from history, the click writes to localStorage, dispatches
  // 'ava-load-conversation', AND fires the navigate event. The dispatch is
  // synchronous, so the listener (registered in this useEffect) hasn't been
  // attached yet at that moment — AvaChatPage is mid-mount. The event is
  // lost, the conv sits in localStorage indefinitely, and the chat never
  // updates. Symptoms: clicking conversations from history appears to do
  // nothing on first click after a navigate, and subsequent clicks render
  // stale content because each click overwrites localStorage but only the
  // event-listener path consumes it.
  //
  // Fix: on every mount, drain localStorage immediately. The live event
  // listener still handles the case where the chat tab is already mounted
  // when the operator clicks a conv (no remount, listener catches the
  // event). This way both paths land the same outcome — conversation loads
  // — regardless of mount timing.
  useEffect(() => {
    const drainPending = () => {
      try {
        const raw = localStorage.getItem('ava-ide-load-conversation');
        if (!raw) return;
        localStorage.removeItem('ava-ide-load-conversation');
        const conv = JSON.parse(raw);
        if (conv.messages && Array.isArray(conv.messages)) {
          setMessages(conv.messages);
          setConversationTitle(conv.title || t('dash.chat.new_chat'));
          setCurrentConvId(typeof conv.id === 'string' ? conv.id : null);
        }
      } catch { /* ignore */ }
    };
    drainPending();
    // History is drained synchronously from localStorage on mount, so the
    // gate flips false immediately. Kept as a state flag (rather than a
    // constant false) so the loading banner has a consistent shape with
    // the extension chat panel and the field is available to gate other
    // components that may wait on async history sync in future.
    setHistoryLoading(false);
    window.addEventListener('ava-load-conversation', drainPending);
    return () => window.removeEventListener('ava-load-conversation', drainPending);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reset chat when the operator deletes the conversation currently shown,
  // OR when the History page becomes empty. Without this, deleting from
  // History leaves the chat panel rendering a conversation that no longer
  // exists in storage.
  useEffect(() => {
    const onDeleted = (e: Event) => {
      const detail = (e as CustomEvent<{ deletedId: string; remaining: number }>).detail;
      if (!detail) return;
      const isCurrent = currentConvId !== null && currentConvId === detail.deletedId;
      const allCleared = detail.remaining === 0;
      if (isCurrent || allCleared) {
        setMessages([{ id: mkId(), role: 'ava', text: buildIdeWelcome(), timestamp: Date.now() }]);
        setConversationTitle(t('dash.chat.new_chat'));
        setCurrentConvId(null);
      }
    };
    window.addEventListener('ava-history-conv-deleted', onDeleted);
    return () => window.removeEventListener('ava-history-conv-deleted', onDeleted);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentConvId]);

  // ── Platform credit balance fetch ───────────────────────────────────────
  // Mirrors the extension's read shim (Usage.tsx in extension/dashboard-ui):
  // reads credits_* first, falls back to tokens_* for any stale account-info
  // cache from before the platform's credit-redesign hotfix shipped.
  // Combines the free pool + subscription pool into one balance bar — same
  // unified view the extension uses so users don't have to mentally add the
  // two pools together.
  const fetchBalance = useCallback(async () => {
    const key = getPlatformKey();
    if (!key) {
      // No platform key — there's nothing to wait on. Drop the gate so
      // BYOK / local-only users aren't stuck at the loading banner.
      setAccountLoading(false);
      return;
    }
    try {
      const res = await apiFetch('/account-info');
      if (!res?.usage) {
        setAccountLoading(false);
        return;
      }
      const u = res.usage as Record<string, unknown>;
      const freeUsed  = Number(u.free_credits_used  ?? u.free_tokens_used  ?? 0);
      const freeLimit = Number(u.free_credits_limit ?? u.free_tokens_limit ?? 300);
      const subUsed   = Number(u.credits_used       ?? u.tokens_used       ?? 0);
      const subLimit  = Number(u.credits_limit      ?? u.tokens_limit      ?? 0);
      const totalUsed  = freeUsed + subUsed;
      const totalLimit = freeLimit + subLimit;
      // Reconcile via max() on `used`. The platform's chat route runs
      // increment_credits inside Vercel's after() — strictly post-stream-
      // close. The fetchBalance triggered by the 'done' event will
      // usually beat that commit, returning a pre-charge value. Without
      // max() the displayed balance would roll backwards from the
      // optimistic bump applied in the 'usage' / 'done' handlers.
      // Once the server's after() commits, the next refresh comes back
      // higher and replaces the optimistic value cleanly.
      setCreditBalance((prev) => {
        const used = prev && prev.used > totalUsed ? prev.used : totalUsed;
        return { used, limit: totalLimit };
      });
      // Mirror to localStorage so the App-level tick engine can fire
      // low-credit warnings without needing the dashboard mounted.
      try {
        localStorage.setItem('ava-platform-balance', JSON.stringify({ used: totalUsed, limit: totalLimit }));
      } catch { /* quota / disabled — non-fatal */ }
    } catch { /* non-fatal */ }
    finally { setAccountLoading(false); }
  }, []);

  useEffect(() => { fetchBalance(); }, [fetchBalance]);
  // Refresh balance when streaming ends
  useEffect(() => { if (!streaming) fetchBalance(); }, [streaming, fetchBalance]);
  // Also subscribe to the global 'ava-usage-refresh' signal — covers the
  // case where streaming flips false → true → false within the same render
  // batch and the streaming-ends effect doesn't fire, plus keeps balance
  // in sync with anywhere else that dispatches the event.
  useEffect(() => {
    const handler = () => { fetchBalance(); };
    window.addEventListener('ava-usage-refresh', handler);
    return () => window.removeEventListener('ava-usage-refresh', handler);
  }, [fetchBalance]);

  // ── Local sidecar state ─────────────────────────────────────────────────
  // chatBackend selects where the chat runs — local sidecar (BYOK) vs the
  // platform. Binary: the legacy 'both' value migrates to 'cloud' (it only
  // ever differed for the data axis, which is now the separate cloud-sync
  // toggle). The control lives in Settings.
  const [chatBackend, setChatBackend] = useState<'local' | 'cloud'>(() => {
    const saved = localStorage.getItem('ava-ide-chat-backend');
    // Force local if not connected — Cloud needs a platform account
    if (!checkConnected()) return 'local';
    return saved === 'local' ? 'local' : 'cloud';
  });
  const [sidecarReady, setSidecarReady] = useState(false);
  const [sidecarStatus, setSidecarStatus] = useState<'off' | 'starting' | 'ready' | 'error'>('off');
  // Cloud-sync toggle removed — Ava is local-first (cloudSyncEnabled() is hard-off).
  const [pendingConfirm, setPendingConfirm] = useState<{
    id: string;
    toolName: string;
    args: Record<string, unknown>;
    desktopClassification?: {
      riskClass: 'observational' | 'navigational' | 'mutative-reversible' | 'mutative-irreversible' | 'privileged';
      reasons: string[];
      requiresSecretHandle: boolean;
    };
  } | null>(null);
  const [confirmInput, setConfirmInput] = useState('');
  const [pendingAttachments, setPendingAttachments] = useState<{ name: string; dataUri: string; mimeType: string }[]>([]);

  // Secret-grant prompt — populated when the sidecar emits a
  // secret_grant_request because Ava called secret_request. User types
  // the value into the masked input; it goes to the sidecar's session-
  // lived working set and Ava receives back an opaque `{{secret:<id>}}`
  // handle. The raw value never appears in chat history, tool args,
  // thinking, or the model's context — it only materialises at tool
  // execute time via argsPreprocessor substitution in the sidecar.
  const [pendingSecretGrant, setPendingSecretGrant] = useState<{
    grantId: string;
    label: string;
    reason: string;
  } | null>(null);
  const [secretGrantInput, setSecretGrantInput] = useState('');

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
  // Tracks whether the sidecar emitted a 'usage' event during the current
  // turn. Some providers (Ollama, LM Studio, custom OpenAI-compatible
  // endpoints) don't include usage in streaming chunks, so the agent
  // never fires a 'usage' event and the per-session token counter
  // sits at 0 forever. Reset on stream_start, set on usage, fall back
  // to a content-length estimate at 'done' when still false.
  const usageEventFiredThisTurn = useRef<boolean>(false);
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

  // ── Command palette state ─────────────────────────────────────────────
  const [showPalette, setShowPalette] = useState(false);
  const [paletteActiveIndex, setPaletteActiveIndex] = useState(0);
  const palettePanelRef = useRef<HTMLDivElement>(null);
  const paletteBtnRef = useRef<HTMLButtonElement>(null);

  // Close palette on outside click — mirrors the vault handler above.
  useEffect(() => {
    if (!showPalette) return;
    const handler = (e: MouseEvent) => {
      if (palettePanelRef.current && !palettePanelRef.current.contains(e.target as Node) && paletteBtnRef.current && !paletteBtnRef.current.contains(e.target as Node)) setShowPalette(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showPalette]);

  // Typing `/` at the start of the input opens the palette; the text after
  // the slash becomes the filter query. Typing anything else closes it so
  // the input goes back to being a normal chat composer.
  useEffect(() => {
    if (input.startsWith('/')) {
      setShowPalette(true);
    } else if (input.length > 0) {
      setShowPalette(false);
    }
    setPaletteActiveIndex(0);
  }, [input]);

  const paletteQuery = input.startsWith('/') ? input.slice(1) : '';
  const filteredPaletteActions: PaletteAction[] = useMemo(
    () => filterPaletteActions(paletteQuery),
    [paletteQuery],
  );

  // Clamp active index when the filtered list shrinks below it.
  useEffect(() => {
    if (paletteActiveIndex >= filteredPaletteActions.length) {
      setPaletteActiveIndex(Math.max(0, filteredPaletteActions.length - 1));
    }
  }, [filteredPaletteActions.length, paletteActiveIndex]);

  // Group filtered actions by section for rendering (preserving canonical
  // section order; sections with no matches disappear from the dropdown).
  const groupedPaletteActions = useMemo(() => {
    const order: string[] = [];
    const map = new Map<string, PaletteAction[]>();
    for (const a of filteredPaletteActions) {
      if (!map.has(a.sectionKey)) {
        map.set(a.sectionKey, []);
        order.push(a.sectionKey);
      }
      map.get(a.sectionKey)!.push(a);
    }
    return order.map((sectionKey) => ({ sectionKey, items: map.get(sectionKey)! }));
  }, [filteredPaletteActions]);

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
  // Ava's avatar is brand-locked — sourced from
  // packages/core/assets/ava-avatar.jpeg (copied to public/). The
  // operator-override path via `ava-ide-ai-avatar` localStorage was
  // removed alongside the Settings → Avatars upload UI; Ava reads
  // consistently across every install and every surface.
  const chatAiAvatar = '/ava-avatar.jpeg';

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
  // packsMenuRef removed with knowledge-pack feature in v0.59.2.

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
  // First-load gate — locks the chat input while account or history are
  // still loading. Mirrors the extension chat panel.
  const dataLoading = accountLoading || historyLoading;
  const canChat = !dataLoading && (chatBackend === 'local' ? (hasByokKeys || connected) : connected);
  const chatInactiveReason = dataLoading
    ? (accountLoading && historyLoading
        ? 'Loading your account and chat history…'
        : accountLoading
          ? 'Loading your account…'
          : 'Loading your chat history…')
    : !canChat
      ? (!connected && !hasByokKeys
        ? t('dash.chat.inactive_no_keys')
        : chatBackend === 'cloud' && !connected
          ? t('dash.chat.inactive_no_cloud')
          : '')
      : '';

  // ── Persist model & mode ──────────────────────────────────────────────────
  useEffect(() => {
    try {
      // Guard: MiniMax is Creative Studio only — never persist as chat model.
      if (!model.toLowerCase().includes('minimax')) {
        localStorage.setItem('ava-ide-chat-model', model);
      }
    } catch { /* */ }
  }, [model]);
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
  // Local-first: reads the SAME ~/.ava/tasks.json (+ workspace store) the CLI
  // and extension use, via Tauri fs. Works with no account. Cloud sync is
  // additive and opt-in, handled at the platform layer — never required here.
  const fetchUserTasks = useCallback(async () => {
    try {
      const today = new Date().toISOString().slice(0, 10);
      const entries = await readLocalTasks();
      const mapped: TodayTaskUI[] = entries.map((t) => ({
        id: t.id, title: t.title, priority: (t.priority || 'medium') as TodayTaskUI['priority'],
        status: (t.status || 'todo') as TodayTaskUI['status'], dueDate: t.dueDate, category: t.category || 'general',
      }));
      setAllTasks(mapped);
      // Today = in-progress OR due today and not done (mirrors @ava/core getTodayTasks).
      setTodayTasks(mapped.filter((t) => t.status === 'in-progress' || (t.dueDate === today && t.status !== 'done')));
    } catch { /* local-first: empty board, never an error */ }
  }, []);

  useEffect(() => { if (tasksPanelOpen) fetchUserTasks(); }, [tasksPanelOpen, fetchUserTasks]);
  // Preload on mount too — the collapsed spine shows a live active-count.
  useEffect(() => { fetchUserTasks(); }, [fetchUserTasks]);

  const handleToggleTask = useCallback(async (taskId: string) => {
    try {
      await toggleLocalTask(taskId);
      fetchUserTasks();
    } catch { /* */ }
  }, [fetchUserTasks]);

  const handleCreateTask = useCallback(async (task: { title: string; priority?: string; category?: string; due_date?: string }) => {
    try {
      await createLocalTask(task);
      fetchUserTasks();
    } catch { /* */ }
  }, [fetchUserTasks]);

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
      // packsMenu outside-click handler removed with knowledge-pack feature in v0.59.2.
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
  // chatBackend (where the chat runs) is independent of cloud sync (data
  // backup) — the two were previously conflated on one toggle. The
  // chat-backend control now lives in Settings, which dispatches
  // 'ava-chat-backend-changed'; this component owns the state + persists it.
  useEffect(() => {
    try {
      localStorage.setItem('ava-ide-chat-backend', chatBackend);
    } catch { /* */ }
  }, [chatBackend]);

  // Honour chat-backend changes made from the Settings page.
  useEffect(() => {
    const handler = (e: Event) => {
      const next = (e as CustomEvent<{ backend: 'local' | 'cloud' }>).detail?.backend;
      if (next === 'local' || next === 'cloud') setChatBackend(next);
    };
    window.addEventListener('ava-chat-backend-changed', handler);
    return () => window.removeEventListener('ava-chat-backend-changed', handler);
  }, []);

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

        // Data Mode + per-category sync prefs → localOnly flags passed
        // into the sidecar. Same formula as the VS Code extension's
        // setupAgent: the category pref OR the global Data Mode resolving
        // to local means no cloud writes from the generator / learning
        // tools. Mirrors the flags added in extension v0.48.4.
        const idesSyncPrefs = (() => {
          try { return JSON.parse(localStorage.getItem('ava-ide-sync-prefs') || '{}') as Record<string, boolean>; }
          catch { return {}; }
        })();
        const idesCloudAllowed = cloudSyncEnabled();
        const generationLocalOnly = idesSyncPrefs.generations === false || !idesCloudAllowed;
        const learningLocalOnly = idesSyncPrefs.learning === false || !idesCloudAllowed;

        // Local / custom OpenAI-compatible provider (Ollama, LM Studio, vLLM).
        // Operator configures via Settings → Models → Local. Both fields
        // required to register; if either is missing we just don't pass it
        // and the sidecar skips registration cleanly.
        const localBaseUrl = localStorage.getItem('ava-ide-local-baseurl') || '';
        const localModelName = localStorage.getItem('ava-ide-local-model') || '';
        const localApiKey = localStorage.getItem('ava-ide-local-apikey') || '';
        const localModelLabel = localStorage.getItem('ava-ide-local-label') || '';
        const localBlock = (localBaseUrl && localModelName)
          ? { baseUrl: localBaseUrl, modelName: localModelName, apiKey: localApiKey || undefined, modelLabel: localModelLabel || undefined }
          : undefined;

        const config: SidecarConfig = {
          providers,
          platformKey: getPlatformKey() || undefined,
          // Sidecar resolves bare 'auto'/'supernova' via AutoCoordinator; raw
          // model ids without a known mapping get a `platform:` prefix so the
          // ProviderRegistry resolver can find them. Never silently coerce
          // to `qwen:` — that produces nonsense ids like `qwen:supernova` and
          // makes the resolver fall back to qwen3.5-flash without warning.
          activeModel: modelMap[model] || (model === 'auto' || model === 'supernova' || model === 'aurora' ? model : `platform:${model}`),
          cwd: localStorage.getItem('ava-ide-project-folder') || '.',
          mode,
          permissionMode: (localStorage.getItem('ava-ide-settings') ? JSON.parse(localStorage.getItem('ava-ide-settings')!).permissionMode : 'balanced') || 'balanced',
          autoMemory: true,
          workingHours: { start: workStart, end: workEnd },
          userName: localStorage.getItem('ava-ide-user-name') || localStorage.getItem('ava-ide-email')?.split('@')[0] || undefined,
          userEmail: localStorage.getItem('ava-ide-email') || undefined,
          userTier: localStorage.getItem('ava-ide-tier') || undefined,
          _devPlatformFallback: !!getPlatformKey(),
          generationLocalOnly,
          learningLocalOnly,
          local: localBlock,
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

  // ── Library → Papers "Read with Ava" handoff ────────────────────────
  // LibraryPapersPage dispatches `ava-read-paper-with-ava` on the window
  // when the user clicks the CTA on a paper card. Switch to Teach mode,
  // persist it, and send the four-layer-pass primer through the sidecar.
  // The chat panel's natural send loop renders the message + streams
  // Ava's reply, so this handler doesn't need to manage UI state itself.
  useEffect(() => {
    const handler = (ev: Event) => {
      const detail = (ev as CustomEvent<{ paper: {
        id?: string; doi?: string; arxiv_id?: string; openalex_id?: string;
        title: string; authors: { name: string }[];
        year?: number; primary_url?: string; retracted?: boolean;
      } }>).detail;
      const paper = detail?.paper;
      if (!paper) return;

      const ident = paper.arxiv_id
        ? `arxiv:${paper.arxiv_id}`
        : paper.doi
          ? `doi:${paper.doi}`
          : paper.openalex_id
            ? `openalex:${paper.openalex_id}`
            : paper.primary_url ?? paper.title;

      const primer =
        `[Read with Ava]\n\n` +
        `I'd like you to read and explain this scientific paper for me. ` +
        `Use the four-layer pass: 1. What's the question? (one plain-English sentence). ` +
        `2. Why does it matter? (the human stake). ` +
        `3. What did they do? (method, jargon-stripped). ` +
        `4. What did they find — and how confident should I be? (results + caveats specific to this paper's discipline).\n\n` +
        `Paper: **${paper.title}**${paper.year ? ` (${paper.year})` : ''}\n` +
        (paper.authors.length > 0 ? `Authors: ${paper.authors.slice(0, 6).map(a => a.name).join(', ')}${paper.authors.length > 6 ? ', et al.' : ''}\n` : '') +
        `Identifier: \`${ident}\`\n` +
        (paper.primary_url ? `URL: ${paper.primary_url}\n` : '') +
        (paper.retracted ? `\n⚠ This paper is marked as RETRACTED. Surface that to me before discussing findings.\n` : '') +
        `\nFetch the full text via the \`paper_fetch_full_text\` tool first if you need more than the abstract, then walk me through it.`;

      // Switch to Teach mode and persist. The model/mode-change effect
      // below will push the new mode to the sidecar on the next render.
      setMode('teach');
      try { localStorage.setItem('ava-ide-chat-mode', 'teach'); } catch { /* */ }
      // Surface the user-side message in the chat history immediately
      // so the operator sees the request landed. Then send through the
      // sidecar — Ava's reply streams in as normal.
      setMessages(prev => [...prev, { id: mkId(), role: 'user' as const, text: primer, timestamp: Date.now() }]);
      setStreaming(true);
      // Small delay so the mode change commits to the sidecar before the
      // message hits — same pattern the desktop-mode `@@` switcher uses.
      window.setTimeout(() => {
        getSidecar().sendMessage(primer).catch(() => { setStreaming(false); });
      }, 200);
    };
    window.addEventListener('ava-read-paper-with-ava', handler as EventListener);
    return () => window.removeEventListener('ava-read-paper-with-ava', handler as EventListener);
  }, []);

  // ── Send model/mode changes to running sidecar (no restart) ────────────
  // Initialised to null so the first effect pass after mount is treated
  // as a transition. That matters because `mode` may be hydrated from
  // localStorage as 'desktop' on startup — without the null sentinel,
  // the effect would see mode === prevModeRef and skip, leaving the
  // kill-switch silently disarmed for an entire session.
  const prevModelRef = useRef<string | null>(null);
  const prevModeRef = useRef<AvaMode | null>(null);
  useEffect(() => {
    if (!sidecarReady) return;
    const sidecar = getSidecar();
    if (model !== prevModelRef.current) {
      prevModelRef.current = model;
      // Same orchestrated-id passthrough as init: 'auto' / 'supernova' /
      // 'aurora' must not get a provider prefix or the sidecar's
      // AutoCoordinator handler misses them.
      sidecar.setModel(
        SIDECAR_MODEL_MAP[model] || (model === 'auto' || model === 'supernova' || model === 'aurora' ? model : `platform:${model}`),
      ).catch(() => {});
    }
    if (mode !== prevModeRef.current) {
      const previousMode = prevModeRef.current;
      prevModeRef.current = mode;
      sidecar.setMode(mode).catch(() => {});
      // Arm / disarm the Ctrl+Alt+K panic hotkey when entering or
      // leaving desktop mode. The Rust side only fires the global
      // shortcut when DESKTOP_MODE_ACTIVE is true.
      if (mode === 'desktop' && previousMode !== 'desktop') {
        invoke('desktop_mode_start').catch(() => {});
        // Push the operator's saved permission level on entry so the
        // sidecar's sharedState matches the IDE's saved choice instead
        // of falling back to whatever was set at sidecar init.
        sidecar.setDesktopPermissionLevel(desktopPermLevel).catch(() => {});
        // Capability check — if the active coordinator isn't on the
        // desktop-capable list, warn before the operator fires off a
        // click on a model that drops tool-call args under load.
        if (!isDesktopCapable(model)) {
          setDesktopModelWarn({ currentName: activeModelName || model });
        }
      } else if (previousMode === 'desktop' && mode !== 'desktop') {
        invoke('desktop_mode_stop').catch(() => {});
      }
    }
  }, [model, mode, sidecarReady, desktopPermLevel]);

  // Permission-level sync — handled inside the useDesktopPermLevel hook
  // (localStorage + window event + sidecar push). The on-entry push above
  // covers the case where the operator changed the level while not in
  // desktop mode and then switched in.

  // ── Desktop kill-switch listener ──────────────────────────────────────
  // Ctrl+Alt+K global hotkey, tray "Stop Desktop Mode", or manual
  // desktop_kill all emit this event from Rust. We cancel the active
  // agent run, dismiss any pending approval, and flip the chat out of
  // desktop mode so the hotkey disarms cleanly.
  useEffect(() => {
    if (!sidecarReady) return;
    let unlisten: UnlistenFn | undefined;
    listen<{ level: 'pause' | 'stop' | 'panic' }>('desktop:kill', (event) => {
      const level = event.payload?.level ?? 'stop';
      const sidecar = getSidecar();
      sidecar.cancel().catch(() => {});
      if (level === 'panic') {
        // Hardest stop — also wipe any in-flight approval so the UI
        // doesn't hang waiting for the user to click something that no
        // longer exists.
        setPendingConfirm(null);
        setPendingSecretGrant(null);
      }
      setMode('work');
    }).then((fn) => { unlisten = fn; }).catch(() => {});
    return () => { if (unlisten) unlisten(); };
  }, [sidecarReady]);

  // ── Sidecar event handler (for local mode streaming) ──────────────────
  const handleSidecarEvent = useCallback((event: SidecarEvent) => {
    switch (event.event) {
      case 'stream_start':
        setStatusText('');
        usageEventFiredThisTurn.current = false;
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

      case 'progress': {
        // Coordinator prep/routing status during the silent classify + intent
        // gate + route window (worst in the orchestration modes) — fills the
        // gap before stream_start with a real, localized line.
        const e = event as any;
        setStatusText(t(e.labelKey, e.model ? { model: e.model } : undefined));
        break;
      }
      case 'auto_routing':
        setStatusText(t('dash.chat.status.selecting_model'));
        break;

      case 'auto_agent_start':
        setStatusText(t('dash.chat.status.spinning_agent'));
        break;

      case 'auto_agent_end':
        setStatusText('');
        break;

      case 'execution_start': {
        const total = (event as any).total ?? 0;
        setStatusText(`Builder dispatched — ${total} task${total === 1 ? '' : 's'}`);
        setMessages(prev => [...prev, {
          id: mkId(),
          role: 'system' as const,
          text: `Builder dispatched — executing ${total} task${total === 1 ? '' : 's'}.`,
          timestamp: Date.now(),
        }]);
        break;
      }

      case 'task_start': {
        const ev = event as any;
        const idx = (ev.index ?? 0) + 1;
        const total = ev.total ?? 0;
        setStatusText(`Task ${idx}/${total}: ${ev.title}`);
        setMessages(prev => [...prev, {
          id: mkId(),
          role: 'system' as const,
          text: `▶ Task ${idx}/${total}: ${ev.title}`,
          timestamp: Date.now(),
        }]);
        // Update the React session task list to reflect in-progress state
        setSessionTasks(prev => prev.map(t =>
          t.title === ev.title ? { ...t, status: 'in_progress' } : t
        ));
        break;
      }

      case 'task_complete': {
        const ev = event as any;
        setMessages(prev => [...prev, {
          id: mkId(),
          role: 'system' as const,
          text: `✓ ${ev.title}${ev.summary ? ` — ${ev.summary}` : ''}`,
          timestamp: Date.now(),
        }]);
        setSessionTasks(prev => prev.map(t =>
          t.title === ev.title ? { ...t, status: 'completed' } : t
        ));
        break;
      }

      case 'task_blocked': {
        const ev = event as any;
        setMessages(prev => [...prev, {
          id: mkId(),
          role: 'system' as const,
          text: `⛔ ${ev.title} blocked: ${ev.reason}`,
          timestamp: Date.now(),
        }]);
        break;
      }

      case 'task_failed': {
        const ev = event as any;
        setMessages(prev => [...prev, {
          id: mkId(),
          role: 'system' as const,
          text: `⛔ ${ev.title} failed: ${ev.error}`,
          timestamp: Date.now(),
        }]);
        break;
      }

      case 'execution_complete': {
        const ev = event as any;
        const headline = ev.blocked > 0
          ? `Builder finished: ${ev.completed}/${ev.total} done, ${ev.blocked} blocked.`
          : `Builder finished: all ${ev.completed} tasks done.`;
        setStatusText('');
        setMessages(prev => [...prev, {
          id: mkId(),
          role: 'system' as const,
          text: headline,
          timestamp: Date.now(),
        }]);
        break;
      }

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
          desktopClassification: event.desktopClassification,
        });
        break;

      case 'secret_grant_request':
        setPendingSecretGrant({
          grantId: event.grantId || '',
          label: event.label || 'secret',
          reason: event.reason || '',
        });
        setSecretGrantInput('');
        break;

      case 'usage':
        if (event.usage) {
          // Convert raw token usage to credits per turn so the session
          // counter speaks the same unit as the platform billing UI.
          // creditsForTurn applies bracket scaling + per-model multipliers
          // identical to the server-side metering, so the local count is a
          // faithful estimate of what the turn would actually charge.
          const { credits } = creditsForTurn('chat_turn', {
            inputTokens: event.usage.prompt_tokens || 0,
            outputTokens: event.usage.completion_tokens || 0,
            model,
          });
          setTokenCount((prev) => prev + credits);
          // Optimistic balance bump — the platform's chat route runs
          // increment_credits inside Vercel's after() so it commits
          // strictly after the response closes. The post-`done`
          // /account-info refetch races that commit and usually wins,
          // returning the pre-charge value. Bumping the displayed used
          // here keeps the bar moving in sync with the turn; fetchBalance
          // reconciles via max() once the server catches up.
          setCreditBalance((prev) => prev ? { ...prev, used: prev.used + credits } : prev);
          trackTokenUsage(event.usage, model);
          usageEventFiredThisTurn.current = true;
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

        // Fallback per-session token estimate when no 'usage' event fired
        // this turn (provider didn't include usage in stream chunks). A
        // crude 4-chars-per-token approximation keeps the session counter
        // moving so the user has *some* signal. Real billing is server-side
        // via /account-info — this is purely the local session display.
        if (!usageEventFiredThisTurn.current) {
          const last = (event.content as string) || '';
          if (last) {
            const estOutput = Math.max(1, Math.ceil(last.length / 4));
            const { credits } = creditsForTurn('chat_turn', {
              inputTokens: 0,
              outputTokens: estOutput,
              model,
            });
            setTokenCount((prev) => prev + credits);
            // Same optimistic bump as the 'usage' branch — covers
            // providers that don't emit a usage chunk so the balance
            // bar still moves on every turn.
            setCreditBalance((prev) => prev ? { ...prev, used: prev.used + credits } : prev);
          }
        }

        // Refresh server-side usage / balance views (Usage page, account
        // balance bar, etc). useApiData hooks listen for this event and
        // refetch their endpoints — without this they only fetch on mount
        // and the dashboard shows a frozen snapshot of usage.
        window.dispatchEvent(new CustomEvent('ava-usage-refresh'));
        // Second pulse a few seconds later so the authoritative server
        // value lands once Vercel's after() has finished committing
        // increment_credits. Without this, the optimistic bar stays at
        // its predicted value indefinitely if the user doesn't navigate
        // away — fetchBalance's max() reconciliation needs a fresh
        // server read to converge.
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('ava-usage-refresh'));
        }, 2500);

        // Mode transition: if switch_mode was approved, start new run in target mode
        if (pendingModeTransitionRef.current) {
          const { targetMode, context } = pendingModeTransitionRef.current;
          pendingModeTransitionRef.current = null;
          setTimeout(() => {
            const transitionMsg = `[Continuing from previous mode]\n\n${context}\n\nProceed with the above in ${targetMode} mode.`;
            // Inject as a new user message and send via sidecar
            const modeMap: Record<string, (text: string) => string> = {
              work: (t: string) => t,
              plan: (t: string) => `[Plan Mode] ${t}`,
              chat: (t: string) => `[Chat Mode] ${t}`,
              teach: (t: string) => `[Teach Mode] ${t}`,
              security: (t: string) => `[Security Audit Mode] ${t}`,
              brainstorm: (t: string) => `[Brainstorm Mode] ${t}`,
            };
            const prefixed = (modeMap[targetMode] || modeMap.work)(transitionMsg);
            setMessages(prev => [...prev, { id: mkId(), role: 'user' as const, text: `Switching to ${targetMode} mode...`, timestamp: Date.now() }]);
            setStreaming(true);
            getSidecar().sendMessage(prefixed);
          }, 300);
        }
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

      case 'backup_ready':
      case 'readable_ready':
      case 'backup_imported':
        // Forward to the Sync page, which owns the Tauri save dialog + result.
        window.dispatchEvent(new CustomEvent('ava-backup-event', { detail: event }));
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
      { id: mkId(), role: 'ava', text: buildIdeWelcome(), timestamp: Date.now() },
    ]);
    setConversationTitle(t('dash.chat.new_chat'));
    setCurrentConvId(null);
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

  // togglePack removed with knowledge-pack feature in v0.59.2.

  // ── Cancel streaming ──────────────────────────────────────────────────────
  // Soft interrupt — tap to get Ava's attention
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
        // Same Data Mode resolution as the primary start() site above —
        // kept inline here rather than lifted so the hard-stop fallback
        // doesn't depend on closure state from outside this callback.
        const fallbackSyncPrefs = (() => {
          try { return JSON.parse(localStorage.getItem('ava-ide-sync-prefs') || '{}') as Record<string, boolean>; }
          catch { return {}; }
        })();
        const fallbackCloudAllowed = cloudSyncEnabled();
        sidecar.start({
          providers: {},
          platformKey: getPlatformKey() || undefined,
          activeModel: `platform:${model}`,
          cwd: localStorage.getItem('ava-ide-project-folder') || '.',
          mode,
          permissionMode: (localStorage.getItem('ava-ide-settings') ? JSON.parse(localStorage.getItem('ava-ide-settings')!).permissionMode : 'balanced') || 'balanced',
          autoMemory: true,
          _devPlatformFallback: true,
          generationLocalOnly: fallbackSyncPrefs.generations === false || !fallbackCloudAllowed,
          learningLocalOnly: fallbackSyncPrefs.learning === false || !fallbackCloudAllowed,
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
    // Hide the internal <changes-summary> completion-contract block — the
    // coordinator parses it from the stored message for verification, so it
    // stays in the message, but it's never meant for display. Matches a
    // complete block or an unterminated one (mid-stream).
    text = text.replace(/\s*<changes-summary>[\s\S]*?(?:<\/changes-summary>|$)/i, '');
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
          const { credits } = creditsForTurn('chat_turn', {
            inputTokens: json.usage.prompt_tokens || 0,
            outputTokens: json.usage.completion_tokens || 0,
            model,
          });
          setTokenCount((prev) => prev + credits);
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
                  const { credits } = creditsForTurn('chat_turn', {
                    inputTokens: json.usage.prompt_tokens || 0,
                    outputTokens: json.usage.completion_tokens || 0,
                    model,
                  });
                  sessionTokens += credits;
                  setTokenCount(sessionTokens);
                  trackTokenUsage(json.usage, model);
                  if (json.usage.prompt_tokens && json.usage.completion_tokens) {
                    const total = json.usage.prompt_tokens + json.usage.completion_tokens;
                    // Use model's actual context window for percentage
                    const MODEL_CTX: Record<string, number> = {
                      'qwen3.6-plus': 1048576, 'kimi-k2.6': 262144, 'kimi-k2.5': 262144,
                      'MiniMax-M3': 1048576, 'MiniMax-M2.7': 204800, 'MiniMax-M2.7-highspeed': 204800,
                      'qwen3.5-omni-flash': 262144, 'qwen3.5-omni-plus': 262144, 'qwen3.5-plus': 1048576,
                      'qwen3.5-flash': 262144, 'deepseek-chat': 131072, 'deepseek-reasoner': 131072,
                      'claude-opus-4-7': 200000, 'claude-opus-4-6': 200000, 'claude-sonnet-4-6': 200000,
                      'claude-haiku-4-5-20251001': 200000, 'glm-5': 200000,
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

    // Desktop Automation mode: `@@` prefix switches the chat to desktop mode
    // so Ava uses the sidecar's agent loop with the restricted desktop tool
    // set. If there's task text after @@, it becomes the first message of
    // this turn. The setMode call persists desktop mode for subsequent
    // messages; the `forceDesktopPrefixThisTurn` flag below makes sure THIS
    // turn's message carries the desktop tag even though React state hasn't
    // committed yet. Prefer this over the old overlay — the sidecar's
    // single-call loop is 5-10× faster than the persona wave.
    let forceDesktopPrefixThisTurn = false;
    let effectiveTrimmed = trimmed;
    if (trimmed.startsWith('@@')) {
      const preset = trimmed.slice(2).trim();
      setMode('desktop');
      localStorage.setItem('ava-ide-chat-mode', 'desktop');
      if (!preset) {
        // Bare `@@` — just switch mode, don't send anything this turn.
        setInput('');
        return;
      }
      effectiveTrimmed = preset;
      forceDesktopPrefixThisTurn = true;
    }

    setInput('');
    if (textareaRef.current) { textareaRef.current.style.height = 'auto'; }

    // Inject secrets — replace @secret:Label with actual values before sending
    const { text: injectedText, usedSecrets } = injectSecrets(effectiveTrimmed);

    // Show the raw user text (with @secret:Label visible as masked) in the chat UI
    // Replace @secret:Label with masked dots for display
    const displayText = effectiveTrimmed.replace(/@secret:(\S+)/g, (_m, label) => {
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

    // Resolve the mode prefix tag for THIS turn. Needed because the agent
    // detects mode via detectModeFromMessages() on the user message prefix.
    // When the @@ shortcut is used, `setMode('desktop')` hasn't committed
    // yet — force the desktop tag so the first turn lands in desktop mode.
    let outgoingText = injectedText;
    const effectiveMode: AvaMode = forceDesktopPrefixThisTurn ? 'desktop' : mode;
    const effectiveModeInfo = MODES.find(m => m.id === effectiveMode);
    if (effectiveModeInfo?.prefix) {
      outgoingText = effectiveModeInfo.prefix + injectedText;
    }

    // Always use sidecar — both Local and Cloud modes run the full agent
    // Send the prefixed, secret-injected text to the sidecar
    sendLocal(outgoingText, userMsg.attachments);
  }, [input, messages, sendLocal, pendingAttachments, model, injectSecrets, secrets, mode]);

  // ── Command palette — fire a pre-classified intent ──────────────────────
  // Click and Enter both land here. Clear the textarea (in case it held a
  // `/query` filter), close the palette, then dispatch the confirmed intent.
  // Mode prefix mirrors send().
  const handlePaletteAction = useCallback((tool: PaletteTool, action: string) => {
    if (streaming) return;
    const built = buildPaletteDirective(tool, action);
    if (!built) return;
    setInput('');
    setShowPalette(false);
    setPaletteActiveIndex(0);
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    const userMsg: ChatMessage = { id: mkId(), role: 'user', text: built.label, timestamp: Date.now() };
    setMessages((prev) => [...prev, userMsg]);
    trackMessage(model);
    const modeInfo = MODES.find((m) => m.id === mode);
    const outgoing = modeInfo?.prefix ? modeInfo.prefix + built.directive : built.directive;
    sendLocal(outgoing);
  }, [streaming, mode, model, sendLocal]);

  // ── Tool confirmation handlers ─────────────────────────────────────────
  // Pending mode transition — scheduled by switch_mode tool approval
  const pendingModeTransitionRef = useRef<{ targetMode: string; context: string } | null>(null);

  const approveConfirm = useCallback(async () => {
    if (!pendingConfirm) return;
    const sidecar = getSidecar();
    const isInteractive = pendingConfirm.toolName === 'ask_user' || pendingConfirm.toolName === 'present_plan' || pendingConfirm.toolName === 'switch_mode';
    if (isInteractive && confirmInput.trim()) {
      await sidecar.confirm(pendingConfirm.id, true, confirmInput.trim());
    } else {
      await sidecar.confirm(pendingConfirm.id, true);
    }
    // Schedule mode transition if this was switch_mode
    if (pendingConfirm.toolName === 'switch_mode' && pendingConfirm.args) {
      const args = pendingConfirm.args as Record<string, unknown>;
      const additions = confirmInput.trim() ? ` Additional context: ${confirmInput.trim()}` : '';
      pendingModeTransitionRef.current = {
        targetMode: (args.target_mode as string) || 'work',
        context: ((args.context_summary as string) || '') + additions,
      };
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
    if (model === 'aurora') return '✦ Aurora';
    if (model === 'supernova') return '✦ Supernova';
    if (model === 'auto') return '✦ Maestro';
    if (model === 'qwen3.6-plus') return 'Qwen 3.6 Plus';
    if (model === 'qwen3.5-plus') return 'Qwen 3.5 Plus';
    if (model === 'qwen3.5-omni-plus') return 'Qwen 3.5 Omni Plus';
    if (model === 'qwen3.5-omni-flash') return 'Qwen 3.5 Omni Flash';
    if (model === 'qwen3.5-flash') return 'Qwen 3.5 Flash';
    // Legacy display-name fallbacks for clients that still have old IDs saved
    if (model === 'qwen3-omni-flash') return 'Qwen 3.5 Omni Flash';
    if (model === 'qwen-flash') return 'Qwen 3.5 Flash';
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
                {/* Orchestrated section — Supernova (polyglot ensemble) on top,
                    Maestro (single conductor) below. Both highlighted as
                    Ava-orchestrated modes vs raw model picks. Supernova is
                    admin-gated at preview while the DeepSeek partnership
                    finalises — non-admin users see "In development" with a
                    disabled button. Mirrors the extension's ModelSelector. */}
                <div style={{ fontSize: 10, fontWeight: 600, color: '#6c7086', padding: '6px 10px 4px', textTransform: 'uppercase', letterSpacing: 0.8 }}>
                  Orchestrated
                </div>
                {(() => {
                  // Mode list now sourced from useModeAvailability —
                  // a plan path lights up Maestro for everyone and
                  // Aurora/Supernova for admins; a BYOK path lights
                  // them up the moment the right keys are present
                  // (Maestro=Qwen, Supernova=DeepSeek+Qwen, Aurora=Mistral).
                  const orchestrated = [
                    { id: 'aurora',    modeId: 'aurora'    as const, label: '✦ Aurora',    enabled: modeAvailability.aurora,    title: 'Aurora — Mistral-only three-tier EU stack. Large 3 coordinator + heavy specialists, Medium 3.5 for Builder + mid-tier + vision + long-form, Small 4 at the intent gate. Stays inside European infrastructure.' },
                    { id: 'supernova', modeId: 'supernova' as const, label: '✦ Supernova', enabled: modeAvailability.supernova, title: 'Supernova — DeepSeek V4 Pro coordinator + V4 Flash specialists with Qwen builders. Heavy multi-step work.' },
                    { id: 'auto',      modeId: 'maestro'   as const, label: '✦ Maestro',   enabled: modeAvailability.maestro,   title: 'Maestro — single Qwen 3.6 Plus conductor. Daily work, predictable cost.' },
                  ].map(o => ({ ...o, subtitle: modeSubtitle(o.modeId, modeAvailability, modeState) }));
                  return orchestrated.map((o) => {
                    const active = model === o.id;
                    return (
                      <button
                        key={o.id}
                        disabled={!o.enabled}
                        onClick={() => { if (!o.enabled) return; setModel(o.id); setModelMenuOpen(false); }}
                        title={o.enabled ? o.title : `${o.label.replace('✦ ', '')} — ${o.subtitle}`}
                        style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%',
                          padding: '8px 10px', background: o.enabled && active ? 'rgba(168,85,247,0.15)' : 'transparent',
                          border: 'none', borderRadius: 6,
                          color: !o.enabled ? '#6c7086' : active ? '#e0b0ff' : '#cdd6f4',
                          fontSize: 12, cursor: o.enabled ? 'pointer' : 'default', textAlign: 'left',
                          opacity: o.enabled ? 1 : 0.55,
                        }}
                        onMouseEnter={(e) => { if (o.enabled && !active) e.currentTarget.style.background = 'rgba(168,85,247,0.08)'; }}
                        onMouseLeave={(e) => { if (o.enabled && !active) e.currentTarget.style.background = 'transparent'; }}
                      >
                        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {o.enabled && active && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#a855f7' }} />}
                          {o.label}
                        </span>
                        <span style={{ fontSize: 10, color: o.enabled ? '#a855f7' : '#facc15' }}>{o.subtitle}</span>
                      </button>
                    );
                  });
                })()}
                {/* Raw individual models (Qwen, MiniMax, etc.) are no
                    longer surfaced here for plan users — plans = the 3
                    modes only. The BYOK section below shows raw models
                    per the user's own keys; that's the only path to
                    direct model selection now. Decision 2026-04-29 —
                    see project_byok_mode_gating memory. */}

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

          {/* Knowledge packs dropdown removed in v0.59.2 — see DashboardPages.tsx history. */}

          {/* Conversation title */}
          <span style={{ fontSize: 12, color: '#6c7086', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {conversationTitle}
          </span>
        </div>

        {/* Right: cloud-sync toggle + tokens + new chat */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* Local sidecar status — read-only. Shown only when the chat
              backend is the local sidecar (set in Settings), so the
              operator can see at a glance whether the local model is
              ready. Not a control — the Cloud sync toggle beside it is. */}
          {chatBackend === 'local' && (
            <span
              title={`Local model — ${sidecarStatus}`}
              style={{
                display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px',
                background: 'rgba(166,227,161,0.1)',
                border: '1px solid rgba(166,227,161,0.3)',
                borderRadius: 6, fontSize: 10, fontWeight: 600, color: '#a6e3a1',
              }}
            >
              <span style={{
                width: 6, height: 6, borderRadius: '50%',
                background: sidecarStatus === 'ready' ? '#a6e3a1'
                  : sidecarStatus === 'starting' ? '#eab308'
                  : sidecarStatus === 'error' ? '#ef4444' : '#6c7086',
                ...(sidecarStatus === 'starting' ? { animation: 'avaPulse 1.5s infinite' } : {}),
              }} />
              {sidecarStatus === 'ready' ? 'Local model'
                : sidecarStatus === 'starting' ? 'Starting…'
                : sidecarStatus === 'error' ? 'Model error' : 'Local model off'}
            </span>
          )}
          {/* Cloud-sync toggle removed — Ava is local-first; nothing syncs
              to the cloud (storage sunsets 1 Jul 2026). */}

          {/* Credit display — platform balance when signed in, or local
              session credit estimate (computed via creditsForTurn so the unit
              matches platform billing) when running standalone. */}
          {creditBalance && connected ? (() => {
            const isAdmin = creditBalance.limit >= 999_999_999;
            if (isAdmin) return (
              <span style={{ fontSize: 11, color: '#6c7086', fontFamily: 'monospace', opacity: 0.5 }} title={`Unlimited credits — ${tokenCount.toLocaleString()} used this session`}>
                ∞ {tokenCount > 0 ? `· ${tokenCount.toLocaleString()} session` : 'credits'}
              </span>
            );
            const remaining = Math.max(0, creditBalance.limit - creditBalance.used);
            const pct = creditBalance.limit > 0 ? (creditBalance.used / creditBalance.limit) * 100 : 0;
            const color = pct >= 95 ? '#ef4444' : pct >= 80 ? '#eab308' : '#a6e3a1';
            return (
              <span style={{ fontSize: 11, fontFamily: 'monospace', fontWeight: 600, color }} title={`${remaining.toLocaleString()} of ${creditBalance.limit.toLocaleString()} credits remaining (${Math.round(pct)}% used)`}>
                {remaining.toLocaleString()} left
              </span>
            );
          })() : (
            <span style={{ fontSize: 11, color: '#6c7086', fontFamily: 'monospace' }} title={`${tokenCount.toLocaleString()} credits used this session`}>
              {tokenCount > 0 ? `${tokenCount.toLocaleString()} credits` : '0 credits'}
            </span>
          )}

          {/* Context usage indicator moved to the top of the chat area
              as a horizontal ContextBar (mirroring the VSCode extension's
              v0.39.0 UX). The old circular ring lived here and is gone. */}

          {/* Tasks toggle removed — the always-visible Tasks spine on the right
              edge is the single control now (its grip expands/collapses). */}

          {/* New Chat button */}
          <Tooltip content={t('dash.chat.new_chat')} placement="bottom">
          <button
            onClick={newChat}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px',
              background: 'rgba(168,85,247,0.1)', border: '1px solid rgba(168,85,247,0.25)',
              borderRadius: 8, color: '#a855f7', fontSize: 11, fontWeight: 600, cursor: 'pointer',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(168,85,247,0.2)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(168,85,247,0.1)'; }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            {t('dash.chat.new_chat')}
          </button>
          </Tooltip>
        </div>
      </div>

      {/* ── Credit usage bar ───────────────────────────────────────────── */}
      {creditBalance && connected && creditBalance.limit > 0 && creditBalance.limit < 999_999_999 && (() => {
        const remaining = Math.max(0, creditBalance.limit - creditBalance.used);
        const pct = Math.max(0, Math.min(100, (remaining / creditBalance.limit) * 100));
        const color = pct <= 5 ? '#ef4444' : pct <= 20 ? '#eab308' : '#a855f7';
        return (
          <div style={{ padding: '0 16px 6px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ flex: 1, height: 4, borderRadius: 4, overflow: 'hidden', background: 'rgba(168,85,247,0.08)' }}>
                <div style={{ width: `${pct}%`, height: '100%', borderRadius: 4, background: color, transition: 'width 0.5s' }} />
              </div>
              <span style={{ fontSize: 9, fontFamily: 'monospace', color, opacity: pct <= 20 ? 0.9 : 0.4, flexShrink: 0 }}>
                {remaining.toLocaleString()} left
              </span>
            </div>
          </div>
        );
      })()}

      {/* First-load takeover — full-area spinner replaces the previous
          thin banner, which was too easy to miss. The chat surface
          stays empty-looking until data arrives; the spinner makes
          it obvious that something's happening. Drops in one sweep
          when both fetches resolve. */}
      {dataLoading && (
        <div
          role="status"
          aria-live="polite"
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
            color: '#cdd6f4',
          }}
        >
          <div
            style={{
              width: 36, height: 36, borderRadius: '50%',
              border: '2.5px solid rgba(168, 85, 247, 0.18)',
              borderTopColor: '#a855f7',
              animation: 'avaSpin 0.9s linear infinite',
            }}
          />
          <div style={{ fontSize: 12, color: '#a6adc8' }}>
            {accountLoading && historyLoading
              ? 'Loading your account and chat history…'
              : accountLoading
                ? 'Loading your account…'
                : 'Loading your chat history…'}
          </div>
          <style>{`
            @keyframes avaSpin { to { transform: rotate(360deg); } }
          `}</style>
        </div>
      )}

      {/* ── Context Bar (top of chat) ───────────────────────────────────
           Mirrors the v0.39.0 extension UX — horizontal token-usage bar
           always visible above the messages area. Escalates colour at
           80/90%. Auto-compression triggers at 70% at the agent layer
           (no manual trigger yet in the IDE — would need a sidecar
           `compress` RPC method added). */}
      <ContextBar contextPercent={contextPercent} isCompressing={statusText.toLowerCase().includes('compress')} />

      {/* ── Messages Area (flex-1, scrollable) ────────────────────────────
           Hidden while dataLoading so the spinner above takes the full
           area instead of competing with an empty messages list for
           flex space. Flips back the moment data resolves. */}
      <div style={{
        flex: dataLoading ? 0 : 1,
        display: dataLoading ? 'none' : 'flex',
        overflowY: 'auto', padding: '20px 24px',
        flexDirection: 'column', gap: 4,
      }}>
        {/* Empty-state helper — six starter chips covering each mode,
            shown until the user sends their first message. Click prefills
            the input rather than auto-sending so the user can edit
            before firing. Per-mode colour tokens, gradient bg, animated
            entrance — aim is "warm partner" not "onboarding tooltip". */}
        {!messages.some(m => m.role === 'user') && !streaming && !dataLoading && (
          <div
            className="ava-ide-starter-card"
            style={{
              borderRadius: 16,
              padding: 18,
              margin: '4px 0 16px',
              background: 'linear-gradient(135deg, rgba(168, 85, 247, 0.10) 0%, rgba(96, 165, 250, 0.05) 100%)',
              border: '1px solid rgba(168, 85, 247, 0.25)',
              boxShadow: '0 4px 24px rgba(168, 85, 247, 0.10)',
            }}
          >
            <style>{`
              .ava-ide-starter-card { animation: avaIdeStarterFade 0.4s ease-out; }
              @keyframes avaIdeStarterFade {
                from { opacity: 0; transform: translateY(8px); }
                to   { opacity: 1; transform: translateY(0); }
              }
            `}</style>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{ color: '#a855f7', fontSize: 14 }}>✦</span>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#cdd6f4' }}>Where do we start?</div>
            </div>
            <p style={{ fontSize: 12, color: '#a6adc8', lineHeight: 1.5, margin: '0 0 14px' }}>
              I can read your code, plan a feature, teach you something, audit security, brainstorm, or just chat.
              Pick one — you can edit before sending.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {[
                { label: 'Explain a file',  prefix: '>>', prompt: 'Explain what this file does: ',           color: '#a855f7' },
                { label: 'Plan a feature',  prefix: '::', prompt: ':: How should I approach adding ',         color: '#60a5fa' },
                { label: 'Teach me',        prefix: '??', prompt: '?? Teach me about ',                       color: '#f9e2af' },
                { label: 'Audit security',  prefix: '!!', prompt: '!! Audit this project for security issues', color: '#f38ba8' },
                { label: 'Brainstorm',      prefix: '**', prompt: '** Help me think through ',                color: '#94e2d5' },
                { label: 'Just chat',       prefix: '..', prompt: '.. ',                                      color: '#a6adc8' },
              ].map(c => (
                <button
                  key={c.label}
                  onClick={() => {
                    setInput(c.prompt);
                    requestAnimationFrame(() => {
                      const el = textareaRef.current;
                      if (el) {
                        el.focus();
                        el.selectionStart = el.selectionEnd = el.value.length;
                      }
                    });
                  }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    fontSize: 12,
                    padding: '6px 12px',
                    background: 'rgba(26, 16, 40, 0.5)',
                    border: `1px solid ${c.color}33`,
                    borderRadius: 8,
                    color: '#cdd6f4',
                    cursor: 'pointer',
                    transition: 'transform 0.12s ease, background 0.15s, border-color 0.15s',
                  }}
                  onMouseEnter={e => {
                    const el = e.currentTarget as HTMLButtonElement;
                    el.style.background = `${c.color}1c`;
                    el.style.borderColor = `${c.color}66`;
                    el.style.transform = 'translateY(-1px)';
                  }}
                  onMouseLeave={e => {
                    const el = e.currentTarget as HTMLButtonElement;
                    el.style.background = 'rgba(26, 16, 40, 0.5)';
                    el.style.borderColor = `${c.color}33`;
                    el.style.transform = 'translateY(0)';
                  }}
                >
                  <span style={{ color: c.color, fontFamily: 'monospace', fontSize: 10, fontWeight: 700 }}>{c.prefix}</span>
                  <span>{c.label}</span>
                </button>
              ))}
            </div>
            <p style={{ fontSize: 10, color: '#6c7086', marginTop: 14, marginBottom: 0 }}>
              Tip: type <code style={{ color: '#a855f7' }}>{'>>'}</code> <code style={{ color: '#60a5fa' }}>::</code> <code style={{ color: '#a6adc8' }}>..</code> <code style={{ color: '#f9e2af' }}>??</code> <code style={{ color: '#f38ba8' }}>!!</code> <code style={{ color: '#94e2d5' }}>**</code> to switch modes any time.
            </p>
          </div>
        )}

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

              <div style={{ maxWidth: '85%', position: 'relative' }}>
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
                    <span style={{ display: 'inline-flex', alignItems: 'center', color: '#a6adc8' }} title={t('dash.chat.secret_used')}><PhLock size={12} weight="duotone" /></span>
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

                  {/* Tool calls timeline — uses tool-header helper to render
                      readable labels ("Edit foo.tsx" instead of "file_edit")
                      matching the VSCode extension's v0.39.0 UX. */}
                  {msg.toolCalls && msg.toolCalls.length > 0 && (
                    <div style={{ marginTop: 10, borderTop: '1px solid rgba(168, 85, 247, 0.12)', paddingTop: 8 }}>
                      {msg.toolCalls.map((tc, idx) => {
                        const header = getToolHeader(tc.name, tc.args);
                        return (
                          <div key={idx} style={{
                            display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0',
                            fontSize: 11, color: '#6c7086',
                          }}>
                            <span style={{
                              width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                              background: tc.status === 'running' ? '#eab308' : tc.status === 'done' ? '#a6e3a1' : '#ef4444',
                              ...(tc.status === 'running' ? { animation: 'avaPulse 1.5s infinite' } : {}),
                            }} />
                            <span style={{ fontWeight: 600, fontSize: 11, color: '#cdd6f4' }}>{header.verb}</span>
                            {header.target && (
                              <span style={{ fontFamily: 'monospace', fontSize: 11, opacity: 0.7 }}>{header.target}</span>
                            )}
                            <span style={{ fontSize: 10, color: '#45475a', marginLeft: 'auto' }}>
                              {tc.status === 'running' ? t('dash.chat.tool_running') : tc.status === 'done' ? t('dash.chat.tool_done') : t('dash.chat.tool_error')}
                            </span>
                          </div>
                        );
                      })}
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

      {/* ── Secret Grant — inline banner above input ────────────────────── */}
      {pendingSecretGrant && (
        <div style={{
          margin: '0 16px', padding: '14px 18px',
          background: 'rgba(10, 20, 40, 0.7)',
          border: '1px solid rgba(59, 130, 246, 0.45)', borderRadius: 10,
          borderBottom: 'none', borderBottomLeftRadius: 0, borderBottomRightRadius: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#cdd6f4' }}>
              Ava is asking for a secret: <span style={{ color: '#60a5fa', fontFamily: 'monospace' }}>{pendingSecretGrant.label}</span>
            </div>
          </div>
          {pendingSecretGrant.reason && (
            <div style={{ fontSize: 11, color: '#9399b2', marginBottom: 10, paddingLeft: 24 }}>
              {pendingSecretGrant.reason}
            </div>
          )}
          <div style={{ paddingLeft: 24 }}>
            <input
              type="password"
              value={secretGrantInput}
              onChange={(e) => setSecretGrantInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && secretGrantInput.trim() && pendingSecretGrant) {
                  void getSidecar().respondToSecretGrant(pendingSecretGrant.grantId, secretGrantInput);
                  setPendingSecretGrant(null);
                  setSecretGrantInput('');
                }
                if (e.key === 'Escape' && pendingSecretGrant) {
                  void getSidecar().respondToSecretGrant(pendingSecretGrant.grantId, null);
                  setPendingSecretGrant(null);
                  setSecretGrantInput('');
                }
              }}
              placeholder={`Enter your ${pendingSecretGrant.label}…`}
              autoFocus
              style={{
                width: '100%', padding: '8px 12px', marginBottom: 8,
                background: 'rgba(10, 6, 18, 0.9)',
                border: '1px solid rgba(59, 130, 246, 0.3)', borderRadius: 6,
                color: '#cdd6f4', fontSize: 12, fontFamily: 'monospace', outline: 'none',
              }}
            />
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button
                onClick={() => {
                  if (!pendingSecretGrant) return;
                  void getSidecar().respondToSecretGrant(pendingSecretGrant.grantId, null);
                  setPendingSecretGrant(null);
                  setSecretGrantInput('');
                }}
                style={{
                  padding: '5px 14px', background: 'transparent', border: '1px solid #45475a',
                  borderRadius: 6, color: '#9399b2', fontSize: 12, fontWeight: 500, cursor: 'pointer',
                }}
              >
                Deny
              </button>
              <button
                onClick={() => {
                  if (!pendingSecretGrant || !secretGrantInput.trim()) return;
                  void getSidecar().respondToSecretGrant(pendingSecretGrant.grantId, secretGrantInput);
                  setPendingSecretGrant(null);
                  setSecretGrantInput('');
                }}
                disabled={!secretGrantInput.trim()}
                style={{
                  padding: '5px 14px', background: '#3b82f6',
                  border: 'none', borderRadius: 6, color: '#fff', fontSize: 12,
                  fontWeight: 600, cursor: secretGrantInput.trim() ? 'pointer' : 'not-allowed',
                  opacity: secretGrantInput.trim() ? 1 : 0.5,
                }}
              >
                Grant
              </button>
              <div style={{ marginLeft: 'auto', fontSize: 10, color: '#6c7086' }}>
                Session-lived. Not saved. Never enters chat history.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Tool Confirmation — inline banner above input ──────────────── */}
      {pendingConfirm && (() => {
        // Per-card data derived once — cheaper than inline ternaries, and
        // puts the "what is this?" decision in one place.
        const isPlanCard = pendingConfirm.toolName === 'desktop_plan_approve';
        const planSummary = isPlanCard ? (pendingConfirm.args?.summary as string | undefined) : undefined;
        // Steps now optionally carry per-step risk classification (computed
        // server-side in desktop-plan-approve.ts via classifyPlanStep). When
        // present, render a badge per step so the operator can spot a
        // destructive verb in step 4 without reading every line.
        const planSteps = isPlanCard
          ? ((pendingConfirm.args?.steps as Array<{ description?: string; riskClass?: string; reasons?: string[] }> | undefined) || [])
          : [];
        const cls = pendingConfirm.desktopClassification;
        const isDesktopTool = !!cls;
        // Per-tool human-facing action line — simpler than a JSON dump.
        const desktopActionLine = (() => {
          const args = pendingConfirm.args || {};
          switch (pendingConfirm.toolName) {
            case 'desktop_launch_app':     return `Launch ${(args.app as string) || '?'}`;
            case 'desktop_click_by_name':  return `Click "${(args.name as string) || '?'}"`;
            case 'desktop_focus_window':   return `Focus window: ${(args.title as string) || '?'}`;
            case 'desktop_type':           return `Type: "${String(args.text || '').slice(0, 80)}"`;
            case 'desktop_key_press':      return `Press ${(args.key as string) || '?'}`;
            case 'browser_navigate':       return `Open ${(args.url as string) || '?'}`;
            case 'browser_click':          return `Click ${(args.target_text as string) || (args.selector as string) || '?'}`;
            case 'browser_type':           return `Type into field: "${String(args.text || '').slice(0, 80)}"`;
            case 'browser_close':          return 'Close the browser';
            default:                       return null;
          }
        })();
        // Risk badge colour by class — irreversible / privileged are the
        // ones the user really needs to notice.
        const riskColour = (() => {
          switch (cls?.riskClass) {
            case 'mutative-irreversible': return { bg: 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.45)', fg: '#f87171' };
            case 'privileged':            return { bg: 'rgba(239,68,68,0.18)', border: 'rgba(239,68,68,0.6)',  fg: '#ef4444' };
            case 'mutative-reversible':   return { bg: 'rgba(234,179,8,0.12)', border: 'rgba(234,179,8,0.35)', fg: '#eab308' };
            case 'navigational':          return { bg: 'rgba(168,85,247,0.12)', border: 'rgba(168,85,247,0.3)', fg: '#a855f7' };
            default:                      return { bg: 'rgba(168,85,247,0.12)', border: 'rgba(168,85,247,0.3)', fg: '#a855f7' };
          }
        })();

        return (
        <div style={{
          margin: '0 16px', padding: '14px 18px',
          background: 'rgba(26, 16, 40, 0.6)', border: `1px solid ${riskColour.border}`, borderRadius: 10,
          borderBottom: 'none', borderBottomLeftRadius: 0, borderBottomRightRadius: 0,
        }}>
          {/* Header — dot + headline + action buttons */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: isPlanCard || isDesktopTool ? 10 : 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: riskColour.fg, animation: 'avaPulse 1.5s infinite', flexShrink: 0 }} />
              <div style={{ fontSize: 13, color: '#cdd6f4', fontWeight: 600 }}>
                {isPlanCard
                  ? 'Ava wants your approval to run this plan:'
                  : desktopActionLine
                    ? `Ava wants to: ${desktopActionLine}`
                    : <>Ava wants to run <span style={{ color: '#f5c2e7', fontFamily: 'monospace', fontWeight: 600 }}>{pendingConfirm.toolName}</span></>
                }
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
              <button
                onClick={denyConfirm}
                style={{
                  padding: '5px 14px', background: 'transparent', border: '1px solid #45475a',
                  borderRadius: 6, color: '#9399b2', fontSize: 12, fontWeight: 500, cursor: 'pointer',
                }}
              >
                {t('tool.deny')}
              </button>
              <button
                onClick={approveConfirm}
                style={{
                  padding: '5px 14px', background: '#a855f7',
                  border: 'none', borderRadius: 6, color: '#fff', fontSize: 12,
                  fontWeight: 600, cursor: 'pointer',
                }}
              >
                {isPlanCard ? 'Approve plan' : t('plan.approve')}
              </button>
              {!isPlanCard && cls?.riskClass !== 'mutative-irreversible' && cls?.riskClass !== 'privileged' && (
                <button
                  onClick={approveAlwaysCategory}
                  style={{
                    padding: '5px 12px', background: 'transparent', border: '1px solid #a855f7',
                    borderRadius: 6, color: '#a855f7', fontSize: 11, fontWeight: 500, cursor: 'pointer',
                  }}
                  title="Auto-approve this tool category for the rest of the session"
                >
                  Always
                </button>
              )}
            </div>
          </div>

          {/* Plan card body — summary + numbered steps */}
          {isPlanCard && (
            <div style={{
              padding: '10px 12px', background: 'rgba(10, 6, 18, 0.6)',
              border: '1px solid rgba(168,85,247,0.18)', borderRadius: 8, marginBottom: 6,
            }}>
              {planSummary && (
                <div style={{ fontSize: 13, color: '#f5c2e7', marginBottom: 10, fontStyle: 'italic' }}>
                  "{planSummary}"
                </div>
              )}
              <ol style={{
                margin: 0, paddingLeft: 22,
                fontSize: 13, color: '#cdd6f4', lineHeight: '1.7',
              }}>
                {planSteps.map((s, i) => {
                  // Per-step badge colour mirrors the card-level riskColour
                  // map so the visual language is identical between "this
                  // whole action is risky" and "this one step in the plan
                  // is risky."
                  const stepRisk = (() => {
                    switch (s.riskClass) {
                      case 'mutative-irreversible': return { label: 'IRREVERSIBLE', bg: 'rgba(239,68,68,0.14)', fg: '#f87171', border: 'rgba(239,68,68,0.45)' };
                      case 'privileged':            return { label: 'PRIVILEGED', bg: 'rgba(239,68,68,0.20)', fg: '#ef4444', border: 'rgba(239,68,68,0.6)' };
                      case 'mutative-reversible':   return { label: 'REVERSIBLE', bg: 'rgba(168,85,247,0.10)', fg: '#a855f7', border: 'rgba(168,85,247,0.28)' };
                      default:                      return null;
                    }
                  })();
                  // Only flag the operator's eye on irreversible / privileged.
                  // Tagging every reversible step with a green "REVERSIBLE"
                  // badge would be visual noise — they're already the default.
                  const showBadge = stepRisk && (s.riskClass === 'mutative-irreversible' || s.riskClass === 'privileged');
                  const reasonHint = s.reasons && s.reasons.length > 0 ? s.reasons[0] : undefined;
                  return (
                    <li
                      key={i}
                      title={reasonHint}
                      style={{
                        marginBottom: 4,
                        // Subtle red tint on the row for irreversible / privileged
                        // so the eye lands on it even before reading the badge.
                        color: showBadge ? '#f5d0d0' : '#cdd6f4',
                      }}
                    >
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span>{s.description || '(unnamed step)'}</span>
                        {showBadge && stepRisk && (
                          <span style={{
                            padding: '1px 7px', borderRadius: 8, fontSize: 9, fontWeight: 700,
                            background: stepRisk.bg, color: stepRisk.fg, border: `1px solid ${stepRisk.border}`,
                            letterSpacing: 0.4, lineHeight: 1.4, whiteSpace: 'nowrap',
                          }}>
                            {stepRisk.label}
                          </span>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ol>
              <div style={{ fontSize: 11, color: '#6c7086', marginTop: 10, lineHeight: 1.4 }}>
                Approving this plan covers all the reversible steps above. Dangerous actions
                (Send, Pay, Delete, destructive key combos) will still ask for fresh approval
                even inside this plan.
              </div>
            </div>
          )}

          {/* Non-plan desktop tools — risk badge + classifier reasons */}
          {!isPlanCard && isDesktopTool && cls && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 4 }}>
              <span style={{
                padding: '2px 8px', borderRadius: 10, fontSize: 10, fontWeight: 600,
                background: riskColour.bg, color: riskColour.fg,
                border: `1px solid ${riskColour.border}`, textTransform: 'uppercase', letterSpacing: 0.3,
              }}>
                {cls.riskClass.replace('mutative-', '')}
              </span>
              {cls.requiresSecretHandle && (
                <span style={{
                  padding: '2px 8px', borderRadius: 10, fontSize: 10, fontWeight: 600,
                  background: 'rgba(59,130,246,0.12)', color: '#60a5fa',
                  border: '1px solid rgba(59,130,246,0.4)',
                }}>
                  SENSITIVE
                </span>
              )}
              {cls.reasons.length > 0 && (
                <span style={{ fontSize: 11, color: '#9399b2' }}>
                  {cls.reasons[0]}
                </span>
              )}
            </div>
          )}

          {/* Collapsible raw args — always available, just not front-and-centre */}
          <details style={{ marginTop: isPlanCard || isDesktopTool ? 6 : 0, marginBottom: (pendingConfirm.toolName === 'ask_user' || pendingConfirm.toolName === 'present_plan') ? 8 : 0 }}>
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
        );
      })()}

      {/* ── Input Bar (fixed at bottom) ─────────────────────────────────── */}
      <div style={{
        padding: '12px 24px 16px', borderTop: '1px solid rgba(168, 85, 247, 0.12)',
        background: 'rgba(26, 16, 40, 0.6)', flexShrink: 0,
      }}>
        <div style={{ width: '100%', position: 'relative' }}>
          {/* ── Command palette dropdown (slash-command picker) ─────────────
              Anchored above the input bar, scrollable when filtered list
              exceeds max-height. See COMMAND_PALETTE_PLAN.md. */}
          {showPalette && (
            <div
              ref={palettePanelRef}
              style={{
                position: 'absolute', bottom: '100%', left: 12,
                marginBottom: 8,
                width: 320,
                maxHeight: 320,
                overflowY: 'auto',
                background: '#0f0a1a',
                border: '1px solid rgba(168, 85, 247, 0.30)',
                borderRadius: 12,
                boxShadow: '0 -8px 32px rgba(0, 0, 0, 0.5), 0 -2px 0 rgba(168, 85, 247, 0.15) inset',
                zIndex: 100,
              }}
              role="listbox"
              aria-label={t('palette.title')}
            >
              {filteredPaletteActions.length === 0 ? (
                <div style={{ padding: '24px 16px', textAlign: 'center', fontSize: 12, color: '#6c7086', opacity: 0.7 }}>
                  {t('palette.empty')}
                </div>
              ) : (
                groupedPaletteActions.map((group) => (
                  <div key={group.sectionKey}>
                    <div style={{
                      padding: '10px 14px 4px',
                      fontSize: 9, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase',
                      color: 'rgba(168, 85, 247, 0.7)',
                    }}>
                      {t(group.sectionKey)}
                    </div>
                    {group.items.map((a) => {
                      const idx = filteredPaletteActions.indexOf(a);
                      const isActive = idx === paletteActiveIndex;
                      return (
                        <button
                          key={`${a.tool}.${a.action}`}
                          ref={isActive ? (el) => { el?.scrollIntoView({ block: 'nearest' }); } : undefined}
                          onClick={() => handlePaletteAction(a.tool, a.action)}
                          onMouseEnter={() => setPaletteActiveIndex(idx)}
                          style={{
                            display: 'block', width: '100%', textAlign: 'left',
                            padding: '8px 16px', fontSize: 12, fontWeight: 500,
                            background: isActive ? 'rgba(168, 85, 247, 0.18)' : 'transparent',
                            color: isActive ? '#fff' : '#cdd6f4',
                            border: 'none', cursor: 'pointer',
                            transition: 'background 0.1s',
                          }}
                          role="option"
                          aria-selected={isActive}
                        >
                          {t(a.labelKey)}
                        </button>
                      );
                    })}
                  </div>
                ))
              )}
            </div>
          )}
          {/* ── Secret Vault Panel (slides up from input) ─────────────────────
              Security-critical surface — solid background, confident border,
              clear hierarchy. Trust signal in the header, monospace columns
              for labels + values. */}
          <div
            ref={vaultPanelRef}
            style={{
              position: 'absolute', bottom: '100%', left: 0, right: 0,
              // Solid background — no chat bleed-through. The vault is a
              // place; it shouldn't feel like floating gauze over the chat.
              background: '#0f0a1a',
              border: '1px solid rgba(168, 85, 247, 0.30)',
              borderBottom: 'none',
              borderRadius: '14px 14px 0 0',
              boxShadow: '0 -16px 48px rgba(0, 0, 0, 0.5), 0 -2px 0 rgba(168, 85, 247, 0.15) inset',
              maxHeight: showVault ? 380 : 0,
              overflow: 'hidden',
              transition: 'max-height 0.3s cubic-bezier(0.22, 1, 0.36, 1)',
              zIndex: 100,
            }}
          >
            {showVault && (
              <div>
                {/* Top accent stripe — thin gradient that signals "secured area" */}
                <div style={{
                  height: 2,
                  background: 'linear-gradient(90deg, transparent 0%, #a855f7 30%, #a855f7 70%, transparent 100%)',
                  opacity: 0.7,
                }} />
                <div style={{ padding: '16px 20px 18px' }}>
                {/* Vault header — lock badge + title + trust signal + close */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, gap: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                    <div style={{
                      width: 30, height: 30, borderRadius: 8,
                      background: 'rgba(168, 85, 247, 0.12)',
                      border: '1px solid rgba(168, 85, 247, 0.30)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0,
                    }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a855f7" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                        <path d="M7 11V7a5 5 0 0110 0v4" />
                      </svg>
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#cdd6f4', lineHeight: 1.2 }}>{t('dash.chat.secret_vault')}</div>
                      <div style={{ fontSize: 10, color: '#6c7086', marginTop: 2, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#a6e3a1' }} />
                          Local only · Never synced
                        </span>
                        <span style={{ color: '#45475a' }}>·</span>
                        <span>Reference with <code style={{ fontFamily: 'monospace', color: '#cba6f7', background: 'rgba(168,85,247,0.10)', padding: '0 4px', borderRadius: 3 }}>@secret:Label</code></span>
                      </div>
                    </div>
                  </div>
                  <Tooltip content="Close vault">
                    <button
                      onClick={() => setShowVault(false)}
                      style={{
                        background: 'transparent', border: '1px solid rgba(168, 85, 247, 0.18)',
                        cursor: 'pointer', color: '#9399b2',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        width: 26, height: 26, borderRadius: 6, flexShrink: 0,
                        transition: 'background 0.15s, color 0.15s',
                      }}
                      onMouseEnter={e => {
                        e.currentTarget.style.color = '#cdd6f4';
                        e.currentTarget.style.background = 'rgba(168, 85, 247, 0.10)';
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.color = '#9399b2';
                        e.currentTarget.style.background = 'transparent';
                      }}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </Tooltip>
                </div>

                {/* Secrets list */}
                <div style={{ maxHeight: 200, overflowY: 'auto', marginBottom: 12 }}>
                  {secrets.length === 0 && (
                    <div style={{
                      textAlign: 'center', padding: '20px 0',
                      color: '#6c7086', fontSize: 12,
                      border: '1px dashed rgba(168, 85, 247, 0.18)', borderRadius: 8,
                    }}>
                      <div style={{ fontSize: 20, marginBottom: 6 }}>{'\ud83d\udd10'}</div>
                      <div style={{ fontWeight: 500, color: '#9399b2' }}>No secrets stored yet</div>
                      <div style={{ marginTop: 2, fontSize: 11 }}>Add an API key, password, or token below.</div>
                    </div>
                  )}
                  {secrets.map(s => {
                    const revealed = vaultRevealIds.has(s.id);
                    return (
                      <div
                        key={s.id}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 10,
                          padding: '9px 12px', marginBottom: 6,
                          background: 'rgba(10, 6, 18, 0.95)',
                          border: '1px solid rgba(168, 85, 247, 0.18)',
                          borderRadius: 8,
                          transition: 'border-color 0.15s, background 0.15s',
                        }}
                        onMouseEnter={e => {
                          e.currentTarget.style.borderColor = 'rgba(168, 85, 247, 0.32)';
                          e.currentTarget.style.background = 'rgba(15, 10, 26, 1)';
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.borderColor = 'rgba(168, 85, 247, 0.18)';
                          e.currentTarget.style.background = 'rgba(10, 6, 18, 0.95)';
                        }}
                      >
                        <span
                          style={{
                            fontSize: 11, fontWeight: 600, color: '#cba6f7',
                            fontFamily: 'monospace', minWidth: 90,
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}
                          title={s.label}
                        >{s.label}</span>
                        <span style={{ width: 1, alignSelf: 'stretch', background: 'rgba(168, 85, 247, 0.12)' }} />
                        <span style={{
                          flex: 1, fontSize: 12, fontFamily: 'monospace',
                          color: revealed ? '#cdd6f4' : '#585b70',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          letterSpacing: revealed ? 'normal' : 1.5,
                        }}>
                          {revealed ? s.value : '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022'}
                        </span>
                        <Tooltip content={revealed ? 'Hide value' : 'Reveal value'}>
                          <button
                            onClick={() => toggleVaultReveal(s.id)}
                            style={{
                              background: 'transparent', border: 'none', cursor: 'pointer',
                              color: revealed ? '#a855f7' : '#6c7086',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              padding: 5, borderRadius: 5,
                              transition: 'color 0.15s, background 0.15s',
                            }}
                            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(168, 85, 247, 0.10)'; }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                          >
                            {revealed ? (
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
                        </Tooltip>
                        <Tooltip content={t('dash.chat.delete_secret')}>
                          <button
                            onClick={() => deleteSecret(s.id)}
                            style={{
                              background: 'transparent', border: 'none', cursor: 'pointer',
                              color: '#6c7086',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              padding: 5, borderRadius: 5,
                              transition: 'color 0.15s, background 0.15s',
                            }}
                            onMouseEnter={e => {
                              e.currentTarget.style.color = '#f87171';
                              e.currentTarget.style.background = 'rgba(248, 113, 113, 0.10)';
                            }}
                            onMouseLeave={e => {
                              e.currentTarget.style.color = '#6c7086';
                              e.currentTarget.style.background = 'transparent';
                            }}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="3 6 5 6 21 6" />
                              <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                            </svg>
                          </button>
                        </Tooltip>
                      </div>
                    );
                  })}
                </div>

                {/* Add secret row — clearly delineated as a "new entry" zone */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '10px 12px',
                  background: 'rgba(168, 85, 247, 0.04)',
                  border: '1px solid rgba(168, 85, 247, 0.22)',
                  borderRadius: 8,
                }}>
                  <span style={{ fontSize: 14, color: '#9399b2', fontWeight: 500, marginRight: 2, lineHeight: 1 }}>+</span>
                  <input
                    type="text"
                    value={vaultNewLabel}
                    onChange={e => setVaultNewLabel(e.target.value)}
                    placeholder={t('dash.chat.secret_label')}
                    style={{
                      width: 110, height: 32,
                      background: 'rgba(10, 6, 18, 0.85)',
                      border: '1px solid rgba(168, 85, 247, 0.18)',
                      borderRadius: 6, padding: '0 10px',
                      fontSize: 12, fontFamily: 'monospace', color: '#cdd6f4',
                      outline: 'none',
                      transition: 'border-color 0.15s',
                    }}
                    onFocus={e => e.currentTarget.style.borderColor = '#a855f7'}
                    onBlur={e => e.currentTarget.style.borderColor = 'rgba(168, 85, 247, 0.18)'}
                    onKeyDown={e => { if (e.key === 'Enter') addSecret(); }}
                  />
                  <input
                    type="password"
                    value={vaultNewValue}
                    onChange={e => setVaultNewValue(e.target.value)}
                    placeholder={t('dash.chat.secret_value')}
                    style={{
                      flex: 1, height: 32,
                      background: 'rgba(10, 6, 18, 0.85)',
                      border: '1px solid rgba(168, 85, 247, 0.18)',
                      borderRadius: 6, padding: '0 10px',
                      fontSize: 12, fontFamily: 'monospace', color: '#cdd6f4',
                      outline: 'none',
                      transition: 'border-color 0.15s',
                    }}
                    onFocus={e => e.currentTarget.style.borderColor = '#a855f7'}
                    onBlur={e => e.currentTarget.style.borderColor = 'rgba(168, 85, 247, 0.18)'}
                    onKeyDown={e => { if (e.key === 'Enter') addSecret(); }}
                  />
                  <button
                    onClick={addSecret}
                    disabled={!vaultNewLabel.trim() || !vaultNewValue.trim()}
                    style={{
                      height: 32, padding: '0 16px', borderRadius: 6, border: 'none',
                      background: vaultNewLabel.trim() && vaultNewValue.trim()
                        ? 'linear-gradient(135deg, #a855f7, #7c3aed)'
                        : 'rgba(49, 34, 68, 0.4)',
                      color: vaultNewLabel.trim() && vaultNewValue.trim() ? '#fff' : '#585b70',
                      fontSize: 11, fontWeight: 600, letterSpacing: 0.3,
                      cursor: vaultNewLabel.trim() && vaultNewValue.trim() ? 'pointer' : 'not-allowed',
                      flexShrink: 0,
                      boxShadow: vaultNewLabel.trim() && vaultNewValue.trim() ? '0 2px 8px rgba(168, 85, 247, 0.30)' : 'none',
                      transition: 'box-shadow 0.15s',
                    }}
                  >
                    Save
                  </button>
                </div>
                </div>{/* /padding wrapper */}
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
              <Tooltip content={t('dash.chat.switch_mode')} placement="top">
                <button
                  onClick={() => setModeMenuOpen(!modeMenuOpen)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px',
                    background: 'linear-gradient(135deg, #a855f7, #7c3aed)', border: 'none',
                    borderRadius: 8, color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <span style={{ fontFamily: 'monospace', fontSize: 10, opacity: 0.7 }}>{currentMode.icon}</span>
                  {currentMode.label}
                  <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"
                    style={{ transform: modeMenuOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                  </svg>
                </button>
              </Tooltip>
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

            {/* Desktop permission-level picker — visible only in desktop mode.
               Three-state pill (Watch · Ask · Drive). Drives sharedState on
               the sidecar, which in turn drives the safety gate's approval
               decision and the system-prompt block Ava reads. The operator
               always sees what level they're in; switching is one click. */}
            {mode === 'desktop' && (() => {
              const LEVELS: Array<{ id: 'watch' | 'ask' | 'drive'; label: string; tip: string }> = [
                { id: 'watch', label: 'Watch', tip: 'Ava describes what she would do. You stay in control of the mouse and keyboard. Safest mode.' },
                { id: 'ask',   label: 'Ask',   tip: 'Ava acts. You approve every click, keystroke, and app launch before it fires. Default.' },
                { id: 'drive', label: 'Drive', tip: 'Reversible plan steps run silently after one approval. Irreversibles (Send, Pay, Delete, destructive combos) still ask each time.' },
              ];
              return (
                <div
                  style={{
                    display: 'flex', alignItems: 'center', gap: 0, flexShrink: 0, alignSelf: 'center',
                    padding: 2, borderRadius: 8, background: 'rgba(168,85,247,0.06)',
                    border: '1px solid rgba(168,85,247,0.18)',
                  }}
                >
                  {LEVELS.map(l => {
                    const active = desktopPermLevel === l.id;
                    return (
                      <Tooltip key={l.id} content={l.tip}>
                        <button
                          onClick={() => setDesktopPermLevel(l.id)}
                          style={{
                            padding: '3px 10px',
                            background: active
                              ? (l.id === 'drive'
                                  ? 'linear-gradient(135deg, #f59e0b, #d97706)'
                                  : 'linear-gradient(135deg, #a855f7, #7c3aed)')
                              : 'transparent',
                            border: 'none',
                            borderRadius: 6,
                            color: active ? '#fff' : '#9399b2',
                            fontSize: 10,
                            fontWeight: active ? 700 : 500,
                            cursor: 'pointer',
                            letterSpacing: 0.3,
                            textTransform: 'uppercase',
                            transition: 'background 0.15s, color 0.15s',
                          }}
                        >
                          {l.label}
                        </button>
                      </Tooltip>
                    );
                  })}
                </div>
              );
            })()}

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
                  // Palette takes over the keyboard while it is open —
                  // arrows navigate the dropdown, Enter fires the highlighted
                  // action, Escape closes and clears any `/query` text.
                  if (showPalette) {
                    if (e.key === 'ArrowDown') {
                      e.preventDefault();
                      setPaletteActiveIndex((i) => Math.min(filteredPaletteActions.length - 1, i + 1));
                      return;
                    }
                    if (e.key === 'ArrowUp') {
                      e.preventDefault();
                      setPaletteActiveIndex((i) => Math.max(0, i - 1));
                      return;
                    }
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      const item = filteredPaletteActions[paletteActiveIndex];
                      if (item) handlePaletteAction(item.tool, item.action);
                      return;
                    }
                    if (e.key === 'Escape') {
                      e.preventDefault();
                      setShowPalette(false);
                      if (input.startsWith('/')) {
                        setInput('');
                        if (textareaRef.current) textareaRef.current.style.height = 'auto';
                      }
                      return;
                    }
                  }
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
            <Tooltip content={t('dash.chat.attach_file')} placement="top">
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
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
              </svg>
            </button>
            </Tooltip>

            {/* Command palette button */}
            <Tooltip content={t('palette.tooltip')} placement="top">
            <button
              ref={paletteBtnRef}
              onClick={() => { setShowPalette(!showPalette); setShowVault(false); }}
              style={{
                width: 36, height: 36, borderRadius: 8,
                border: showPalette ? '1px solid rgba(168,85,247,0.5)' : '1px solid rgba(168,85,247,0.15)',
                background: showPalette ? 'rgba(168,85,247,0.2)' : 'rgba(168,85,247,0.05)',
                color: showPalette ? '#a855f7' : '#6c7086', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                transition: 'all 0.2s',
              }}
            >
              <span style={{ fontSize: 18, fontWeight: 700, fontFamily: 'monospace', lineHeight: 1 }}>/</span>
            </button>
            </Tooltip>

            {/* Secret Vault button */}
            <Tooltip content={t('dash.chat.secret_vault')} placement="top">
            <button
              ref={vaultBtnRef}
              onClick={() => { setShowVault(!showVault); setShowPalette(false); }}
              style={{
                width: 36, height: 36, borderRadius: 8,
                border: showVault ? '1px solid rgba(168,85,247,0.5)' : '1px solid rgba(168,85,247,0.15)',
                background: showVault ? 'rgba(168,85,247,0.2)' : 'rgba(168,85,247,0.05)',
                color: showVault ? '#a855f7' : '#6c7086', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                transition: 'all 0.2s',
                position: 'relative',
              }}
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
            </Tooltip>

            {/* Credit balance in input bar */}
            {connected && creditBalance && (() => {
              const isAdmin = creditBalance.limit >= 999_999_999;
              if (isAdmin) return (
                <span style={{ fontSize: 11, fontFamily: 'monospace', color: '#6c7086', opacity: 0.5, flexShrink: 0 }} title={`Unlimited credits — ${tokenCount.toLocaleString()} used this session`}>
                  {tokenCount > 0 ? `∞ · ${tokenCount.toLocaleString()}` : '∞'}
                </span>
              );
              const remaining = Math.max(0, creditBalance.limit - creditBalance.used);
              const pct = creditBalance.limit > 0 ? (creditBalance.used / creditBalance.limit) * 100 : 0;
              const color = pct >= 95 ? '#ef4444' : pct >= 80 ? '#eab308' : '#a6e3a1';
              return (
                <span style={{ fontSize: 10, fontFamily: 'monospace', fontWeight: 600, color, flexShrink: 0 }} title={`${remaining.toLocaleString()} credits remaining`}>
                  {remaining.toLocaleString()}
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
    {/* ── Tasks — always present: full panel when open, self-advertising
           spine when collapsed. ─────────────────────────────────────────── */}
    {tasksPanelOpen ? (
      <IdeTasksPanel
        sessionTasks={sessionTasks}
        avaCompletedTasks={avaCompletedTasks}
        todayTasks={todayTasks}
        allTasks={allTasks}
        onClose={() => setTasksPanelOpen(false)}
        onToggleTask={handleToggleTask}
        onCreateTask={handleCreateTask}
        width={tasksPanelWidth}
        onWidthChange={setTasksPanelWidth}
      />
    ) : (
      <IdeTasksSpine
        activeCount={allTasks.filter(t => t.status !== 'done').length}
        sessionTasks={sessionTasks}
        onExpand={() => setTasksPanelOpen(true)}
      />
    )}

    {/* ── Desktop-mode model-capability warning ──────────────────────────
         Fires when the operator switches into desktop mode while the
         active coordinator isn't on the desktop-capable list. The model
         can still tool-call in code mode just fine — it just isn't
         reliable enough at the high-frequency, high-stakes tool cadence
         that desktop_* tools demand. Offers one-click switch to a
         recommended coordinator. No silent autoswitch. */}
    {desktopModelWarn && (
      <>
        <div
          onClick={() => setDesktopModelWarn(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', zIndex: 1100 }}
        />
        <div style={{
          position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
          width: 'min(560px, 94vw)',
          background: '#0f0a1a', border: '1px solid rgba(168,85,247,0.35)', borderRadius: 14,
          padding: '20px 22px', zIndex: 1101,
          boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <span style={{ fontSize: 18 }}>⚠️</span>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#cdd6f4' }}>
              Desktop mode wants a more reliable model
            </div>
          </div>
          <div style={{ fontSize: 12, color: '#9399b2', lineHeight: 1.55, marginBottom: 14 }}>
            <strong style={{ color: '#cdd6f4' }}>{desktopModelWarn.currentName}</strong> is great for chat and code, but
            desktop automation fires many short tool calls in fast succession — clicks, keystrokes, app launches with
            real consequences. Smaller / faster models drop tool-call arguments under that kind of load.
            <br /><br />
            Pick a coordinator that's been verified for desktop reliability:
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
            {([
              { id: 'auto', label: 'Maestro', note: 'One coordinator handles everything — production-tuned.' },
              { id: 'qwen3.6-plus', label: 'Qwen 3.6 Plus', note: 'Flagship Qwen. 1M context.' },
              { id: 'kimi-k2.6', label: 'Kimi K2.6', note: 'Top BYOK coordinator.' },
            ]).map(opt => {
              const isByokOnly = opt.id === 'kimi-k2.6';
              const hasKey = byokModels.some(m => m.id === opt.id);
              const enabled = !isByokOnly || hasKey;
              return (
                <button
                  key={opt.id}
                  onClick={() => {
                    if (!enabled) return;
                    setModel(opt.id);
                    setDesktopModelWarn(null);
                  }}
                  disabled={!enabled}
                  style={{
                    display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', width: '100%',
                    padding: '10px 12px', background: enabled ? 'rgba(168,85,247,0.10)' : 'rgba(168,85,247,0.04)',
                    border: enabled ? '1px solid rgba(168,85,247,0.25)' : '1px solid rgba(168,85,247,0.10)',
                    borderRadius: 8, color: enabled ? '#cdd6f4' : '#6c7086',
                    fontSize: 12, cursor: enabled ? 'pointer' : 'not-allowed', textAlign: 'left',
                    fontFamily: 'inherit',
                    opacity: enabled ? 1 : 0.5,
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ fontWeight: 600 }}>{opt.label}</span>
                    <span style={{ fontSize: 10, color: '#6c7086' }}>{opt.note}</span>
                  </div>
                  <span style={{ fontSize: 10, color: enabled ? '#a855f7' : '#6c7086', flexShrink: 0, marginLeft: 12 }}>
                    {enabled ? 'Switch →' : (isByokOnly ? 'BYOK key needed' : '')}
                  </span>
                </button>
              );
            })}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <button
              onClick={() => setDesktopModelWarn(null)}
              style={{
                padding: '6px 12px', borderRadius: 6, border: '1px solid rgba(168,85,247,0.20)',
                background: 'transparent', color: '#9399b2', fontSize: 11, fontWeight: 500, cursor: 'pointer',
              }}
              title="Stay on the current model — desktop tools may behave unreliably."
            >
              Keep current model
            </button>
            <span style={{ fontSize: 10, color: '#6c7086', flex: 1, textAlign: 'right' }}>
              You can change this anytime from the model picker.
            </span>
          </div>
        </div>
      </>
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
  const [activeTab, setActiveTab] = useState<'conversations' | 'usage' | 'audit'>('conversations');
  const { data: usage } = useApiData<any>('/usage/summary', null);

  // ── Audit tab state — hoisted to History page so the Audit tab is
  // a top-level entry alongside Conversations + Usage instead of being
  // buried inside the Usage page's own sub-tabs. Owns its own search /
  // filter / expand state because UsagePage's audit state lives in a
  // different component tree.
  const [historyAuditEntries, setHistoryAuditEntries] = useState<any[]>([]);
  const [historyAuditExpanded, setHistoryAuditExpanded] = useState<number | null>(null);
  const [historyAuditSearch, setHistoryAuditSearch] = useState('');
  const [historyAuditRiskFilter, setHistoryAuditRiskFilter] = useState<string>('all');
  const [historyAuditStatusFilter, setHistoryAuditStatusFilter] = useState<string>('all');

  // Listen for audit events forwarded from the sidecar handler. Also
  // handles audit_export_ready by opening the Tauri save dialog.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.event === 'audit_log' && Array.isArray(detail.entries)) {
        setHistoryAuditEntries(detail.entries);
      }
      if (detail?.event === 'audit_entry' && detail.entry) {
        setHistoryAuditEntries(prev => [...prev, detail.entry].slice(-1000));
      }
      if (detail?.event === 'audit_export_ready' && detail.bundle) {
        const b = detail.bundle as { filename: string; content: string; format: 'markdown' | 'json' };
        Promise.all([
          import('@tauri-apps/plugin-dialog'),
          import('@tauri-apps/plugin-fs'),
        ]).then(async ([dialog, fs]) => {
          const target = await dialog.save({
            defaultPath: b.filename,
            filters: [{ name: b.format === 'json' ? 'JSON' : 'Markdown', extensions: [b.format === 'json' ? 'json' : 'md'] }],
          });
          if (!target) return;
          await fs.writeTextFile(target, b.content);
        }).catch(() => { /* non-fatal */ });
      }
    };
    window.addEventListener('ava-audit-event', handler);
    return () => window.removeEventListener('ava-audit-event', handler);
  }, []);

  // Pull persistent log when entering the audit tab.
  useEffect(() => {
    if (activeTab !== 'audit') return;
    const sidecar = getSidecar();
    if (sidecar.isReady) {
      sidecar.getAuditLog().catch(() => { /* offline / not ready */ });
    }
  }, [activeTab]);

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
    // When the operator deletes the conversation currently loaded in the
    // chat panel, OR clears history entirely (last conv deleted), the chat
    // panel needs to reset to a fresh state — otherwise the chat shows a
    // conversation that no longer exists in storage. Fire one event,
    // include the deleted id and the new total so the chat panel can
    // decide whether to reset.
    try {
      window.dispatchEvent(new CustomEvent('ava-history-conv-deleted', {
        detail: { deletedId: id, remaining: updated.length },
      }));
    } catch { /* */ }
  };

  // Usage analytics
  const period = usage?.period || {};
  const totals = usage?.totals || {};
  const freeUsed = period.free_credits_used || 0;
  const freeLimit = period.free_credits_limit || 300;
  const subUsed = period.credits_used || 0;
  const subLimit = period.credits_limit || 0;
  const isUnlimited = usage?.isUnlimited || false;
  const hasSub = subLimit > 0 && (usage?.tier || 'free') !== 'free';
  const balanceUsed = hasSub ? subUsed : freeUsed;
  const balanceLimit = hasSub ? subLimit : freeLimit;
  const balanceRemaining = Math.max(0, balanceLimit - balanceUsed);
  const remainPct = isUnlimited ? 100 : (balanceLimit > 0 ? Math.min((balanceRemaining / balanceLimit) * 100, 100) : 0);
  const daily: any[] = usage?.daily || [];
  // Read shim mirrors extension Usage.tsx: prefer `credits` fields when the
  // server has rolled out the credit-redesign columns, fall back to legacy
  // `tokens` for stale account-info caches. One source of truth means we
  // can keep the bar chart accurate through the rollout window without
  // double-rendering.
  const dailyValue = (d: any) => Number(d?.credits ?? d?.tokens ?? 0);
  const maxDaily = daily.length > 0 ? Math.max(...daily.map(dailyValue)) : 1;
  const today = new Date().toISOString().slice(0, 10);
  const models: any[] = usage?.models || [];
  const modelValue = (m: any) => Number(m?.total_credits ?? m?.total_tokens ?? 0);
  const maxModelTokens = models.length > 0 ? Math.max(...models.map(modelValue)) : 1;
  const monthValue = Number(totals?.credits ?? totals?.tokens ?? 0);
  const monthRequests = Number(totals?.requests ?? 0);
  const monthAvg = monthRequests > 0 ? Math.round(monthValue / monthRequests) : 0;

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
        <div style={{ ...pageSubtitle, marginBottom: 16 }}>Credits, sessions, models</div>

        {/* ── Tabs ───────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid rgba(168, 85, 247, 0.12)', marginBottom: 16, paddingBottom: 1 }}>
          <button style={tabStyle(activeTab === 'conversations')} onClick={() => setActiveTab('conversations')}>Conversations</button>
          <button style={tabStyle(activeTab === 'usage')} onClick={() => setActiveTab('usage')}>Usage</button>
          <button style={tabStyle(activeTab === 'audit')} onClick={() => setActiveTab('audit')}>Audit</button>
        </div>

        {/* ── Audit Tab — every tool call Ava made on this machine.
            Persistent across sessions via @ava/core/audit; never leaves
            the user's disk; works for BYOK no-account users. ────────── */}
        {activeTab === 'audit' && (
          <IdeAuditView
            entries={historyAuditEntries}
            expandedIdx={historyAuditExpanded}
            onToggleExpand={(i) => setHistoryAuditExpanded(historyAuditExpanded === i ? null : i)}
            search={historyAuditSearch}
            onSearchChange={setHistoryAuditSearch}
            riskFilter={historyAuditRiskFilter}
            onRiskFilterChange={setHistoryAuditRiskFilter}
            statusFilter={historyAuditStatusFilter}
            onStatusFilterChange={setHistoryAuditStatusFilter}
            onExport={(format) => {
              const sidecar = getSidecar();
              if (sidecar.isReady) sidecar.exportAuditLog(format).catch(() => {});
            }}
          />
        )}

        {/* ── Usage Tab ──────────────────────────────────────────────── */}
        {activeTab === 'usage' && (
          <>
            {/* Credit Balance */}
            {connected && usage && (
              <div style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase' as const, color: '#6c7086', marginBottom: 8 }}>Credit Balance</div>
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
                        <span style={{ color: '#a6adc8' }}>Credits Remaining</span>
                        <span style={{ color: '#cdd6f4', fontWeight: 600 }}>{balanceRemaining.toLocaleString()}</span>
                      </div>
                      <div style={{ height: 12, borderRadius: 6, overflow: 'hidden', background: 'rgba(49, 34, 68, 0.5)' }}>
                        <div style={{
                          width: `${remainPct}%`, height: '100%', borderRadius: 6,
                          background: remainPct < 10 ? '#f87171' : remainPct < 30 ? '#f59e0b' : 'linear-gradient(90deg, #a855f7, #6366f1)',
                          transition: 'width 0.5s',
                        }} />
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#585b70', marginTop: 4 }}>
                        <span>{balanceUsed.toLocaleString()} used</span>
                        <span>{balanceLimit.toLocaleString()} limit</span>
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
                    { label: 'Credits This Month', value: monthValue.toLocaleString() },
                    { label: 'Requests',           value: String(monthRequests) },
                    { label: 'Active Days',        value: String(totals.active_days || 0) },
                    { label: 'Avg / Request',      value: monthAvg.toLocaleString() },
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
                      const v = dailyValue(d);
                      const h = maxDaily > 0 ? Math.max(2, (v / maxDaily) * 80) : 2;
                      const isToday = d.date === today;
                      return (
                        <div key={d.date} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }} title={`${d.date}: ${formatTokens(v)} credits`}>
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
                  {models.slice(0, 5).map((m: any) => {
                    const v = modelValue(m);
                    return (
                      <div key={m.model}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
                          <span style={{ color: '#cdd6f4', fontWeight: 500 }}>{m.model}</span>
                          <span style={{ color: '#6c7086' }}>{formatTokens(v)} credits ({m.request_count} req)</span>
                        </div>
                        <div style={{ height: 6, borderRadius: 3, overflow: 'hidden', background: 'rgba(49, 34, 68, 0.5)' }}>
                          <div style={{ width: `${(v / maxModelTokens) * 100}%`, height: '100%', borderRadius: 3, background: 'linear-gradient(90deg, #a855f7, #6366f1)' }} />
                        </div>
                      </div>
                    );
                  })}
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

type MemoryViewMode = 'active' | 'stale' | 'archived';

// Stale = no recall/update/create activity in the last 90 days. Matches the
// extension's definition so both surfaces classify the same way.
function isMemoryStale(entry: any): boolean {
  const lastActivity = entry.last_recalled_at ?? entry.updated_at ?? entry.created_at;
  if (!lastActivity) return false;
  const daysSince = (Date.now() - new Date(lastActivity).getTime()) / (1000 * 60 * 60 * 24);
  return daysSince > 90;
}

export function MemoryPage() {
  useLocale();
  const { data: rawMemories, loading, error } = useApiData<any[]>('/memories', []);
  const [memories, setMemories] = useState<any[]>([]);
  const [localMemories, setLocalMemories] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<MemoryViewMode>('active');
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

  // Category counts are computed from the current view-mode subset so the
  // badge numbers match what the user will actually see when they pick a
  // category. Without this, "Preference (5)" in Active view could include
  // archived entries.
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    const source = viewMode === 'active' ? memories.filter(m => !m.archived && !isMemoryStale(m))
      : viewMode === 'stale' ? memories.filter(m => !m.archived && isMemoryStale(m))
      : memories.filter(m => m.archived);
    for (const m of source) {
      const cat = m.category || 'general';
      counts[cat] = (counts[cat] || 0) + 1;
    }
    return counts;
  }, [memories, viewMode]);

  const globalCount = memories.filter(m => m.scope === 'global').length;
  const projectCount = memories.filter(m => m.scope === 'project').length;

  // Split into active / stale / archived buckets. Archived wins over stale so
  // an archived-and-stale entry appears only in Archived.
  const { activeMemories, staleMemories, archivedMemories } = useMemo(() => {
    const active: any[] = [];
    const stale: any[] = [];
    const archived: any[] = [];
    for (const m of memories) {
      if (m.archived) archived.push(m);
      else if (isMemoryStale(m)) stale.push(m);
      else active.push(m);
    }
    return { activeMemories: active, staleMemories: stale, archivedMemories: archived };
  }, [memories]);

  const viewEntries = viewMode === 'active' ? activeMemories
    : viewMode === 'stale' ? staleMemories
    : archivedMemories;

  const filtered = useMemo(() => {
    let result = viewEntries;
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
  }, [viewEntries, categoryFilter, search]);

  // Reset display limit when filters change
  useEffect(() => { setDisplayLimit(MEMORY_PAGE_SIZE); }, [categoryFilter, search, viewMode]);
  // Clear category filter when switching view mode so a category with no
  // entries in the new view doesn't leave the list empty.
  useEffect(() => { setCategoryFilter(null); }, [viewMode]);

  const displayed = filtered.slice(0, displayLimit);
  const hasMore = displayLimit < filtered.length;

  const formatDate = (dateStr: string | null | undefined): string => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const handleDelete = async (id: string | number) => {
    try {
      // Delete the cloud copy too when cloud sync is on.
      if (cloudSyncEnabled()) {
        await apiFetch(`/memories/${id}`, { method: 'DELETE' });
      }
      // Always delete from the local store — local-first.
      {
        try {
          const { readTextFile, writeTextFile, BaseDirectory } = await import('@tauri-apps/plugin-fs');
          const raw = await readTextFile('.ava/memory.json', { baseDir: BaseDirectory.Home });
          const parsed = JSON.parse(raw || '{}');
          parsed.entries = (parsed.entries || []).filter((m: any) => m.id !== id && m._id !== id);
          parsed.lastModified = new Date().toISOString();
          await writeTextFile('.ava/memory.json', JSON.stringify(parsed), { baseDir: BaseDirectory.Home });
          setLocalMemories(parsed.entries);
        } catch { /* file may not exist */ }
      }
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

  const handleDeleteAll = async () => {
    setDeletingAll(true);
    setConfirmDeleteAll(false);
    // Wipe everything — local store + the cloud copy. deleteCloud() self-guards
    // on the platform key (no account => no-op), so we always call it. Gating
    // on a connection/sync flag let cloud memories survive and reappear on the
    // next reload — the bug this fixes.
    await deleteLocal();
    await deleteCloud();
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
            <p style={{ fontSize: 11, color: '#9ca3af', marginBottom: 12 }}>This permanently deletes every memory — on this machine and any cloud copy. It cannot be undone.</p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button onClick={() => handleDeleteAll()} style={{ padding: '6px 14px', borderRadius: 8, background: '#ef4444', color: '#fff', fontSize: 12, border: 'none', cursor: 'pointer' }}>
                Delete Everything
              </button>
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

        {/* View mode tabs — active / stale / archived */}
        {memories.length > 0 && (
          <div style={{ display: 'flex', gap: 6, marginBottom: 16, borderBottom: '1px solid rgba(168, 85, 247, 0.12)' }}>
            {([
              { key: 'active' as MemoryViewMode, label: 'Active', count: activeMemories.length, color: '#a855f7' },
              { key: 'stale' as MemoryViewMode, label: 'Stale', count: staleMemories.length, color: '#f59e0b' },
              { key: 'archived' as MemoryViewMode, label: 'Archived', count: archivedMemories.length, color: '#6c7086' },
            ]).map(tab => {
              const active = viewMode === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => setViewMode(tab.key)}
                  style={{
                    padding: '8px 14px', fontSize: 12, fontWeight: 500, cursor: 'pointer',
                    background: 'transparent', border: 'none', borderBottom: active ? `2px solid ${tab.color}` : '2px solid transparent',
                    color: active ? tab.color : '#6c7086', marginBottom: -1,
                  }}
                >
                  {tab.label} <span style={{ opacity: 0.6, fontSize: 11 }}>({tab.count})</span>
                </button>
              );
            })}
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
            {t('dash.memory.all')} ({viewEntries.length})
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
    // Local-only path: Data Mode = Local, OR user not connected. Both
    // cases skip the cloud write — we just add to the React state and
    // return. (When Data Mode flips back to Cloud/Both, the Sync tab's
    // bulk push will upload whatever isn't already there.)
    if (!connected || !cloudSyncEnabled()) {
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
    if (connected && cloudSyncEnabled()) {
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
    if (connected && cloudSyncEnabled()) {
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
    // Cloud write only when Data Mode allows it. Local mode keeps
    // the localStorage write above and skips the /journal POST
    // entirely, so the entry stays on device.
    if (connected && cloudSyncEnabled()) {
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
  const [playingLessonId, setPlayingLessonId] = useState<string | null>(null);
  const [playingSample, setPlayingSample] = useState(false);

  // Local-first: the user's curriculums + progress live in the SHARED
  // ~/.ava/learning.json (the same file the CLI, extension and @ava/core use),
  // read via Tauri fs — works with no account and no connection. Cloud is
  // additive (merged in when signed in), never required.
  const [localCurricula, setLocalCurricula] = useState<any[]>([]);
  useEffect(() => { void readLocalLearning().then(setLocalCurricula); }, []);

  const cloudCurricula: any[] = Array.isArray(rawData) ? rawData : rawData?.curricula || rawData?.courses || [];

  // Merge: local first (the source of truth), plus any cloud-only curriculums.
  const curricula: any[] = useMemo(() => {
    if (cloudCurricula.length === 0) return localCurricula;
    const localIds = new Set(localCurricula.map((c: any) => c.id || c._id));
    const cloudOnly = cloudCurricula.filter((c: any) => !localIds.has(c.id || c._id));
    return [...localCurricula, ...cloudOnly];
  }, [localCurricula, cloudCurricula]);

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

  // Sample lesson — playable with zero setup, from anywhere in the view.
  if (playingSample) {
    return (
      <div style={pageWrapper}>
        <div style={{ width: '100%' }}>
          <LessonPlayer lesson={SAMPLE_LESSON} onClose={() => setPlayingSample(false)} />
        </div>
      </div>
    );
  }

  // Detail view
  if (selected) {
    const modules: any[] = selected.modules || [];

    // Playing a lesson — hand off to the interactive player.
    if (playingLessonId) {
      const playing = modules
        .flatMap((m: any) => (m.lessons || []))
        .find((l: any) => (l.id || l.title) === playingLessonId);
      if (playing) {
        return (
          <div style={pageWrapper}>
            <div style={{ width: '100%' }}>
              <LessonPlayer
                lesson={playing as PlayableLesson}
                curriculumId={selected.id || selected._id}
                onComplete={setLocalCurricula}
                onClose={() => setPlayingLessonId(null)}
              />
            </div>
          </div>
        );
      }
    }

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
                      {lessons.map((lesson: any) => {
                        const interactive = ((lesson.steps as LessonStep[] | undefined)?.length ?? 0) > 0;
                        return (
                          <button
                            key={lesson.id || lesson.title}
                            onClick={() => setPlayingLessonId(lesson.id || lesson.title)}
                            style={{
                              width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                              padding: '8px 16px', fontSize: 11, textAlign: 'left',
                              border: 'none', borderBottom: '1px solid rgba(49,50,68,0.5)',
                              background: 'transparent', cursor: 'pointer', transition: 'background 0.15s',
                            }}
                            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(49, 34, 68, 0.5)'; }}
                            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                          >
                            <span>{typeIcons[lesson.type] || '\uD83D\uDCD6'}</span>
                            <span style={{
                              color: lesson.status === 'completed' ? '#6c7086' : '#cdd6f4',
                              textDecoration: lesson.status === 'completed' ? 'line-through' : 'none',
                              flex: 1,
                            }}>
                              {lesson.title}
                            </span>
                            {interactive && (
                              <span style={{ fontSize: 8, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: 0.5, color: '#a855f7' }}>
                                interactive
                              </span>
                            )}
                            {lesson.status === 'completed' && <span style={{ color: '#34d399' }}>&#10003;</span>}
                            {lesson.score != null && lesson.status !== 'completed' && <span style={{ color: '#6c7086' }}>{lesson.score}%</span>}
                            <span style={{ color: '#6c7086', opacity: 0.4 }}>&#9654;</span>
                          </button>
                        );
                      })}
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
        </div>
        <div style={pageSubtitle}>{t('dash.learning.subtitle')}</div>

        {/* Try a sample interactive lesson — playable with zero data */}
        <button
          onClick={() => setPlayingSample(true)}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20,
            borderRadius: 10, border: '1px solid rgba(168,85,247,0.3)', background: 'rgba(168,85,247,0.05)',
            padding: '10px 16px', textAlign: 'left', cursor: 'pointer', transition: 'background 0.15s',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(168,85,247,0.1)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(168,85,247,0.05)'; }}
        >
          <span style={{ fontSize: 16 }}>&#9654;</span>
          <div>
            <div style={{ fontSize: 12, fontWeight: 500, color: '#cdd6f4' }}>Try a sample interactive lesson</div>
            <div style={{ fontSize: 10, color: '#6c7086', marginTop: 2 }}>See the new step-by-step format — teach, do, check.</div>
          </div>
        </button>

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
type LibraryMediaKind = 'image' | 'music' | 'video' | 'voice' | 'document' | 'spreadsheet' | 'presentation';
interface LibraryFile {
  /** creative_assets.id — present on cloud rows, absent on locally-scanned files.
   *  Required for the cloud delete path; absence flags the item as local. */
  id?: string;
  name: string;
  path: string;
  folder: string;
  type: LibraryFileType;
  /** Original asset_type from the cloud row (or extension-derived for local
   *  files). LibraryFileType is a single-axis filter that coalesces every
   *  media kind to 'image'; mediaKind preserves the actual kind so the
   *  thumbnail can render the right element (img / audio icon / video poster)
   *  without falling back to a broken <img src="...mp3"> for music tracks. */
  mediaKind?: LibraryMediaKind;
  size: number;
  modified: string;
  url?: string;          // platform storage URL (cloud) or local-resolved path
  prompt?: string;       // generation prompt for cloud assets
  source?: 'cloud' | 'local';
}

// Per-mediaKind icon — Phosphor duotone weight. Layered fill gives each
// icon a primary + secondary tone so they read as crafted product elements
// instead of generic SaaS strokes.
type PhIconComponent = React.ComponentType<{ size?: number; weight?: 'thin' | 'light' | 'regular' | 'bold' | 'fill' | 'duotone'; color?: string }>;
const MEDIA_KIND_PH: Record<LibraryMediaKind, PhIconComponent> = {
  image:        PhImage,
  music:        PhMusic,
  voice:        PhVoice,
  video:        PhVideo,
  document:     PhDocument,
  spreadsheet:  PhSpreadsheet,
  presentation: PhPresentation,
};

// Wrapper: defaults to duotone so call sites stay terse and consistent.
// Picks up `currentColor` from the parent for the primary stroke; the
// duotone fill is auto-derived by Phosphor at a lower opacity.
function MediaKindIcon({ kind, size = 24, weight = 'duotone' }: { kind: LibraryMediaKind; size?: number; weight?: 'thin' | 'light' | 'regular' | 'bold' | 'fill' | 'duotone' }) {
  const Icon = MEDIA_KIND_PH[kind];
  return <Icon size={size} weight={weight} />;
}

// File-type variant for the empty state and previews — same lookup, scoped
// to the LibraryFileType union (image/document/spreadsheet/presentation).
const FILE_TYPE_PH: Record<LibraryFileType, PhIconComponent> = {
  image:        PhImage,
  document:     PhDocument,
  spreadsheet:  PhSpreadsheet,
  presentation: PhPresentation,
};

// Per-mediaKind colour palette so the badge + tile chrome reflect the real
// kind (a music track now reads MUSIC in pink instead of IMAGE in purple).
const MEDIA_KIND_COLORS: Record<LibraryMediaKind, { bg: string; text: string; border: string }> = {
  image:        { bg: 'rgba(168,85,247,0.10)', text: '#c084fc', border: 'rgba(168,85,247,0.25)' }, // purple — same as image
  music:        { bg: 'rgba(236,72,153,0.10)', text: '#f472b6', border: 'rgba(236,72,153,0.25)' }, // pink
  voice:        { bg: 'rgba(244,114,182,0.10)', text: '#f9a8d4', border: 'rgba(244,114,182,0.25)' }, // light pink
  video:        { bg: 'rgba(239,68,68,0.10)', text: '#f87171', border: 'rgba(239,68,68,0.25)' },   // red
  document:     { bg: 'rgba(59,130,246,0.10)', text: '#60a5fa', border: 'rgba(59,130,246,0.25)' }, // blue
  spreadsheet:  { bg: 'rgba(34,197,94,0.10)', text: '#4ade80', border: 'rgba(34,197,94,0.25)' },   // green
  presentation: { bg: 'rgba(249,115,22,0.10)', text: '#fb923c', border: 'rgba(249,115,22,0.25)' }, // orange
};

function formatFileSize(bytes: number): string {
  // Cloud-only assets carry size: 0 because creative_assets doesn't store
  // file size. Render that as a dash rather than a literal "0 B" — every
  // cloud row was previously displaying "0 B" which read as broken/empty.
  if (!bytes || bytes <= 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Extension → LibraryFileType mapping used by the local scan. Anything
// outside this set is skipped so we don't pollute the Library with
// random source files from the project.
const LIBRARY_FILE_EXT: Record<string, LibraryFileType> = {
  // Images
  png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', webp: 'image', svg: 'image', bmp: 'image',
  // Office docs
  doc: 'document', docx: 'document', txt: 'document', md: 'document', rtf: 'document', pdf: 'document',
  xls: 'spreadsheet', xlsx: 'spreadsheet', csv: 'spreadsheet',
  ppt: 'presentation', pptx: 'presentation', key: 'presentation',
  // Media — coalesced to 'image' for the single filter axis; the
  // tab split (Assets vs Documents) handles the important distinction.
  mp3: 'image', wav: 'image', m4a: 'image', ogg: 'image', flac: 'image',
  mp4: 'image', mov: 'image', webm: 'image', mkv: 'image',
};

/** Media-kind classification that survives the LibraryFileType coalesce
 *  above — used by the preview modal to pick inline playback vs thumbnail.
 *  Keeping it as a derived helper (not a column on LibraryFile) so cloud
 *  rows coming back with asset_type='music'/'video'/'voice' keep working
 *  without a schema change here. */
function classifyMediaKind(file: LibraryFile): LibraryMediaKind {
  // Explicit hint from cloud rows wins — cloud titles often have no file
  // extension (e.g. "Cinematic ambient electronic soundtrack..."), so the
  // extension heuristic below would mis-classify them as 'image' and the
  // thumbnail would render a broken <img>.
  if (file.mediaKind) return file.mediaKind;
  if (file.type === 'document' || file.type === 'spreadsheet' || file.type === 'presentation') return file.type;
  const name = (file.path || file.name || '').toLowerCase();
  const ext = name.includes('.') ? name.split('.').pop()! : '';
  if (['mp3', 'wav', 'm4a', 'ogg', 'flac'].includes(ext)) {
    // Voice generations land in .ava/creative/voice/; music in .ava/creative/music/.
    return name.includes('/voice/') || name.includes('\\voice\\') ? 'voice' : 'music';
  }
  if (['mp4', 'mov', 'webm', 'mkv'].includes(ext)) return 'video';
  return 'image';
}

/** Recursive Tauri fs scan rooted at a project folder. Only surfaces
 *  the known creative-asset buckets (`.ava/creative/*`) plus the
 *  top-level `images/` / `documents/` directories some workflows use.
 *  Everything else in the repo is invisible to the Library to avoid
 *  leaking random source files into a user-facing gallery. */
async function scanLocalLibrary(projectFolder: string): Promise<LibraryFile[]> {
  if (!projectFolder) return [];
  try {
    const { readDir, stat } = await import('@tauri-apps/plugin-fs');
    const { join } = await import('@tauri-apps/api/path');
    const { convertFileSrc } = await import('@tauri-apps/api/core');
    const results: LibraryFile[] = [];
    const rootsToScan = [
      '.ava/creative',
      'images',
      'documents',
    ];
    async function walk(absDir: string, relPrefix: string): Promise<void> {
      let entries: { name: string; isDirectory?: boolean; isFile?: boolean }[] = [];
      try { entries = await readDir(absDir); } catch { return; }
      for (const ent of entries) {
        if (!ent.name || ent.name.startsWith('.')) continue;
        const absPath = await join(absDir, ent.name);
        const relPath = relPrefix ? `${relPrefix}/${ent.name}` : ent.name;
        if (ent.isDirectory) {
          await walk(absPath, relPath);
          continue;
        }
        const ext = ent.name.includes('.') ? ent.name.split('.').pop()!.toLowerCase() : '';
        const type = LIBRARY_FILE_EXT[ext];
        if (!type) continue;
        let size = 0; let modified = '';
        try {
          const s = await stat(absPath);
          // Tauri v2 plugin-fs returns size as BigInt on some platforms
          // (Windows in particular). Number() handles both bigint and number;
          // the fallback for null/undefined avoids NaN.
          size = s.size != null ? Number(s.size) : 0;
          // mtime is Date | null in v2 — handle both Date instances and the
          // legacy string/number shape from older bundled versions.
          if (s.mtime instanceof Date) modified = s.mtime.toISOString();
          else if (s.mtime) modified = new Date(s.mtime as unknown as string | number).toISOString();
        } catch { /* stat may fail on some platforms — keep entry without metadata */ }
        results.push({
          name: ent.name,
          path: relPath,
          folder: relPrefix.split('/').slice(-1)[0] || 'root',
          type,
          size,
          modified,
          // convertFileSrc maps an absolute path to the Tauri asset protocol
          // URL the webview can actually load (https://asset.localhost/...
          // on Windows, asset://... on macOS/Linux). Plain `file://` URLs
          // are rejected by WebView2 + WKWebView, which is why every Library
          // thumbnail and "open" link was broken before.
          url: convertFileSrc(absPath),
          source: 'local',
        });
      }
    }
    for (const rel of rootsToScan) {
      const abs = await join(projectFolder, rel);
      await walk(abs, rel);
    }
    // Most-recent first (matches cloud asset ordering).
    results.sort((a, b) => (b.modified || '').localeCompare(a.modified || ''));
    return results;
  } catch {
    return [];
  }
}

/* ===== 6b. Learning Library ===== */
// A small, friendly visual identity per course — a soft gradient + icon
// derived from the subject, so each tile feels distinct and inviting at a
// glance. Mirrors the extension's LearningLibrary identityFor.
type CourseIdentity = { from: string; to: string; tint: string; icon: string };

const COURSE_SUBJECT_IDENTITIES: { match: string[]; identity: CourseIdentity }[] = [
  { match: ['prompt', 'ai', 'llm', 'agent', 'machine'], identity: { from: '#a855f7', to: '#7c3aed', tint: 'rgba(168,85,247,0.12)', icon: '✨' } },
  { match: ['web', 'frontend', 'react', 'css', 'html', 'ui', 'design'], identity: { from: '#38bdf8', to: '#2563eb', tint: 'rgba(56,189,248,0.12)', icon: '🎨' } },
  { match: ['python', 'data', 'analysis', 'science', 'ml'], identity: { from: '#34d399', to: '#0ea5e9', tint: 'rgba(52,211,153,0.12)', icon: '📊' } },
  { match: ['security', 'crypto', 'network', 'cyber'], identity: { from: '#f87171', to: '#b91c1c', tint: 'rgba(248,113,113,0.12)', icon: '🔒' } },
  { match: ['backend', 'server', 'api', 'database', 'sql', 'devops', 'cloud'], identity: { from: '#fbbf24', to: '#d97706', tint: 'rgba(251,191,36,0.12)', icon: '⚙️' } },
  { match: ['game', 'graphics', '3d', 'shader'], identity: { from: '#f472b6', to: '#db2777', tint: 'rgba(244,114,182,0.12)', icon: '🎮' } },
  { match: ['math', 'algorithm', 'logic'], identity: { from: '#818cf8', to: '#4f46e5', tint: 'rgba(129,140,248,0.12)', icon: '🧮' } },
];

const COURSE_DEFAULT_IDENTITY: CourseIdentity = { from: '#a855f7', to: '#7c3aed', tint: 'rgba(168,85,247,0.10)', icon: '📚' };

function identityFor(subject?: string, title?: string): CourseIdentity {
  const hay = `${subject || ''} ${title || ''}`.toLowerCase();
  for (const { match, identity } of COURSE_SUBJECT_IDENTITIES) {
    if (match.some(m => hay.includes(m))) return identity;
  }
  return COURSE_DEFAULT_IDENTITY;
}

const COURSE_TYPE_ICONS: Record<string, string> = {
  concept: '📖', exercise: '💻', project: '🛠', quiz: '❓', recap: '🔄', challenge: '🏆',
};

// A small stat block for the course-detail hero — icon, bold value, quiet label.
function CourseStat({ icon, label, sub }: { icon: string; label: string; sub: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontSize: 16, lineHeight: 1 }}>{icon}</span>
      <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15 }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>{label}</span>
        <span style={{ fontSize: 10, color: '#6c7086', textTransform: 'uppercase', letterSpacing: 0.4 }}>{sub}</span>
      </div>
    </div>
  );
}

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
    const id = identityFor(detail.subject, detail.title);
    const moduleCount = modules.length;
    const lessonCount = modules.reduce((s: number, m: any) => s + (m.lessons?.length || 0), 0);
    const avgRating = detail.rating_count > 0 ? (detail.rating_sum / detail.rating_count).toFixed(1) : null;
    return (
      <div style={pageWrapper}>
        <div style={{ width: '100%', maxWidth: 860, margin: '0 auto' }}>
          <button onClick={() => { setSelectedId(null); setDetail(null); }} style={{ background: 'none', border: 'none', color: '#6c7086', cursor: 'pointer', fontSize: 13, marginBottom: 16, padding: 0 }}>
            &larr; Back to Library
          </button>

          {/* Hero */}
          <div style={{
            position: 'relative', overflow: 'hidden', borderRadius: 16,
            border: '1px solid rgba(168,85,247,0.12)',
            background: `linear-gradient(135deg, ${id.tint}, transparent 60%), rgba(26,16,40,0.6)`,
            padding: 24, marginBottom: 20,
          }}>
            <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
              <div style={{
                flexShrink: 0, width: 56, height: 56, borderRadius: 14, display: 'flex',
                alignItems: 'center', justifyContent: 'center', fontSize: 28,
                background: `linear-gradient(135deg, ${id.from}, ${id.to})`,
                boxShadow: `0 6px 20px -6px ${id.from}`,
              }}>
                {id.icon}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
                  <span style={{ padding: '3px 9px', borderRadius: 999, fontSize: 10, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: 0.5, color: detail.source === 'curated' ? '#a855f7' : '#60a5fa', background: detail.source === 'curated' ? 'rgba(168,85,247,0.1)' : 'rgba(96,165,250,0.1)' }}>
                    {detail.source === 'curated' ? 'Curated by Ava' : 'Community'}
                  </span>
                  <span style={{ padding: '3px 9px', borderRadius: 999, fontSize: 10, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: 0.5, color: lc.color, background: lc.bg }}>
                    {detail.level}
                  </span>
                  {detail.subject && (
                    <span style={{ padding: '3px 9px', borderRadius: 999, fontSize: 10, fontWeight: 500, color: '#a6adc8', background: 'rgba(49,34,68,0.5)', border: '1px solid rgba(168,85,247,0.12)' }}>
                      {detail.subject}
                    </span>
                  )}
                </div>
                <h2 style={{ fontSize: 24, fontWeight: 700, color: '#fff', margin: '0 0 4px', lineHeight: 1.2 }}>{detail.title}</h2>
                {detail.author_name && (
                  <p style={{ fontSize: 12, color: '#6c7086', margin: '0 0 10px' }}>by {detail.author_name}</p>
                )}
                <p style={{ fontSize: 13, color: '#a6adc8', lineHeight: 1.65, margin: 0 }}>{detail.description}</p>
              </div>
            </div>

            {/* Stats row */}
            <div style={{ display: 'flex', gap: 20, marginTop: 18, flexWrap: 'wrap' }}>
              {detail.estimated_hours ? <CourseStat icon="\u23F1" label={`${detail.estimated_hours}h`} sub="estimated" /> : null}
              <CourseStat icon="\uD83D\uDC65" label={String(detail.fork_count)} sub={`learner${detail.fork_count !== 1 ? 's' : ''}`} />
              {avgRating ? <CourseStat icon="\u2B50" label={`${avgRating}/5`} sub="rating" /> : null}
              {moduleCount > 0 ? <CourseStat icon="\uD83D\uDCE6" label={String(moduleCount)} sub={`module${moduleCount !== 1 ? 's' : ''}`} /> : null}
              {lessonCount > 0 ? <CourseStat icon="\uD83D\uDCDD" label={String(lessonCount)} sub={`lesson${lessonCount !== 1 ? 's' : ''}`} /> : null}
            </div>
          </div>

          {/* What you'll learn */}
          {detail.learning_objectives?.length > 0 && (
            <div style={{ marginBottom: 22, borderRadius: 14, border: '1px solid rgba(168,85,247,0.12)', background: 'rgba(26,16,40,0.6)', padding: 18 }}>
              <h3 style={{ fontSize: 11, fontWeight: 700, color: '#6c7086', textTransform: 'uppercase', letterSpacing: 0.8, margin: '0 0 12px' }}>What you&apos;ll learn</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '8px 18px' }}>
                {detail.learning_objectives.map((obj: string, oi: number) => (
                  <div key={oi} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13, color: '#a6adc8', lineHeight: 1.5 }}>
                    <span style={{ color: id.from, fontWeight: 700, flexShrink: 0 }}>\u2713</span>
                    <span>{obj}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Curriculum \u2014 a visual learning path */}
          {modules.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <h3 style={{ fontSize: 11, fontWeight: 700, color: '#6c7086', textTransform: 'uppercase', letterSpacing: 0.8, margin: '0 0 16px' }}>Your learning path</h3>
              <div style={{ position: 'relative' }}>
                {/* The vertical journey spine */}
                <div style={{ position: 'absolute', left: 17, top: 8, bottom: 8, width: 2, background: 'linear-gradient(to bottom, #a855f7, #6366f1)', opacity: 0.4 }} />
                {modules.map((mod: any, mi: number) => (
                  <div key={mi} style={{ position: 'relative', paddingLeft: 48, marginBottom: mi === modules.length - 1 ? 0 : 18 }}>
                    {/* Module node */}
                    <div style={{
                      position: 'absolute', left: 0, top: 0, width: 36, height: 36, borderRadius: '50%',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700,
                      color: '#fff', background: `linear-gradient(135deg, ${id.from}, ${id.to})`,
                      boxShadow: '0 0 0 4px rgba(26,16,40,1)',
                    }}>
                      {mi + 1}
                    </div>
                    <div style={{ borderRadius: 14, border: '1px solid rgba(168,85,247,0.12)', background: 'rgba(26,16,40,0.6)', padding: 16 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#fff', marginBottom: mod.description ? 2 : 8 }}>
                        {mod.title}
                      </div>
                      {mod.description && (
                        <div style={{ fontSize: 12, color: '#6c7086', marginBottom: 10, lineHeight: 1.5 }}>{mod.description}</div>
                      )}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        {(mod.lessons || []).map((l: any, li: number) => (
                          <div key={li} style={{
                            display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5,
                            color: '#a6adc8', padding: '7px 10px', borderRadius: 8,
                            background: 'rgba(49,34,68,0.4)',
                          }}>
                            <span style={{ fontSize: 15, lineHeight: 1 }}>{COURSE_TYPE_ICONS[l.type] || '\u25CB'}</span>
                            <span style={{ flex: 1 }}>{l.title}</span>
                            {l.difficulty && (
                              <span style={{ fontSize: 9, fontWeight: 600, color: '#6c7086', textTransform: 'uppercase', letterSpacing: 0.4 }}>{l.difficulty}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Start-learning CTA card */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap',
            borderRadius: 14, border: '1px solid rgba(168,85,247,0.12)',
            background: `linear-gradient(135deg, ${id.tint}, transparent), rgba(26,16,40,0.6)`,
            padding: 18,
          }}>
            <button onClick={() => handleFork(detail.id)} disabled={forking} style={{
              padding: '11px 26px', borderRadius: 10, border: 'none', cursor: forking ? 'wait' : 'pointer',
              background: `linear-gradient(135deg, ${id.from}, ${id.to})`, color: '#fff', fontSize: 14, fontWeight: 600,
            }}>
              {forking ? 'Starting...' : 'Start Learning'}
            </button>
          </div>

          {detail.prerequisites && (
            <p style={{ fontSize: 11, color: '#6c7086', lineHeight: 1.5, marginTop: 12 }}>
              <strong style={{ color: '#a6adc8' }}>Prerequisites:</strong> {detail.prerequisites}
            </p>
          )}
        </div>
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
          <div style={{ marginBottom: 8, color: '#a855f7' }}><PhBook size={36} weight="duotone" /></div>
          <div style={{ fontSize: 13 }}>No paths found.</div>
          <div style={{ fontSize: 11, marginTop: 4 }}>Try a different search or ask Ava to create a custom path.</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
          {filtered.map((p: any) => {
            const lc = levelColors[p.level] || levelColors.beginner;
            const avgRating = p.rating_count > 0 ? (p.rating_sum / p.rating_count).toFixed(1) : null;
            const id = identityFor(p.subject, p.title);
            return (
              <button
                key={p.id}
                onClick={() => handleSelect(p.id)}
                style={{
                  textAlign: 'left' as const, padding: 0, borderRadius: 16, cursor: 'pointer', overflow: 'hidden',
                  border: '1px solid rgba(168,85,247,0.12)', background: 'rgba(26,16,40,0.6)',
                  transition: 'transform 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease',
                  display: 'flex', flexDirection: 'column' as const,
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = id.from;
                  e.currentTarget.style.transform = 'translateY(-3px)';
                  e.currentTarget.style.boxShadow = `0 12px 28px -14px ${id.from}`;
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = 'rgba(168,85,247,0.12)';
                  e.currentTarget.style.transform = 'none';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                {/* Identity band */}
                <div style={{
                  height: 78, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '0 16px', position: 'relative',
                  background: `linear-gradient(135deg, ${id.from}, ${id.to})`,
                }}>
                  <div style={{
                    width: 42, height: 42, borderRadius: 12, display: 'flex', alignItems: 'center',
                    justifyContent: 'center', fontSize: 22, background: 'rgba(0,0,0,0.18)',
                  }}>
                    {id.icon}
                  </div>
                  <span style={{
                    padding: '3px 9px', borderRadius: 999, fontSize: 9, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.5px',
                    background: 'rgba(0,0,0,0.22)', color: '#fff',
                  }}>
                    {p.source === 'curated' ? 'Curated' : 'Community'}
                  </span>
                </div>

                <div style={{ padding: 16, display: 'flex', flexDirection: 'column', flex: 1 }}>
                  {/* Level + subject pills */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, flexWrap: 'wrap' as const }}>
                    <span style={{ padding: '2px 8px', borderRadius: 999, fontSize: 9, fontWeight: 600, textTransform: 'uppercase' as const, color: lc.color, background: lc.bg }}>
                      {p.level}
                    </span>
                    {p.subject && (
                      <span style={{ padding: '2px 8px', borderRadius: 999, fontSize: 9, fontWeight: 500, color: '#a6adc8', background: 'rgba(49,34,68,0.5)' }}>
                        {p.subject}
                      </span>
                    )}
                  </div>

                  {/* Title */}
                  <div style={{ fontSize: 15, fontWeight: 600, color: '#fff', marginBottom: 8, lineHeight: 1.3 }}>
                    {p.title}
                  </div>

                  {/* Description */}
                  <div style={{ fontSize: 12, color: '#a6adc8', lineHeight: 1.6, marginBottom: 12, flex: 1 }}>
                    {p.description?.slice(0, 100)}{(p.description?.length || 0) > 100 ? '...' : ''}
                  </div>

                  {/* Footer stats */}
                  <div style={{ display: 'flex', gap: 14, fontSize: 11, color: '#6c7086', borderTop: '1px solid rgba(168,85,247,0.12)', paddingTop: 10, marginTop: 'auto' }}>
                    {p.estimated_hours && <span>\u23f1 {p.estimated_hours}h</span>}
                    <span>\ud83d\udc65 {p.fork_count}</span>
                    {avgRating && <span style={{ color: '#fbbf24' }}>\u2605 {avgRating}</span>}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Unified Library (Courses / Assets / Documents) ─────────────────────
//
// Mirrors the extension's v0.48.4 Library restructure. Tabs:
//   - Courses: embeds the existing LearningLibraryPage (no
//     duplication — same component, same data).
//   - Assets: images and media creative_assets (was the entire page
//     before this restructure).
//   - Documents: filters to document + spreadsheet asset types, with
//     a "+ New document" action that routes users to Creative Studio
//     for the full blank-or-template picker (porting that modal to
//     the IDE is a separate pass).
//
// The 'learning-library' page id and LearningLibraryPage export stay
// available so deep links keep working, but the sidebar no longer
// exposes a separate entry — both surfaces are reached via Library.
export function LibraryPage() {
  useLocale();
  // Default tab is Courses — Library is a learning-first surface; the
  // curated material (courses + papers) is what makes it valuable.
  const [tab, setTab] = useState<'courses' | 'papers' | 'assets' | 'documents'>('courses');

  const tabBtnStyle = (active: boolean): React.CSSProperties => ({
    padding: '8px 16px', borderRadius: 0, border: 'none', cursor: 'pointer',
    fontSize: 12, fontWeight: active ? 600 : 500,
    background: 'transparent',
    color: active ? '#c084fc' : '#6c7086',
    borderBottom: active ? '2px solid #a855f7' : '2px solid transparent',
    marginBottom: -1,
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{
        padding: '20px 32px 0', flexShrink: 0,
        borderBottom: '1px solid rgba(168, 85, 247, 0.12)',
        background: 'rgba(12, 8, 20, 0.4)',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, marginBottom: 0 }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: '#cdd6f4', margin: 0, marginBottom: 2 }}>Library</h1>
            <p style={{ fontSize: 12, color: '#9b8caa', margin: 0, marginBottom: 16 }}>
              Your courses, papers, assets, and documents — everything Ava has made for you.
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 2 }}>
          <button onClick={() => setTab('courses')} style={tabBtnStyle(tab === 'courses')}>Courses</button>
          <button onClick={() => setTab('papers')} style={tabBtnStyle(tab === 'papers')}>Papers</button>
          <button onClick={() => setTab('assets')} style={tabBtnStyle(tab === 'assets')}>Assets</button>
          <button onClick={() => setTab('documents')} style={tabBtnStyle(tab === 'documents')}>Documents</button>
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        {tab === 'courses' && <LearningLibraryPage />}
        {tab === 'papers' && <LibraryPapersPage />}
        {tab === 'assets' && <LibraryAssetsView kind="assets" />}
        {tab === 'documents' && <LibraryAssetsView kind="documents" />}
      </div>
    </div>
  );
}

// ── Library assets/documents grid — shared by the Assets and Documents
// tabs. `kind='assets'` filters to images + media; `kind='documents'`
// filters to document + spreadsheet and exposes a "+ New document"
// shortcut to Creative Studio's creation picker.
function LibraryAssetsView({ kind }: { kind: 'assets' | 'documents' }) {
  useLocale();
  const [, setAuthKey] = useState(0);
  useEffect(() => {
    const handler = () => { if (!checkConnected()) { setCloudFiles([]); setSelectedFile(null); } setAuthKey(k => k + 1); };
    window.addEventListener('ava-auth-changed', handler);
    return () => window.removeEventListener('ava-auth-changed', handler);
  }, []);
  const connected = checkConnected();
  const [cloudFiles, setCloudFiles] = useState<LibraryFile[]>([]);
  const [localFiles, setLocalFiles] = useState<LibraryFile[]>([]);
  const [loading, setLoading] = useState(true);
  // Source filter — an independent control on this page, driven by the
  // source tabs below. It is NOT derived from any global toggle: cloud
  // sync governs whether data is backed up, never what the Library
  // shows. Defaults to "All" — the merged local + cloud view.
  const [sourceFilter, setSourceFilter] = useState<'all' | 'cloud' | 'local'>('all');
  // Filter axis is the real media kind, not the coalesced LibraryFileType,
  // so the user can isolate just music / video / voice within the Assets
  // tab — previously they all collapsed under Images.
  const [filter, setFilter] = useState<LibraryMediaKind | 'all'>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedFile, setSelectedFile] = useState<LibraryFile | null>(null);

  // Watch projectFolder — re-scan when the user opens a different project.
  // App.tsx persists the folder in localStorage['projectFolder'] and emits
  // 'ava-folder-changed' on change.
  const [projectFolder, setProjectFolder] = useState<string | null>(() => {
    try { return (localStorage.getItem('projectFolder') as string | null) || null; } catch { return null; }
  });
  useEffect(() => {
    const handler = (e: Event) => setProjectFolder(((e as CustomEvent).detail as string) || null);
    window.addEventListener('ava-folder-changed', handler);
    return () => window.removeEventListener('ava-folder-changed', handler);
  }, []);

  // Fetch files from the platform's creative_assets table — this is the
  // same endpoint the VS Code extension uses. Previously the IDE pointed
  // at `/library` which doesn't exist on the server (404 silently
  // handled as empty list), so this page has been showing no cloud
  // results for anyone. Switched to /creative-assets and wired the
  // response shape accordingly.
  useEffect(() => {
    if (!connected) { setLoading(false); return; }
    setLoading(true);
    apiFetch('/creative-assets')
      .then((data: unknown) => {
        const d = data as { assets?: unknown[] } | undefined;
        const items = Array.isArray(d?.assets) ? d!.assets : [];
        setCloudFiles(items.map((f: any) => {
          const rawKind = String(f.asset_type || f.type || 'image').toLowerCase();
          // Filter axis (LibraryFileType) collapses every media kind to
          // 'image' so the existing All / Images / Documents tab split
          // keeps working unchanged.
          const libraryType: LibraryFileType =
            rawKind === 'spreadsheet' ? 'spreadsheet' :
            rawKind === 'document' ? 'document' :
            'image';
          // mediaKind preserves the real asset_type so the thumbnail can
          // pick the right element. Without this, music / voice / video
          // rows all rendered as <img src="mp3 URL"> which the webview
          // shows as a broken-image glyph.
          const mediaKind: LibraryMediaKind =
            rawKind === 'music' || rawKind === 'voice' || rawKind === 'video' ||
            rawKind === 'image' || rawKind === 'document' ||
            rawKind === 'spreadsheet' || rawKind === 'presentation'
              ? (rawKind as LibraryMediaKind)
              : 'image';
          return {
            id: f.id,
            name: f.title || 'Untitled',
            path: f.url || '',
            folder: f.source || 'Creative Studio',
            type: libraryType,
            mediaKind,
            size: 0,  // creative_assets schema doesn't carry size
            modified: f.created_at || '',
            url: f.url || f.thumbnail_url || '',
            prompt: f.prompt || '',
            source: 'cloud',
          };
        }));
      })
      .catch(() => setCloudFiles([]))
      .finally(() => setLoading(false));
  }, [connected]);

  // Local scan — independent of connection state (local files exist
  // whether or not the user is signed in). Re-runs whenever the
  // project folder changes.
  useEffect(() => {
    let cancelled = false;
    if (!projectFolder) { setLocalFiles([]); return; }
    scanLocalLibrary(projectFolder).then((rows) => {
      if (!cancelled) setLocalFiles(rows);
    });
    return () => { cancelled = true; };
  }, [projectFolder]);

  // detectFileType() used to derive a LibraryFileType from a filename
  // for the legacy /library endpoint. The creative-assets endpoint
  // carries asset_type on the row so extension-based detection is no
  // longer needed here. FILE_TYPE_EXTENSIONS is still referenced via
  // the filter tabs below — keeping the map, dropping the helper.

  // Merge cloud + local per the source filter, then split by kind so
  // the Assets tab only sees visual media (image/presentation) and
  // Documents only sees textual files (document/spreadsheet). The
  // type-specific filter tabs below are scoped to the kinds that
  // actually appear in the current view — no empty "0" pills.
  const kindFiles = useMemo(() => {
    const src: LibraryFile[] =
      sourceFilter === 'cloud' ? cloudFiles :
      sourceFilter === 'local' ? localFiles :
      [...cloudFiles, ...localFiles];
    return src.filter((f) =>
      kind === 'assets'
        ? (f.type === 'image' || f.type === 'presentation')
        : (f.type === 'document' || f.type === 'spreadsheet')
    );
  }, [cloudFiles, localFiles, sourceFilter, kind]);
  const filtered = filter === 'all' ? kindFiles : kindFiles.filter((f) => classifyMediaKind(f) === filter);

  const typeCounts = useMemo(() => {
    const byKind = (k: LibraryMediaKind) => kindFiles.filter((f) => classifyMediaKind(f) === k).length;
    return {
      all: kindFiles.length,
      image:        byKind('image'),
      music:        byKind('music'),
      voice:        byKind('voice'),
      video:        byKind('video'),
      document:     byKind('document'),
      spreadsheet:  byKind('spreadsheet'),
      presentation: byKind('presentation'),
    };
  }, [kindFiles]);

  // Source filter counts use the kind-filtered, NOT source-filtered view
  // so the numbers stay honest when the user is on one source and wants
  // to see how many the other one has. Derived independently to avoid
  // circular filter state.
  const kindAll = useMemo(() => {
    const all = [...cloudFiles, ...localFiles];
    return all.filter((f) =>
      kind === 'assets'
        ? (f.type === 'image' || f.type === 'presentation')
        : (f.type === 'document' || f.type === 'spreadsheet')
    );
  }, [cloudFiles, localFiles, kind]);
  const sourceCounts = useMemo(() => ({
    all: kindAll.length,
    cloud: kindAll.filter((f) => f.source === 'cloud').length,
    local: kindAll.filter((f) => f.source === 'local').length,
  }), [kindAll]);

  // Kind-scoped filter tabs. Assets shows every media kind we actually
  // store (image / music / voice / video / slides). Documents shows the
  // office kinds. "All" stays in both so users can clear any sub-filter
  // without swapping tabs. Empty tabs are deliberately KEPT visible so
  // operators always see what categories exist — a "Voice 0" tab tells
  // you the kind is supported and just hasn't been used yet, vs a
  // missing tab which reads as "this kind isn't a thing here."
  // Falls back to a literal label when the i18n string is missing — this
  // is what was rendering raw `dash.library.slides` before.
  const localised = (key: string, fallback: string) => {
    const out = t(key);
    return !out || out === key ? fallback : out;
  };
  const filterOptions = useMemo(() => {
    const base: { id: LibraryMediaKind | 'all'; label: string; count: number }[] = [
      { id: 'all', label: localised('dash.library.all', 'All'), count: typeCounts.all },
    ];
    if (kind === 'assets') {
      base.push(
        { id: 'image',        label: localised('dash.library.images', 'Images'),       count: typeCounts.image },
        { id: 'music',        label: localised('dash.library.music',  'Music'),        count: typeCounts.music },
        { id: 'voice',        label: localised('dash.library.voice',  'Voice'),        count: typeCounts.voice },
        { id: 'video',        label: localised('dash.library.video',  'Video'),        count: typeCounts.video },
        { id: 'presentation', label: localised('dash.library.slides', 'Slides'),       count: typeCounts.presentation },
      );
    } else {
      base.push(
        { id: 'document',     label: localised('dash.library.docs',   'Documents'),    count: typeCounts.document },
        { id: 'spreadsheet',  label: localised('dash.library.sheets', 'Spreadsheets'), count: typeCounts.spreadsheet },
      );
    }
    return base;
  }, [kind, typeCounts]);

  const [newDocOpen, setNewDocOpen] = useState(false);
  // Always open the inline modal — matches the extension's Library +
  // New document flow. The modal handles missing project folder by
  // prompting for a save location via Tauri's save dialog, instead of
  // bouncing the user out to Creative Studio.
  const handleNewDocument = () => setNewDocOpen(true);

  const refreshLocalFiles = () => {
    if (!projectFolder) return;
    scanLocalLibrary(projectFolder).then(setLocalFiles);
  };

  return (
    <div style={{ ...pageWrapper, display: 'flex', flexDirection: 'column', gap: 0, padding: 0, height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '16px 32px 0', flexShrink: 0 }}>
        {/* Source filter — separate row so the two axes (where it lives
            vs what kind of file it is) read as distinct. Labels kept to
            single words so the row stays compact. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, color: '#6c7086', fontWeight: 500 }}>Source</span>
          {([
            { id: 'all', label: 'All', count: sourceCounts.all },
            { id: 'cloud', label: 'Cloud', count: sourceCounts.cloud },
            { id: 'local', label: 'Local', count: sourceCounts.local },
          ] as const).map((s) => (
            <button
              key={s.id}
              onClick={() => setSourceFilter(s.id)}
              style={{
                padding: '4px 10px', borderRadius: 8, border: 'none', cursor: 'pointer',
                fontSize: 11, fontWeight: sourceFilter === s.id ? 600 : 400,
                background: sourceFilter === s.id ? 'rgba(168,85,247,0.2)' : 'transparent',
                color: sourceFilter === s.id ? '#e0b0ff' : '#6c7086',
                display: 'flex', alignItems: 'center', gap: 6,
              }}
            >
              {s.label}
              <span style={{
                fontSize: 9, padding: '1px 5px', borderRadius: 8,
                background: sourceFilter === s.id ? 'rgba(168,85,247,0.3)' : 'rgba(49, 34, 68, 0.5)',
                color: sourceFilter === s.id ? '#fff' : '#6c7086',
              }}>{s.count}</span>
            </button>
          ))}
          {!projectFolder && (
            <span style={{ fontSize: 10, color: '#6c7086', fontStyle: 'italic' }}>
              Open a folder to see local files
            </span>
          )}
        </div>

        {/* Type filter + view toggle */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {kind === 'documents' && (
              <button
                onClick={handleNewDocument}
                style={{
                  padding: '6px 14px', borderRadius: 8, border: '1px solid rgba(168,85,247,0.35)',
                  cursor: 'pointer', fontSize: 12, fontWeight: 600,
                  background: 'rgba(168,85,247,0.15)', color: '#e0b0ff',
                  display: 'flex', alignItems: 'center', gap: 6, marginRight: 6,
                }}
              >
                + New document
              </button>
            )}
            {filterOptions.map((tab) => (
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
            <div style={{ marginBottom: 12, color: '#a855f7', display: 'flex', justifyContent: 'center' }}>{filter === 'all' ? <PhFolder size={48} weight="duotone" /> : <MediaKindIcon kind={filter} size={48} weight="duotone" />}</div>
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
              const kind = classifyMediaKind(file);
              const colors = MEDIA_KIND_COLORS[kind];
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
                  {/* Thumbnail area — pick the right element per real
                      media kind. Music / voice / video have no <img>
                      representation, so they get an icon instead of the
                      broken-image glyph the row was rendering before. */}
                  <div style={{
                    height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: colors.bg, position: 'relative',
                  }}>
                    {(() => {
                      if (kind === 'image' && file.url) {
                        return <img src={file.url} alt={file.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />;
                      }
                      if (kind === 'video' && file.url) {
                        return <video src={file.url} muted preload="metadata" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />;
                      }
                      return <span style={{ color: colors.text, opacity: 0.95 }}><MediaKindIcon kind={kind} size={52} weight="duotone" /></span>;
                    })()}
                    {/* Type badge — labelled and coloured by real media kind
                        so MP3 rows read MUSIC, not IMAGE. */}
                    <span style={{
                      position: 'absolute', top: 8, right: 8, fontSize: 9, fontWeight: 600,
                      padding: '2px 8px', borderRadius: 6, background: 'rgba(0,0,0,0.6)',
                      color: colors.text, textTransform: 'uppercase', letterSpacing: 0.5,
                    }}>{kind}</span>
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
              const kind = classifyMediaKind(file);
              const colors = MEDIA_KIND_COLORS[kind];
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
                  {/* Icon — kind-specific so music/voice/video each get their
                      own glyph instead of every row showing the image icon. */}
                  <div style={{
                    width: 36, height: 36, borderRadius: 8, flexShrink: 0,
                    background: colors.bg, border: `1px solid ${colors.border}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: colors.text,
                  }}><MediaKindIcon kind={kind} size={20} weight="duotone" /></div>
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
                  }}>{kind}</span>
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

      {/* Full-screen preview modal — context-aware actions per source
          and kind. Matches the extension's v0.48.4 Library modal.
          - Cloud:  Download (silent host-fetch to $DOWNLOAD), Copy URL,
                    Delete (platform API).
          - Local:  Open (plugin-opener — uses default app, LibreOffice
                    picks up office docs), Reveal (opener in parent
                    folder), Download (copies into $DOWNLOAD), Delete
                    (fs.remove). */}
      {selectedFile && (
        <LibraryPreviewModal
          file={selectedFile}
          projectFolder={projectFolder}
          onClose={() => setSelectedFile(null)}
          onDeleted={(id, src) => {
            if (src === 'cloud') setCloudFiles(prev => prev.filter(f => f.id !== id));
            else setLocalFiles(prev => prev.filter(f => f.path !== id));
          }}
        />
      )}

      {newDocOpen && (
        <NewDocumentModal
          projectFolder={projectFolder}
          onClose={() => setNewDocOpen(false)}
          onCreated={() => { setNewDocOpen(false); refreshLocalFiles(); }}
        />
      )}
    </div>
  );
}

// ── Library preview modal + media player ───────────────────────────────
//
// Full-screen overlay shown when a grid tile is clicked. Matches the
// extension's v0.48.4 Library UX:
//   - Cloud items: inline image/video/audio playback via the storage
//     URL; actions = Download (host-fetch, silent), Copy URL, Delete.
//   - Local items: icon placeholder (inline preview of local files
//     would need the Tauri asset protocol + Rust rebuild — out of
//     scope for this port); actions = Open (system default app,
//     LibreOffice for office docs), Reveal in explorer, Download
//     (copy to $DOWNLOAD), Delete.
// onDeleted reports (id, source) so the caller can drop it from the
// right state slice — local rows key on `path`, cloud rows on `id`.

function LibraryPreviewModal({
  file,
  projectFolder,
  onClose,
  onDeleted,
}: {
  file: LibraryFile;
  projectFolder: string | null;
  onClose: () => void;
  onDeleted: (id: string, source: 'cloud' | 'local') => void;
}) {
  useLocale();
  const [copied, setCopied] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState<null | 'download' | 'delete' | 'open' | 'reveal'>(null);
  const [toast, setToast] = useState<string | null>(null);

  const isCloud = file.source === 'cloud';
  const mediaKind = classifyMediaKind(file);
  const isImage = mediaKind === 'image';
  const isVideo = mediaKind === 'video';
  const isAudio = mediaKind === 'music' || mediaKind === 'voice';
  const isOfficeDoc = mediaKind === 'document' || mediaKind === 'spreadsheet' || mediaKind === 'presentation';

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  const resolveLocalAbsPath = async (): Promise<string | null> => {
    if (isCloud || !projectFolder) return null;
    try {
      const { join } = await import('@tauri-apps/api/path');
      return await join(projectFolder, file.path);
    } catch { return null; }
  };

  const deriveFilename = (): string => {
    if (isCloud && file.url) {
      try {
        const last = new URL(file.url).pathname.split('/').pop();
        if (last && last.includes('.')) return last;
      } catch { /* fall through */ }
    }
    return file.name || 'download';
  };

  const handleOpen = async () => {
    const abs = await resolveLocalAbsPath();
    if (!abs) return;
    setBusy('open');
    try {
      const { openPath } = await import('@tauri-apps/plugin-opener');
      await openPath(abs);
      onClose();
    } catch (err) {
      showToast(`Open failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally { setBusy(null); }
  };

  const handleReveal = async () => {
    const abs = await resolveLocalAbsPath();
    if (!abs) return;
    setBusy('reveal');
    try {
      const { revealItemInDir } = await import('@tauri-apps/plugin-opener');
      await revealItemInDir(abs);
      onClose();
    } catch (err) {
      showToast(`Reveal failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally { setBusy(null); }
  };

  const handleDownload = async () => {
    setBusy('download');
    try {
      const [{ downloadDir, join }, fsPlugin] = await Promise.all([
        import('@tauri-apps/api/path'),
        import('@tauri-apps/plugin-fs'),
      ]);
      const safeName = deriveFilename()
        .replace(/[\\/]/g, '_')
        .replace(/[^a-zA-Z0-9._ -]/g, '_')
        .slice(0, 200) || 'download';
      const dir = await downloadDir();
      const destPath = await join(dir, safeName);

      let buf: Uint8Array;
      if (isCloud) {
        if (!file.url) throw new Error('No cloud URL on this asset.');
        const res = await fetch(file.url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        buf = new Uint8Array(await res.arrayBuffer());
      } else {
        const abs = await resolveLocalAbsPath();
        if (!abs) throw new Error('Could not resolve local path.');
        buf = await fsPlugin.readFile(abs);
      }
      await fsPlugin.writeFile(destPath, buf);
      showToast(`Downloaded: ${safeName}`);
    } catch (err) {
      showToast(`Download failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally { setBusy(null); }
  };

  const handleDelete = async () => {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    setBusy('delete');
    try {
      if (isCloud) {
        if (!file.id) { showToast('Cloud asset has no id.'); return; }
        await apiFetch(`/creative-assets/${encodeURIComponent(file.id)}`, { method: 'DELETE' });
        onDeleted(file.id, 'cloud');
      } else {
        const abs = await resolveLocalAbsPath();
        if (!abs) { showToast('Could not resolve local path.'); return; }
        // Note: local fs deletes under the project folder currently need
        // a capability extension; today the user's project folder is not
        // in the write allowlist. When that lands, the call below starts
        // working without code changes.
        const { remove } = await import('@tauri-apps/plugin-fs');
        await remove(abs);
        onDeleted(file.path, 'local');
      }
      onClose();
    } catch (err) {
      showToast(`Delete failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally { setBusy(null); }
  };

  const handleCopy = async () => {
    if (!isCloud || !file.url) return;
    try {
      await navigator.clipboard.writeText(file.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { showToast('Clipboard unavailable.'); }
  };

  const actionBtn = (
    label: string,
    onClick: () => void,
    opts: { primary?: boolean; danger?: boolean; disabled?: boolean } = {},
  ): React.ReactElement => (
    <button
      onClick={onClick}
      disabled={opts.disabled || busy !== null}
      style={{
        padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: opts.primary ? 600 : 500,
        cursor: (opts.disabled || busy) ? 'default' : 'pointer', flexShrink: 0,
        background: opts.primary
          ? 'linear-gradient(135deg, #a855f7, #7c3aed)'
          : opts.danger
            ? (confirmDelete ? 'rgba(239, 68, 68, 0.15)' : 'transparent')
            : 'transparent',
        color: opts.primary ? '#fff' : opts.danger ? (confirmDelete ? '#fca5a5' : '#9b8caa') : '#cdd6f4',
        border: opts.primary
          ? 'none'
          : opts.danger
            ? `1px solid ${confirmDelete ? 'rgba(239, 68, 68, 0.6)' : 'rgba(168, 85, 247, 0.2)'}`
            : '1px solid rgba(168, 85, 247, 0.25)',
        opacity: (opts.disabled || busy) ? 0.6 : 1,
      }}
    >
      {label}
    </button>
  );

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 50,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(4px)', padding: 24,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          position: 'relative', width: '100%', maxWidth: 720, maxHeight: '90vh', overflowY: 'auto',
          borderRadius: 16, border: '1px solid rgba(168, 85, 247, 0.2)',
          background: '#1a1028', boxShadow: '0 24px 60px rgba(0,0,0,0.6)',
        }}
      >
        <button
          onClick={onClose}
          aria-label="Close preview"
          style={{
            position: 'absolute', top: 12, right: 12, zIndex: 10,
            width: 32, height: 32, borderRadius: 16,
            background: 'rgba(0,0,0,0.35)', color: '#fff', border: 'none', cursor: 'pointer',
            fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >×</button>

        {/* Preview area */}
        {isImage && isCloud && file.url ? (
          <img src={file.url} alt={file.name} style={{ width: '100%', maxHeight: '50vh', objectFit: 'contain', background: 'rgba(0,0,0,0.25)', borderTopLeftRadius: 16, borderTopRightRadius: 16 }} />
        ) : isVideo && isCloud && file.url ? (
          <LibraryMediaPlayer src={file.url} kind="video" />
        ) : isAudio && isCloud && file.url ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, padding: '40px 20px', background: 'rgba(0,0,0,0.25)' }}>
            <span style={{ fontSize: 48, opacity: 0.6 }}>{'🎵'}</span>
            <div style={{ width: 'min(92%, 480px)' }}>
              <LibraryMediaPlayer src={file.url} kind="audio" />
            </div>
          </div>
        ) : (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            gap: 10, padding: '56px 20px', background: 'rgba(0,0,0,0.25)',
            borderTopLeftRadius: 16, borderTopRightRadius: 16,
          }}>
            {(() => {
              const Icon = FILE_TYPE_PH[file.type];
              return <span style={{ color: '#a855f7' }}><Icon size={72} weight="duotone" /></span>;
            })()}
            {!isCloud && (
              <p style={{ fontSize: 11, color: '#6c7086', margin: 0 }}>
                Inline preview unavailable for local files — use Open to view in your default app.
              </p>
            )}
          </div>
        )}

        {/* Meta + actions */}
        <div style={{ padding: 20 }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, color: '#cdd6f4', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {file.name}
          </h3>
          <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', fontSize: 11 }}>
            <span style={{
              padding: '2px 8px', borderRadius: 4, fontWeight: 500,
              background: isCloud ? 'rgba(168,85,247,0.15)' : 'rgba(108,112,134,0.15)',
              color: isCloud ? '#c084fc' : '#9b8caa',
            }}>
              {isCloud ? '☁ cloud' : '💾 local'}
            </span>
            <span style={{ padding: '2px 8px', borderRadius: 4, fontWeight: 500, background: 'rgba(168,85,247,0.08)', color: '#a6adc8' }}>
              {mediaKind}
            </span>
            {file.modified && (
              <span style={{ color: '#6c7086' }}>
                {new Date(file.modified).toLocaleString()}
              </span>
            )}
            {file.size > 0 && <span style={{ color: '#6c7086' }}>{formatFileSize(file.size)}</span>}
          </div>
          {file.prompt && (
            <p style={{ marginTop: 12, fontSize: 12, color: '#a6adc8', lineHeight: 1.5, fontStyle: 'italic' }}>
              "{file.prompt}"
            </p>
          )}

          <div style={{ marginTop: 20, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {!isCloud && actionBtn(
              busy === 'open' ? 'Opening…' : (isOfficeDoc ? 'Open (LibreOffice)' : 'Open'),
              handleOpen,
              { primary: true, disabled: !projectFolder },
            )}
            {!isCloud && actionBtn(busy === 'reveal' ? 'Revealing…' : 'Reveal', handleReveal, { disabled: !projectFolder })}
            {actionBtn(
              busy === 'download' ? 'Downloading…' : 'Download',
              handleDownload,
              { primary: isCloud, disabled: isCloud && !file.url },
            )}
            {isCloud && file.url && actionBtn(copied ? 'Copied ✓' : 'Copy URL', handleCopy)}
            <div style={{ flex: 1 }} />
            {actionBtn(
              busy === 'delete' ? 'Deleting…' : (confirmDelete ? 'Confirm delete' : 'Delete'),
              handleDelete,
              { danger: true, disabled: isCloud && !file.id },
            )}
          </div>
        </div>

        {toast && (
          <div style={{
            position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)',
            padding: '8px 16px', borderRadius: 8,
            background: 'rgba(26, 16, 40, 0.95)', border: '1px solid rgba(168,85,247,0.3)',
            color: '#cdd6f4', fontSize: 12, fontWeight: 500,
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          }}>
            {toast}
          </div>
        )}
      </div>
    </div>
  );
}

// Minimal audio/video player styled to the IDE purple palette. Native
// browser controls look out of place against the dashboard — custom
// play/scrub/time bar matches Creative Studio's existing players.
function formatClockTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function LibraryMediaPlayer({ src, kind }: { src: string; kind: 'audio' | 'video' }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);

  const el = (): HTMLMediaElement | null => (kind === 'audio' ? audioRef.current : videoRef.current);

  useEffect(() => {
    const m = el();
    if (!m) return;
    const onTime = () => setCurrent(m.currentTime);
    const onMeta = () => setDuration(m.duration || 0);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onEnded = () => setPlaying(false);
    m.addEventListener('timeupdate', onTime);
    m.addEventListener('loadedmetadata', onMeta);
    m.addEventListener('durationchange', onMeta);
    m.addEventListener('play', onPlay);
    m.addEventListener('pause', onPause);
    m.addEventListener('ended', onEnded);
    return () => {
      m.removeEventListener('timeupdate', onTime);
      m.removeEventListener('loadedmetadata', onMeta);
      m.removeEventListener('durationchange', onMeta);
      m.removeEventListener('play', onPlay);
      m.removeEventListener('pause', onPause);
      m.removeEventListener('ended', onEnded);
    };
  }, [kind]);

  const toggle = () => {
    const m = el();
    if (!m) return;
    if (playing) m.pause(); else void m.play();
  };

  const scrubTo = (clientX: number) => {
    const track = trackRef.current;
    const m = el();
    if (!track || !m || !duration) return;
    const rect = track.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    m.currentTime = pct * duration;
  };

  const playedPct = duration > 0 ? (current / duration) * 100 : 0;

  return (
    <div style={{
      position: 'relative', width: '100%', borderRadius: 8, overflow: 'hidden',
      background: kind === 'video' ? '#000' : 'rgba(26, 16, 40, 0.6)',
      border: kind === 'video' ? 'none' : '1px solid rgba(168, 85, 247, 0.2)',
    }}>
      {kind === 'video' ? (
        <video
          ref={videoRef} src={src} preload="metadata" onClick={toggle}
          style={{ width: '100%', maxHeight: '60vh', display: 'block', cursor: 'pointer' }}
        />
      ) : (
        <audio ref={audioRef} src={src} preload="metadata" style={{ display: 'none' }} />
      )}

      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '10px 12px', fontSize: 11, color: '#cdd6f4',
        ...(kind === 'video' ? {
          position: 'absolute', left: 0, right: 0, bottom: 0,
          background: 'linear-gradient(to top, rgba(0,0,0,0.8), transparent)',
        } : {}),
      }}>
        <button
          onClick={toggle}
          aria-label={playing ? 'Pause' : 'Play'}
          style={{
            flexShrink: 0, width: 30, height: 30, borderRadius: 15,
            background: '#a855f7', color: '#fff', border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          {playing ? (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.14v13.72c0 .78.86 1.25 1.52.83l10.76-6.86a1 1 0 000-1.66L9.52 4.31C8.86 3.89 8 4.36 8 5.14z"/></svg>
          )}
        </button>
        <span style={{ fontFamily: 'monospace', fontSize: 10, opacity: 0.7, minWidth: 34, textAlign: 'right' }}>{formatClockTime(current)}</span>
        <div
          ref={trackRef}
          onClick={e => scrubTo(e.clientX)}
          style={{
            position: 'relative', flex: 1, height: 6, borderRadius: 3, cursor: 'pointer',
            background: kind === 'video' ? 'rgba(255,255,255,0.2)' : 'rgba(168, 85, 247, 0.15)',
          }}
        >
          <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: `${playedPct}%`, background: '#a855f7', borderRadius: 3 }} />
          <div style={{ position: 'absolute', top: '50%', left: `${playedPct}%`, width: 12, height: 12, borderRadius: 6, background: '#a855f7', transform: 'translate(-50%, -50%)', boxShadow: '0 2px 4px rgba(0,0,0,0.4)', pointerEvents: 'none' }} />
        </div>
        <span style={{ fontFamily: 'monospace', fontSize: 10, opacity: 0.7, minWidth: 34 }}>{formatClockTime(duration)}</span>
      </div>
    </div>
  );
}

// ── New document modal ─────────────────────────────────────────────────
//
// Mirrors the extension's Library > + New document flow. Writes to
// <projectFolder>/documents/<name>.<ext> when a project is open, or
// prompts via the Tauri save dialog when none is. After the write the
// file is launched via plugin-opener which hands off to the OS default
// app (LibreOffice / Word / Excel / Preview / etc.) — same end-state
// as opening a Library row.
//
// All five extension formats are supported now:
//   - md / txt / csv  : plain text written via writeTextFile
//   - docx           : built with the docx package (browser-friendly)
//   - xlsx           : built with exceljs
//   - pdf            : built with pdf-lib (replaces pdfkit which is Node-only)
type NewDocFormat = 'md' | 'txt' | 'csv' | 'docx' | 'xlsx' | 'pdf';
const NEW_DOC_BLANK_FORMATS: { id: NewDocFormat; label: string; ext: string }[] = [
  { id: 'docx', label: 'Word Document', ext: 'docx' },
  { id: 'xlsx', label: 'Spreadsheet',   ext: 'xlsx' },
  { id: 'pdf',  label: 'PDF',           ext: 'pdf'  },
  { id: 'md',   label: 'Markdown',      ext: 'md'   },
  { id: 'txt',  label: 'Text file',     ext: 'txt'  },
  { id: 'csv',  label: 'CSV',           ext: 'csv'  },
];

const NEW_DOC_TEMPLATES: { id: string; label: string; desc: string; filename: string; body: string }[] = [
  {
    id: 'proposal', label: 'Project Proposal', desc: 'Executive summary, objectives, timeline',
    filename: 'proposal.md',
    body: '# Project Proposal\n\n## Executive Summary\n\n\n## Objectives\n\n\n## Scope\n\n\n## Timeline\n\n| Phase | Deliverable | Date |\n|-------|-------------|------|\n|       |             |      |\n\n## Budget\n\n\n## Team\n\n',
  },
  {
    id: 'report', label: 'Status Report', desc: 'Progress, issues, next steps',
    filename: 'status-report.md',
    body: '# Status Report\n\n**Week of:** _\n\n## Progress\n\n- \n\n## Issues & blockers\n\n- \n\n## Next week\n\n- \n\n## Notes\n\n',
  },
  {
    id: 'invoice', label: 'Invoice', desc: 'Items table, payment terms',
    filename: 'invoice.md',
    body: '# Invoice\n\n**Invoice #:**\n**Date:**\n**Due:**\n\n**Bill to:**\n\n\n| Item | Qty | Rate | Total |\n|------|-----|------|-------|\n|      |     |      |       |\n\n**Subtotal:**\n**Tax:**\n**Total:**\n\n## Payment terms\n\nNet 30. Please remit within 30 days.\n',
  },
  {
    id: 'letter', label: 'Formal Letter', desc: 'Recipient, body, closing',
    filename: 'letter.md',
    body: '[Your name]\n[Your address]\n\n[Date]\n\n[Recipient name]\n[Recipient address]\n\nDear [Recipient],\n\n\n\nSincerely,\n[Your name]\n',
  },
  {
    id: 'meeting_notes', label: 'Meeting Notes', desc: 'Agenda, discussion, action items',
    filename: 'meeting-notes.md',
    body: '# Meeting Notes\n\n**Date:**\n**Attendees:**\n\n## Agenda\n\n1. \n\n## Discussion\n\n\n## Decisions\n\n- \n\n## Action items\n\n- [ ] \n',
  },
  {
    id: 'resume', label: 'Resume', desc: 'Contact, experience, education, skills',
    filename: 'resume.md',
    body: '# [Your name]\n\n_[Role] — [Location] — [Email] — [Phone]_\n\n## Summary\n\n\n## Experience\n\n### [Role], [Company]\n_[Start] – [End]_\n\n- \n\n## Education\n\n### [Degree], [Institution]\n_[Year]_\n\n## Skills\n\n',
  },
];

function NewDocumentModal({
  projectFolder,
  onClose,
  onCreated,
}: {
  projectFolder: string | null;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Build the file bytes for the requested format. md / txt / csv are
  // plain text; docx / xlsx / pdf are binary, built in the webview using
  // the same packages the extension uses (with pdf-lib subbed in for
  // pdfkit since pdfkit is Node-only).
  const buildFileBytes = async (
    fmt: NewDocFormat,
    body: string,
    titleHint: string,
  ): Promise<Uint8Array> => {
    if (fmt === 'md' || fmt === 'txt') {
      return new TextEncoder().encode(body);
    }
    if (fmt === 'csv') {
      return new TextEncoder().encode(body || 'column_a,column_b,column_c\n');
    }
    if (fmt === 'docx') {
      const { Document, Packer, Paragraph } = await import('docx');
      const paragraphs = (body || '').split(/\r?\n/).map(line => new Paragraph({ text: line }));
      const doc = new Document({
        sections: [{ children: paragraphs.length ? paragraphs : [new Paragraph({ text: '' })] }],
      });
      const blob = await Packer.toBlob(doc);
      return new Uint8Array(await blob.arrayBuffer());
    }
    if (fmt === 'xlsx') {
      const ExcelJS = (await import('exceljs')).default;
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Sheet1');
      // CSV body seeds the sheet so a "From template → invoice" path on
      // xlsx isn't a blank grid. Falls back to a single empty row.
      const rows = (body || '').split(/\r?\n/).filter(Boolean).map(r => r.split(','));
      if (rows.length) rows.forEach(r => ws.addRow(r));
      const buf = await wb.xlsx.writeBuffer();
      return new Uint8Array(buf as ArrayBuffer);
    }
    if (fmt === 'pdf') {
      const { PDFDocument, StandardFonts } = await import('pdf-lib');
      const pdf = await PDFDocument.create();
      const page = pdf.addPage();
      const font = await pdf.embedFont(StandardFonts.Helvetica);
      const { height } = page.getSize();
      let y = height - 50;
      page.drawText(titleHint || 'New document', { x: 50, y, font, size: 18 });
      y -= 28;
      for (const line of (body || '').split(/\r?\n/)) {
        if (y < 50) { y = height - 50; pdf.addPage(); }
        page.drawText(line.slice(0, 100), { x: 50, y, font, size: 11 });
        y -= 16;
      }
      return await pdf.save();
    }
    return new TextEncoder().encode(body);
  };

  const createAt = async (filename: string, fmt: NewDocFormat, body: string, titleHint: string) => {
    setBusy(true);
    setError(null);
    try {
      const [{ join }, fsPlugin, opener] = await Promise.all([
        import('@tauri-apps/api/path'),
        import('@tauri-apps/plugin-fs'),
        import('@tauri-apps/plugin-opener'),
      ]);
      const { mkdir, writeFile, writeTextFile, exists } = fsPlugin;

      // Resolve target directory: use <project>/documents when a project
      // is open, otherwise prompt via the save dialog so the user picks
      // a location instead of getting bounced out to Creative Studio.
      let targetAbs: string;
      if (projectFolder) {
        const dirAbs = await join(projectFolder, 'documents');
        await mkdir(dirAbs, { recursive: true } as never).catch(() => { /* exists */ });
        // Auto-suffix if the file exists so we never overwrite silently.
        let finalName = filename;
        let i = 1;
        while (await exists(await join(dirAbs, finalName))) {
          const dot = filename.lastIndexOf('.');
          finalName = dot >= 0
            ? `${filename.slice(0, dot)}-${i}${filename.slice(dot)}`
            : `${filename}-${i}`;
          i++;
        }
        targetAbs = await join(dirAbs, finalName);
      } else {
        const { save } = await import('@tauri-apps/plugin-dialog');
        const chosen = await save({
          defaultPath: filename,
          filters: [{ name: fmt.toUpperCase(), extensions: [fmt] }],
        });
        if (!chosen) { setBusy(false); return; }
        targetAbs = chosen;
      }

      const bytes = await buildFileBytes(fmt, body, titleHint);
      // Plain text via writeTextFile keeps line endings intact for the
      // user's platform; binary kinds go through writeFile which takes
      // a Uint8Array directly.
      if (fmt === 'md' || fmt === 'txt' || fmt === 'csv') {
        await writeTextFile(targetAbs, new TextDecoder().decode(bytes));
      } else {
        await writeFile(targetAbs, bytes);
      }

      // Hand the file to the OS — opens in LibreOffice / Word / Excel /
      // Preview / Reader / whatever the user has registered as default.
      // Mirrors the Library row "open" action at line 8198.
      try { await opener.openPath(targetAbs); } catch { /* file written, just couldn't auto-open */ }

      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const createBlank = (fmt: typeof NEW_DOC_BLANK_FORMATS[number]) => {
    const stamp = new Date().toISOString().slice(0, 10);
    const body = fmt.id === 'csv' ? 'column_a,column_b,column_c\n' :
                 fmt.id === 'md'  ? '# New document\n\n' : '';
    void createAt(`untitled-${stamp}.${fmt.ext}`, fmt.id, body, `Untitled — ${stamp}`);
  };

  const createTemplate = (tmpl: typeof NEW_DOC_TEMPLATES[number]) => {
    // Templates are markdown-prose; written as .md regardless of the
    // blank-format selection.
    void createAt(tmpl.filename, 'md', tmpl.body, tmpl.label);
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 50,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(4px)', padding: 24,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          position: 'relative', width: '100%', maxWidth: 600, maxHeight: '90vh', overflowY: 'auto',
          borderRadius: 16, border: '1px solid rgba(168, 85, 247, 0.2)',
          background: '#1a1028', boxShadow: '0 24px 60px rgba(0,0,0,0.6)', padding: 24,
        }}
      >
        <button
          onClick={onClose}
          aria-label="Close"
          style={{
            position: 'absolute', top: 12, right: 12,
            width: 32, height: 32, borderRadius: 16, background: 'rgba(0,0,0,0.2)',
            color: '#cdd6f4', border: 'none', cursor: 'pointer', fontSize: 18,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >×</button>

        <h2 style={{ fontSize: 16, fontWeight: 600, color: '#cdd6f4', margin: 0 }}>New document</h2>
        <p style={{ fontSize: 12, color: '#6c7086', marginTop: 4, marginBottom: 20 }}>
          {projectFolder ? (
            <>Saves to <code style={{ fontFamily: 'monospace', fontSize: 11, padding: '1px 5px', borderRadius: 4, background: 'rgba(168,85,247,0.1)' }}>documents/</code> in your project, then opens in your default app.</>
          ) : (
            <>You'll be asked where to save the file, then it opens in your default app.</>
          )}
        </p>

        <h3 style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, color: '#6c7086', fontWeight: 500, marginBottom: 10 }}>Blank file</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 24 }}>
          {NEW_DOC_BLANK_FORMATS.map(f => (
            <button
              key={f.id}
              onClick={() => createBlank(f)}
              disabled={busy}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                padding: '14px 10px', borderRadius: 10,
                border: '1px solid rgba(168, 85, 247, 0.2)',
                background: 'rgba(26, 16, 40, 0.6)', cursor: busy ? 'default' : 'pointer',
                opacity: busy ? 0.5 : 1,
              }}
            >
              <span style={{ fontSize: 22 }}>📄</span>
              <span style={{ fontSize: 11, fontWeight: 500, color: '#cdd6f4' }}>{f.label}</span>
              <span style={{ fontSize: 9, color: '#6c7086' }}>.{f.ext}</span>
            </button>
          ))}
        </div>

        <h3 style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, color: '#6c7086', fontWeight: 500, marginBottom: 10 }}>From template</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
          {NEW_DOC_TEMPLATES.map(tmpl => (
            <button
              key={tmpl.id}
              onClick={() => createTemplate(tmpl)}
              disabled={busy}
              style={{
                display: 'flex', flexDirection: 'column', gap: 2, padding: '12px 14px', textAlign: 'left',
                borderRadius: 10, border: '1px solid rgba(168, 85, 247, 0.2)',
                background: 'rgba(26, 16, 40, 0.6)', cursor: busy ? 'default' : 'pointer',
                opacity: busy ? 0.5 : 1,
              }}
            >
              <span style={{ fontSize: 11, fontWeight: 500, color: '#cdd6f4' }}>{tmpl.label}</span>
              <span style={{ fontSize: 10, color: '#6c7086', lineHeight: 1.4 }}>{tmpl.desc}</span>
            </button>
          ))}
        </div>

        {error && (
          <div style={{
            marginTop: 16, padding: 10, borderRadius: 8,
            background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)',
            fontSize: 11, color: '#fca5a5',
          }}>
            {error}
          </div>
        )}
      </div>
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
    // Cloud sync only when Data Mode permits it. Local mode keeps the
    // localStorage save above but skips POST /settings.
    if (connected && cloudSyncEnabled()) {
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
    if (connected && cloudSyncEnabled()) {
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

  // Data sovereignty — encrypted backup / readable export (local, no account).
  const [backupPassModal, setBackupPassModal] = useState<null | { mode: 'export' | 'import'; content?: string; name?: string }>(null);
  const [backupPass, setBackupPass] = useState('');
  const [backupBusy, setBackupBusy] = useState(false);
  const [backupStatus, setBackupStatus] = useState<string | null>(null);

  // The sidecar formats the bytes; the Tauri save dialog + write happen here
  // (mirrors the audit-export flow).
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { event?: string; envelope?: string; json?: string; ok?: boolean; written?: number; skipped?: number; message?: string };
      if (!detail?.event) return;
      if (detail.event === 'backup_ready' && detail.envelope) {
        Promise.all([import('@tauri-apps/plugin-dialog'), import('@tauri-apps/plugin-fs')]).then(async ([dialog, fs]) => {
          const datePart = new Date().toISOString().slice(0, 10);
          const target = await dialog.save({ defaultPath: `ava-backup-${datePart}.ava-backup`, filters: [{ name: 'Ava backup', extensions: ['ava-backup'] }] });
          setBackupBusy(false); setBackupPassModal(null); setBackupPass('');
          if (!target) return;
          await fs.writeTextFile(target, detail.envelope!);
          setBackupStatus(t('dash.portability.backup_saved')); setTimeout(() => setBackupStatus(null), 4000);
        }).catch(() => setBackupBusy(false));
      }
      if (detail.event === 'readable_ready' && detail.json) {
        Promise.all([import('@tauri-apps/plugin-dialog'), import('@tauri-apps/plugin-fs')]).then(async ([dialog, fs]) => {
          const datePart = new Date().toISOString().slice(0, 10);
          const target = await dialog.save({ defaultPath: `ava-data-readable-${datePart}.json`, filters: [{ name: 'JSON', extensions: ['json'] }] });
          if (!target) return;
          await fs.writeTextFile(target, detail.json!);
          setBackupStatus(t('dash.portability.readable_saved')); setTimeout(() => setBackupStatus(null), 4000);
        }).catch(() => { /* non-fatal */ });
      }
      if (detail.event === 'backup_imported') {
        setBackupBusy(false); setBackupPassModal(null); setBackupPass('');
        setBackupStatus(detail.ok ? t('dash.portability.restored') : t('dash.portability.import_failed'));
        setTimeout(() => setBackupStatus(null), 5000);
      }
    };
    window.addEventListener('ava-backup-event', handler);
    return () => window.removeEventListener('ava-backup-event', handler);
  }, []);

  // Categories that default OFF — opt-in only. The user must explicitly
  // enable cloud sync for these: shared learnings leave the device, and
  // the health profile is sensitive body data.
  const OPT_IN_ONLY = new Set(['shared', 'health_profile']);
  const defaultEnabled = (key: string) => !OPT_IN_ONLY.has(key);

  // Per-section sync toggles (local-first, persisted to localStorage)
  const [syncPrefs, setSyncPrefs] = useState<Record<string, boolean>>(() => {
    try { const raw = localStorage.getItem('ava-ide-sync-prefs'); return raw ? JSON.parse(raw) : {}; } catch { return {}; }
  });
  const togglePref = (key: string) => {
    setSyncPrefs(prev => {
      const next = { ...prev, [key]: !(prev[key] ?? defaultEnabled(key)) };
      try { localStorage.setItem('ava-ide-sync-prefs', JSON.stringify(next)); } catch {}
      return next;
    });
  };
  const isSyncEnabled = (key: string) => syncPrefs[key] ?? defaultEnabled(key);

  const DATA_TYPES = [
    { key: 'memory',      label: t('dash.sync.memory'),           icon: '\uD83E\uDDE0', description: t('dash.sync.memory_desc'),    endpoint: '/memories' },
    { key: 'tasks',       label: t('dash.sync.tasks'),            icon: '\u2713',       description: t('dash.sync.tasks_desc'),     endpoint: '/tasks' },
    { key: 'journal',     label: t('dash.sync.journal'),          icon: '\uD83D\uDCD6', description: t('dash.sync.journal_desc'), endpoint: '/journal' },
    { key: 'learning',    label: t('dash.nav.learning'),         icon: '\uD83C\uDF93', description: t('dash.nav.learning_desc'),              endpoint: '/learning' },
    { key: 'settings',    label: t('dash.sync.settings'),         icon: '\u2699',       description: t('dash.sync.settings_desc'),           endpoint: '/settings' },
    { key: 'personality', label: t('dash.sync.personality'),      icon: '\uD83C\uDFAD', description: t('dash.sync.personality_desc'),       endpoint: '/settings' },
    { key: 'shared',      label: t('dash.sync.shared_learnings'), icon: '\uD83D\uDCA1', description: t('dash.sync.shared_learnings_desc'),        endpoint: '/shared-learnings' },
    { key: 'health_profile', label: t('dash.sync.health_profile'), icon: '\uD83C\uDFCB\uFE0F', description: t('dash.sync.health_profile_desc'), endpoint: '/health/profile/sync' },
  ];

  const [counts, setCounts] = useState<Record<string, { local: number; cloud: number; lastSynced?: string }>>({});

  useEffect(() => {
    if (!connected) return;
    const fetchCounts = async () => {
      const results: Record<string, { local: number; cloud: number; lastSynced?: string }> = {};
      for (const dt of DATA_TYPES) {
        try {
          if (dt.key === 'health_profile') {
            // Health profile is local-first (Tauri fs), not an account
            // collection — count it as 1 once a profile has been saved.
            const { loadHealthProfile } = await import('../lib/health-store');
            const local = await loadHealthProfile();
            const cloud = await apiFetch(dt.endpoint);
            results[dt.key] = {
              local: local.updated_at ? 1 : 0,
              cloud: cloud?.profile ? 1 : 0,
              lastSynced: cloud?.updated_at || undefined,
            };
            continue;
          }
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
      if (key === 'health_profile') {
        // Push the local-first health profile up to the cloud copy.
        const { loadHealthProfile } = await import('../lib/health-store');
        const profile = await loadHealthProfile();
        await apiFetch(endpoint, { method: 'POST', body: JSON.stringify({ profile }) });
        setSyncResults(prev => ({ ...prev, [key]: { success: true, count: 1 } }));
        setCounts(prev => ({
          ...prev,
          [key]: { local: 1, cloud: 1, lastSynced: new Date().toISOString() },
        }));
      } else {
        const data = await apiFetch(endpoint);
        const count = Array.isArray(data) ? data.length : (data?.count || data?.total || 1);
        setSyncResults(prev => ({ ...prev, [key]: { success: true, count } }));
        setCounts(prev => ({
          ...prev,
          [key]: { ...prev[key], local: count, cloud: count, lastSynced: new Date().toISOString() },
        }));
      }
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

  // GDPR Article 20 — full cloud-stored data export. Hits the platform
  // /api/export-my-data endpoint directly (Tauri can fetch + write to
  // disk without a host proxy). Pairs with the local audit-log export
  // in the History → Audit tab — together the two give the user a
  // complete picture of every byte the system holds about them.
  const exportFullAccountData = async () => {
    try {
      // Was reading 'ava-platform-key' — wrong key. Canonical storage is
      // 'ava-ide-platform-key' via getPlatformKey() / lib/api.
      const platformKey = getPlatformKey();
      if (!platformKey) {
        alert('Connect a platform account first to export your cloud-stored data.');
        return;
      }
      const res = await fetch('https://ava-supernova.com/api/export-my-data', {
        headers: { Authorization: `Bearer ${platformKey}` },
      });
      if (!res.ok) {
        alert(`Export failed: ${res.status} ${res.statusText}`);
        return;
      }
      const content = await res.text();
      const datePart = new Date().toISOString().slice(0, 10);
      const filename = `ava-supernova-data-export-${datePart}.json`;
      const [{ save }, fs] = await Promise.all([
        import('@tauri-apps/plugin-dialog'),
        import('@tauri-apps/plugin-fs'),
      ]);
      const target = await save({
        defaultPath: filename,
        filters: [{ name: 'JSON', extensions: ['json'] }],
      });
      if (!target) return;
      await fs.writeTextFile(target, content);
    } catch (err) {
      alert(`Export failed: ${err instanceof Error ? err.message : err}`);
    }
  };

  const startEncryptedBackup = () => { setBackupPass(''); setBackupPassModal({ mode: 'export' }); };
  const startReadableExport = () => {
    setBackupStatus(t('dash.portability.preparing'));
    getSidecar().exportReadable().catch(() => setBackupStatus(t('dash.portability.import_failed')));
  };
  const pickBackupToImport = async () => {
    try {
      const [dialog, fs] = await Promise.all([import('@tauri-apps/plugin-dialog'), import('@tauri-apps/plugin-fs')]);
      const sel = await dialog.open({ multiple: false, filters: [{ name: 'Ava backup', extensions: ['ava-backup'] }] });
      if (!sel || typeof sel !== 'string') return;
      const content = await fs.readTextFile(sel);
      setBackupPass('');
      setBackupPassModal({ mode: 'import', content, name: sel.split(/[/\\]/).pop() || 'backup' });
    } catch { /* cancelled / unreadable */ }
  };
  const confirmBackupPass = () => {
    if (!backupPassModal || !backupPass) return;
    setBackupBusy(true);
    const sc = getSidecar();
    if (backupPassModal.mode === 'export') sc.exportBackup(backupPass).catch(() => setBackupBusy(false));
    else sc.importBackup(backupPassModal.content || '', backupPass).catch(() => setBackupBusy(false));
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

        {/* Data sovereignty — encrypted backup + readable export. Local; no
            account needed. Sits above the cloud export. */}
        <div style={{ ...card, marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#cdd6f4', marginBottom: 8 }}>{t('dash.portability.local_title')}</div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button onClick={startEncryptedBackup} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid rgba(168,85,247,0.35)', background: 'rgba(168,85,247,0.12)', color: '#cdd6f4', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>{'\u{1F512}'} {t('dash.portability.enc_backup')} (.ava-backup)</button>
            <button onClick={startReadableExport} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid rgba(108,112,134,0.3)', background: 'transparent', color: '#cdd6f4', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>{'\u{1F4D6}'} {t('dash.portability.readable')}</button>
            <button onClick={pickBackupToImport} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid rgba(108,112,134,0.3)', background: 'transparent', color: '#cdd6f4', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>{'⤓'} {t('dash.portability.import_backup')}</button>
          </div>
          <div style={{ fontSize: 11, color: '#6c7086', lineHeight: 1.5, marginTop: 8 }}>
            {t('dash.portability.enc_backup_desc')} {t('dash.portability.readable_desc')}
          </div>
          {backupStatus && <div style={{ marginTop: 8, fontSize: 11, color: '#cdd6f4', background: 'rgba(168,85,247,0.1)', borderRadius: 8, padding: '6px 10px' }}>{backupStatus}</div>}
        </div>

        {/* Passphrase modal — create or open an encrypted backup. */}
        {backupPassModal && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.6)' }}
            onMouseDown={(e) => { if (e.target === e.currentTarget && !backupBusy) { setBackupPassModal(null); setBackupPass(''); } }}>
            <div style={{ width: 320, background: '#1e1e2e', border: '1px solid rgba(168,85,247,0.3)', borderRadius: 12, padding: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#cdd6f4', marginBottom: 4 }}>
                {backupPassModal.mode === 'export' ? t('dash.portability.pass_set') : t('dash.portability.pass_enter')}
              </div>
              <div style={{ fontSize: 11, color: '#a6adc8', lineHeight: 1.5, marginBottom: 12 }}>
                {backupPassModal.mode === 'export' ? t('dash.portability.pass_set_desc') : (backupPassModal.name || '')}
              </div>
              <input type="password" value={backupPass} autoFocus
                onChange={(e) => setBackupPass(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && backupPass && !backupBusy) confirmBackupPass(); }}
                placeholder={t('dash.portability.passphrase')}
                style={{ width: '100%', padding: '8px 10px', borderRadius: 8, background: '#11111b', color: '#cdd6f4', border: '1px solid rgba(168,85,247,0.2)', outline: 'none', marginBottom: 12, boxSizing: 'border-box' }} />
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => { setBackupPassModal(null); setBackupPass(''); }} disabled={backupBusy}
                  style={{ flex: 1, padding: '8px', borderRadius: 8, background: 'transparent', color: '#a6adc8', border: '1px solid rgba(108,112,134,0.3)', cursor: 'pointer' }}>{t('dash.portability.cancel')}</button>
                <button onClick={confirmBackupPass} disabled={!backupPass || backupBusy}
                  style={{ flex: 1, padding: '8px', borderRadius: 8, background: (!backupPass || backupBusy) ? '#6c7086' : 'linear-gradient(135deg,#a855f7,#7c3aed)', color: '#fff', border: 'none', cursor: (!backupPass || backupBusy) ? 'default' : 'pointer' }}>
                  {backupBusy ? t('dash.portability.working') : backupPassModal.mode === 'export' ? t('dash.portability.create_backup') : t('dash.portability.restore')}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* GDPR full-account export — now also the cloud SUNSET notice: the
            platform stops storing user data on 1 Jul 2026, so this is the
            last-chance path to pull anything still in the cloud. Amber warning. */}
        {connected && (
          <div style={{ ...card, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 14, borderColor: 'rgba(245,158,11,0.4)', background: 'rgba(245,158,11,0.08)' }}>
            <div style={{ flexShrink: 0, color: '#fbbf24', fontSize: 22 }}>⚠️</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#fbbf24', marginBottom: 2 }}>{t('dash.portability.download_all')}</div>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#fbbf24', lineHeight: 1.5, marginBottom: 2 }}>
                {t('dash.portability.cloud_sunset')}
              </div>
              <div style={{ fontSize: 11, color: '#6c7086', lineHeight: 1.5 }}>
                {t('dash.portability.download_all_desc')}
              </div>
            </div>
            <button
              onClick={exportFullAccountData}
              style={{
                flexShrink: 0,
                padding: '8px 14px', borderRadius: 8, border: '1px solid rgba(245,158,11,0.4)',
                background: 'rgba(245,158,11,0.15)', color: '#fbbf24', fontSize: 12, fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Download (.json)
            </button>
          </div>
        )}

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

  // Audit-tab UI state — search + filter live next to the entries
  // they apply to. Same axes the extension uses so muscle memory ports.
  const [auditSearch, setAuditSearch] = useState('');
  const [auditRiskFilter, setAuditRiskFilter] = useState<string>('all');
  const [auditStatusFilter, setAuditStatusFilter] = useState<string>('all');

  // Listen for audit events forwarded from sidecar event handler.
  // Also handles `audit_export_ready` — sidecar formats the bundle and
  // we open the Tauri save dialog from here so the user gets a native
  // file picker.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.event === 'audit_log' && Array.isArray(detail.entries)) {
        setAuditEntries(detail.entries);
      }
      if (detail?.event === 'audit_entry' && detail.entry) {
        setAuditEntries(prev => [...prev, detail.entry].slice(-500));
      }
      if (detail?.event === 'audit_export_ready' && detail.bundle) {
        const b = detail.bundle as { filename: string; content: string; format: 'markdown' | 'json' };
        // Lazy-import the Tauri dialog + fs plugins so they don't
        // bloat the audit-tab first-paint when the export button
        // is never used.
        Promise.all([
          import('@tauri-apps/plugin-dialog'),
          import('@tauri-apps/plugin-fs'),
        ]).then(async ([dialog, fs]) => {
          const target = await dialog.save({
            defaultPath: b.filename,
            filters: [{ name: b.format === 'json' ? 'JSON' : 'Markdown', extensions: [b.format === 'json' ? 'json' : 'md'] }],
          });
          if (!target) return;
          await fs.writeTextFile(target, b.content);
        }).catch(() => { /* user cancelled or fs error — non-fatal */ });
      }
    };
    window.addEventListener('ava-audit-event', handler);
    return () => window.removeEventListener('ava-audit-event', handler);
  }, []);

  // Pull the persistent audit log when the audit tab opens so prior
  // sessions are visible. Without this, the tab only shows entries
  // captured in the current process's lifetime.
  useEffect(() => {
    if (activeTab !== 'audit') return;
    const sidecar = getSidecar();
    if (sidecar.isReady) {
      sidecar.getAuditLog().catch(() => { /* offline / not ready */ });
    }
  }, [activeTab]);

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
  const totalTokens = activeTab === 'session' ? session.totalTokens : (period.free_credits_used || 0) + (period.credits_used || 0);
  const inputTokens = activeTab === 'session' ? session.inputTokens : Math.round(totalTokens * 0.6);
  const outputTokens = activeTab === 'session' ? session.outputTokens : totalTokens - inputTokens;
  const messages = activeTab === 'session' ? session.messages : (period.requests_count || totals.requests || 0);
  const toolCalls = activeTab === 'session' ? session.toolCalls : 0;

  // All-time from totals
  const freeUsed = period.free_credits_used || 0;
  const freeLimit = period.free_credits_limit || 300;
  const subUsed = period.credits_used || 0;
  const subLimit = period.credits_limit || 0;
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
    'qwen3.5-omni-flash': { input: 0.065, output: 0.26 },
    'qwen3.5-omni-plus': { input: 0.26, output: 1.56 },
    'qwen3.5-plus': { input: 0.20, output: 1.20 },
    'qwen3.5-flash': { input: 0.05, output: 0.40 },
    'MiniMax-M3': { input: 0.60, output: 2.40 },
    'MiniMax-M2.7': { input: 0.30, output: 1.20 },
    'MiniMax-M2.7-highspeed': { input: 0.60, output: 2.40 },
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

                {/* Active orchestration mode header — surfaces "you are
                    in Aurora" so the breakdown below makes sense. Used
                    to be confusing: Aurora session showed only Mistral
                    Large 3 in the list (because chat-only sessions only
                    invoke the coordinator), making it look like Aurora
                    was a one-model mode. The header now names the mode
                    + lists the fleet roles so the operator can see the
                    full topology even if specialists haven't fired. */}
                {(() => {
                  const activeId = (typeof localStorage !== 'undefined' ? localStorage.getItem('ava-ide-active-model') : null) || '';
                  const modeInfo = activeId === 'aurora'
                    ? { label: 'Aurora', flavour: 'Mistral three-tier · sovereign EU stack', roles: [
                        { name: 'Mistral Large 3', role: 'Coordinator + heavy specialists' },
                        { name: 'Mistral Medium 3.5', role: 'Builder · mid-tier · vision · long-form' },
                        { name: 'Mistral Small 4', role: 'Intent gate' },
                      ] }
                    : activeId === 'supernova'
                      ? { label: 'Supernova', flavour: 'DeepSeek + Qwen ensemble', roles: [
                          { name: 'DeepSeek V4 Pro', role: 'Coordinator' },
                          { name: 'DeepSeek V4 Flash', role: 'Mid-tier specialists' },
                          { name: 'Qwen 3.6 Plus', role: 'Builder' },
                          { name: 'Qwen 3.5 Flash', role: 'Light tier / intent gate' },
                          { name: 'Qwen 3.5 Omni Plus', role: 'Vision' },
                          { name: 'Qwen 3.5 Plus', role: 'Long-form writing' },
                        ] }
                      : activeId === 'auto'
                        ? { label: 'Maestro', flavour: 'Qwen-only · daily work, predictable cost', roles: [
                            { name: 'Qwen 3.6 Plus', role: 'Coordinator + Builder' },
                            { name: 'Qwen 3.5 Flash', role: 'Light tier / intent gate' },
                          ] }
                        : null;
                  if (!modeInfo) return null;
                  return (
                    <div style={{ ...card, borderColor: 'rgba(168, 85, 247, 0.25)' }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
                        <span style={{ fontSize: 11, fontWeight: 600, color: '#a855f7', letterSpacing: '0.04em', textTransform: 'uppercase' }}>Active Mode</span>
                        <span style={{ fontSize: 18, fontWeight: 600, color: '#cdd6f4' }}>{modeInfo.label}</span>
                        <span style={{ fontSize: 11, color: '#6c7086' }}>{modeInfo.flavour}</span>
                      </div>
                      <div style={{ fontSize: 11, color: '#6c7086', marginBottom: 10 }}>
                        Models below show specialists that actually fired this session. Chat-only sessions typically only invoke the coordinator — the rest activate when the orchestrator spawns Builders, vision, long-form, etc.
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingLeft: 4 }}>
                        {modeInfo.roles.map((r) => (
                          <div key={r.name} style={{ display: 'flex', gap: 8, fontSize: 11 }}>
                            <span style={{ color: '#cdd6f4', minWidth: 160, fontWeight: 500 }}>{r.name}</span>
                            <span style={{ color: '#6c7086' }}>{r.role}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}

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
              <IdeAuditView
                entries={auditEntries}
                expandedIdx={auditExpanded}
                onToggleExpand={(i) => setAuditExpanded(auditExpanded === i ? null : i)}
                search={auditSearch}
                onSearchChange={setAuditSearch}
                riskFilter={auditRiskFilter}
                onRiskFilterChange={setAuditRiskFilter}
                statusFilter={auditStatusFilter}
                onStatusFilterChange={setAuditStatusFilter}
                onExport={(format) => {
                  const sidecar = getSidecar();
                  if (sidecar.isReady) sidecar.exportAuditLog(format).catch(() => {});
                }}
              />
            ) : (
              <>
                {/* Credit Balance */}
                {usage && (
                  <div style={{ ...card }}>
                    <div style={sectionTitle}>Credit Balance</div>
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
                          <span style={{ color: '#a6adc8' }}>Credits Remaining</span>
                          <span style={{ color: '#cdd6f4', fontWeight: 600 }}>{balanceRemaining.toLocaleString()}</span>
                        </div>
                        <div style={{ height: 12, background: 'rgba(49, 34, 68, 0.5)', borderRadius: 6, overflow: 'hidden' }}>
                          <div style={{
                            width: `${remainPct}%`, height: '100%', borderRadius: 6,
                            background: remainPct < 10 ? '#f87171' : remainPct < 30 ? '#f59e0b' : 'linear-gradient(90deg, #a855f7, #6366f1)',
                            transition: 'width 0.5s',
                          }} />
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#585b70', marginTop: 4 }}>
                          <span>{balanceUsed.toLocaleString()} used</span>
                          <span>{balanceLimit.toLocaleString()} limit</span>
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

/* ===== Local Model card — Ollama / LM Studio / vLLM =====
 *
 * Lets the operator point Ava at any locally-hosted model that speaks
 * the OpenAI Chat Completions API. Stores config in localStorage; the
 * IDE init path reads it and forwards to the sidecar's GenericProvider
 * registration. Restart of the sidecar (close + reopen the chat panel
 * or the window) is required for changes to take effect — the sidecar
 * registers providers at init only.
 */
function LocalModelSettings() {
  const [baseUrl, setBaseUrl] = useState(() => localStorage.getItem('ava-ide-local-baseurl') || '');
  const [modelName, setModelName] = useState(() => localStorage.getItem('ava-ide-local-model') || '');
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('ava-ide-local-apikey') || '');
  const [modelLabel, setModelLabel] = useState(() => localStorage.getItem('ava-ide-local-label') || '');
  const [savedTick, setSavedTick] = useState(0);

  const save = () => {
    if (baseUrl.trim()) localStorage.setItem('ava-ide-local-baseurl', baseUrl.trim());
    else localStorage.removeItem('ava-ide-local-baseurl');
    if (modelName.trim()) localStorage.setItem('ava-ide-local-model', modelName.trim());
    else localStorage.removeItem('ava-ide-local-model');
    if (apiKey.trim()) localStorage.setItem('ava-ide-local-apikey', apiKey.trim());
    else localStorage.removeItem('ava-ide-local-apikey');
    if (modelLabel.trim()) localStorage.setItem('ava-ide-local-label', modelLabel.trim());
    else localStorage.removeItem('ava-ide-local-label');
    setSavedTick(t => t + 1);
    // Flash success indicator briefly
    setTimeout(() => setSavedTick(t => t + 1), 1800);
  };

  const clear = () => {
    setBaseUrl('');
    setModelName('');
    setApiKey('');
    setModelLabel('');
    localStorage.removeItem('ava-ide-local-baseurl');
    localStorage.removeItem('ava-ide-local-model');
    localStorage.removeItem('ava-ide-local-apikey');
    localStorage.removeItem('ava-ide-local-label');
    setSavedTick(t => t + 1);
  };

  const isConfigured = !!(baseUrl.trim() && modelName.trim());
  const justSaved = savedTick % 2 === 1;

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '7px 10px', borderRadius: 6,
    border: '1px solid rgba(168, 85, 247, 0.18)',
    background: 'rgba(10, 6, 18, 0.8)', color: '#cdd6f4',
    fontSize: 12, fontFamily: 'monospace', outline: 'none',
  };

  return (
    <div style={{
      background: 'rgba(26, 16, 40, 0.6)', border: '1px solid rgba(168, 85, 247, 0.12)', borderRadius: 12,
      padding: '18px 20px', marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 14,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <span style={{ fontSize: 22 }}>🦙</span>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#cdd6f4' }}>Custom model — Ollama, LM Studio, vLLM, or any OpenAI-compatible endpoint</div>
            {isConfigured && (
              <span style={{
                fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 6,
                background: 'rgba(166, 227, 161, 0.10)', color: '#a6e3a1',
                border: '1px solid rgba(166, 227, 161, 0.30)', letterSpacing: 0.4,
              }}>CONFIGURED</span>
            )}
          </div>
          <div style={{ fontSize: 11, color: '#6c7086', marginTop: 2, lineHeight: 1.5 }}>
            Point Ava at any model — local (Ollama, LM Studio, vLLM on your machine) or remote (private vLLM cluster,
            self-hosted finetune, OpenRouter, Together, anything that speaks the OpenAI Chat Completions API).
            Local servers stay on your machine; remote endpoints get whatever security your endpoint exposes.
            Restart the chat panel after saving for changes to take effect.
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div style={{ gridColumn: '1 / span 2' }}>
          <div style={{ fontSize: 11, fontWeight: 500, color: '#cdd6f4', marginBottom: 4 }}>Base URL</div>
          <input
            value={baseUrl}
            onChange={e => setBaseUrl(e.target.value)}
            placeholder="http://localhost:11434/v1"
            style={inputStyle}
            spellCheck={false}
          />
          <div style={{ fontSize: 10, color: '#6c7086', marginTop: 4 }}>
            Ollama: <code style={{ color: '#cdd6f4' }}>http://localhost:11434/v1</code>. LM Studio: <code style={{ color: '#cdd6f4' }}>http://localhost:1234/v1</code>.
            Remote endpoints: <code style={{ color: '#cdd6f4' }}>https://your-host/v1</code>.
          </div>
        </div>

        <div>
          <div style={{ fontSize: 11, fontWeight: 500, color: '#cdd6f4', marginBottom: 4 }}>Model name</div>
          <input
            value={modelName}
            onChange={e => setModelName(e.target.value)}
            placeholder="qwen2.5-coder:7b"
            style={inputStyle}
            spellCheck={false}
          />
          <div style={{ fontSize: 10, color: '#6c7086', marginTop: 4 }}>
            The exact id your server reports (e.g. <code style={{ color: '#cdd6f4' }}>ollama list</code>).
          </div>
        </div>

        <div>
          <div style={{ fontSize: 11, fontWeight: 500, color: '#cdd6f4', marginBottom: 4 }}>Display name <span style={{ color: '#6c7086', fontWeight: 400 }}>(optional)</span></div>
          <input
            value={modelLabel}
            onChange={e => setModelLabel(e.target.value)}
            placeholder="Defaults to the model name"
            style={inputStyle}
            spellCheck={false}
          />
          <div style={{ fontSize: 10, color: '#6c7086', marginTop: 4 }}>
            What you'll see in the chat model picker.
          </div>
        </div>

        <div style={{ gridColumn: '1 / span 2' }}>
          <div style={{ fontSize: 11, fontWeight: 500, color: '#cdd6f4', marginBottom: 4 }}>API key <span style={{ color: '#6c7086', fontWeight: 400 }}>(optional — leave empty for local servers)</span></div>
          <input
            type="password"
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            placeholder="Most local servers don't require one"
            style={inputStyle}
            spellCheck={false}
            autoComplete="off"
          />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}>
        <button
          onClick={save}
          style={{
            padding: '7px 16px', borderRadius: 6, border: 'none',
            background: 'linear-gradient(135deg, #a855f7, #7c3aed)',
            color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer',
          }}
        >
          {justSaved ? 'Saved ✓' : 'Save'}
        </button>
        {(baseUrl || modelName || apiKey || modelLabel) && (
          <button
            onClick={clear}
            style={{
              padding: '7px 14px', borderRadius: 6,
              border: '1px solid rgba(248,113,113,0.30)',
              background: 'transparent', color: '#f87171',
              fontSize: 11, fontWeight: 500, cursor: 'pointer',
            }}
          >
            Remove
          </button>
        )}
        <span style={{ flex: 1 }} />
        <a
          href="https://ollama.com/download"
          target="_blank"
          rel="noreferrer"
          style={{ fontSize: 10, color: '#6c7086', textDecoration: 'none' }}
          onMouseEnter={e => (e.currentTarget.style.color = '#9399b2')}
          onMouseLeave={e => (e.currentTarget.style.color = '#6c7086')}
        >
          Get Ollama →
        </a>
      </div>
    </div>
  );
}

/** Settings control for chat-backend routing — where the chat runs:
 *  the local sidecar (your own API keys / BYOK) or the Ava platform.
 *  Independent of cloud sync (which is the data-backup axis). Persists
 *  to 'ava-ide-chat-backend' and broadcasts 'ava-chat-backend-changed'
 *  so the chat surface picks the change up live. */
function ChatBackendSetting() {
  const [backend, setBackend] = useState<'local' | 'cloud'>(() =>
    localStorage.getItem('ava-ide-chat-backend') === 'local' ? 'local' : 'cloud',
  );
  const choose = (next: 'local' | 'cloud') => {
    setBackend(next);
    try { localStorage.setItem('ava-ide-chat-backend', next); } catch { /* */ }
    try {
      window.dispatchEvent(new CustomEvent('ava-chat-backend-changed', { detail: { backend: next } }));
    } catch { /* no window */ }
  };
  const opts: Array<{ id: 'local' | 'cloud'; label: string; desc: string }> = [
    { id: 'cloud', label: 'Platform', desc: 'Run the chat on the Ava platform — needs a connected account.' },
    { id: 'local', label: 'Local sidecar', desc: 'Run the chat on this machine with your own API keys (BYOK).' },
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
      {opts.map((o) => {
        const active = backend === o.id;
        return (
          <button
            key={o.id}
            onClick={() => choose(o.id)}
            style={{
              textAlign: 'left', padding: '10px 12px', borderRadius: 8, cursor: 'pointer',
              background: active ? 'rgba(168,85,247,0.1)' : 'rgba(26,16,40,0.6)',
              border: `1px solid ${active ? 'rgba(168,85,247,0.4)' : 'rgba(168,85,247,0.12)'}`,
              color: '#cdd6f4',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 600 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: active ? '#a855f7' : '#6c7086' }} />
              {o.label}
            </div>
            <div style={{ fontSize: 11, color: '#6c7086', marginTop: 3 }}>{o.desc}</div>
          </button>
        );
      })}
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
  // Desktop permission level — same hook as the chat-bar pill, so changes
  // here propagate there and vice versa. Hook handles localStorage + sidecar
  // push internally.
  const [desktopPermLevel, setDesktopPermLevel] = useDesktopPermLevel();
  // Inner-tab grouping for the Settings page. Sections render in source
  // order, filtered by tab membership — so the file's top-to-bottom flow
  // is preserved within each tab and we don't have to physically reorder.
  type SettingsTab = 'general' | 'models' | 'behavior' | 'desktop' | 'privacy';
  const [settingsTab, setSettingsTab] = useState<SettingsTab>(() => {
    const saved = localStorage.getItem('ava-ide-settings-tab');
    return (saved === 'models' || saved === 'behavior' || saved === 'desktop' || saved === 'privacy') ? saved : 'general';
  });
  const setTab = (t: SettingsTab) => {
    setSettingsTab(t);
    try { localStorage.setItem('ava-ide-settings-tab', t); } catch { /* */ }
  };
  const [personality, setPersonality] = useState<any>(null);
  // Dataset capture config — separate from `settings` because it lives in
  // its own file (~/.ava/datasets/config.json) with its own granular schema
  // and is read directly by the sidecar's dataset consumer.
  const [datasetCfg, setDatasetCfg] = useState<DatasetCfg | null>(null);
  useEffect(() => {
    fsLoadDatasetConfig().then(setDatasetCfg).catch(() => setDatasetCfg(null));
  }, []);
  const writeDatasetCfg = useCallback((next: DatasetCfg) => {
    setDatasetCfg(next);
    fsSaveDatasetConfig(next).catch(() => {});
  }, []);
  const toggleDatasetMaster = useCallback((on: boolean) => {
    if (!datasetCfg) return;
    writeDatasetCfg({
      ...datasetCfg,
      enabled: on,
      capture_modes: on && datasetCfg.capture_modes.length === 0
        ? [...DC_ALL_MODES]
        : datasetCfg.capture_modes,
      capture_datasets: on && datasetCfg.capture_datasets.length === 0
        ? [...DC_ALL_DATASETS]
        : datasetCfg.capture_datasets,
    });
  }, [datasetCfg, writeDatasetCfg]);
  const toggleDatasetMode = useCallback((m: DCAvaMode) => {
    if (!datasetCfg) return;
    const has = datasetCfg.capture_modes.includes(m);
    writeDatasetCfg({
      ...datasetCfg,
      capture_modes: has ? datasetCfg.capture_modes.filter(x => x !== m) : [...datasetCfg.capture_modes, m],
    });
  }, [datasetCfg, writeDatasetCfg]);
  const toggleDatasetKind = useCallback((k: DCDatasetName) => {
    if (!datasetCfg) return;
    const has = datasetCfg.capture_datasets.includes(k);
    writeDatasetCfg({
      ...datasetCfg,
      capture_datasets: has ? datasetCfg.capture_datasets.filter(x => x !== k) : [...datasetCfg.capture_datasets, k],
    });
  }, [datasetCfg, writeDatasetCfg]);

  const [userAvatar, setUserAvatar] = useState<string>(() => localStorage.getItem('ava-ide-user-avatar') || '');

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

  // Avatar mutators are now user-only — Ava's avatar is brand-locked
  // (sourced from packages/core/assets/ava-avatar.jpeg) and operators
  // can no longer override it.
  const saveAvatar = useCallback(async (_type: 'user', dataUri: string) => {
    const resized = await resizeAvatar(dataUri);
    localStorage.setItem('ava-ide-user-avatar', resized);
    setUserAvatar(resized);
    if (connected && cloudSyncEnabled()) {
      apiFetch('/settings', {
        method: 'POST',
        body: JSON.stringify({ user_avatar: resized }),
      }).catch(() => {});
    }
    return resized;
  }, [connected, resizeAvatar]);

  const removeAvatar = useCallback((_type: 'user') => {
    localStorage.removeItem('ava-ide-user-avatar');
    setUserAvatar('');
    if (connected && cloudSyncEnabled()) {
      apiFetch('/settings', {
        method: 'POST',
        body: JSON.stringify({ user_avatar: null }),
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
    { id: 'deepseek', name: 'DeepSeek', placeholder: 'sk-...', signupUrl: 'https://platform.deepseek.com', description: 'DeepSeek V4 Pro and V4 Flash \u2014 1M context, MIT open-weight' },
    { id: 'kimi', name: 'Kimi (Moonshot)', placeholder: 'sk-...', signupUrl: 'https://platform.moonshot.ai', description: 'Kimi K2.5 \u2014 best multi-step tool calling' },
    { id: 'minimax', name: 'MiniMax', placeholder: 'sk-api-...', signupUrl: 'https://platform.minimax.io', description: 'M2.7 self-evolving, M2.5 best tool calling' },
    { id: 'glm', name: 'GLM (Zhipu AI)', placeholder: '...', signupUrl: 'https://z.ai', description: 'GLM-5, GLM-4.7 \u2014 best tool-call reliability' },
    { id: 'qwen', name: 'Qwen (Alibaba)', placeholder: 'sk-...', signupUrl: 'https://dashscope.console.aliyun.com', description: 'Qwen 3.5 Omni Plus and Omni Flash — multimodal' },
    { id: 'mistral', name: 'Mistral AI', placeholder: '...', signupUrl: 'https://console.mistral.ai', description: 'Mistral Large 3, Medium 3.5, Small 4, Codestral, Devstral 2' },
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
          // Load user avatar from platform (overrides local if present).
          // Ava avatar is brand-locked — `data.ai_avatar` from the
          // platform is intentionally ignored.
          if (data.user_avatar) { setUserAvatar(data.user_avatar); localStorage.setItem('ava-ide-user-avatar', data.user_avatar); }
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
    if (connected && cloudSyncEnabled()) {
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
    // Provider keys never leave the device in Local mode. OS keychain
    // on the extension holds the BYOK keys locally; mirroring to cloud
    // is opt-in via Data Mode.
    if (connected && cloudSyncEnabled()) {
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
    if (connected && cloudSyncEnabled()) {
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
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 22, fontWeight: 600, color: '#cdd6f4' }}>{t('dash.settings.title')}</div>
          <div style={{ fontSize: 13, color: '#6c7086', marginTop: 4 }}>
            {t('dash.settings.subtitle')}
          </div>
        </div>

        {/* ── Inner tab bar — underline-tab pattern matching Library / Models pages */}
        <div style={{
          display: 'flex', gap: 4, marginBottom: 20,
          borderBottom: '1px solid rgba(168, 85, 247, 0.18)',
        }}>
          {([
            { id: 'general',  label: 'General' },
            { id: 'models',   label: 'Models' },
            { id: 'behavior', label: 'Behavior' },
            { id: 'desktop',  label: 'Desktop Automation' },
            { id: 'privacy',  label: 'Privacy' },
          ] as const).map(tab => {
            const active = settingsTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setTab(tab.id)}
                style={{
                  padding: '8px 14px',
                  background: 'transparent', border: 'none',
                  borderBottom: active ? '2px solid #a855f7' : '2px solid transparent',
                  marginBottom: -1,
                  color: active ? '#cdd6f4' : '#6c7086',
                  fontSize: 12, fontWeight: active ? 600 : 500,
                  cursor: 'pointer',
                  transition: 'color 0.15s, border-color 0.15s',
                }}
                onMouseEnter={e => { if (!active) e.currentTarget.style.color = '#9399b2'; }}
                onMouseLeave={e => { if (!active) e.currentTarget.style.color = '#6c7086'; }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* ── Group: General (sec 1+2) ──────────────────────────── */}
        <div style={{ display: settingsTab === 'general' ? 'contents' : 'none' }}>
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

            {/* AI (Ava) avatar upload removed — Ava's image is brand-locked
                to packages/core/assets/ava-avatar.jpeg. Operator can set
                their own avatar above; Ava's avatar is fixed across all
                surfaces so the brand reads consistently in chat. */}
          </div>
          <div style={{ fontSize: 11, color: '#45475a', marginTop: 10 }}>{t('dash.settings.avatar_stored_locally')}</div>
        </div>


        </div>{/* /General-1 */}

        {/* ── Group: Privacy (sec 3+4) ──────────────────────────── */}
        <div style={{ display: settingsTab === 'privacy' ? 'contents' : 'none' }}>
        {/* 3. Privacy & Data */}
        <div style={sLabel}>{t('dash.settings.section.privacy')}</div>
        <div style={{
          background: 'rgba(26, 16, 40, 0.6)', border: '1px solid rgba(168, 85, 247, 0.12)', borderRadius: 12,
          padding: '18px 20px', marginBottom: 16,
        }}>
          {/* Auto Memory */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', color: '#cba6f7' }}><PhBrain size={18} weight="duotone" /></span>
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
              <span style={{ display: 'inline-flex', alignItems: 'center', color: '#a6adc8' }}><PhLock size={18} weight="duotone" /></span>
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
                <span style={{ display: 'inline-flex', alignItems: 'center', color: '#f9e2af' }}><PhLightbulb size={18} weight="duotone" /></span>
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

        {/* 3.5 Help train Ava's own model — dataset capture opt-in */}
        <div style={sLabel}>Help train Ava&apos;s own model</div>
        <div style={{
          background: 'rgba(26, 16, 40, 0.6)', border: '1px solid rgba(168, 85, 247, 0.12)', borderRadius: 12,
          padding: '18px 20px', marginBottom: 16,
        }}>
          {/* Master toggle */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', color: '#a6e3a1' }}><PhTestTube size={18} weight="duotone" /></span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#cdd6f4' }}>Capture Ava&apos;s actions as training data</div>
                <div style={{ fontSize: 11, color: '#6c7086', marginTop: 2 }}>
                  Records Ava&apos;s tool choices, persona handoffs, memory ops, etc. to ~/.ava/datasets/.
                  Local-only by default. Never captures your prompts or files — only her decisions and shape-only context.
                </div>
              </div>
            </div>
            <ToggleSwitch value={!!datasetCfg?.enabled} onChange={toggleDatasetMaster} />
          </div>

          {datasetCfg?.enabled && (
            <>
              <div style={divider} />
              <div style={{ fontSize: 12, fontWeight: 600, color: '#a6adc8', marginBottom: 6 }}>Modes captured</div>
              <div style={{ fontSize: 10, color: '#6c7086', marginBottom: 10 }}>
                Choose which thought modes feed the dataset. Toggle any off to keep that mode private.
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 4 }}>
                {DC_ALL_MODES.map((mode) => {
                  const on = datasetCfg.capture_modes.includes(mode);
                  return (
                    <button
                      key={mode}
                      onClick={() => toggleDatasetMode(mode)}
                      style={{
                        padding: '4px 12px', fontSize: 11, borderRadius: 9999,
                        border: on ? '1px solid #34d399' : '1px solid rgba(168, 85, 247, 0.12)',
                        background: on ? 'rgba(52, 211, 153, 0.08)' : 'transparent',
                        color: on ? '#34d399' : '#6c7086', cursor: 'pointer', transition: 'all 0.15s',
                      }}
                    >
                      {mode}
                    </button>
                  );
                })}
              </div>

              <div style={divider} />
              <div style={{ fontSize: 12, fontWeight: 600, color: '#a6adc8', marginBottom: 6 }}>Dataset kinds</div>
              <div style={{ fontSize: 10, color: '#6c7086', marginBottom: 10 }}>
                The 10 distinct training datasets Ava generates. All on by default; turn off any you&apos;d rather not contribute to.
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                {DC_ALL_DATASETS.map((kind) => {
                  const on = datasetCfg.capture_datasets.includes(kind);
                  return (
                    <button
                      key={kind}
                      onClick={() => toggleDatasetKind(kind)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px',
                        fontSize: 11, textAlign: 'left', borderRadius: 6,
                        border: on ? '1px solid rgba(52, 211, 153, 0.4)' : '1px solid rgba(168, 85, 247, 0.12)',
                        background: on ? 'rgba(52, 211, 153, 0.05)' : 'transparent',
                        color: on ? '#a6adc8' : '#6c7086', cursor: 'pointer',
                      }}
                    >
                      <span style={{ color: on ? '#34d399' : '#6c7086' }}>{on ? '\u25CF' : '\u25CB'}</span>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{kind}</span>
                    </button>
                  );
                })}
              </div>

              <div style={{ fontSize: 10, color: '#6c7086', marginTop: 14 }}>
                All capture is local and append-only. Nothing leaves your machine until you explicitly push to your private dataset repo (separate, opt-in).
              </div>
            </>
          )}
        </div>

        </div>{/* /Privacy-1 */}

        {/* ── Group: Behavior (sec 4) ──────────────────────────── */}
        <div style={{ display: settingsTab === 'behavior' ? 'contents' : 'none' }}>
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
                { id: 'media', icon: '🎨', label: 'Media', desc: 'generate_image, generate_video, generate_voice, generate_music' },
                { id: 'database', icon: '🗄️', label: 'Database', desc: 'database_query' },
                { id: 'system', icon: '🖥️', label: 'System', desc: 'desktop_*, browser_*' },
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

        </div>{/* /Behavior */}

        {/* ── Group: General (sec 5 — Language) ──────────────────── */}
        <div style={{ display: settingsTab === 'general' ? 'contents' : 'none' }}>
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

        </div>{/* /General-2 */}

        {/* ── Group: Models (sec 6+7) ──────────────────────────── */}
        <div style={{ display: settingsTab === 'models' ? 'contents' : 'none' }}>

        {/* Chat backend — where the chat runs (local sidecar vs platform).
            Independent of cloud sync; previously these shared one header
            toggle, now separated so the IDE chat header mirrors the
            extension. */}
        <div style={sLabel}>CHAT BACKEND</div>
        <ChatBackendSetting />

        {/* Custom OpenAI-compatible model — Ollama / LM Studio / vLLM /
            any local or remote endpoint that speaks the OpenAI Chat
            Completions API. Covers BYOM (private vLLM, self-finetuned
            on your own server, OpenRouter / Together / etc) as well as
            on-machine local servers. */}
        <div style={sLabel}>CUSTOM MODEL</div>
        <LocalModelSettings />

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

        </div>{/* /Models */}

        {/* ── Group: Desktop (sec 8) ──────────────────────────── */}
        <div style={{ display: settingsTab === 'desktop' ? 'contents' : 'none' }}>
        {/* 8. Desktop Automation */}
        <div style={sLabel}>DESKTOP AUTOMATION</div>
        <div style={{
          background: 'rgba(26, 16, 40, 0.6)', border: '1px solid rgba(168, 85, 247, 0.12)', borderRadius: 12,
          padding: '18px 20px', marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 16,
        }}>
          {/* Header — what this section is for */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <span style={{ fontSize: 24 }}>🖥️</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#cdd6f4' }}>Desktop Automation</div>
              <div style={{ fontSize: 11, color: '#6c7086', marginTop: 2, lineHeight: 1.5 }}>
                Lets Ava reach out of the IDE into the rest of your OS — launch apps, click UI elements, type into forms,
                drive a visible browser. Same memory, mission, and audit log as code mode; additional safety gates apply.
              </div>
            </div>
          </div>

          {/* Permission level — three-state pill, same value as the chat-bar pill */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 500, color: '#cdd6f4', marginBottom: 4 }}>Permission level</div>
            <div style={{ fontSize: 11, color: '#6c7086', marginBottom: 8, lineHeight: 1.5 }}>
              How aggressively Ava is allowed to act on your screen. Irreversible actions (Send, Pay, Delete, destructive
              key combos) always re-prompt regardless of level.
            </div>
            <div
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 0,
                padding: 3, borderRadius: 8, background: 'rgba(168,85,247,0.06)',
                border: '1px solid rgba(168,85,247,0.18)',
              }}
            >
              {([
                { id: 'watch' as const, label: 'Watch',  desc: 'Ava describes; you stay on the mouse + keyboard. Safest.' },
                { id: 'ask'   as const, label: 'Ask',    desc: 'You approve every click / keystroke / launch. Default.' },
                { id: 'drive' as const, label: 'Drive',  desc: 'Reversible plan steps run silently after one approval.' },
              ]).map(l => {
                const active = desktopPermLevel === l.id;
                return (
                  <Tooltip key={l.id} content={l.desc}>
                    <button
                      onClick={() => setDesktopPermLevel(l.id)}
                      style={{
                        padding: '5px 14px',
                        background: active
                          ? (l.id === 'drive'
                              ? 'linear-gradient(135deg, #f59e0b, #d97706)'
                              : 'linear-gradient(135deg, #a855f7, #7c3aed)')
                          : 'transparent',
                        border: 'none',
                        borderRadius: 6,
                        color: active ? '#fff' : '#9399b2',
                        fontSize: 11,
                        fontWeight: active ? 700 : 500,
                        cursor: 'pointer',
                        letterSpacing: 0.3,
                        textTransform: 'uppercase',
                        transition: 'background 0.15s, color 0.15s',
                      }}
                    >
                      {l.label}
                    </button>
                  </Tooltip>
                );
              })}
            </div>
            <div style={{ fontSize: 11, color: '#9399b2', marginTop: 8, lineHeight: 1.5 }}>
              {desktopPermLevel === 'watch' && 'Ava describes what she would do — you stay in control of the mouse and keyboard. She never clicks, types, or launches anything.'}
              {desktopPermLevel === 'ask'   && 'Ava acts on your screen; every click, keystroke, and app launch waits for your confirmation.'}
              {desktopPermLevel === 'drive' && 'Reversible plan steps run silently after one approval. Irreversible actions still ask each time.'}
            </div>
          </div>

          {/* Audit log — purely informational, no toggle */}
          <div style={{
            padding: '10px 12px', background: 'rgba(10, 6, 18, 0.6)',
            border: '1px solid rgba(168,85,247,0.12)', borderRadius: 8,
          }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#cdd6f4', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ color: '#a6e3a1' }}>●</span>
              Audit log
            </div>
            <div style={{ fontSize: 11, color: '#9399b2', lineHeight: 1.5 }}>
              Every desktop tool call (click, keystroke, launch) is appended to{' '}
              <code style={{ color: '#cdd6f4', fontFamily: 'monospace', fontSize: 10 }}>~/.ava/audit-log.jsonl</code>{' '}
              on this machine. Survives restarts, never syncs anywhere, works fully without an account.
            </div>
          </div>

          {/* Kill-switch reminder */}
          <div style={{
            padding: '10px 12px', background: 'rgba(239, 68, 68, 0.06)',
            border: '1px solid rgba(239, 68, 68, 0.20)', borderRadius: 8,
          }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#f5d0d0', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ color: '#f87171' }}>⏻</span>
              Emergency stop
            </div>
            <div style={{ fontSize: 11, color: '#cba8a8', lineHeight: 1.5 }}>
              Press{' '}
              <kbd style={{ padding: '1px 6px', background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(248,113,113,0.4)', borderRadius: 4, fontFamily: 'monospace', fontSize: 10, color: '#fff' }}>Ctrl+Alt+K</kbd>{' '}
              anytime to immediately stop Ava and exit desktop mode. Also available via the system tray.
            </div>
          </div>
        </div>

        </div>{/* /Desktop */}

        {/* ── Group: Privacy (sec 9 — Danger Zone) ─────────────── */}
        <div style={{ display: settingsTab === 'privacy' ? 'contents' : 'none' }}>
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
        </div>{/* /Privacy-2 */}
      </div>
    </div>
  );
}

/* ===== 11. Billing ===== */
export function BillingPage() {
  useLocale();
  const connected = checkConnected();
  const { data: usage, loading } = useApiData<any>('/usage/summary', null);
  // Tier tracked as state so the panel re-renders when refreshTier() picks
  // up a platform upgrade (ava-tier-changed event from lib/api.ts).
  const [tier, setTier] = useState<string>(() => localStorage.getItem('ava-ide-tier') || 'free');
  useEffect(() => {
    const onChange = (e: Event) => {
      const next = (e as CustomEvent).detail?.tier as string | undefined;
      if (next) setTier(next);
      else setTier(localStorage.getItem('ava-ide-tier') || 'free');
    };
    window.addEventListener('ava-tier-changed', onChange);
    return () => window.removeEventListener('ava-tier-changed', onChange);
  }, []);

  const tierConfig: Record<string, { label: string; color: string; bg: string; limit: string }> = {
    free:       { label: t('dash.billing.plan.free'), color: '#a6e3a1', bg: 'rgba(166,227,161,0.10)', limit: '300 credits' },
    pro:        { label: t('dash.billing.plan.pro'), color: '#89b4fa', bg: 'rgba(137,180,250,0.10)', limit: '5,000 credits' },
    ultra:      { label: t('dash.billing.plan.ultra'), color: '#cba6f7', bg: 'rgba(203,166,247,0.10)', limit: '10,000 credits' },
    enterprise: { label: t('dash.billing.plan.enterprise'), color: '#f9e2af', bg: 'rgba(249,226,175,0.10)', limit: '20,000 credits' },
    admin:      { label: t('dash.billing.plan.admin'), color: '#f38ba8', bg: 'rgba(243,139,168,0.10)', limit: 'Unlimited' },
  };
  const tc = tierConfig[tier] || tierConfig.free;

  const freeUsed = usage?.period?.free_credits_used || 0;
  const freeLimit = usage?.period?.free_credits_limit || 300;
  const planUsed = usage?.period?.credits_used || 0;
  const planLimit = usage?.period?.credits_limit || 0;
  const topUpBalance = usage?.period?.topup_tokens_remaining || 0;

  const pct = (used: number, limit: number) => limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;

  // ── Live checkout handlers — plans, top-ups ─────────────────────────────
  // Hits the platform's /api/billing/checkout (or /topup) endpoint with the
  // operator's platform key (apiFetch attaches it), receives a Stripe URL,
  // opens it in the system browser via the Tauri opener plugin. Mirrors the
  // extension's openCheckout / openTopup in DashboardPanel.ts.
  // [pending] state is per-card so the operator sees an accurate "Opening..."
  // label and can't double-click the same card while the round-trip is in flight.
  const [checkoutPending, setCheckoutPending] = useState<string | null>(null);

  const openExternalUrl = async (url: string) => {
    try {
      const { openUrl } = await import('@tauri-apps/plugin-opener');
      await openUrl(url);
    } catch {
      window.open(url, '_blank');
    }
  };

  const startPlanCheckout = async (plan: 'pro' | 'ultra' | 'enterprise') => {
    if (checkoutPending) return;
    setCheckoutPending(`plan:${plan}`);
    try {
      const res: { url?: string } = await apiFetch('/billing/checkout', {
        method: 'POST', body: JSON.stringify({ plan }),
      });
      if (res?.url) await openExternalUrl(res.url);
    } catch { /* network/auth — silent, restored CTA tells the operator nothing happened */ }
    setCheckoutPending(null);
  };

  const startTopupCheckout = async (pkgId: string) => {
    if (checkoutPending) return;
    setCheckoutPending(`topup:${pkgId}`);
    try {
      const res: { url?: string } = await apiFetch('/billing/topup', {
        method: 'POST', body: JSON.stringify({ package: pkgId }),
      });
      if (res?.url) await openExternalUrl(res.url);
    } catch { /* */ }
    setCheckoutPending(null);
  };

  return (
    <div style={pageWrapper}>
      <h1 style={pageTitle}>{t('dash.billing.title')}</h1>
      <p style={pageSubtitle}>{t('dash.billing.subtitle')}</p>

      {!connected ? (
        <div style={{ ...card, textAlign: 'center', padding: 60 }}>
          <div style={{ marginBottom: 12, color: '#a855f7' }}><PhCreditCard size={44} weight="duotone" /></div>
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
            <a href={dashboardBillingUrl()} target="_blank" rel="noopener noreferrer" style={{
              padding: '8px 18px', borderRadius: 8, fontSize: 12, fontWeight: 600,
              background: 'linear-gradient(135deg, #a855f7, #7c3aed)', color: '#fff', textDecoration: 'none',
            }}>Manage Plan</a>
          </div>

          {/* Credit Balance — single card. Free tier shows the free pool;
              paid tiers show the plan pool (which already includes any
              top-ups, per project_billing_architecture). We don't sum the
              two — on paid plans the legacy 300 free credits aren't an
              additive bonus, they're just the pool that's bypassed. */}
          {(() => {
            const isFree = tier === 'free';
            const used = isFree ? freeUsed : planUsed;
            const limit = isFree ? freeLimit : planLimit;
            const remaining = Math.max(0, limit - used);
            const usedPct = pct(used, limit);
            return (
              <div style={{ ...card, marginTop: 16 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
                  <div style={{ fontSize: 12, color: '#6c7086' }}>Credits Remaining</div>
                  <div style={{ fontSize: 11, color: '#45475a' }}>
                    {limit > 0
                      ? `${remaining.toLocaleString()} of ${limit.toLocaleString()}`
                      : 'No credits this period'}
                  </div>
                </div>
                <div style={{ fontSize: 28, fontWeight: 700, color: '#cdd6f4', marginBottom: 10, fontVariantNumeric: 'tabular-nums' }}>
                  {remaining.toLocaleString()}
                </div>
                <div style={{ height: 6, background: 'rgba(49, 34, 68, 0.5)', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%',
                    width: `${usedPct}%`,
                    background: usedPct >= 95
                      ? 'linear-gradient(90deg, #f87171, #ef4444)'
                      : usedPct >= 80
                        ? 'linear-gradient(90deg, #f59e0b, #eab308)'
                        : 'linear-gradient(90deg, #a855f7, #7c3aed)',
                    borderRadius: 3,
                    transition: 'width 0.5s',
                  }} />
                </div>
                <div style={{ fontSize: 11, color: '#6c7086', marginTop: 8 }}>
                  {tier === 'free'
                    ? 'Resets monthly. Upgrade for more.'
                    : 'Includes your monthly plan allowance + any top-ups.'}
                </div>
              </div>
            );
          })()}

          {/* Top-Up Balance */}
          {topUpBalance > 0 && (
            <div style={{ ...card, marginTop: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 12, color: '#6c7086', marginBottom: 4 }}>Top-Up Balance</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#f9e2af' }}>{topUpBalance.toLocaleString()}</div>
              </div>
              <span style={{ padding: '3px 10px', borderRadius: 8, fontSize: 10, color: '#f9e2af', background: 'rgba(249,226,175,0.10)' }}>Active</span>
            </div>
          )}

          {/* Token Top-Up Packages — unified purchase card shape.
              Same visual language as the extension + the website pricing
              page. Effective rate makes the 10M "Best value" honest —
              20-40% cheaper per token. */}
          <h2 style={{ fontSize: 15, fontWeight: 600, color: '#cdd6f4', marginTop: 24, marginBottom: 12 }}>Top-Up Packages</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            {CREDIT_TOPUPS.map((pkg) => {
              const isPending = checkoutPending === `topup:${pkg.id}`;
              return (
                <IdePurchaseCard
                  key={pkg.id}
                  title={pkg.label}
                  subtitle={pkg.subtitle}
                  price={`$${pkg.price}`}
                  effectiveRate={pkg.effectiveRate}
                  popular={pkg.popular}
                  state="live"
                  ctaLabel={isPending ? 'Opening checkout…' : 'Buy credits'}
                  onClick={() => startTopupCheckout(pkg.id)}
                />
              );
            })}
          </div>

          {/* Plans — all four tiers shown for full transparency. Current tier
              flagged "Your plan". Free always visible so paid users can see
              where they'd land on missed renewal / cancellation. */}
          {tier !== 'admin' && (
            <>
              <h2 style={{ fontSize: 15, fontWeight: 600, color: '#cdd6f4', marginTop: 32, marginBottom: 12 }}>Plans</h2>
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr 1fr 1fr',
                gap: 12,
              }}>
                {(['free', 'pro', 'ultra', 'enterprise'] as const).map((target: Exclude<AvaPlanTier, 'admin'>) => {
                  const plan = PLANS[target];
                  const isCurrent = target === tier;
                  const highlight = target === 'ultra';
                  return (
                    <div key={target} style={{
                      ...card, padding: '20px 18px', position: 'relative',
                      borderColor: isCurrent
                        ? 'rgba(166,227,161,0.45)'
                        : highlight
                        ? 'rgba(168,85,247,0.4)'
                        : 'rgba(49, 34, 68, 0.5)',
                    }}>
                      {isCurrent && (
                        <span style={{ position: 'absolute', top: 8, right: 10, fontSize: 8, fontWeight: 700, padding: '2px 7px', borderRadius: 6, background: 'rgba(166,227,161,0.12)', color: '#a6e3a1', letterSpacing: 0.5 }}>YOUR PLAN</span>
                      )}
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#cdd6f4', marginBottom: 2 }}>{plan.name}</div>
                      <div style={{ marginBottom: 12 }}>
                        <span style={{ fontSize: 28, fontWeight: 700, color: '#cdd6f4' }}>${plan.price}</span>
                        <span style={{ fontSize: 11, color: '#6c7086', marginLeft: 4 }}>/mo</span>
                      </div>
                      <ul style={{ margin: 0, padding: 0, listStyle: 'none', marginBottom: 14 }}>
                        {plan.features.map((f) => (
                          <li key={f} style={{ fontSize: 11, color: '#a6adc8', marginBottom: 6, paddingLeft: 14, position: 'relative' }}>
                            <span style={{ position: 'absolute', left: 0, color: '#a855f7' }}>{'\u2713'}</span>
                            {f}
                          </li>
                        ))}
                      </ul>
                      {(() => {
                        // Plans are live (Pro / Ultra / Enterprise). Free is
                        // not a checkout target — operators land there by
                        // default or via cancel-and-downgrade through the
                        // billing portal. So: current plan reads "Current
                        // plan", free shows nothing actionable here, and
                        // the rest open Stripe checkout.
                        if (isCurrent) {
                          return (
                            <div style={{
                              display: 'block', padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                              background: 'rgba(166,227,161,0.10)', color: '#a6e3a1',
                              border: '1px solid rgba(166,227,161,0.25)', textAlign: 'center',
                            }}>Current plan</div>
                          );
                        }
                        if (target === 'free') {
                          // Downgrade-to-free goes through the billing portal,
                          // not a checkout. Surface that affordance only when
                          // useful (currently on a paid plan).
                          return (
                            <a
                              href={dashboardBillingUrl()}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{
                                display: 'block', padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 500,
                                background: 'transparent', color: '#9399b2',
                                border: '1px solid rgba(168,85,247,0.18)', textAlign: 'center',
                                textDecoration: 'none',
                              }}
                            >Manage in portal</a>
                          );
                        }
                        const isPending = checkoutPending === `plan:${target}`;
                        return (
                          <button
                            onClick={() => startPlanCheckout(target as 'pro' | 'ultra' | 'enterprise')}
                            disabled={isPending}
                            style={{
                              display: 'block', width: '100%', padding: '8px 16px', borderRadius: 8,
                              fontSize: 12, fontWeight: 600,
                              background: highlight
                                ? 'linear-gradient(90deg, #a855f7, #7c3aed)'
                                : 'rgba(168,85,247,0.10)',
                              color: highlight ? '#fff' : '#cba6f7',
                              border: highlight ? 'none' : '1px solid rgba(168,85,247,0.30)',
                              cursor: isPending ? 'wait' : 'pointer',
                              opacity: isPending ? 0.65 : 1,
                              boxShadow: highlight ? '0 2px 12px rgba(168,85,247,0.30)' : 'none',
                              textAlign: 'center', transition: 'opacity 0.15s',
                            }}
                          >
                            {isPending ? 'Opening checkout…' : `Upgrade to ${plan.name}`}
                          </button>
                        );
                      })()}
                    </div>
                  );
                })}
              </div>
            </>
          )}
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
        <div style={{ marginBottom: 8, color: '#a855f7' }}><PhLink size={36} weight="duotone" /></div>
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

/* ===== 12b. Remote Devices (D7) ===== */
export function RemoteDevicesPage() {
  useLocale();
  const [devices, setDevices] = useState<Array<{
    id: string; name: string; fingerprint: string;
    lastSeen: string; paired: boolean;
  }>>([]);

  // In production: read from ~/.ava/remote-devices.json
  // For now, empty state with explanation

  return (
    <div style={pageWrapper}>
      <h1 style={pageTitle}>Remote Devices</h1>
      <p style={pageSubtitle}>Manage companion devices that can pair with this IDE for remote desktop automation.</p>

      {devices.length === 0 ? (
        <div style={{ ...card, textAlign: 'center', padding: '32px 20px', marginBottom: 24 }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>{'📱'}</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#cdd6f4', marginBottom: 4 }}>No devices paired yet</div>
          <div style={{ fontSize: 12, color: '#6c7086', lineHeight: 1.5, maxWidth: 400, margin: '0 auto' }}>
            When you pair your companion app with this IDE during desktop automation mode,
            the device will appear here. You can revoke access at any time.
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {devices.map(d => (
            <div key={d.id} style={{ ...card, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 22 }}>{'📱'}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#cdd6f4' }}>{d.name}</div>
                <div style={{ fontSize: 11, color: '#6c7086' }}>
                  Last seen: {new Date(d.lastSeen).toLocaleDateString()} · {d.fingerprint.slice(0, 12)}...
                </div>
              </div>
              <button
                onClick={() => setDevices(prev => prev.filter(x => x.id !== d.id))}
                style={{
                  padding: '4px 12px', borderRadius: 6, fontSize: 11,
                  background: 'rgba(243,139,168,0.1)', color: '#f38ba8',
                  border: '1px solid rgba(243,139,168,0.3)', cursor: 'pointer',
                }}
              >
                Revoke
              </button>
            </div>
          ))}
        </div>
      )}

      <div style={{ ...card, padding: '14px 18px', marginTop: 24 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#cdd6f4', marginBottom: 6 }}>How pairing works</div>
        <div style={{ fontSize: 11, color: '#6c7086', lineHeight: 1.6 }}>
          1. Start desktop automation mode (@@) in this IDE<br />
          2. Open the companion app on your phone<br />
          3. Select this IDE session from the sessions list<br />
          4. First-time devices need approval from this desktop<br />
          5. Once paired, the companion can drive the trajectory remotely
        </div>
      </div>
    </div>
  );
}

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

/* ===== Roadmap =====
 *
 * Fetched live from the platform's /api/roadmap (single source of
 * truth shared with the public web roadmap, the extension Roadmap
 * tab, and the Hub admin editor). The previous hardcoded
 * ROADMAP_THEMES const drifted out of sync — that whole block is
 * gone now. New shape lives below as a runtime fetch keyed off
 * the IDE's current locale.
 */

interface IdeRoadmapItem {
  id: string;
  label: string;
  shipped: boolean;
  sort_order: number;
}

interface IdeRoadmapTheme {
  id: string;
  slug: string;
  title: string;
  icon: string;
  color: string;
  color_bg: string;
  sort_order: number;
  items: IdeRoadmapItem[];
}


/* ═══════════════════════════════════════════════════════════════════
 * CONSOLIDATED PAGES — match extension sidebar layout
 * ═══════════════════════════════════════════════════════════════════ */

export function PlannerPage() {
  const [tab, setTab] = useState<'tasks' | 'journal' | 'learning' | 'plans'>('tasks');
  const tabs = [
    { key: 'tasks' as const, icon: '\u2713', label: 'Tasks' },
    { key: 'journal' as const, icon: '\u270E', label: 'Journal' },
    { key: 'learning' as const, icon: '\u2605', label: 'Learning' },
    { key: 'plans' as const, icon: '\u2630', label: 'Plans' },
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
      {tab === 'plans' && <HealthPlansPage />}
    </div>
  );
}

// Inner components — reuse existing page content without the outer wrapper
function TasksPageInner() { return <TasksPage />; }
function JournalPageInner() { return <JournalPage />; }
function LearningPageInner() { return <LearningPage />; }

export function AccountPage() {
  const [tab, setTab] = useState<'settings' | 'billing' | 'connections' | 'personality'>('settings');
  // Was reading 'ava-platform-key' — wrong storage key. The canonical
  // location is 'ava-ide-platform-key' (per getPlatformKey() in lib/api).
  // The mismatch meant the Billing tab was hidden even for signed-in
  // operators, because `connected` was always false. Use the helper so
  // we also pick up the sk-ava- prefix validation.
  const [connected, setConnected] = useState<boolean>(() => checkConnected());
  // Re-check on auth changes (sign-in / disconnect) so the Billing tab
  // shows / hides without a manual refresh.
  useEffect(() => {
    const onChange = () => setConnected(checkConnected());
    window.addEventListener('ava-auth-changed', onChange);
    return () => window.removeEventListener('ava-auth-changed', onChange);
  }, []);
  const tabs = [
    { key: 'settings' as const, label: 'Settings' },
    ...(connected ? [{ key: 'billing' as const, label: 'Billing' }] : []),
    { key: 'connections' as const, label: 'Connections' },
    { key: 'personality' as const, label: "Ava's Style" },
    // Sync tab removed — Ava is local-first; nothing syncs to the cloud.
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
  const [themes, setThemes] = useState<IdeRoadmapTheme[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    apiFetch(`/roadmap?locale=${encodeURIComponent(getLocale())}`)
      .then((res: { themes?: IdeRoadmapTheme[] } | null) => {
        if (cancelled) return;
        setThemes(res?.themes ?? []);
        setLoading(false);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Failed to load roadmap');
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const totalShipped = themes.reduce((s, t) => s + t.items.filter(i => i.shipped).length, 0);
  const totalAll = themes.reduce((s, t) => s + t.items.length, 0);
  const pctAll = totalAll > 0 ? Math.round((totalShipped / totalAll) * 100) : 0;

  return (
    <div style={pageWrapper}>
      <div style={{ width: '100%', maxWidth: 700 }}>
        <div style={pageTitle}>Roadmap</div>
        <div style={{ ...pageSubtitle, marginBottom: 24 }}>Where Ava has been and where she is heading.</div>

        {loading && themes.length === 0 && (
          <div style={{ ...card, padding: 40, textAlign: 'center', fontSize: 13, color: '#6c7086' }}>Loading roadmap…</div>
        )}

        {error && !loading && (
          <div style={{ ...card, padding: 20, fontSize: 12, color: '#f38ba8', borderColor: 'rgba(243, 139, 168, 0.3)' }}>
            Could not load roadmap: {error}
          </div>
        )}

        {!loading && !error && themes.length === 0 && (
          <div style={{ ...card, padding: 40, textAlign: 'center', fontSize: 13, color: '#6c7086' }}>
            No roadmap items yet. New ones land here as they ship.
          </div>
        )}

        {themes.length > 0 && (
          <>
            <div style={{ display: 'flex', gap: 32, marginBottom: 32 }}>
              <div><div style={{ fontSize: 28, fontWeight: 300, color: '#a855f7' }}>{pctAll}%</div><div style={{ fontSize: 10, color: '#6c7086', textTransform: 'uppercase', letterSpacing: 1 }}>Complete</div></div>
              <div><div style={{ fontSize: 28, fontWeight: 300, color: '#a6e3a1' }}>{totalShipped}</div><div style={{ fontSize: 10, color: '#6c7086', textTransform: 'uppercase', letterSpacing: 1 }}>Shipped</div></div>
              <div><div style={{ fontSize: 28, fontWeight: 300, color: '#89b4fa' }}>{totalAll - totalShipped}</div><div style={{ fontSize: 10, color: '#6c7086', textTransform: 'uppercase', letterSpacing: 1 }}>Coming</div></div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {themes.map(theme => {
                const shipped = theme.items.filter(i => i.shipped).length;
                const total = theme.items.length;
                const themePct = total > 0 ? Math.round((shipped / total) * 100) : 0;
                if (total === 0) return null;
                return (
                  <div key={theme.id} style={{ ...card, overflow: 'hidden' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px' }}>
                      <span style={{ fontSize: 20 }}>{theme.icon}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ fontSize: 14, fontWeight: 400, color: '#cdd6f4' }}>{theme.title}</span><span style={{ fontSize: 10, color: '#6c7086' }}>{shipped}/{total}</span></div>
                        <div style={{ marginTop: 6, height: 4, width: '100%', borderRadius: 2, background: theme.color_bg }}><div style={{ height: '100%', borderRadius: 2, background: theme.color, width: themePct + '%' }} /></div>
                      </div>
                    </div>
                    <div style={{ padding: '0 20px 16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                      {theme.items.map(item => (
                        <div key={item.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '6px 8px', borderRadius: 6, background: item.shipped ? 'transparent' : theme.color_bg }}>
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
          </>
        )}
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
        const freeUsed = res.period.free_credits_used || 0;
        const freeLimit = res.period.free_credits_limit || 300;
        const subUsed = res.period.credits_used || 0;
        const subLimit = res.period.credits_limit || 0;
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
  // Exact credit count with locale-grouped digits — operator wants the
  // precise number, not "5K" / "1.2M" rounded buckets, so they can see
  // exactly how many credits a generation actually cost.
  const fmt = (n: number) => n.toLocaleString();
  return (
    <div style={{ width: 180, flexShrink: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#6c7086', marginBottom: 4 }}>
        <span>Credits Remaining</span><span>{fmt(rem)}</span>
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

  // Library tab removed — browsing generated assets now lives in the
  // top-level Library page. Creative Studio stays as a pure creation
  // surface (images / audio / voice / video). Matches the extension's
  // v0.48.4 restructure.
  const [tab, setTab] = useState<'images' | 'audio' | 'voice' | 'sfx' | 'video'>('images');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // Per-medium gallery hooks — replace the old single-slot lastX state.
  // Each hook handles persistence (disk + cloud per data-mode) and
  // exposes saveGenerated/deleteItem operations the form handlers call.
  // gallery.items[0] is the most recent generation, used by the strip.
  const imageGallery = useCreativeGallery('image');
  const musicGallery = useCreativeGallery('music');
  const voiceGallery = useCreativeGallery('voice');
  const sfxGallery   = useCreativeGallery('sfx');
  const videoGallery = useCreativeGallery('video');

  // Session start — anchors the per-medium strips to "things made this
  // session". Library is the canonical archive; Creative Studio is for
  // creation only. Reload = empty right panel; new generations stack.
  const sessionStart = useMemo(() => new Date().toISOString(), []);
  const inSession = useCallback(
    (i: GalleryItem) => (i.createdAt || '') >= sessionStart,
    [sessionStart],
  );
  const sessionImages = useMemo(() => imageGallery.items.filter(inSession), [imageGallery.items, inSession]);
  const sessionMusic  = useMemo(() => musicGallery.items.filter(inSession), [musicGallery.items, inSession]);
  const sessionVoice  = useMemo(() => voiceGallery.items.filter(inSession), [voiceGallery.items, inSession]);
  const sessionSfx    = useMemo(() => sfxGallery.items.filter(inSession), [sfxGallery.items, inSession]);
  const sessionVideo  = useMemo(() => videoGallery.items.filter(inSession), [videoGallery.items, inSession]);

  // Images state
  const [imagePrompt, setImagePrompt] = useState('');
  const [imageSize, setImageSize] = useState<'1:1' | '3:4' | '4:3'>('1:1');

  // Audio state
  const [musicPrompt, setMusicPrompt] = useState('');
  const [musicLyrics, setMusicLyrics] = useState('');

  // Voice state
  const [voiceText, setVoiceText] = useState('');
  const [voiceId, setVoiceId] = useState('Calm_Woman');
  const [voiceSpeed, setVoiceSpeed] = useState(1.0);

  // SFX state
  const [sfxPrompt, setSfxPrompt] = useState('');

  // Video state
  const [videoPrompt, setVideoPrompt] = useState('');
  const [videoDuration, setVideoDuration] = useState<6 | 10>(6);
  const [elapsed, setElapsed] = useState(0);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Persistence — formerly saveToLocal — moved into the
  // useCreativeGallery hook (lib/creative-gallery.ts). The hook honours
  // the operator's Data Mode (local / cloud / both) and writes to disk +
  // ~/.ava/creative/metadata.json + Supabase as appropriate. Each handler
  // calls gallery.saveGenerated({ prompt, title, url }) with the result.

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
      // No model field → server defaults to Wan (DashScope wan2.6-t2i).
      // Wan handles vector / graphic-design output materially better than
      // MiniMax image-01 — the previous default — which renders every
      // prompt as soft painterly illustration.
      const res = await fetch(`${PLATFORM_API}/generate-image`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ prompt: imagePrompt.trim(), size: sizeMap[imageSize] }),
      });
      if (!res.ok) throw new Error(`Image generation failed (${res.status})`);
      const data = await res.json();
      if (data.url) {
        await imageGallery.saveGenerated({
          prompt: imagePrompt,
          title: imagePrompt.slice(0, 60),
          url: data.url,
        });
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
        await musicGallery.saveGenerated({
          prompt: musicPrompt,
          title: musicPrompt.slice(0, 60),
          url: data.url,
        });
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
        await voiceGallery.saveGenerated({
          prompt: voiceText,
          title: voiceText.slice(0, 60),
          url: data.url,
        });
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
        await sfxGallery.saveGenerated({
          prompt: sfxPrompt,
          title: sfxPrompt.slice(0, 60),
          url: data.url,
        });
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
        await videoGallery.saveGenerated({
          prompt: videoPrompt,
          title: videoPrompt.slice(0, 60),
          url: data.url,
        });
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

  // Regenerate handlers — drop the previous gallery item's prompt back
  // into the form and trigger the generation handler. Operator can edit
  // first if they want a variation; one click + Generate is the fast path.
  const onRegenerateImage = (item: GalleryItem) => { setImagePrompt(item.prompt); };
  const onRegenerateMusic = (item: GalleryItem) => { setMusicPrompt(item.prompt); };
  const onRegenerateVoice = (item: GalleryItem) => { setVoiceText(item.prompt); };
  const onRegenerateSfx   = (item: GalleryItem) => { setSfxPrompt(item.prompt); };
  const onRegenerateVideo = (item: GalleryItem) => { setVideoPrompt(item.prompt); };

  const renderImagesResults = () => (
    <CreativeGalleryStrip
      items={sessionImages}
      onRegenerate={onRegenerateImage}
      onDelete={imageGallery.deleteItem}
      emptyHint="Generate an image — it'll appear here for this session, then live in your Library."
    />
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
    <CreativeGalleryStrip
      items={sessionMusic}
      onRegenerate={onRegenerateMusic}
      onDelete={musicGallery.deleteItem}
      emptyHint="Generate music — it'll appear here for this session, then live in your Library."
    />
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
    <CreativeGalleryStrip
      items={sessionVoice}
      onRegenerate={onRegenerateVoice}
      onDelete={voiceGallery.deleteItem}
      emptyHint="Generate voice — it'll appear here for this session, then live in your Library."
    />
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
    <CreativeGalleryStrip
      items={sessionSfx}
      onRegenerate={onRegenerateSfx}
      onDelete={sfxGallery.deleteItem}
      emptyHint="Generate a sound effect — it'll appear here for this session, then live in your Library."
    />
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
    <CreativeGalleryStrip
      items={sessionVideo}
      onRegenerate={onRegenerateVideo}
      onDelete={videoGallery.deleteItem}
      emptyHint="Generate a video — it'll appear here for this session, then live in your Library."
    />
  );

  return (
    <div style={{ ...pageWrapper, display: 'flex', flexDirection: 'column' }}>
      <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={pageTitle}>Creative Studio</div>
          <div style={pageSubtitle}>Generate images with Wan, plus music, voice, and video with MiniMax</div>
        </div>
        <CSTokenBar refreshKey={refreshKey} />
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid rgba(168, 85, 247, 0.12)', marginBottom: 16, paddingBottom: 1 }}>
        {/* SFX tab hidden — in development. MiniMax music model doesn't support short isolated sound effects yet. */}
        {(['images', 'audio', 'voice', /* 'sfx', */ 'video'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={tabBtn(t, tab === t)}>
            {t === 'images' ? '\uD83D\uDDBC\uFE0F Images' : t === 'audio' ? '\uD83C\uDFB5 Audio' : t === 'voice' ? '\uD83C\uDF99\uFE0F Voice' : t === 'video' ? '\uD83C\uDFAC Video' : '\uD83D\uDCDA Library'}
          </button>
        ))}
      </div>

      {/* Library tab removed — browsing lives in the top-level Library
          page now. Creative Studio is pure creation surface. */}
      {false ? null : (
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

// Dead code after the library tab removal from Creative Studio —
// export keeps noUnusedLocals happy for one release so a targeted
// prune can land as its own commit. Pick up next time this file's
// open. Renamed to _CreativeLibraryTab to signal "retained but unused".
export function _CreativeLibraryTab() {
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



/* ===== Models — public benchmark leaderboard ============================
   Reads ava-supernova-bench/leaderboard.json from raw GitHub. Renders the
   heatmap + plain-language summaries any user can audit themselves by
   visiting the public bench repo. No platform middleman: the bytes
   shown here are the bytes anyone visiting raw.githubusercontent.com
   sees. That equivalence is the trust claim.
   ====================================================================== */
export function ModelsPage() {
  useLocale();
  const [leaderboard, setLeaderboard] = useState(() => {
    try { return getCachedBenchLeaderboard(); } catch { return null; }
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  const toggle = (id: string) =>
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  const refresh = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const fresh = await fetchPublicBenchLeaderboard();
      if (fresh) setLeaderboard(fresh);
      else setError("The public benchmark repo isn't live yet — the leaderboard publishes the moment Ava's first run batch is pushed.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!leaderboard || isCachedBenchLeaderboardStale()) void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cellColor = (score: number | undefined): string => {
    if (score == null) return 'rgba(49,34,68,0.4)';
    if (score >= 90) return 'rgba(34,197,94,0.55)';
    if (score >= 75) return 'rgba(34,197,94,0.35)';
    if (score >= 60) return 'rgba(249,226,175,0.45)';
    if (score >= 40) return 'rgba(251,146,60,0.45)';
    return 'rgba(239,68,68,0.45)';
  };

  const openExternal = (url: string) => {
    import('@tauri-apps/plugin-opener').then(({ openUrl }) => openUrl(url)).catch(() => {});
  };

  // No-naked-score sub-line — cost + latency + n, each only when present.
  const metaLine = (m: BenchModelScoresType): string | null => {
    const parts: string[] = [];
    if (m.cost_credits_per_task != null) parts.push(`${m.cost_credits_per_task.toFixed(1)} cr/task`);
    if (m.median_latency_s != null) parts.push(`${m.median_latency_s.toFixed(0)}s`);
    if (m.overall_sample_size != null) parts.push(`n=${m.overall_sample_size}`);
    return parts.length ? parts.join(' · ') : null;
  };

  // Lowest cells across the whole board — surfaced on purpose.
  const worstCells = (lb: BenchLeaderboardType, limit = 4) => {
    const cells: { name: string; cat: string; score: number }[] = [];
    for (const m of lb.models) {
      for (const cat of lb.categories) {
        const cell = m.scores[cat];
        if (cell) cells.push({ name: m.display_name, cat: BENCH_CATEGORY_LABELS[cat], score: cell.score });
      }
    }
    return cells.sort((a, b) => a.score - b.score).slice(0, limit);
  };

  const models = leaderboard?.models.filter(m => m.entry_kind !== 'mode') ?? [];
  const modes = leaderboard?.models.filter(m => m.entry_kind === 'mode') ?? [];

  // One heatmap — reused for the Models block and the Modes block. `expandable`
  // turns on the fleet-disclosure row for mode entries.
  const renderTable = (rows: BenchModelScoresType[], expandable: boolean) => {
    if (!leaderboard || rows.length === 0) return null;
    return (
      <div style={{ ...card, padding: 16, marginBottom: 16, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 4 }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', fontSize: 11, color: '#6c7086', fontWeight: 500, padding: '6px 10px' }}>{expandable ? 'Mode' : 'Model'}</th>
              {leaderboard.categories.map(cat => (
                <th key={cat} style={{ textAlign: 'center', fontSize: 10, color: '#6c7086', fontWeight: 500, padding: '6px 8px', minWidth: 110 }}>
                  {BENCH_CATEGORY_LABELS[cat]}
                </th>
              ))}
              <th style={{ textAlign: 'center', fontSize: 10, color: '#6c7086', fontWeight: 500, padding: '6px 8px' }}>Overall</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(m => {
              const meta = metaLine(m);
              const hasFleet = expandable && !!m.constituent_models?.length;
              const isOpen = expanded.has(m.model_id);
              return (
                <Fragment key={m.model_id}>
                  <tr>
                    <td style={{ padding: '8px 10px', verticalAlign: 'top' }}>
                      <div
                        onClick={() => hasFleet && toggle(m.model_id)}
                        style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 500, color: '#cdd6f4', cursor: hasFleet ? 'pointer' : 'default' }}
                      >
                        {hasFleet && (
                          <PhCaretRight size={11} weight="bold" style={{ transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }} />
                        )}
                        {m.display_name}
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px 8px', marginTop: 4 }}>
                        {meta && <span style={{ fontSize: 10, fontFamily: 'monospace', color: '#6c7086' }}>{meta}</span>}
                        {m.tasks_after_release != null && m.tasks_total != null && (
                          <span
                            title="Tasks published after this model shipped — no training-data contamination on those."
                            style={{ fontSize: 9, fontFamily: 'monospace', color: '#a6e3a1', background: 'rgba(34,197,94,0.1)', borderRadius: 4, padding: '1px 5px' }}
                          >
                            clean {m.tasks_after_release}/{m.tasks_total}
                          </span>
                        )}
                        {m.receipts_url && (
                          <span
                            onClick={() => openExternal(m.receipts_url!)}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: 10, fontFamily: 'monospace', color: '#a855f7', cursor: 'pointer' }}
                          >
                            <PhArrowSquareOut size={10} weight="duotone" />
                            receipts
                          </span>
                        )}
                      </div>
                    </td>
                    {leaderboard.categories.map(cat => {
                      const cell = m.scores[cat];
                      const lowConfidence = cell && cell.sample_size < 10;
                      return (
                        <td key={cat}
                          title={cell ? `${cell.score.toFixed(1)}% over ${cell.sample_size} runs${lowConfidence ? ' (low confidence)' : ''}` : 'no runs in this category yet'}
                          style={{
                            textAlign: 'center', fontSize: 11, fontFamily: 'monospace', color: '#cdd6f4', verticalAlign: 'middle',
                            background: cellColor(cell?.score), borderRadius: 6, padding: '10px 8px',
                            opacity: lowConfidence ? 0.5 : 1,
                          }}>
                          {cell ? `${cell.score.toFixed(0)}%` : '—'}
                        </td>
                      );
                    })}
                    <td style={{ textAlign: 'center', fontSize: 11, fontFamily: 'monospace', fontWeight: 700, color: '#cdd6f4', verticalAlign: 'middle', background: cellColor(m.overall_pass_rate), borderRadius: 6, padding: '10px 8px' }}>
                      {m.overall_pass_rate.toFixed(0)}%
                    </td>
                  </tr>
                  {hasFleet && isOpen && (
                    <tr>
                      <td colSpan={leaderboard.categories.length + 2} style={{ padding: '0 10px 8px' }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, borderRadius: 8, border: '1px solid rgba(168,85,247,0.15)', background: 'rgba(26,16,40,0.4)', padding: '8px 12px' }}>
                          <PhStack size={12} weight="duotone" style={{ color: '#a855f7' }} />
                          <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, color: '#6c7086', marginRight: 4 }}>Fleet</span>
                          {m.constituent_models!.map(cm => (
                            <span key={cm} style={{ fontSize: 10, fontFamily: 'monospace', color: '#cdd6f4', background: 'rgba(168,85,247,0.1)', borderRadius: 4, padding: '1px 6px' }}>{cm}</span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div style={pageWrapper}>
      <div style={{ width: '100%' }}>
        <div style={{ marginBottom: 20 }}>
          <div style={pageTitle}>Models</div>
          <div style={pageSubtitle}>Real coding tasks. Real model outputs. Real receipts. Auditable in the public bench repo.</div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 11, color: '#6c7086' }}>
            {leaderboard ? `Generated ${leaderboard.generated_at} · ${leaderboard.total_runs} total runs · ${leaderboard.models.length} entries` : 'No leaderboard data yet'}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {/* GitHub link only shows once data has actually published —
                before that the URL would 404 and we'd be teasing a repo
                that doesn't exist yet. */}
            {leaderboard && (
              <button
                onClick={() => openExternal('https://github.com/AugmentedValueAcceleration/ava-supernova-bench')}
                style={{
                  padding: '6px 12px', borderRadius: 8, border: '1px solid rgba(168,85,247,0.25)',
                  background: 'rgba(168,85,247,0.08)', color: '#cdd6f4', fontSize: 11, cursor: 'pointer',
                }}
              >
                View on GitHub
              </button>
            )}
            <button
              onClick={() => void refresh()}
              disabled={loading}
              style={{
                padding: '6px 12px', borderRadius: 8, border: '1px solid rgba(168,85,247,0.25)',
                background: 'rgba(26, 16, 40, 0.6)', color: '#cdd6f4', fontSize: 11,
                cursor: loading ? 'default' : 'pointer', opacity: loading ? 0.5 : 1,
              }}
            >
              {loading ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
        </div>

        {error && !leaderboard && (
          <div style={{ ...card, padding: 24, textAlign: 'center' }}>
            <div style={{ marginBottom: 12, color: '#a855f7', display: 'flex', justifyContent: 'center' }}>
              <PhRocket size={40} weight="duotone" />
            </div>
            <div style={{ fontSize: 14, color: '#cdd6f4', fontWeight: 500, marginBottom: 6 }}>Leaderboard launching soon</div>
            <div style={{ fontSize: 12, color: '#6c7086', maxWidth: 480, margin: '0 auto', lineHeight: 1.6 }}>{error}</div>
          </div>
        )}

        {leaderboard && (
          <>
            {/* Models (raw models, Tier 1) */}
            {models.length > 0 && (
              <>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#cdd6f4', marginBottom: 8 }}>Models</div>
                {renderTable(models, false)}
              </>
            )}

            {/* Ava Modes (Tier 2) — physically separate so a mode's number can
                never be misread as beating a raw model's. */}
            {modes.length > 0 && (
              <>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#cdd6f4', marginTop: 20, marginBottom: 4 }}>Ava Modes</div>
                <div style={{ fontSize: 11, color: '#6c7086', lineHeight: 1.6, maxWidth: 640, marginBottom: 8 }}>
                  Modes orchestrate several models. They are compared only to each other — never ranked against a raw model, because a mode costs more and runs slower by design. Expand a mode to see the fleet it actually ran.
                </div>
                {renderTable(modes, true)}
              </>
            )}

            {/* Where we lose — our weakest cells, surfaced on purpose. */}
            {leaderboard.total_runs > 0 && (
              <div style={{ borderRadius: 16, border: '1px solid rgba(239,68,68,0.2)', background: 'rgba(239,68,68,0.04)', padding: 16, marginBottom: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#f38ba8', marginBottom: 4 }}>Where we lose</div>
                <div style={{ fontSize: 11, color: '#6c7086', lineHeight: 1.6, marginBottom: 10 }}>
                  Our weakest results, shown on purpose. Publishing your own losses is the part nobody fakes.
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {worstCells(leaderboard).map((w, i) => (
                    <span key={i} style={{ fontSize: 10, color: '#cdd6f4', border: '1px solid rgba(239,68,68,0.2)', background: 'rgba(26,16,40,0.6)', borderRadius: 8, padding: '4px 10px' }}>
                      <span style={{ fontWeight: 500 }}>{w.name}</span>
                      <span style={{ color: '#6c7086' }}> · {w.cat} · </span>
                      <span style={{ fontFamily: 'monospace', color: '#f38ba8' }}>{w.score.toFixed(0)}%</span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Plain-language summaries */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
              {leaderboard.models.map(m => (
                <div key={m.model_id} style={{ ...card, padding: '12px 16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: '#cdd6f4' }}>
                      {m.display_name}
                      {m.entry_kind === 'mode' && (
                        <span style={{ marginLeft: 6, fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.5, color: '#a855f7', background: 'rgba(168,85,247,0.15)', borderRadius: 4, padding: '1px 5px', verticalAlign: 'middle' }}>mode</span>
                      )}
                    </span>
                    <span style={{ fontSize: 12, fontFamily: 'monospace', color: m.overall_pass_rate >= 80 ? '#a6e3a1' : m.overall_pass_rate >= 60 ? '#f9e2af' : '#f38ba8' }}>
                      {m.overall_pass_rate.toFixed(1)}%
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: '#6c7086', marginTop: 4 }}>{m.summary}</div>
                </div>
              ))}
            </div>
          </>
        )}

        <div style={{ ...card, padding: 16, fontSize: 11, color: '#6c7086', lineHeight: 1.7 }}>
          <strong style={{ color: '#cdd6f4' }}>How this works.</strong> Ava runs a hand-curated suite of real coding tasks against every supported model on a weekly cadence. Every score links to the exact prompt sent and the exact response received — open the public repo to read any transcript, propose a tighter scoring rubric, or reproduce a score on your own machine with one command. No user data ever enters this repo.
        </div>
      </div>
    </div>
  );
}


/* ===== IDE Audit View ===================================================
   Inline-style component for the IDE History → Audit tab. Mirrors the
   extension's AuditView feature-for-feature: pattern findings strip,
   search, risk + status filters, cost column, export buttons. Lives
   here as a small component (rather than a separate file) so it's
   colocated with UsagePage that owns the audit state.
   ====================================================================== */
interface IdeAuditEntry {
  timestamp: string;
  toolName: string;
  category: string;
  riskLevel: string;
  approvalMethod: string;
  status: string;
  argsSummary: string;
  fullArgs?: Record<string, unknown>;
  result?: string;
  cost?: { mode: 'platform' | 'byok'; credits?: number; usd?: number; tokens?: { input: number; output: number }; provider?: string; model?: string };
}
interface IdeAuditFinding {
  severity: 'info' | 'warning' | 'critical';
  message: string;
  suggestion?: string;
}
function ideFormatAuditCost(cost: IdeAuditEntry['cost']): string {
  if (!cost) return '—';
  if (cost.mode === 'platform' && cost.credits != null) return `${cost.credits} cr`;
  if (cost.mode === 'byok' && cost.usd != null) return `$${cost.usd.toFixed(cost.usd >= 0.01 ? 4 : 6)}`;
  return '—';
}
function ideDetectAuditPatterns(entries: IdeAuditEntry[]): IdeAuditFinding[] {
  const findings: IdeAuditFinding[] = [];
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const recent = entries.filter(e => e.timestamp >= sevenDaysAgo);
  if (recent.length === 0) return [];
  const byTool = new Map<string, { auto: number; autoFailed: number }>();
  for (const e of recent) {
    if (e.approvalMethod !== 'auto') continue;
    const t = byTool.get(e.toolName) ?? { auto: 0, autoFailed: 0 };
    t.auto++;
    if (e.status === 'failed' || e.status === 'denied') t.autoFailed++;
    byTool.set(e.toolName, t);
  }
  for (const [tool, s] of byTool) {
    if (s.auto >= 5 && s.autoFailed / s.auto > 0.2) {
      findings.push({
        severity: 'warning',
        message: `You auto-approve ${tool} but ${Math.round((s.autoFailed / s.auto) * 100)}% of those calls fail (${s.autoFailed} of ${s.auto} this week).`,
        suggestion: 'Consider tightening the approval rule to first-time, so failures get a second look.',
      });
    }
  }
  const dangerousSucceeded = recent.filter(e => e.riskLevel === 'dangerous' && e.status === 'success');
  if (dangerousSucceeded.length > 0) {
    findings.push({
      severity: 'critical',
      message: `${dangerousSucceeded.length} dangerous tool call${dangerousSucceeded.length === 1 ? '' : 's'} succeeded this week.`,
      suggestion: 'Review these in the audit table to confirm they touched only what you expected.',
    });
  }
  return findings;
}
const AUDIT_PAGE_SIZE = 25;

function IdeAuditView({
  entries, expandedIdx, onToggleExpand,
  search, onSearchChange, riskFilter, onRiskFilterChange, statusFilter, onStatusFilterChange,
  onExport,
}: {
  entries: IdeAuditEntry[];
  expandedIdx: number | null;
  onToggleExpand: (i: number) => void;
  search: string;
  onSearchChange: (v: string) => void;
  riskFilter: string;
  onRiskFilterChange: (v: string) => void;
  statusFilter: string;
  onStatusFilterChange: (v: string) => void;
  onExport: (format: 'markdown' | 'json') => void;
}) {
  const findings = useMemo(() => ideDetectAuditPatterns(entries), [entries]);
  const filtered = useMemo(() => entries.filter(e => {
    if (search && !e.toolName.toLowerCase().includes(search.toLowerCase()) && !e.argsSummary.toLowerCase().includes(search.toLowerCase())) return false;
    if (riskFilter !== 'all' && e.riskLevel !== riskFilter) return false;
    if (statusFilter !== 'all' && e.status !== statusFilter) return false;
    return true;
  }), [entries, search, riskFilter, statusFilter]);

  // Pagination — audit logs grow fast; rendering 1000+ entries was
  // janky. 25/page is the sweet spot with the existing row height.
  // Page resets to 0 whenever filters change so the user isn't
  // stranded on an empty page after narrowing the result set.
  const [page, setPage] = useState(0);
  useEffect(() => { setPage(0); }, [search, riskFilter, statusFilter]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / AUDIT_PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const pageStart = safePage * AUDIT_PAGE_SIZE;
  const paged = filtered.slice(pageStart, pageStart + AUDIT_PAGE_SIZE);
  const totals = useMemo(() => {
    let credits = 0, usd = 0;
    for (const e of filtered) {
      if (e.cost?.credits) credits += e.cost.credits;
      if (e.cost?.usd) usd += e.cost.usd;
    }
    return { credits, usd };
  }, [filtered]);

  const inputStyle: React.CSSProperties = {
    background: 'rgba(49,34,68,0.5)', border: '1px solid rgba(168,85,247,0.18)',
    borderRadius: 6, padding: '6px 10px', fontSize: 11, color: '#cdd6f4', outline: 'none',
  };
  const btnStyle: React.CSSProperties = {
    padding: '6px 10px', borderRadius: 6, border: '1px solid rgba(168,85,247,0.18)',
    background: 'rgba(49,34,68,0.5)', color: '#cdd6f4', fontSize: 11, cursor: 'pointer',
  };
  const sevColors: Record<IdeAuditFinding['severity'], { bg: string; border: string; text: string }> = {
    info:     { bg: 'rgba(49,34,68,0.5)',    border: 'rgba(168,85,247,0.18)', text: '#a6adc8' },
    warning:  { bg: 'rgba(249,226,175,0.06)', border: 'rgba(249,226,175,0.35)', text: '#f9e2af' },
    critical: { bg: 'rgba(243,139,168,0.06)', border: 'rgba(243,139,168,0.4)',  text: '#f9b3c4' },
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {findings.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {findings.map((f, i) => {
            const c = sevColors[f.severity];
            return (
              <div key={i} style={{ background: c.bg, border: `1px solid ${c.border}`, borderRadius: 8, padding: '10px 14px', color: c.text, fontSize: 11, lineHeight: 1.6 }}>
                <div style={{ fontWeight: 600 }}>{f.message}</div>
                {f.suggestion && <div style={{ marginTop: 4, opacity: 0.85, fontSize: 10 }}>{f.suggestion}</div>}
              </div>
            );
          })}
        </div>
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', background: 'rgba(26,16,40,0.6)', border: '1px solid rgba(168,85,247,0.12)', borderRadius: 12, padding: 10 }}>
        <input type="text" value={search} onChange={(e) => onSearchChange(e.target.value)} placeholder="Filter by tool name or argument..." style={{ ...inputStyle, flex: 1, minWidth: 160 }} />
        <select value={riskFilter} onChange={(e) => onRiskFilterChange(e.target.value)} style={inputStyle}>
          <option value="all">All risk</option>
          <option value="safe">Safe</option>
          <option value="write">Write</option>
          <option value="dangerous">Dangerous</option>
        </select>
        <select value={statusFilter} onChange={(e) => onStatusFilterChange(e.target.value)} style={inputStyle}>
          <option value="all">All status</option>
          <option value="success">Success</option>
          <option value="failed">Failed</option>
          <option value="denied">Denied</option>
        </select>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <button onClick={() => onExport('markdown')} style={btnStyle} title="Export as Markdown — human-readable, never leaves your machine">Export .md</button>
          <button onClick={() => onExport('json')} style={btnStyle} title="Export as JSON — for SIEM ingest or programmatic analysis">Export .json</button>
        </div>
      </div>
      {(totals.credits > 0 || totals.usd > 0) && (
        <div style={{ display: 'flex', gap: 16, background: 'rgba(26,16,40,0.6)', border: '1px solid rgba(168,85,247,0.12)', borderRadius: 12, padding: '8px 14px', fontSize: 11 }}>
          {totals.credits > 0 && <span><span style={{ color: '#6c7086' }}>Credits:</span> <span style={{ color: '#cdd6f4', fontWeight: 600 }}>{totals.credits.toLocaleString()}</span></span>}
          {totals.usd > 0 && <span><span style={{ color: '#6c7086' }}>BYOK estimate:</span> <span style={{ color: '#cdd6f4', fontWeight: 600 }}>${totals.usd.toFixed(4)}</span></span>}
          <span style={{ marginLeft: 'auto', color: '#6c7086' }}>{filtered.length} of {entries.length} entries shown</span>
        </div>
      )}
      {filtered.length === 0 ? (
        <div style={{ background: 'rgba(26,16,40,0.6)', border: '1px dashed rgba(168,85,247,0.12)', borderRadius: 12, padding: '32px 20px', textAlign: 'center' }}>
          <div style={{ fontSize: 28, opacity: 0.3, marginBottom: 8 }}>📋</div>
          <div style={{ fontSize: 13, color: '#6c7086' }}>{entries.length === 0 ? 'No tool calls recorded yet.' : 'No entries match your filters.'}</div>
        </div>
      ) : (
        <div style={{ background: 'rgba(26,16,40,0.6)', border: '1px solid rgba(168,85,247,0.12)', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr 80px 60px 90px 80px 60px', gap: 8, padding: '8px 12px', borderBottom: '1px solid rgba(168,85,247,0.12)', fontSize: 9, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' as const, color: '#6c7086' }}>
            <span>Time</span><span>Tool</span><span>Category</span><span>Risk</span><span>Approval</span><span style={{ textAlign: 'right' }}>Cost</span><span>Status</span>
          </div>
          {paged.map((entry, localI) => {
            // Use the absolute filtered index so expandedIdx stays
            // stable across page changes (a user expanding a row on
            // page 1, flipping to page 2, then back, sees their row
            // still open).
            const i = pageStart + localI;
            const time = new Date(entry.timestamp).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
            const isExp = expandedIdx === i;
            const approvalColors: Record<string, string> = { 'auto': '#34d399', 'first-time': '#60a5fa', 'user-approved': '#fbbf24', 'denied': '#f87171' };
            const statusColors: Record<string, string> = { 'success': '#34d399', 'failed': '#f87171', 'denied': '#f87171' };
            const riskColors: Record<string, string> = { 'safe': '#34d399', 'write': '#fbbf24', 'dangerous': '#f87171' };
            const catLabels: Record<string, string> = { file_ops: 'File Ops', shell: 'Shell', git: 'Git', web: 'Web', media: 'Media', database: 'Database', system: 'System', documents: 'Docs', memory: 'Memory', learning: 'Learning' };
            return (
              <div key={i}>
                <button onClick={() => onToggleExpand(i)} style={{ display: 'grid', gridTemplateColumns: '90px 1fr 80px 60px 90px 80px 60px', gap: 8, width: '100%', padding: '8px 12px', textAlign: 'left', fontSize: 11, border: 'none', background: 'transparent', cursor: 'pointer' }}>
                  <span style={{ color: '#6c7086', fontFamily: 'monospace', fontSize: 10 }}>{time}</span>
                  <span style={{ color: '#cdd6f4', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.toolName}</span>
                  <span style={{ color: '#a6adc8' }}>{catLabels[entry.category] || entry.category}</span>
                  <span style={{ color: riskColors[entry.riskLevel] || '#6c7086', fontSize: 10, fontWeight: 500 }}>{entry.riskLevel}</span>
                  <span style={{ color: approvalColors[entry.approvalMethod] || '#6c7086', fontSize: 10, fontWeight: 500 }}>{entry.approvalMethod}</span>
                  <span style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: 10, color: '#a6adc8' }}>{ideFormatAuditCost(entry.cost)}</span>
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
                        <pre style={{ fontSize: 10, color: '#a6adc8', fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: 160, overflowY: 'auto', margin: 0 }}>{entry.result}</pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {/* Pagination footer — only renders when there's more than
              one page worth of filtered entries. Showing it on a 5-row
              filter result would be noise. */}
          {totalPages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderTop: '1px solid rgba(168,85,247,0.12)', fontSize: 11, color: '#6c7086' }}>
              <span>
                Showing {pageStart + 1}–{Math.min(pageStart + AUDIT_PAGE_SIZE, filtered.length)} of {filtered.length}
              </span>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <button
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  disabled={safePage === 0}
                  style={{ ...btnStyle, opacity: safePage === 0 ? 0.4 : 1, cursor: safePage === 0 ? 'default' : 'pointer' }}
                >Prev</button>
                <span style={{ minWidth: 60, textAlign: 'center' }}>Page {safePage + 1} of {totalPages}</span>
                <button
                  onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                  disabled={safePage >= totalPages - 1}
                  style={{ ...btnStyle, opacity: safePage >= totalPages - 1 ? 0.4 : 1, cursor: safePage >= totalPages - 1 ? 'default' : 'pointer' }}
                >Next</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
