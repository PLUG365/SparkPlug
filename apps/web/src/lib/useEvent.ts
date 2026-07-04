import { useEffect, useState } from 'react';
import type { Role } from '@sparkplug/shared';
import { createSocket, type SparkPlugSocket } from './socket';

/** イベント（ルーム）に接続し、切断まで面倒を見るフック */
export function useEvent(eventId: string | undefined, role: Role) {
  const [socket, setSocket] = useState<SparkPlugSocket | null>(null);
  const [participantCount, setParticipantCount] = useState(0);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!eventId) return;
    const s = createSocket();
    s.on('connect', () => {
      setConnected(true);
      s.emit('join', { eventId, role });
    });
    s.on('disconnect', () => setConnected(false));
    s.on('participantCount', setParticipantCount);
    s.connect();
    setSocket(s);
    return () => {
      s.disconnect();
      setSocket(null);
    };
  }, [eventId, role]);

  return { socket, connected, participantCount };
}
