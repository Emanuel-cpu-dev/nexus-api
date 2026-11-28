export class RtcManager {
  constructor({ socket, callId, myId, localStream, onTrack, onError } = {}) {
    this.socket = socket;
    this.callId = callId;
    this.myId = myId;
    this.localStream = localStream || null;
    this.onTrack = onTrack || (() => {});
    this.onError = onError || (() => {});
    this.peers = new Map();
    this.pending = new Map();
    this.videoSenders = new Map();
    this.offering = new Set();
    this.reoffer = new Set();
    this.offerTimers = new Map();
    this.offerRetries = new Map();
    this.connectionRetries = new Map();
    this.recoverTimers = new Map();
    this.destroyed = false;

    const iceServers = [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' }
    ];
    try {
      const turn = JSON.parse(localStorage.getItem('nexus_turn') || 'null');
      if (turn && turn.urls) iceServers.push(turn);
    } catch {
      /* TURN inválido: se ignoran los STUN de Google */
    }
    this.iceServers = iceServers;

    this._onSignal = this._onSignal.bind(this);
    this.socket?.on('call:signal', this._onSignal);
  }

  syncPeers(ids = []) {
    if (this.destroyed) return;
    const unique = [...new Set(ids)].filter((id) => id && id !== this.myId);

    for (const [id, pc] of this.peers) {
      if (!unique.includes(id)) {
        pc.close();
        this.peers.delete(id);
        this.pending.delete(id);
        this.videoSenders.delete(id);
        this.offering.delete(id);
        this.reoffer.delete(id);
        clearTimeout(this.offerTimers.get(id));
        this.offerTimers.delete(id);
        this.offerRetries.delete(id);
        clearTimeout(this.recoverTimers.get(id));
        this.recoverTimers.delete(id);
        this.connectionRetries.delete(id);
      }
    }

    for (const id of unique) {
      if (this.peers.has(id)) continue;
      this._createPeer(id);
      // El participante con el userId más pequeño crea la oferta.
      if (String(this.myId) < String(id)) this._offer(id);
    }
  }

  // El micrófono/cámara pueden abrirse después de que llegó la oferta.
  // Al llegar el stream se agregan las pistas y se renegocia para que el audio
  // y el video lleguen también al otro participante.
  setLocalStream(stream) {
    if (this.destroyed) return;
    this.localStream = stream || null;
    for (const [id, pc] of this.peers) {
      const sending = new Set(pc.getSenders().map((sender) => sender.track));
      for (const track of this.localStream?.getTracks() || []) {
        if (sending.has(track)) continue;
        const sender = pc.addTrack(track, this.localStream);
        if (track.kind === 'video') this.videoSenders.set(id, sender);
      }
    }
    this.renegotiate();
  }

  renegotiate() {
    if (this.destroyed) return;
    for (const id of this.peers.keys()) {
      if (String(this.myId) < String(id)) this._offer(id);
    }
  }

  _createPeer(id) {
    if (this.peers.has(id)) return this.peers.get(id);
    const pc = new RTCPeerConnection({ iceServers: this.iceServers });
    this.peers.set(id, pc);

    for (const track of this.localStream?.getTracks() || []) {
      const sender = pc.addTrack(track, this.localStream);
      if (track.kind === 'video') this.videoSenders.set(id, sender);
    }

    pc.onicecandidate = (event) => {
      if (!event.candidate || !this.socket || this.destroyed) return;
      const candidate = event.candidate.toJSON ? event.candidate.toJSON() : event.candidate;
      this.socket.emit('call:signal', {
        to: id,
        callId: this.callId,
        data: { type: 'ice', candidate }
      });
    };

    pc.ontrack = (event) => {
      const stream = event.streams?.[0] || new MediaStream([event.track]);
      this.onTrack(id, stream);
      // Si la cámara se apagó y volvió, el navegador puede dejar el último frame
      // congelado hasta que la pista vuelve a emitir.
      event.track.onunmute = () => this.onTrack(id, stream);
    };

    // NAT/4G: la señalización puede seguir viva aunque el media muera. Reactivamos
    // ICE en vez de dejar la cámara del otro congelada para siempre.
    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      if (state === 'connected') {
        this.connectionRetries.set(id, 0);
        return;
      }
      if (state === 'failed' || state === 'disconnected') this._recoverPeer(id, pc);
    };
    pc.oniceconnectionstatechange = () => {
      const state = pc.iceConnectionState;
      if (state === 'failed' || state === 'disconnected') this._recoverPeer(id, pc);
    };

    return pc;
  }

  _recoverPeer(id, pc) {
    if (this.destroyed || this.peers.get(id) !== pc) return;
    // Un solo lado renegocia: si los dos lanzan ofertas al mismo tiempo se
    // produce glare y la cámara puede quedar detenida igual que antes.
    if (String(this.myId) >= String(id)) return;
    clearTimeout(this.recoverTimers.get(id));
    this.recoverTimers.set(id, setTimeout(async () => {
      if (this.destroyed || this.peers.get(id) !== pc) return;
      const state = pc.connectionState || pc.iceConnectionState;
      if (state === 'connected' || state === 'completed' || state === 'stable') return;
      const attempt = (this.connectionRetries.get(id) || 0) + 1;
      if (attempt > 4) return;
      this.connectionRetries.set(id, attempt);
      try {
        if (pc.signalingState === 'have-local-offer') {
          await pc.setRemoteDescription({ type: 'rollback' });
        }
        if (typeof pc.restartIce === 'function') pc.restartIce();
        await this._offer(id, true);
      } catch (error) {
        this.onError(error);
      }
    }, 1500));
  }

  async _offer(id, iceRestart = false) {
    if (this.destroyed || !this.peers.has(id)) return;
    const pc = this.peers.get(id);
    // Si ya hay una oferta en curso, se marca para enviar otra cuando llegue la respuesta.
    if (this.offering.has(id) || pc.signalingState !== 'stable') {
      this.reoffer.add(id);
      return;
    }
    this.offering.add(id);
    clearTimeout(this.offerTimers.get(id));
    this.offerTimers.delete(id);
    try {
      const offer = await pc.createOffer({ iceRestart });
      await pc.setLocalDescription(offer);
      this.socket?.emit('call:signal', {
        to: id,
        callId: this.callId,
        data: { type: 'offer', description: pc.localDescription }
      });
      // Si el otro participante todavía no abrió su conexión, la oferta se pierde.
      // Reintentamos con ICE restart para que el tercero y los siguientes sí se escuchen.
      const attempt = this.offerRetries.get(id) || 0;
      if (!pc.remoteDescription && attempt < 3) {
        this.offerTimers.set(id, setTimeout(async () => {
          if (this.destroyed || this.peers.get(id) !== pc || pc.remoteDescription) return;
          try {
            if (pc.signalingState === 'have-local-offer') {
              await pc.setRemoteDescription({ type: 'rollback' });
            }
          } catch {
            /* El navegador no soporta rollback: se conserva la oferta anterior. */
          }
          this.offerRetries.set(id, attempt + 1);
          this._offer(id, true);
        }, 6000));
      }
    } catch (error) {
      this.onError(error);
    } finally {
      this.offering.delete(id);
      if (this.reoffer.has(id)) {
        this.reoffer.delete(id);
        this._offer(id);
      }
    }
  }

  async _flush(id, pc) {
    const candidates = this.pending.get(id) || [];
    this.pending.delete(id);
    for (const candidate of candidates) {
      try {
        await pc.addIceCandidate(candidate);
      } catch {
        /* candidate obsoleto */
      }
    }
  }

  async _onSignal(payload) {
    if (this.destroyed || !payload || payload.callId !== this.callId || payload.from === this.myId) return;
    const { from, data } = payload;

    try {
      if (data?.type === 'ice') {
        const pc = this.peers.get(from);
        if (pc?.remoteDescription) await pc.addIceCandidate(data.candidate);
        else this.pending.set(from, [...(this.pending.get(from) || []), data.candidate]);
        return;
      }
      if (data?.type === 'offer') {
        clearTimeout(this.offerTimers.get(from));
        this.offerTimers.delete(from);
        this.offerRetries.delete(from);
        const pc = this._createPeer(from);
        // Si habíamos enviado una oferta al mismo tiempo, volvemos a estable antes de aceptar.
        try {
          if (pc.signalingState === 'have-local-offer') {
            await pc.setRemoteDescription({ type: 'rollback' });
          }
        } catch {
          /* No soportado: seguimos con el flujo normal. */
        }
        await pc.setRemoteDescription(data.description);
        await this._flush(from, pc);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        this.socket?.emit('call:signal', {
          to: from,
          callId: this.callId,
          data: { type: 'answer', description: pc.localDescription }
        });
        if (this.reoffer.has(from)) {
          this.reoffer.delete(from);
          this._offer(from);
        }
        return;
      }
      if (data?.type === 'answer') {
        clearTimeout(this.offerTimers.get(from));
        this.offerTimers.delete(from);
        this.offerRetries.delete(from);
        const pc = this.peers.get(from) || this._createPeer(from);
        await pc.setRemoteDescription(data.description);
        await this._flush(from, pc);
        if (this.reoffer.has(from)) {
          this.reoffer.delete(from);
          this._offer(from);
        }
      }
    } catch (error) {
      this.onError(error);
    }
  }

  async replaceVideoTrack(track, stream) {
    if (stream) this.localStream = stream;
    const operations = [];
    for (const [id, pc] of this.peers) {
      const senders = pc.getSenders();
      const sender = this.videoSenders.get(id);
      if (sender && senders.includes(sender)) {
        operations.push(sender.replaceTrack(track || null));
      } else if (track) {
        // No había cámara: compartir pantalla debe crear el sender y negociarlo.
        const added = pc.addTrack(track, this.localStream || new MediaStream([track]));
        this.videoSenders.set(id, added);
        operations.push(this._offer(id));
      }
    }
    await Promise.allSettled(operations);
  }

  destroy() {
    this.destroyed = true;
    this.socket?.off('call:signal', this._onSignal);
    for (const pc of this.peers.values()) pc.close();
    this.peers.clear();
    this.pending.clear();
    this.videoSenders.clear();
    this.offering.clear();
    this.reoffer.clear();
    for (const timer of this.offerTimers.values()) clearTimeout(timer);
    this.offerTimers.clear();
    this.offerRetries.clear();
    for (const timer of this.recoverTimers.values()) clearTimeout(timer);
    this.recoverTimers.clear();
    this.connectionRetries.clear();
  }
}
