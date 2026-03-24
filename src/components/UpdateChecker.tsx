import { useState, useEffect, useCallback } from 'react';
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-updater';

export const APP_VERSION = '0.1.0';

interface UpdateInfo {
  version: string;
  body?: string;
}

export default function UpdateChecker() {
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  const [status, setStatus] = useState<'idle' | 'checking' | 'downloading' | 'ready' | 'error'>('idle');
  const [progress, setProgress] = useState(0);
  const [dismissed, setDismissed] = useState(false);

  const checkForUpdate = useCallback(async () => {
    setStatus('checking');
    try {
      const result = await check();
      if (result?.available) {
        setUpdate({ version: result.version, body: result.body || '' });
        setStatus('idle');
      } else {
        setStatus('idle');
      }
    } catch {
      setStatus('idle');
    }
  }, []);

  // Check on launch + every 30 minutes
  useEffect(() => {
    const timer = setTimeout(checkForUpdate, 5000); // 5s after launch
    const interval = setInterval(checkForUpdate, 30 * 60 * 1000);
    return () => { clearTimeout(timer); clearInterval(interval); };
  }, [checkForUpdate]);

  // Listen for manual check requests
  useEffect(() => {
    const handler = () => checkForUpdate();
    window.addEventListener('ava-check-updates', handler);
    return () => window.removeEventListener('ava-check-updates', handler);
  }, [checkForUpdate]);

  const handleUpdate = useCallback(async () => {
    setStatus('downloading');
    try {
      const result = await check();
      if (!result?.available) return;

      let downloaded = 0;
      let total = 0;
      await result.downloadAndInstall((event) => {
        if (event.event === 'Started' && event.data?.contentLength) {
          total = event.data.contentLength;
        } else if (event.event === 'Progress' && event.data?.chunkLength) {
          downloaded += event.data.chunkLength;
          if (total > 0) setProgress(Math.round((downloaded / total) * 100));
        } else if (event.event === 'Finished') {
          setStatus('ready');
        }
      });

      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }, []);

  const handleRelaunch = useCallback(async () => {
    await relaunch();
  }, []);

  if (!update || dismissed) return null;

  return (
    <div style={{
      position: 'fixed', bottom: 16, right: 16, zIndex: 9998,
      background: '#1e1e2e', border: '1px solid rgba(168,85,247,0.3)',
      borderRadius: 12, padding: '16px 20px', width: 320,
      boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 16 }}>🚀</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#cdd6f4' }}>Update Available</span>
        </div>
        <button
          onClick={() => setDismissed(true)}
          style={{ background: 'none', border: 'none', color: '#585b70', cursor: 'pointer', fontSize: 14 }}
        >✕</button>
      </div>

      {/* Version info */}
      <div style={{ fontSize: 12, color: '#a6adc8', marginBottom: 12 }}>
        <span style={{ color: '#a855f7', fontWeight: 600 }}>v{update.version}</span> is ready.
        {update.body && (
          <div style={{ marginTop: 6, fontSize: 11, color: '#6c7086', maxHeight: 60, overflowY: 'auto', lineHeight: 1.5 }}>
            {update.body.split('\n').slice(0, 3).join('\n')}
          </div>
        )}
      </div>

      {/* Progress bar */}
      {status === 'downloading' && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ height: 4, background: '#313244', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: 2, width: `${progress}%`,
              background: 'linear-gradient(90deg, #a855f7, #6366f1)',
              transition: 'width 0.3s',
            }} />
          </div>
          <div style={{ fontSize: 10, color: '#585b70', marginTop: 4, textAlign: 'right' }}>{progress}%</div>
        </div>
      )}

      {/* Buttons */}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        {status === 'idle' && (
          <>
            <button
              onClick={() => setDismissed(true)}
              style={{ padding: '6px 14px', background: 'none', border: '1px solid #313244', borderRadius: 6, color: '#6c7086', fontSize: 11, cursor: 'pointer' }}
            >Later</button>
            <button
              onClick={handleUpdate}
              style={{ padding: '6px 14px', background: '#a855f7', border: 'none', borderRadius: 6, color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
            >Update Now</button>
          </>
        )}
        {status === 'downloading' && (
          <span style={{ fontSize: 11, color: '#6c7086' }}>Downloading...</span>
        )}
        {status === 'ready' && (
          <button
            onClick={handleRelaunch}
            style={{ padding: '6px 14px', background: '#a6e3a1', border: 'none', borderRadius: 6, color: '#11111b', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
          >Restart to Apply</button>
        )}
        {status === 'error' && (
          <button
            onClick={handleUpdate}
            style={{ padding: '6px 14px', background: '#f87171', border: 'none', borderRadius: 6, color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
          >Retry</button>
        )}
      </div>
    </div>
  );
}
