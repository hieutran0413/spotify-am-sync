'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type SyncResult = {
  processed: number;
  matched: number;
  unmatched?: { name: string; artist: string }[];
  syncedAt?: string;
  note?: string;
};

declare global {
  interface Window {
    MusicKit?: any;
  }
}

export default function SyncApp() {
  const [spotify, setSpotify] = useState<any>(null);
  const [appleReady, setAppleReady] = useState(false);
  const [appleToken, setAppleToken] = useState('');
  const [storefront, setStorefront] = useState('us');
  const [auto, setAuto] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [logs, setLogs] = useState<string[]>([]);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const musicRef = useRef<any>(null);

  const log = useCallback((message: string) => {
    setLogs((prev) => [`${new Date().toLocaleTimeString()}  ${message}`, ...prev].slice(0, 30));
  }, []);

  const loadSpotify = useCallback(async () => {
    const r = await fetch('/api/spotify/me', { cache: 'no-store' });
    const data = await r.json();
    if (data.id) {
      setSpotify(data);
    } else setSpotify(null);
  }, []);

  useEffect(() => { loadSpotify().catch(() => setSpotify(null)); }, [loadSpotify]);

  const connectApple = useCallback(async () => {
    setError('');
    try {
      const tokenResponse = await fetch('/api/apple/developer-token', { cache: 'no-store' });
      const tokenData = await tokenResponse.json();
      if (!tokenResponse.ok) throw new Error(tokenData.error ?? 'Apple Music developer token is not configured.');
      if (!window.MusicKit) {
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement('script');
          script.src = 'https://js-cdn.music.apple.com/musickit/v3/musickit.js';
          script.async = true;
          script.onload = () => resolve();
          script.onerror = () => reject(new Error('Could not load MusicKit JS.'));
          document.head.appendChild(script);
        });
      }
      window.MusicKit.configure({ developerToken: tokenData.token, app: { name: 'Spotify → Apple Music Sync', build: '0.1.0' } });
      const music = window.MusicKit.getInstance();
      await music.authorize();
      musicRef.current = music;
      setAppleToken(music.musicUserToken);
      setStorefront(music.storefrontId || 'us');
      setAppleReady(true);
      log(`Apple Music connected · storefront ${music.storefrontId || 'us'}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Apple Music authorization failed.');
    }
  }, [log]);

  const sync = useCallback(async (silent = false) => {
    if (!spotify || !appleReady || !appleToken || busy) return;
    setBusy(true);
    if (!silent) setError('');
    try {
      const r = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userToken: appleToken,
          storefront,
          mode: 'library',
          limit: 20,
        }),
      });
      const data = await r.json() as SyncResult & { error?: string };
      if (!r.ok) throw new Error(data.error ?? 'Sync failed.');
      log(`Spotify Library synced · ${data.matched}/${data.processed} matched`);
      if (data.unmatched?.length) log(`Unmatched: ${data.unmatched.slice(0, 3).map((x) => `${x.artist} — ${x.name}`).join(' · ')}`);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Sync failed.';
      if (!silent) setError(message); else log(`Auto-sync error: ${message}`);
    } finally {
      setBusy(false);
    }
  }, [spotify, appleReady, appleToken, busy, storefront, log]);

  useEffect(() => {
    if (timer.current) clearInterval(timer.current);
    if (auto && spotify && appleReady) {
      timer.current = setInterval(() => { void sync(true); }, 60_000);
    }
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [auto, spotify, appleReady, sync]);

  const connectSpotifyUrl = useMemo(() => '/api/auth/spotify', []);

  return (
    <main className="shell">
      <div className="glow" />
      <div className="container">
        <div className="topbar">
          <div className="brand"><div className="logo" /> <span>Spotify → Apple Music</span></div>
          <div className="badge">foreground realtime · 60s</div>
        </div>

        <section className="hero">
          <h1>Your music, mirrored.</h1>
          <p className="lede">Keep newly saved Spotify tracks flowing into Apple Music. Connect both services once, then leave this tab open for automatic 60-second sync passes.</p>
        </section>

        <section className="grid">
          <div className="card">
            <div className="row"><div><h2>01 · Spotify</h2><p>Read your saved songs through OAuth.</p></div><div className={`dot ${spotify ? 'on' : ''}`} /></div>
            {!spotify ? (
              <div className="actions"><a className="btn" href={connectSpotifyUrl} style={{ textDecoration: 'none' }}>Connect Spotify</a></div>
            ) : (
              <div className="state"><div><div className="success">Connected</div><div className="muted">{spotify.display_name || spotify.id}</div></div><button className="btn dark small" onClick={async () => { await fetch('/api/auth/spotify/logout', { method: 'POST' }); setSpotify(null); }}>Disconnect</button></div>
            )}
          </div>

          <div className="card">
            <div className="row"><div><h2>02 · Apple Music</h2><p>MusicKit authorizes this browser to modify your library.</p></div><div className={`dot ${appleReady ? 'on' : ''}`} /></div>
            {!appleReady ? (
              <div className="actions"><button className="btn" onClick={() => void connectApple()}>Connect Apple Music</button></div>
            ) : (
              <div className="state"><div><div className="success">Connected</div><div className="muted">Storefront: {storefront.toUpperCase()}</div></div><button className="btn dark small" onClick={() => { setAppleReady(false); setAppleToken(''); musicRef.current = null; }}>Reconnect</button></div>
            )}
          </div>
        </section>

        <section className="card" style={{ marginTop: 14 }}>
          <div className="row"><div><h2>Sync engine</h2><p>Track matching uses title, artist, duration and ISRC where available. No Spotify audio is downloaded.</p></div><button className="btn dark small" onClick={() => void sync()} disabled={!spotify || !appleReady || busy || false}>{busy ? 'Syncing…' : 'Sync now'}</button></div>
          <div className="control">
            <div className="label">Source</div>
            <div className="select">Spotify Liked Songs → Apple Music Library</div>
          </div>
          <div className="actions">
            <button className="btn dark small" onClick={() => setAuto((v) => !v)} disabled={!spotify || !appleReady}>{auto ? 'Auto-sync: ON' : 'Auto-sync: OFF'}</button>
            {spotify && <button className="btn dark small" onClick={() => void loadSpotify()}>Refresh Spotify</button>}
          </div>
          {error && <div className="error">{error}</div>}
          <div className="status">
            <div className="statusHead"><div className="statusTitle">Activity</div><div className="muted">{auto && spotify && appleReady ? 'next pass in ≤ 60s' : 'manual'}</div></div>
            <div className="log">{logs.length ? logs.join('\n') : 'No sync activity yet.'}</div>
          </div>
        </section>

        <p className="note">This deployment is designed for personal use. Spotify Development Mode currently has tighter app restrictions, including a five-user cap for new apps and a Premium requirement for the app owner. Apple Music user-library requests require a Music User Token. The app never stores the Apple Music User Token in a database.</p>
        <div className="footer">Spotify → Apple Music Sync · built on Next.js + Vercel + Spotify Web API + Apple Music API / MusicKit JS</div>
      </div>
    </main>
  );
}
