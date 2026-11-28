import { useEffect, useRef, useState } from 'react';
import { getSocket } from '../socket.js';
import { RtcManager } from '../rtc.js';
import { cx } from '../utils.js';
import Avatar from './Avatar.jsx';

const MAX_CALL_PARTICIPANTS = 5;
const FILTERS = [
  { id: 'natural', label: 'Natural', css: 'none' },
  { id: 'bn', label: 'B/N', css: 'grayscale(1)' },
  { id: 'sepia', label: 'Sepia', css: 'sepia(.75) saturate(1.2)' },
  { id: 'frio', label: 'Frío', css: 'hue-rotate(175deg) saturate(1.15)' },
  { id: 'calido', label: 'Cálido', css: 'sepia(.25) hue-rotate(330deg)' }
];

function filterCss(id, blur) {
  const base = FILTERS.find((item) => item.id === id)?.css || 'none';
  const parts = [];
  if (base && base !== 'none') parts.push(base);
  if (blur > 0) parts.push(`blur(${blur}px)`);
  return parts.length ? parts.join(' ') : 'none';
}

function VideoTile({ stream, name, user, muted = false, remote = false }) {
  const ref = useRef(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) return undefined;
    if (element.srcObject !== (stream || null)) element.srcObject = stream || null;
    const retry = () => { if (stream && element.paused) element.play().catch(() => {}); };
    // El autoplay con audio puede estar bloqueado hasta que el usuario interactúa.
    retry();
    element.addEventListener('loadeddata', retry);
    element.addEventListener('canplay', retry);
    return () => {
      element.removeEventListener('loadeddata', retry);
      element.removeEventListener('canplay', retry);
    };
  }, [stream]);
  const hasVideo = Boolean(stream?.getVideoTracks().length);
  return (
    <div className="video-tile">
      <video
        ref={ref}
        autoPlay
        playsInline
        muted={muted}
        data-remote={remote ? '1' : undefined}
        className={cx('tile-video', remote && 'remote-video', !hasVideo && 'no-video')}
      />
      <span className="video-label">{name || 'Participante'}</span>
      {!hasVideo && <span className="video-avatar"><Avatar user={user} size="xl" /></span>}
    </div>
  );
}

export default function CallOverlay({ call, me, friends, onClose }) {
  const [active, setActive] = useState(call?.status !== 'incoming');
  const [peerIds, setPeerIds] = useState(call?.peers || []);
  const [localStream, setLocalStream] = useState(null);
  const [remoteStreams, setRemoteStreams] = useState({});
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [selected, setSelected] = useState([]);
  const [minimized, setMinimized] = useState(false);
  const [filter, setFilter] = useState('natural');
  const [blur, setBlur] = useState(0);
  const [hostId, setHostId] = useState(call?.hostId || call?.from?.id || null);
  const [error, setError] = useState('');
  const rtcRef = useRef(null);
  const screenRef = useRef(null);
  const cameraRef = useRef(null);
  const localStreamRef = useRef(null);
  const pipelineRef = useRef(null);
  const sharingRef = useRef(false);
  const cameraOffRef = useRef(false);
  const appliedFilterKey = useRef('');

  const callId = call?.callId;
  const userOf = (id) => (id === me?.id ? me : friends.find((f) => f.id === id));
  const nameOf = (id) => (id === me?.id
    ? `${me?.displayName} (tú)`
    : userOf(id)?.displayName || 'Participante');

  function stopFilterPipeline() {
    const pipeline = pipelineRef.current;
    if (!pipeline) return;
    cancelAnimationFrame(pipeline.raf);
    if (pipeline.hidden) {
      pipeline.hidden.srcObject = null;
      pipeline.hidden.pause?.();
    }
    pipeline.track?.stop();
    if (pipeline.canvas) {
      pipeline.canvas.width = 0;
      pipeline.canvas.height = 0;
    }
    pipelineRef.current = null;
  }

  async function sendVideoTrack(track) {
    if (!track) return;
    const audio = localStreamRef.current?.getAudioTracks() || [];
    const next = new MediaStream([...audio, track]);
    await rtcRef.current?.replaceVideoTrack(track, next);
    localStreamRef.current = next;
    setLocalStream(next);
  }

  async function restoreOriginalTrack() {
    const camera = cameraRef.current?.readyState === 'live' ? cameraRef.current : null;
    if (!camera) return;
    if (localStreamRef.current?.getVideoTracks()[0] === camera) return;
    stopFilterPipeline();
    await sendVideoTrack(camera);
  }

  async function applyFilterPipeline() {
    const css = filterCss(filter, blur);
    if (css === 'none') {
      // Volver a Natural debe devolver la cámara real al stream enviado.
      if (!sharingRef.current && !cameraOffRef.current) await restoreOriginalTrack();
      stopFilterPipeline();
      return;
    }
    if (sharingRef.current || cameraOffRef.current) {
      stopFilterPipeline();
      return;
    }
    const camera = cameraRef.current;
    if (!camera || camera.readyState !== 'live') return;
    if (typeof document === 'undefined' || !document.createElement('canvas').captureStream) {
      setError('Este dispositivo no puede aplicar filtros al video que envías.');
      return;
    }

    stopFilterPipeline();
    const canvas = document.createElement('canvas');
    const hidden = document.createElement('video');
    hidden.muted = true;
    hidden.playsInline = true;
    hidden.autoplay = true;
    hidden.srcObject = new MediaStream([camera]);
    await hidden.play();
    const settings = camera.getSettings?.() || {};
    canvas.width = Math.max(2, Number(settings.width) || 640);
    canvas.height = Math.max(2, Number(settings.height) || 480);
    const context = canvas.getContext('2d');
    let raf = 0;
    const draw = () => {
      if (hidden.readyState >= 2) {
        context.filter = css;
        context.drawImage(hidden, 0, 0, canvas.width, canvas.height);
      }
      raf = requestAnimationFrame(draw);
    };
    draw();

    const track = canvas.captureStream(30).getVideoTracks()[0];
    if (!track) {
      cancelAnimationFrame(raf);
      return;
    }
    pipelineRef.current = { canvas, hidden, raf, track };
    await sendVideoTrack(track);
  }

  useEffect(() => {
    setMinimized(false);
    setFilter('natural');
    setBlur(0);
  }, [callId]);

  useEffect(() => {
    localStreamRef.current = localStream;
  }, [localStream]);

  useEffect(() => {
    sharingRef.current = sharing;
  }, [sharing]);

  useEffect(() => {
    cameraOffRef.current = cameraOff;
  }, [cameraOff]);

  useEffect(() => {
    if (!callId || !active) return undefined;
    let disposed = false;
    let stream = null;

    async function start() {
      const wantsVideo = call?.video !== false;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: wantsVideo });
      } catch (err) {
        setError(`No se pudo abrir cámara/micrófono: ${err.message}. Se usará solo audio.`);
        try {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        } catch {
          return;
        }
      }
      if (disposed) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      cameraRef.current = stream.getVideoTracks()[0] || null;
      setLocalStream(stream);
      const rtc = new RtcManager({
        socket: getSocket(),
        callId,
        myId: me.id,
        localStream: null,
        onTrack: (id, remote) => setRemoteStreams((current) => ({ ...current, [id]: remote })),
        onError: (err) => setError(err.message)
      });
      rtcRef.current = rtc;
      // No conectamos con `peerIds` acá: ese listado incluye a los invitados que todavía
      // no aceptaron. Las conexiones se crean con `call:ready`, que trae solo aceptados.
      rtc.setLocalStream(stream);
      getSocket()?.emit('call:resync', { callId });
    }

    start();
    return () => {
      disposed = true;
      stopFilterPipeline();
      rtcRef.current?.destroy();
      rtcRef.current = null;
      stream?.getTracks().forEach((track) => track.stop());
      screenRef.current?.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
      cameraRef.current = null;
      appliedFilterKey.current = '';
      setLocalStream(null);
      setRemoteStreams({});
    };
    // peerIds se sincroniza con call:ready, no debe reiniciar el media.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callId, active]);

  useEffect(() => {
    if (!callId || !active) return;
    const cameraKey = cameraRef.current?.id || 'none';
    const key = `${callId}:${cameraKey}:${filter}:${blur}:${sharing}:${cameraOff}`;
    if (appliedFilterKey.current === key) return;
    appliedFilterKey.current = key;
    applyFilterPipeline().catch((err) => setError(`No se pudo aplicar el filtro: ${err.message}`));
  }, [callId, active, filter, blur, sharing, cameraOff, localStream]);

  useEffect(() => {
    const socket = getSocket();
    if (!socket || !callId) return undefined;

    function onReady(payload) {
      if (payload?.callId !== callId) return;
      const ids = payload.peers || [];
      if (payload.hostId) setHostId(payload.hostId);
      setPeerIds(ids);
      rtcRef.current?.syncPeers(ids);
      rtcRef.current?.renegotiate();
    }
    function onLeft(payload) {
      if (payload?.callId !== callId || !payload.userId) return;
      if (payload.hostId) setHostId(payload.hostId);
      setPeerIds((current) => {
        const next = current.filter((id) => id !== payload.userId);
        rtcRef.current?.syncPeers(next);
        return next;
      });
      setRemoteStreams((current) => {
        const next = { ...current };
        delete next[payload.userId];
        return next;
      });
    }
    function onInvite(payload) {
      if (payload?.callId !== callId) return;
      // Solo actualizamos la lista visible. WebRTC espera al `call:ready` de la
      // aceptación para no enviar ofertas a alguien que aún no está en la sala.
      setPeerIds((current) => [...new Set([...current, ...(payload.peers || [])])]);
    }
    function onEnded(payload) {
      if (!payload || payload.callId === callId) onClose();
    }

    socket.on('call:invite', onInvite);
    socket.on('call:ready', onReady);
    socket.on('call:left', onLeft);
    socket.on('call:ended', onEnded);
    return () => {
      socket.off('call:invite', onInvite);
      socket.off('call:ready', onReady);
      socket.off('call:left', onLeft);
      socket.off('call:ended', onEnded);
    };
  }, [callId, onClose]);

  function accept() {
    getSocket()?.emit('call:accept', { callId });
    setActive(true);
    setError('');
  }

  function reject() {
    getSocket()?.emit('call:reject', { callId });
    onClose();
  }

  function hangup() {
    // Salir no corta la sala: los demás siguen hablando.
    getSocket()?.emit('call:leave', { callId });
    onClose();
  }

  function endRoom() {
    getSocket()?.emit('call:ended', { callId });
    onClose();
  }

  function toggleMute() {
    const next = !muted;
    localStream?.getAudioTracks().forEach((track) => { track.enabled = !next; });
    setMuted(next);
  }

  async function enableCamera() {
    screenRef.current?.getTracks().forEach((track) => track.stop());
    screenRef.current = null;
    let camera = cameraRef.current?.readyState === 'live' ? cameraRef.current : null;
    if (!camera) {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: true });
      camera = stream.getVideoTracks()[0];
      cameraRef.current = camera;
    }
    camera.enabled = true;
    const audio = localStream?.getAudioTracks() || [];
    const next = new MediaStream([...audio, camera]);
    await rtcRef.current?.replaceVideoTrack(camera, next);
    setLocalStream(next);
    setCameraOff(false);
    setSharing(false);
    setError('');
  }

  async function toggleCamera() {
    if (!cameraOff) {
      localStream?.getVideoTracks().forEach((track) => { track.enabled = false; });
      setCameraOff(true);
      return;
    }
    try {
      await enableCamera();
    } catch (err) {
      setError(`No se pudo volver a abrir la cámara: ${err.message}`);
    }
  }

  async function restoreCamera() {
    try {
      await enableCamera();
    } catch (err) {
      setError(`No se pudo restaurar la cámara: ${err.message}`);
    }
  }

  function stopScreenShare() {
    screenRef.current?.getTracks().forEach((track) => track.stop());
    screenRef.current = null;
    restoreCamera();
  }

  async function shareScreen() {
    if (sharing) {
      stopScreenShare();
      return;
    }
    if (!window.electronAPI?.getSources && !navigator.mediaDevices?.getDisplayMedia) {
      setError('En el celular no se puede compartir pantalla. Usá la app de escritorio.');
      return;
    }
    setError('');
    try {
      let stream;
      let systemAudio = false;
      if (window.electronAPI?.getSources) {
        const sources = await window.electronAPI.getSources();
        const source = sources.find((item) => /screen|pantalla/i.test(item.name)) || sources[0];
        if (!source) throw new Error('No se detectó ninguna pantalla.');
        const video = {
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: source.id,
            maxWidth: 1920,
            maxHeight: 1080
          }
        };
        try {
          // En Windows/Mac el audio de escritorio se toma con el mismo origen.
          stream = await navigator.mediaDevices.getUserMedia({
            video,
            audio: {
              mandatory: {
                chromeMediaSource: 'desktop',
                chromeMediaSourceId: String(source.id).split(':')[0]
              }
            }
          });
          systemAudio = stream.getAudioTracks().length > 0;
        } catch {
          stream = await navigator.mediaDevices.getUserMedia({ video, audio: false });
        }
      } else {
        try {
          stream = await navigator.mediaDevices.getDisplayMedia({
            video: { frameRate: 30 },
            audio: { systemAudio: 'include', echoCancellation: false, noiseSuppression: false }
          });
        } catch {
          stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
        }
        systemAudio = stream.getAudioTracks().length > 0;
      }
      if (!systemAudio) {
        setError('Se comparte la imagen. Para que se escuche, elegí una pestaña con audio (o permití el audio del sistema).');
      }
      const track = stream.getVideoTracks()[0];
      // Si hay un filtro activo, localStream tiene el track del canvas; la
      // cámara real siempre queda en cameraRef para poder volver a ella.
      if (cameraRef.current?.readyState !== 'live') {
        cameraRef.current = localStream?.getVideoTracks()[0] || null;
      }
      screenRef.current = stream;
      // Si la fuente trae audio, viaja ese; si no, se mantiene el micrófono.
      const audio = systemAudio
        ? stream.getAudioTracks()
        : (localStream?.getAudioTracks() || []);
      const next = new MediaStream([...audio, track]);
      await rtcRef.current?.replaceVideoTrack(track, next);
      setLocalStream(next);
      setSharing(true);
      track.onended = () => {
        screenRef.current = null;
        restoreCamera();
      };
    } catch (err) {
      setError(`No se pudo compartir la pantalla: ${err.message}`);
    }
  }

  function enableRemoteAudio() {
    document.querySelectorAll('video[data-remote="1"]').forEach((element) => {
      element.muted = false;
      element.play().catch(() => {});
    });
  }

  function invite() {
    if (!selected.length) return;
    getSocket()?.emit('call:invite', { callId, to: selected, video: call?.video !== false }, (response) => {
      if (response?.error) setError(response.error);
    });
    setSelected([]);
  }

  if (!call) return null;

  if (!active) {
    return (
      <div className="overlay">
        <div className="card call-card">
          <div className="incoming-avatar"><Avatar user={call.from} size="xl" /></div>
          <div className="call-pulse">📹</div>
          <h2>Llamada entrante</h2>
          <p>{call.from?.displayName || 'Un amigo'} te está llamando</p>
          {error && <div className="error-box">{error}</div>}
          <div className="call-actions">
            <button type="button" className="primary" onClick={accept}>✅ Aceptar</button>
            <button type="button" className="danger" onClick={reject}>❌ Rechazar</button>
          </div>
        </div>
      </div>
    );
  }

  const inviteable = friends.filter((friend) => !peerIds.includes(friend.id));
  const roomFull = peerIds.length >= MAX_CALL_PARTICIPANTS;
  const peopleInRoom = peerIds.length || 1;
  const isHost = hostId === me?.id || (!hostId && call?.from?.id === me?.id);

  const tiles = (
    <>
      <VideoTile stream={localStream} name={`${me?.displayName} (tú)`} user={me} muted />
      {peerIds.filter((id) => id !== me?.id).map((id) => (
        <VideoTile key={id} stream={remoteStreams[id]} name={nameOf(id)} user={userOf(id)} remote />
      ))}
    </>
  );

  if (minimized) {
    // Los videos siguen montados (fuera de pantalla) para que el audio no se corte.
    return (
      <>
        <div className="call-media-hidden" aria-hidden="true">{tiles}</div>
        <div className="call-mini">
          <button type="button" className="call-mini-open" onClick={() => setMinimized(false)}>
            📹 Llamada · {peopleInRoom}/{MAX_CALL_PARTICIPANTS}
          </button>
          <button type="button" className="icon-btn" title={muted ? 'Activar micrófono' : 'Silenciar'} onClick={toggleMute}>
            {muted ? '🔇' : '🎙️'}
          </button>
          <button type="button" className="icon-btn" title="Salir de la llamada" onClick={hangup}>📴</button>
        </div>
      </>
    );
  }

  return (
    <div className="overlay">
      <div className="card call-window">
        <header className="call-header">
          <div>
            <strong>📹 Llamada Nexus</strong>
            <span className="tiny muted block">En la llamada: {peerIds.map(nameOf).join(', ') || 'Conectando…'}</span>
          </div>
          <div className="call-header-actions">
            <button type="button" className="icon-btn" title="Minimizar y seguir usando la app" onClick={() => setMinimized(true)}>－</button>
            <button type="button" className="icon-btn" title="Salir de la llamada (los demás siguen)" onClick={hangup}>✕</button>
          </div>
        </header>

        {error && <div className="error-box">{error}</div>}

        <div className="video-grid">{tiles}</div>

        <div className="invite-row">
          <select
            multiple
            value={selected}
            onChange={(e) => setSelected([...e.target.selectedOptions].map((option) => option.value))}
          >
            {inviteable.map((friend) => <option key={friend.id} value={friend.id}>{friend.displayName}</option>)}
          </select>
          <button type="button" className="ghost small" disabled={roomFull || !selected.length} onClick={invite}>Invitar</button>
        </div>
        {roomFull && <div className="tiny muted invite-limit">La sala está llena: hasta 5 participantes.</div>}

        <div className="call-controls">
          <button type="button" className={cx('control', muted && 'off')} onClick={toggleMute}>
            {muted ? '🔇' : '🎙️'} {muted ? 'Activar micrófono' : 'Silenciar'}
          </button>
          <button type="button" className={cx('control', cameraOff && 'off')} onClick={toggleCamera}>
            {cameraOff ? '📷' : '🎥'} {cameraOff ? 'Activar cámara' : 'Apagar cámara'}
          </button>
          <button type="button" className="control" onClick={enableRemoteAudio}>🔊 Activar sonido</button>
          <button type="button" className={cx('control', sharing && 'off')} onClick={shareScreen}>
            {sharing ? '🛑 Dejar de compartir' : '🖥️ Compartir pantalla'}
          </button>
          <div className="filter-controls">
            <span className="tiny muted">Filtro</span>
            {FILTERS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={cx('control', filter === item.id && 'off')}
                onClick={() => setFilter(item.id)}
                disabled={sharing}
              >
                {item.label}
              </button>
            ))}
            <label className="tiny muted filter-blur">
              Desenfoque
              <input
                type="range"
                min="0"
                max="8"
                value={blur}
                disabled={sharing}
                onChange={(event) => setBlur(Number(event.target.value))}
              />
              {blur > 0 ? `${blur}px` : ''}
            </label>
          </div>
          <button type="button" className="control hangup" onClick={hangup}>🚪 Salir (los demás siguen)</button>
          {isHost && (
            <button type="button" className="control danger-outline" onClick={endRoom}>⛔ Finalizar sala</button>
          )}
        </div>
      </div>
    </div>
  );
}
