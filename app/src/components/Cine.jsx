import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api.js';
import { fileUrl } from '../config.js';
import { getSocket } from '../socket.js';
import Chat from './Chat.jsx';
import { cx, initials, secondsToClock } from '../utils.js';

const EMOJIS = ['⚽', '🔥', '❤️', '😂', '👏'];

function youtubeIdFromUrl(value) {
  try {
    const url = new URL(value);
    if (url.hostname.endsWith('youtu.be')) return url.pathname.slice(1);
    if (url.hostname.includes('youtube.com')) {
      const param = url.searchParams.get('v');
      if (param) return param;
      const match = url.pathname.match(/^\/embed\/([^/]+)/);
      if (match) return match[1];
    }
  } catch {
    /* no es una URL absoluta */
  }
  return null;
}

export default function Cine({ target, chat, me, friends, onCall, onCine }) {
  const key = useMemo(() => {
    if (target?.type === 'community') return `community:${target.id}`;
    if (target?.type === 'dm') return `dm:${target.id}`;
    return 'general';
  }, [target?.type, target?.id]);

  const [input, setInput] = useState('');
  const [url, setUrl] = useState('');
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [reactions, setReactions] = useState([]);
  const [error, setError] = useState('');

  const urlRef = useRef('');
  const playingRef = useRef(false);
  const positionRef = useRef(0);
  const hostRef = useRef(null);
  const lastSync = useRef(0);
  const playerRef = useRef(null);
  const videoRef = useRef(null);
  const mountRef = useRef(null);

  const youtubeId = useMemo(() => youtubeIdFromUrl(url), [url]);
  const isFile = /\.(mp4|webm|ogg|m4v)(\?|$)/i.test(url);
  const showChat = chat?.type === 'dm' || chat?.type === 'community';

  function applyState(state) {
    if (!state) return;
    const nextUrl = state.url || '';
    urlRef.current = nextUrl;
    playingRef.current = Boolean(state.playing);
    positionRef.current = Number(state.position) || 0;
    hostRef.current = state.hostId || null;
    setUrl(nextUrl);
    setInput(nextUrl);
    setPlaying(playingRef.current);
    setPosition(positionRef.current);
  }

  useEffect(() => {
    const socket = getSocket();
    let cancelled = false;

    api(`/watch/${encodeURIComponent(key)}`)
      .then((data) => { if (!cancelled) applyState(data.state); })
      .catch((err) => { if (!cancelled) setError(err.message); });
    socket?.emit('watch:join', { key });

    function onState(state) {
      if (!state) return;
      applyState(state);
    }
    function onReaction(payload) {
      setReactions((current) => [...current.slice(-11), {
        emoji: payload?.emoji || '❤️',
        from: payload?.from,
        at: payload?.at || new Date().toISOString()
      }]);
    }
    socket?.on('watch:state', onState);
    socket?.on('watch:reaction', onReaction);

    return () => {
      cancelled = true;
      socket?.off('watch:state', onState);
      socket?.off('watch:reaction', onReaction);
    };
  }, [key]);

  function pushState(patch, immediate = false) {
    const now = Date.now();
    if (!immediate && now - lastSync.current < 350) return;
    lastSync.current = now;
    const next = {
      key,
      url: urlRef.current,
      playing: patch.playing ?? playingRef.current,
      position: patch.position ?? positionRef.current,
      hostId: me?.id
    };
    playingRef.current = next.playing;
    positionRef.current = next.position;
    getSocket()?.emit('watch:sync', next);
  }

  function loadUrl(event) {
    event.preventDefault();
    let value = input.trim();
    if (!value) return;
    if (!/^https?:\/\//i.test(value) && /(youtube\.com|youtu\.be)/i.test(value)) {
      value = `https://${value}`;
      setInput(value);
    }
    setError('');
    urlRef.current = value;
    setUrl(value);
    pushState({ playing: false, position: 0 }, true);
  }

  function react(emoji) {
    getSocket()?.emit('watch:reaction', { key, emoji });
    setReactions((current) => [...current.slice(-11), { emoji, from: me?.id, at: new Date().toISOString() }]);
  }

  useEffect(() => {
    if (!youtubeId) return undefined;
    let cancelled = false;
    let player = null;

    function create() {
      if (cancelled || !mountRef.current) return;
      player = new window.YT.Player(mountRef.current, {
        videoId: youtubeId,
        playerVars: { playsinline: 1, rel: 0 },
        events: {
          onReady: () => {
            playerRef.current = player;
            if (positionRef.current) player.seekTo(positionRef.current, true);
            if (playingRef.current) player.playVideo();
            else player.pauseVideo();
          },
          onStateChange: (event) => {
            const nowPlaying = event.data === 1 || event.data === 5;
            if (nowPlaying !== playingRef.current) {
              playingRef.current = nowPlaying;
              setPlaying(nowPlaying);
              pushState({ playing: nowPlaying, position: player.getCurrentTime() || 0 }, true);
            }
          }
        }
      });
    }

    if (window.YT?.Player) {
      create();
    } else {
      const previous = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => { previous?.(); create(); };
      if (!document.getElementById('youtube-iframe-api')) {
        const script = document.createElement('script');
        script.id = 'youtube-iframe-api';
        script.src = 'https://www.youtube.com/iframe_api';
        document.body.appendChild(script);
      }
    }

    return () => {
      cancelled = true;
      try { player?.destroy?.(); } catch { /* ya destruido */ }
      playerRef.current = null;
    };
    // pushState depende de refs estables; no debe recrear el reproductor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [youtubeId, key]);

  useEffect(() => {
    const player = playerRef.current;
    if (!player || hostRef.current === me?.id) return;
    try {
      if (playing && player.getPlayerState() !== 1) player.playVideo();
      if (!playing && player.getPlayerState() !== 2) player.pauseVideo();
      if (Math.abs((player.getCurrentTime() || 0) - position) > 2) player.seekTo(position, true);
    } catch {
      /* reproductor aún no listo */
    }
  }, [playing, position, youtubeId, me?.id]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !isFile || hostRef.current === me?.id) return;
    if (Math.abs((video.currentTime || 0) - position) > 1.5) video.currentTime = position;
    if (playing && video.paused) video.play().catch(() => {});
    if (!playing && !video.paused) video.pause();
  }, [position, playing, isFile, url, me?.id]);

  const nameOf = (id) => (id === me?.id ? me?.displayName : friends.find((f) => f.id === id)?.displayName || 'Alguien');

  return (
    <div className="cine-layout">
      <div className="cine-main">
        <div className="cine-title">
          <h2>📺 Sala de video</h2>
          <span className="chip">{key}</span>
        </div>
        <p className="muted">Compatibilidad con salas antiguas. Para ver cualquier cosa, compartí tu pantalla desde la PC.</p>

        <form onSubmit={loadUrl} className="inline-form">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Pega un link de YouTube o un .mp4"
          />
          <button type="submit" className="primary">Cargar</button>
        </form>
        {error && <div className="error-box">{error}</div>}

        <div className="player-shell card">
          {!url && <div className="empty-state">Pega un video para empezar la sesión.</div>}
          {youtubeId && <div ref={mountRef} className="youtube-mount" />}
          {isFile && (
            <video
              ref={videoRef}
              className="cine-video"
              src={url.startsWith('/') ? fileUrl(url) : url}
              controls
              onPlay={() => pushState({ playing: true, position: videoRef.current?.currentTime || 0 }, true)}
              onPause={() => pushState({ playing: false, position: videoRef.current?.currentTime || 0 }, true)}
              onSeeked={() => pushState({ position: videoRef.current?.currentTime || 0 })}
            />
          )}
          {url && !youtubeId && !isFile && (
            <div className="empty-state">Este enlace no es de YouTube ni un .mp4. Prueba con otro.</div>
          )}
        </div>

        <div className="cine-bottom">
          <div className="reaction-bar">
            {EMOJIS.map((emoji) => (
              <button key={emoji} type="button" className="emoji-btn" onClick={() => react(emoji)}>{emoji}</button>
            ))}
            <span className="tiny muted">Reacciones en vivo</span>
          </div>
          <div className="reaction-feed">
            {reactions.map((item, index) => (
              <span key={`${item.at}-${index}`} className="reaction-item" title={nameOf(item.from)}>
                {item.emoji}<small>{nameOf(item.from)}</small>
              </span>
            ))}
          </div>
          <div className="tiny muted">Posición: {secondsToClock(position)} {playing ? '▶' : '⏸'}</div>
        </div>
      </div>

      {showChat && (
        <aside className="cine-chat">
          <Chat chat={chat} me={me} compact onCall={onCall} onCine={onCine} />
        </aside>
      )}
    </div>
  );
}
