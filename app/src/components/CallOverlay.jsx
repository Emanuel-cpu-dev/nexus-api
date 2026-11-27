import { useEffect, useRef, useState } from 'react';
import { getSocket } from '../socket.js';
import { RtcManager } from '../rtc.js';
import { cx } from '../utils.js';
import Avatar from './Avatar.jsx';

function VideoTile({ stream, name, user, muted = false, remote = false }) {
  const ref = useRef(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (element.srcObject !== (stream || null)) element.srcObject = stream || null;
    // El autoplay con audio puede estar bloqueado hasta que el usuario interactúa.
    if (stream && element.paused) element.play().catch(() => {});
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
  const [error, setError] = useState('');
  const rtcRef = useRef(null);
  const screenRef = useRef(null);
  const cameraRef = useRef(null);

  const callId = call?.callId;
  const userOf = (id) => (id === me?.id ? me : friends.find((f) => f.id === id));
  const nameOf = (id) => (id === me?.id
    ? `${me?.displayName} (tú)`
    : userOf(id)?.displayName || 'Participante');

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
      // Agregamos las pistas y renegociamos: si la oferta llegó antes de abrir el micrófono,
      // se vuelve a enviar con audio y video incluidos.
      rtc.setLocalStream(stream);
      rtc.syncPeers(peerIds);
      getSocket()?.emit('call:resync', { callId });
    }

    start();
    return () => {
      disposed = true;
      rtcRef.current?.destroy();
      rtcRef.current = null;
      stream?.getTracks().forEach((track) => track.stop());
      screenRef.current?.getTracks().forEach((track) => track.stop());
      setLocalStream(null);
      setRemoteStreams({});
    };
    // peerIds se sincroniza con call:ready, no debe reiniciar el media.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callId, active]);

  useEffect(() => {
    const socket = getSocket();
    if (!socket || !callId) return undefined;

    function onReady(payload) {
      if (payload?.callId !== callId) return;
      const ids = payload.peers || [];
      setPeerIds(ids);
      rtcRef.current?.syncPeers(ids);
      rtcRef.current?.renegotiate();
    }
    function onLeft(payload) {
      if (payload?.callId !== callId || !payload.userId) return;
      setPeerIds((current) => current.filter((id) => id !== payload.userId));
      setRemoteStreams((current) => {
        const next = { ...current };
        delete next[payload.userId];
        return next;
      });
    }
    function onInvite(payload) {
      if (payload?.callId !== callId) return;
      const ids = payload.peers || [];
      setPeerIds(ids);
      rtcRef.current?.syncPeers(ids);
      rtcRef.current?.renegotiate();
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
    getSocket()?.emit('call:ended', { callId });
    onClose();
  }

  function toggleMute() {
    const next = !muted;
    localStream?.getAudioTracks().forEach((track) => { track.enabled = !next; });
    setMuted(next);
  }

  function toggleCamera() {
    const next = !cameraOff;
    localStream?.getVideoTracks().forEach((track) => { track.enabled = !next; });
    setCameraOff(next);
  }

  function restoreCamera() {
    const audio = localStream?.getAudioTracks() || [];
    const camera = cameraRef.current?.readyState === 'live' ? cameraRef.current : null;
    const next = new MediaStream([...audio, ...(camera ? [camera] : [])]);
    rtcRef.current?.replaceVideoTrack(camera, next);
    setLocalStream(next);
    setSharing(false);
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
    try {
      let stream;
      if (window.electronAPI?.getSources) {
        const sources = await window.electronAPI.getSources();
        const source = sources.find((item) => /screen|pantalla/i.test(item.name)) || sources[0];
        if (!source) throw new Error('No se detectó ninguna pantalla.');
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            mandatory: {
              chromeMediaSource: 'desktop',
              chromeMediaSourceId: source.id,
              maxWidth: 1920,
              maxHeight: 1080
            }
          },
          audio: false
        });
      } else {
        stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      }
      const track = stream.getVideoTracks()[0];
      cameraRef.current = localStream?.getVideoTracks()[0] || cameraRef.current || null;
      screenRef.current = stream;
      const next = new MediaStream([...(localStream?.getAudioTracks() || []), track]);
      rtcRef.current?.replaceVideoTrack(track, next);
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

  return (
    <div className="overlay">
      <div className="card call-window">
        <header className="call-header">
          <div>
            <strong>📹 Llamada Nexus</strong>
            <span className="tiny muted block">En la llamada: {peerIds.map(nameOf).join(', ') || 'Conectando…'}</span>
          </div>
          <button type="button" className="icon-btn" onClick={hangup}>✕</button>
        </header>

        {error && <div className="error-box">{error}</div>}

        <div className="video-grid">
          <VideoTile stream={localStream} name={`${me?.displayName} (tú)`} user={me} muted />
          {peerIds.filter((id) => id !== me?.id).map((id) => (
            <VideoTile key={id} stream={remoteStreams[id]} name={nameOf(id)} user={userOf(id)} remote />
          ))}
        </div>

        <div className="invite-row">
          <select
            multiple
            value={selected}
            onChange={(e) => setSelected([...e.target.selectedOptions].map((option) => option.value))}
          >
            {inviteable.map((friend) => <option key={friend.id} value={friend.id}>{friend.displayName}</option>)}
          </select>
          <button type="button" className="ghost small" disabled={!selected.length} onClick={invite}>Invitar</button>
        </div>

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
          <button type="button" className="control hangup" onClick={hangup}>📴 Colgar</button>
        </div>
      </div>
    </div>
  );
}
