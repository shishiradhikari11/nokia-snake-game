// Online 2-player transport for the web version (not part of the YouTube bundle).
// Two devices connect peer-to-peer over WebRTC using PeerJS; the free PeerJS
// cloud server is only used to introduce the two devices to each other.
(() => {
  'use strict';

  const PEERJS_URL = 'https://cdn.jsdelivr.net/npm/peerjs@1.5.5/dist/peerjs.min.js';
  const ID_PREFIX = 'nokia-snake-v1-';
  const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O or 1/I
  const CODE_LENGTH = 4;
  const TIMEOUT_MS = 15000;

  // Optional override, e.g. to point at a self-hosted PeerServer:
  // window.SNAKE_PEER_OPTIONS = { host: 'peer.example.com', port: 443, path: '/' };
  const peerOptions = () => window.SNAKE_PEER_OPTIONS || {};

  let peerLoad = null;
  function loadPeerJs() {
    if (window.Peer) return Promise.resolve();
    peerLoad = peerLoad || new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = PEERJS_URL;
      s.onload = resolve;
      s.onerror = () => { peerLoad = null; reject(new Error('Could not load the online library. Check your connection.')); };
      document.head.appendChild(s);
    });
    return peerLoad;
  }

  function randomCode() {
    let c = '';
    for (let i = 0; i < CODE_LENGTH; i++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    return c;
  }

  function normalizeCode(code) {
    return String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, CODE_LENGTH);
  }

  function friendlyError(err) {
    switch (err && err.type) {
      case 'peer-unavailable': return 'Room not found. Check the code.';
      case 'network':
      case 'server-error':
      case 'socket-error':
      case 'socket-closed': return 'Could not reach the online server.';
      case 'browser-incompatible': return 'This browser does not support online play.';
      default: return (err && err.message) || 'Connection failed.';
    }
  }

  // Wraps a PeerJS DataConnection in the small API the game uses.
  function link(peer, conn, handlers) {
    let closed = false;
    const finish = () => {
      if (closed) return;
      closed = true;
      peer.destroy();
      handlers.onClose();
    };
    conn.on('data', (msg) => { if (!closed) handlers.onData(msg); });
    conn.on('close', finish);
    conn.on('error', finish);
    peer.on('disconnected', () => { if (!closed && !peer.destroyed) peer.reconnect(); });
    return {
      send(msg) { if (!closed && conn.open) conn.send(msg); },
      close() {
        if (closed) return;
        closed = true;
        try { conn.close(); } catch (e) { /* already closed */ }
        peer.destroy();
      },
    };
  }

  function openPeer(id) {
    return new Promise((resolve, reject) => {
      const peer = id ? new window.Peer(id, peerOptions()) : new window.Peer(peerOptions());
      const fail = (err) => { clearTimeout(timer); peer.destroy(); reject(err); };
      const timer = setTimeout(() => fail(new Error('Could not reach the online server.')), TIMEOUT_MS);
      peer.once('error', fail);
      peer.once('open', () => {
        clearTimeout(timer);
        peer.off('error', fail); // later errors are handled by the caller
        resolve(peer);
      });
    });
  }

  // Creates a room. Calls handlers.onCode(code) once the room exists and
  // handlers.onConnect(link) when a friend joins. Returns { cancel }.
  function host(handlers) {
    let peer = null;
    let cancelled = false;
    (async () => {
      try {
        await loadPeerJs();
        for (let attempt = 0; !peer && attempt < 5; attempt++) {
          const code = randomCode();
          try {
            peer = await openPeer(ID_PREFIX + code);
          } catch (err) {
            if (err.type !== 'unavailable-id') throw err; // code taken: try another
            continue;
          }
          if (cancelled) { peer.destroy(); return; }
          handlers.onCode(code);
        }
        if (!peer) throw new Error('Could not create a room. Try again.');
        let taken = false;
        peer.on('connection', (conn) => {
          if (taken) { conn.on('open', () => conn.close()); return; } // room is full
          taken = true;
          conn.on('open', () => handlers.onConnect(link(peer, conn, handlers)));
        });
        peer.on('error', (err) => { if (!taken) handlers.onError(friendlyError(err)); });
      } catch (err) {
        if (!cancelled) handlers.onError(friendlyError(err));
      }
    })();
    return {
      cancel() {
        cancelled = true;
        if (peer) peer.destroy();
      },
    };
  }

  // Joins the room with `code`. Calls handlers.onConnect(link) when connected.
  function join(code, handlers) {
    let peer = null;
    let cancelled = false;
    (async () => {
      try {
        await loadPeerJs();
        peer = await openPeer(null);
        if (cancelled) { peer.destroy(); return; }
        const conn = peer.connect(ID_PREFIX + normalizeCode(code), { reliable: true });
        const timer = setTimeout(() => {
          if (!conn.open) { peer.destroy(); handlers.onError('Room not found. Check the code.'); }
        }, TIMEOUT_MS);
        conn.on('open', () => { clearTimeout(timer); handlers.onConnect(link(peer, conn, handlers)); });
        peer.on('error', (err) => {
          if (conn.open) return;
          clearTimeout(timer);
          peer.destroy();
          handlers.onError(friendlyError(err));
        });
      } catch (err) {
        if (!cancelled) handlers.onError(friendlyError(err));
      }
    })();
    return {
      cancel() {
        cancelled = true;
        if (peer) peer.destroy();
      },
    };
  }

  window.SnakeNet = { host, join, normalizeCode, CODE_LENGTH };
})();
