import { useEffect, useState } from 'react';
import type { Role } from '@sparkplug/shared';
import { createSocket, type SparkPlugSocket } from './socket';

/**
 * イベント（ルーム）に接続し、切断まで面倒を見るフック。
 * host / presenter などの特権ロールは token（URLの ?t= 由来）を渡す。不一致だと
 * サーバーが authRejected を返し、rejected=true になる（audience / screen では不要）。
 */
export function useEvent(eventId: string | undefined, role: Role, token?: string) {
  const [socket, setSocket] = useState<SparkPlugSocket | null>(null);
  const [participantCount, setParticipantCount] = useState(0);
  const [connected, setConnected] = useState(false);
  const [rejected, setRejected] = useState(false);

  useEffect(() => {
    if (!eventId) return;
    const s = createSocket();
    s.on('connect', () => {
      setConnected(true);
      s.emit('join', { eventId, role, token });
    });
    s.on('disconnect', () => setConnected(false));
    s.on('participantCount', setParticipantCount);
    s.on('authRejected', () => setRejected(true));
    s.connect();
    setSocket(s);
    return () => {
      s.disconnect();
      setSocket(null);
    };
  }, [eventId, role, token]);

  return { socket, connected, participantCount, rejected };
}
