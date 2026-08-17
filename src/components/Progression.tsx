import { localYmd } from '@ava/core/dates';
import { useEffect, useMemo, useState, useCallback } from 'react';
import { t, useLocale, getLocale } from '../lib/i18n';
import {
  deriveProgression, buildCvMarkdown, buildCertificateMarkdown,
  type LearnerProgression, type DerivedSkill, type SkillLevel, type DerivedCertificate,
} from '@ava/core/learning';
import { readLocalLearningStore } from '../lib/learning-store';
import { readLearnerProfile, writeLearnerProfile, type LearnerProfile, emptyLearnerProfile } from '../lib/learner-store';
import {
  SealCheck as PhVerified,
  GraduationCap as PhGraduationCap,
  BookOpen as PhBooks,
  Flame as PhStreak,
  Clock as PhClock,
  Certificate as PhCertificate,
  Trophy as PhTrophy,
  Star as PhStar,
  X as PhX,
} from '@phosphor-icons/react';

/**
 * Progression — the learner's profile / CV in the IDE. Mirrors the extension's
 * Progression: EARNED skills/certs/achievements are derived from graded
 * performance (honest, verified ✓); SELF-added skills/achievements are the
 * user's own (tagged "added by you"). A self skill graduates to verified when
 * its name matches an earned subject. Local-first — reads learning.json +
 * learner.json directly; edits write learner.json and re-derive.
 */

const LEVEL_META: Record<SkillLevel, { label: string; color: string }> = {
  novice:     { label: 'Novice',     color: '#94a3b8' },
  familiar:   { label: 'Familiar',   color: '#60a5fa' },
  proficient: { label: 'Proficient', color: '#c084fc' },
  mastered:   { label: 'Mastered',   color: '#34d399' },
};

const relTime = (iso: string | null): string => {
  if (!iso) return '';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return t('learning.progression.today');
  if (days === 1) return t('learning.progression.yesterday');
  if (days < 30) return t('learning.progression.days_ago').replace('{n}', String(days));
  return t('learning.progression.months_ago').replace('{n}', String(Math.floor(days / 30)));
};

export function Progression() {
  useLocale();
  const [prog, setProg] = useState<LearnerProgression | null>(null);
  const [profile, setProfile] = useState<LearnerProfile>(() => emptyLearnerProfile());
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<LearnerProfile | null>(null);

  const reload = useCallback(async () => {
    const [store, prof] = await Promise.all([readLocalLearningStore(), readLearnerProfile()]);
    setProg(deriveProgression(store));
    setProfile(prof);
    setDraft(prof);
    setLoading(false);
  }, []);
  useEffect(() => { void reload(); }, [reload]);

  const userName = (() => { try { return (localStorage.getItem('ava-ide-user-name') || '').trim() || null; } catch { return null; } })();

  const skills = useMemo(() => {
    const earned = prog?.skills ?? [];
    const earnedNames = new Set(earned.map((s) => s.name.toLowerCase()));
    const self = (profile.self.skills ?? []).filter((s) => !earnedNames.has(s.trim().toLowerCase()));
    return { earned, self };
  }, [prog, profile]);

  const saveDraft = useCallback(async (next: LearnerProfile) => {
    await writeLearnerProfile(next);
    setEditing(false);
    await reload();
  }, [reload]);

  // Export a Markdown CV / certificate via the native save dialog.
  const exportMarkdown = useCallback(async (filename: string, content: string) => {
    try {
      const [dialog, fs] = await Promise.all([import('@tauri-apps/plugin-dialog'), import('@tauri-apps/plugin-fs')]);
      const target = await dialog.save({ defaultPath: filename, filters: [{ name: 'Markdown', extensions: ['md'] }] });
      if (!target) return;
      await fs.writeTextFile(target, content);
    } catch { /* user cancelled / unavailable */ }
  }, []);

  if (loading || !prog) {
    return <div style={{ padding: '40px 8px', textAlign: 'center', fontSize: 13, color: '#6c7086' }}>{t('learning.progression.loading')}</div>;
  }

  const displayName = profile.identity.display_name || userName || t('learning.progression.learner');
  const initial = (displayName || 'A').trim().charAt(0).toUpperCase();
  const hasData = prog.skills.length > 0 || prog.certificates.length > 0 || prog.stats.coursesCompleted > 0;

  const cvName = displayName.replace(/[^\w-]+/g, '-');
  const exportCv = () => exportMarkdown(`${cvName}-learning-cv.md`, buildCvMarkdown({
    name: displayName,
    headline: profile.identity.headline,
    bio: profile.identity.bio,
    progression: prog,
    selfSkills: skills.self,
    selfAchievements: profile.self.achievements.map((a) => a.title),
  }));
  const exportCert = (c: DerivedCertificate) => exportMarkdown(`${cvName}-${c.subject.replace(/[^\w-]+/g, '-')}-certificate.md`, buildCertificateMarkdown(c, displayName));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* ── Header card ─────────────────────────────────────────── */}
      <div style={{ borderRadius: 16, border: '1px solid color-mix(in srgb, var(--accent) 12%, transparent)', background: 'rgba(26, 16, 40, 0.6)', padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
          <div style={{ display: 'flex', height: 64, width: 64, flexShrink: 0, alignItems: 'center', justifyContent: 'center', borderRadius: '50%', fontSize: 22, fontWeight: 700, color: '#fff', background: 'linear-gradient(135deg, var(--accent), #7c3aed)' }}>{initial}</div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <h2 style={{ margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 18, fontWeight: 600, color: '#cdd6f4' }}>{displayName}</h2>
              <button onClick={() => setEditing((v) => !v)} style={{ flexShrink: 0, borderRadius: 8, border: '1px solid color-mix(in srgb, var(--accent) 40%, transparent)', background: 'color-mix(in srgb, var(--accent) 10%, transparent)', padding: '4px 12px', fontSize: 11, fontWeight: 500, color: 'var(--accent)', cursor: 'pointer' }}>
                {editing ? t('learning.progression.done') : t('learning.progression.edit')}
              </button>
            </div>
            {profile.identity.headline && !editing && <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--accent)' }}>{profile.identity.headline}</p>}
            {profile.identity.bio && !editing && <p style={{ margin: '6px 0 0', fontSize: 12, lineHeight: 1.5, color: '#a6adc8' }}>{profile.identity.bio}</p>}
          </div>
        </div>

        {/* Stats strip */}
        <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
          <Stat icon={<PhStreak size={15} weight="duotone" />} value={prog.stats.currentStreak} label={t('learning.progression.stat.streak')} />
          <Stat icon={<PhGraduationCap size={15} weight="duotone" />} value={prog.stats.coursesTotal} label={t('learning.progression.stat.courses')} />
          <Stat icon={<PhBooks size={15} weight="duotone" />} value={prog.stats.lessonsMastered} label={t('learning.progression.stat.lessons')} />
          <Stat icon={<PhClock size={15} weight="duotone" />} value={prog.stats.totalHours} label={t('learning.progression.stat.hours')} />
          <Stat icon={<PhVerified size={15} weight="duotone" />} value={prog.stats.avgScore != null ? `${prog.stats.avgScore}%` : '—'} label={t('learning.progression.stat.avg')} />
        </div>

        {editing && draft && <EditPanel draft={draft} setDraft={setDraft} onSave={saveDraft} />}
      </div>

      {!hasData && !editing && (
        <div style={{ borderRadius: 12, border: '1px dashed color-mix(in srgb, var(--accent) 18%, transparent)', padding: 24, textAlign: 'center', fontSize: 12, color: '#6c7086' }}>
          {t('learning.progression.empty')}
        </div>
      )}

      {/* ── Skills ──────────────────────────────────────────────── */}
      {(skills.earned.length > 0 || skills.self.length > 0) && (
        <Section title={t('learning.progression.skills')}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {skills.earned.map((s) => <EarnedSkillChip key={s.name} skill={s} />)}
            {skills.self.map((s) => (
              <span key={s} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 8, border: '1px solid color-mix(in srgb, var(--accent) 12%, transparent)', background: 'rgba(26, 16, 40, 0.6)', padding: '6px 12px', fontSize: 12, color: '#a6adc8' }}>
                {s}
                <span style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.5, color: '#6c7086' }}>{t('learning.progression.self_tag')}</span>
              </span>
            ))}
          </div>
        </Section>
      )}

      {/* ── Certificates ────────────────────────────────────────── */}
      {prog.certificates.length > 0 && (
        <Section
          title={t('learning.progression.certificates')}
          action={
            <button onClick={exportCv} style={{ borderRadius: 8, border: '1px solid color-mix(in srgb, var(--accent) 40%, transparent)', background: 'color-mix(in srgb, var(--accent) 10%, transparent)', padding: '4px 10px', fontSize: 11, fontWeight: 500, color: 'var(--accent)', cursor: 'pointer' }}>{t('learning.progression.export_cv')}</button>
          }
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
            {prog.certificates.map((c) => (
              <div key={c.id} style={{ display: 'flex', flexDirection: 'column', borderRadius: 12, border: '1px solid color-mix(in srgb, var(--accent) 25%, transparent)', background: 'color-mix(in srgb, var(--accent) 6%, transparent)', padding: 16 }}>
                <div style={{ marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--accent)' }}><PhCertificate size={12} weight="duotone" /> {t('learning.progression.cert_badge')}</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#cdd6f4' }}>{c.title}</div>
                <div style={{ marginTop: 2, fontSize: 11, color: '#6c7086' }}>{c.subject} · {c.level}</div>
                <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 12, fontSize: 11, color: '#a6adc8' }}>
                  <span>✓ {c.score}%</span>
                  <span>{c.completedAt ? new Date(c.completedAt).toLocaleDateString(getLocale(), { day: 'numeric', month: 'short', year: 'numeric' }) : ''}</span>
                </div>
                <button onClick={() => exportCert(c)} style={{ marginTop: 12, width: '100%', borderRadius: 8, border: '1px solid color-mix(in srgb, var(--accent) 40%, transparent)', background: 'color-mix(in srgb, var(--accent) 10%, transparent)', padding: '6px 0', fontSize: 11, fontWeight: 500, color: 'var(--accent)', cursor: 'pointer' }}>{t('learning.progression.export_cert')}</button>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* ── Achievements ────────────────────────────────────────── */}
      {(prog.achievements.length > 0 || profile.self.achievements.length > 0) && (
        <Section title={t('learning.progression.achievements')}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {prog.achievements.map((a) => {
              const AIcon = a.id.startsWith('streak') ? PhStreak : a.id.startsWith('course') || a.id === 'first-course' ? PhGraduationCap : a.id.startsWith('lessons') ? PhBooks : PhStar;
              return (
                <span key={a.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 8, border: '1px solid color-mix(in srgb, var(--accent) 25%, transparent)', background: 'color-mix(in srgb, var(--accent) 8%, transparent)', padding: '6px 12px', fontSize: 12, color: '#cdd6f4' }}>
                  <span style={{ color: 'var(--accent)' }}><AIcon size={14} weight="duotone" /></span>{a.title}
                </span>
              );
            })}
            {profile.self.achievements.map((a, i) => (
              <span key={`self-${i}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 8, border: '1px solid color-mix(in srgb, var(--accent) 12%, transparent)', background: 'rgba(26, 16, 40, 0.6)', padding: '6px 12px', fontSize: 12, color: '#a6adc8' }}>
                <PhTrophy size={14} weight="duotone" />{a.title}
                <span style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.5, color: '#6c7086' }}>{t('learning.progression.self_tag')}</span>
              </span>
            ))}
          </div>
        </Section>
      )}

      {/* ── Activity heatmap ────────────────────────────────────── */}
      {Object.keys(prog.stats.activity).length > 0 && (
        <Section title={t('learning.progression.activity')}>
          <Heatmap activity={prog.stats.activity} />
        </Section>
      )}
    </div>
  );
}

function Stat({ icon, value, label }: { icon: React.ReactNode; value: number | string; label: string }) {
  return (
    <div style={{ borderRadius: 12, border: '1px solid color-mix(in srgb, var(--accent) 12%, transparent)', background: 'rgba(12, 8, 20, 0.4)', padding: '8px 12px', textAlign: 'center' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, fontSize: 16, fontWeight: 700, color: '#cdd6f4' }}><span style={{ color: 'var(--accent)' }}>{icon}</span>{value}</div>
      <div style={{ fontSize: 10, color: '#6c7086' }}>{label}</div>
    </div>
  );
}

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h3 style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#cdd6f4' }}>{title}</h3>
        {action}
      </div>
      {children}
    </div>
  );
}

function EarnedSkillChip({ skill }: { skill: DerivedSkill }) {
  const meta = LEVEL_META[skill.level];
  return (
    <span
      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 8, border: `1px solid ${meta.color}55`, background: `${meta.color}12`, padding: '6px 12px', fontSize: 12, color: '#cdd6f4' }}
      title={`${t('learning.progression.verified')} · ${skill.lessonsMastered}/${skill.lessonsTotal} ${t('learning.progression.lessons_mastered')}${skill.avgScore != null ? ` · ${skill.avgScore}%` : ''}${skill.lastPracticed ? ` · ${relTime(skill.lastPracticed)}` : ''}`}
    >
      <span style={{ color: meta.color }}><PhVerified size={13} weight="duotone" /></span>
      {skill.name}
      <span style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, color: meta.color }}>{meta.label}</span>
      {skill.stale && <span title={t('learning.progression.stale')}><PhClock size={12} weight="duotone" /></span>}
    </span>
  );
}

function Heatmap({ activity }: { activity: Record<string, number> }) {
  // Last ~17 weeks (119 days), GitHub-style columns of 7.
  const days: { date: string; count: number }[] = [];
  const today = new Date();
  for (let i = 118; i >= 0; i--) {
    const d = new Date(today.getTime() - i * 86_400_000);
    // Must match how core's progression builds the activity map — both now
    // render the LOCAL day. They used to agree by both being UTC, which lit
    // the wrong square for anyone whose evening is the next day in Greenwich.
    const key = localYmd(d);
    days.push({ date: key, count: activity[key] ?? 0 });
  }
  const intensity = (n: number) => n === 0 ? 'rgba(148,163,184,0.10)' : n < 2 ? 'color-mix(in srgb, var(--accent) 30%, transparent)' : n < 4 ? 'color-mix(in srgb, var(--accent) 55%, transparent)' : 'var(--accent)';
  const cols: { date: string; count: number }[][] = [];
  for (let i = 0; i < days.length; i += 7) cols.push(days.slice(i, i + 7));
  return (
    <div style={{ display: 'flex', gap: 3, overflowX: 'auto', borderRadius: 12, border: '1px solid color-mix(in srgb, var(--accent) 12%, transparent)', background: 'rgba(26, 16, 40, 0.6)', padding: 12 }}>
      {cols.map((col, ci) => (
        <div key={ci} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {col.map((d) => <div key={d.date} title={`${d.date}: ${d.count}`} style={{ height: 10, width: 10, borderRadius: 2, background: intensity(d.count) }} />)}
        </div>
      ))}
    </div>
  );
}

// ── Edit panel ─────────────────────────────────────────────────────────────
function EditPanel({ draft, setDraft, onSave }: { draft: LearnerProfile; setDraft: (p: LearnerProfile) => void; onSave: (p: LearnerProfile) => void }) {
  const [newSkill, setNewSkill] = useState('');
  const [newAchv, setNewAchv] = useState('');

  const set = (patch: Partial<LearnerProfile['identity']>) => setDraft({ ...draft, identity: { ...draft.identity, ...patch } });
  const addSkill = () => { const s = newSkill.trim(); if (s && !draft.self.skills.includes(s)) setDraft({ ...draft, self: { ...draft.self, skills: [...draft.self.skills, s] } }); setNewSkill(''); };
  const rmSkill = (s: string) => setDraft({ ...draft, self: { ...draft.self, skills: draft.self.skills.filter((x) => x !== s) } });
  const addAchv = () => { const tt = newAchv.trim(); if (tt) setDraft({ ...draft, self: { ...draft.self, achievements: [...draft.self.achievements, { title: tt }] } }); setNewAchv(''); };
  const rmAchv = (i: number) => setDraft({ ...draft, self: { ...draft.self, achievements: draft.self.achievements.filter((_, x) => x !== i) } });

  const inputStyle: React.CSSProperties = { width: '100%', boxSizing: 'border-box', borderRadius: 8, border: '1px solid color-mix(in srgb, var(--accent) 18%, transparent)', background: 'rgba(12, 8, 20, 0.5)', padding: '8px 12px', fontSize: 12, color: '#cdd6f4', outline: 'none', fontFamily: 'inherit' };
  const tagStyle: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 4, borderRadius: 8, border: '1px solid color-mix(in srgb, var(--accent) 12%, transparent)', background: 'rgba(26, 16, 40, 0.6)', padding: '4px 8px', fontSize: 11, color: '#a6adc8' };
  const addBtn: React.CSSProperties = { flexShrink: 0, borderRadius: 8, border: '1px solid color-mix(in srgb, var(--accent) 18%, transparent)', background: 'transparent', padding: '0 14px', fontSize: 12, color: '#a6adc8', cursor: 'pointer' };

  return (
    <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 12, borderRadius: 12, border: '1px solid color-mix(in srgb, var(--accent) 12%, transparent)', background: 'rgba(12, 8, 20, 0.3)', padding: 16 }}>
      <input style={inputStyle} placeholder={t('learning.progression.headline_ph')} value={draft.identity.headline ?? ''} onChange={(e) => set({ headline: e.target.value })} />
      <textarea style={{ ...inputStyle, resize: 'none' }} rows={2} placeholder={t('learning.progression.bio_ph')} value={draft.identity.bio ?? ''} onChange={(e) => set({ bio: e.target.value })} />

      <div>
        <div style={{ marginBottom: 4, fontSize: 11, color: '#6c7086' }}>{t('learning.progression.add_skills')}</div>
        <div style={{ marginBottom: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {draft.self.skills.map((s) => (
            <span key={s} style={tagStyle}>{s}<button onClick={() => rmSkill(s)} style={{ border: 'none', background: 'transparent', color: '#6c7086', cursor: 'pointer', padding: 0, display: 'flex' }}><PhX size={11} /></button></span>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input style={inputStyle} placeholder={t('learning.progression.skill_ph')} value={newSkill} onChange={(e) => setNewSkill(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addSkill(); } }} />
          <button onClick={addSkill} style={addBtn}>{t('learning.progression.add')}</button>
        </div>
      </div>

      <div>
        <div style={{ marginBottom: 4, fontSize: 11, color: '#6c7086' }}>{t('learning.progression.add_achievements')}</div>
        <div style={{ marginBottom: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {draft.self.achievements.map((a, i) => (
            <span key={i} style={tagStyle}>{a.title}<button onClick={() => rmAchv(i)} style={{ border: 'none', background: 'transparent', color: '#6c7086', cursor: 'pointer', padding: 0, display: 'flex' }}><PhX size={11} /></button></span>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input style={inputStyle} placeholder={t('learning.progression.achievement_ph')} value={newAchv} onChange={(e) => setNewAchv(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addAchv(); } }} />
          <button onClick={addAchv} style={addBtn}>{t('learning.progression.add')}</button>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button onClick={() => onSave(draft)} style={{ borderRadius: 8, border: 'none', background: 'var(--accent)', padding: '8px 18px', fontSize: 12, fontWeight: 600, color: '#fff', cursor: 'pointer' }}>{t('learning.progression.save')}</button>
      </div>
    </div>
  );
}
