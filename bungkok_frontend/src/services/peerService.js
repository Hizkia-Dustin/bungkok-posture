import Peer from 'peerjs';

const GOOGLE_ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
  { urls: 'stun:stun4.l.google.com:19302' },
];

/**
 * Generate a short, user-friendly room ID for pairing
 * Example: "bk-side-7k3m"
 */
export function generateRoomId() {
  const randomSuffix = Math.random().toString(36).substring(2, 6);
  return `bk-side-${randomSuffix}`;
}

/**
 * Initialize WebRTC Peer on the Laptop (Receiver)
 * Listens for incoming phone camera calls
 */
export function createLaptopPeer(roomId, { onStream, onStatusChange, onError }) {
  onStatusChange?.('initializing');

  const peer = new Peer(roomId, {
    config: {
      iceServers: GOOGLE_ICE_SERVERS,
    },
    debug: 1,
  });

  peer.on('open', (id) => {
    onStatusChange?.('ready', id);
  });

  peer.on('call', (incomingCall) => {
    onStatusChange?.('connecting');
    // Answer the call without sending laptop webcam (receive-only)
    incomingCall.answer();

    incomingCall.on('stream', (remoteStream) => {
      onStatusChange?.('connected', remoteStream);
      onStream?.(remoteStream);
    });

    incomingCall.on('close', () => {
      onStatusChange?.('disconnected');
    });

    incomingCall.on('error', (err) => {
      onError?.(err);
      onStatusChange?.('error');
    });
  });

  peer.on('error', (err) => {
    onError?.(err);
    onStatusChange?.('error', err);
  });

  peer.on('disconnected', () => {
    onStatusChange?.('disconnected');
  });

  return {
    peer,
    roomId,
    destroy: () => {
      try {
        peer.destroy();
      } catch {
        // ignore
      }
    },
  };
}

/**
 * Initialize WebRTC Peer on the Mobile Phone (Broadcaster)
 * Calls the laptop's room ID with the phone's camera stream
 */
export function connectPhoneToRoom(targetRoomId, localStream, { onConnected, onStatusChange, onError }) {
  onStatusChange?.('initializing');

  const peer = new Peer({
    config: {
      iceServers: GOOGLE_ICE_SERVERS,
    },
    debug: 1,
  });

  let activeCall = null;

  peer.on('open', () => {
    onStatusChange?.('calling');
    activeCall = peer.call(targetRoomId, localStream);

    if (!activeCall) {
      onError?.(new Error('Gagal memulai panggilan WebRTC'));
      return;
    }

    activeCall.on('close', () => {
      onStatusChange?.('disconnected');
    });

    activeCall.on('error', (err) => {
      onError?.(err);
      onStatusChange?.('error');
    });

    const transport = activeCall.peerConnection;
    const updateConnection = () => {
      if (transport.connectionState === 'connected') {
        onStatusChange?.('connected');
        onConnected?.(activeCall);
      } else if (['closed', 'disconnected', 'failed'].includes(transport.connectionState)) {
        onStatusChange?.('disconnected');
      }
    };
    transport.addEventListener('connectionstatechange', updateConnection);
    activeCall.on('close', () => transport.removeEventListener('connectionstatechange', updateConnection));
    updateConnection();
  });

  peer.on('error', (err) => {
    onError?.(err);
    onStatusChange?.('error', err);
  });

  peer.on('disconnected', () => {
    onStatusChange?.('disconnected');
  });

  return {
    peer,
    destroy: () => {
      try {
        activeCall?.close();
        peer.destroy();
      } catch {
        // ignore
      }
    },
  };
}
