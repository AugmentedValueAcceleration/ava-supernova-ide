import { useCallback, useEffect, useState } from 'react';
import { t } from '../lib/i18n';
import { apiFetch, isConnected } from '../lib/api';
import { cloudSyncEnabled } from '../lib/data-mode';

/**
 * YOUR profile picture.
 *
 * It used to live on the Personality page — Ava's style — under a section
 * headed "Avatars", plural, because that section was once meant to hold hers
 * as well. Hers is brand-locked and sourced from the package, so all that was
 * ever editable there was yours, sitting in a panel about her.
 *
 * The storage key had been saying so the whole time: `ava-ide-user-avatar`.
 *
 * It belongs with your name and your details, so it now renders inside the
 * general profile. Ava's style page is about her, and only her.
 *
 * Local first: the image is stored in localStorage and only reaches the server
 * if the account is connected AND cloud sync is on. Resized to 128px and
 * re-encoded as JPEG first, because a full-resolution photo in localStorage is
 * how you quietly fill a 5MB quota with one file.
 */

const MAX_PX = 128;

export function UserAvatarPanel({ fallbackName }: { fallbackName?: string | null }) {
  const [avatar, setAvatar] = useState<string>(() => localStorage.getItem('ava-ide-user-avatar') || '');

  // Hydrate from the server, so a picture set on another machine shows here.
  // This used to happen on the Personality page, which meant your avatar only
  // arrived if you happened to open Ava's style settings first. It belongs
  // with the thing that displays it.
  useEffect(() => {
    if (!isConnected() || !cloudSyncEnabled()) return;
    let live = true;
    apiFetch('/settings')
      .then((data: { user_avatar?: string | null }) => {
        if (!live || !data?.user_avatar) return;
        setAvatar(data.user_avatar);
        localStorage.setItem('ava-ide-user-avatar', data.user_avatar);
      })
      .catch(() => { /* the local copy stands */ });
    return () => { live = false; };
  }, []);

  const resize = useCallback((dataUri: string): Promise<string> => new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = MAX_PX;
      canvas.height = MAX_PX;
      const ctx = canvas.getContext('2d');
      if (!ctx) { resolve(dataUri); return; }
      // Cover, not contain — a face should fill the circle rather than sit in
      // it letterboxed.
      const scale = Math.max(MAX_PX / img.width, MAX_PX / img.height);
      const w = img.width * scale;
      const h = img.height * scale;
      ctx.drawImage(img, (MAX_PX - w) / 2, (MAX_PX - h) / 2, w, h);
      resolve(canvas.toDataURL('image/jpeg', 0.8));
    };
    // A file we cannot decode is stored as-is rather than dropped: better a
    // picture that works than a silent no-op on a button you just pressed.
    img.onerror = () => resolve(dataUri);
    img.src = dataUri;
  }), []);

  const save = useCallback(async (dataUri: string) => {
    const resized = await resize(dataUri);
    localStorage.setItem('ava-ide-user-avatar', resized);
    setAvatar(resized);
    // Tell the rest of the app. Writing to storage and saying nothing meant
    // the chat kept showing the default until it happened to remount.
    try { window.dispatchEvent(new CustomEvent('ava-avatar-changed')); } catch { /* non-DOM */ }
    if (isConnected() && cloudSyncEnabled()) {
      apiFetch('/settings', { method: 'POST', body: JSON.stringify({ user_avatar: resized }) }).catch(() => {});
    }
  }, [resize]);

  const remove = useCallback(() => {
    localStorage.removeItem('ava-ide-user-avatar');
    setAvatar('');
    try { window.dispatchEvent(new CustomEvent('ava-avatar-changed')); } catch { /* non-DOM */ }
    if (isConnected() && cloudSyncEnabled()) {
      apiFetch('/settings', { method: 'POST', body: JSON.stringify({ user_avatar: null }) }).catch(() => {});
    }
  }, []);

  const pick = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => save(reader.result as string);
      reader.readAsDataURL(file);
    };
    input.click();
  }, [save]);

  return (
    <div style={{
      background: 'rgba(26, 16, 40, 0.6)',
      border: '1px solid color-mix(in srgb, var(--accent) 12%, transparent)',
      borderRadius: 12, padding: '18px 20px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <div
          onClick={pick}
          title={t('dash.settings.avatar_upload_hint')}
          style={{
            width: 64, height: 64, borderRadius: '50%', cursor: 'pointer',
            border: '2px dashed color-mix(in srgb, var(--accent) 30%, transparent)',
            background: avatar ? 'transparent' : 'rgba(10, 6, 18, 0.8)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            overflow: 'hidden', position: 'relative', flexShrink: 0,
            fontSize: 22, color: 'var(--accent)', fontWeight: 300,
          }}
        >
          {avatar
            ? <img src={avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            /* YOUR initial. On the extension this fell back to Ava's name, so
               her first letter could end up standing in for your face. */
            : (fallbackName?.trim()?.[0]?.toUpperCase() ?? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6c7086" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" />
              </svg>
            ))}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, color: '#45475a' }}>{t('dash.settings.avatar_stored_locally')}</div>
          {avatar && (
            <button
              onClick={remove}
              style={{ marginTop: 6, fontSize: 10, color: '#6c7086', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}
            >{t('dash.settings.remove')}</button>
          )}
        </div>
      </div>
    </div>
  );
}
