import { useEffect, useRef, useState } from 'react';
import type { Poll } from '@sparkplug/shared';
import type { SparkPlugSocket } from './socket';

export interface PollState {
  poll: Poll | null;
  counts: number[];
  total: number;
}

/** アクティブなアンケートと集計をリアルタイム購読するフック */
export function usePoll(socket: SparkPlugSocket | null): PollState {
  const [poll, setPoll] = useState<Poll | null>(null);
  const [counts, setCounts] = useState<number[]>([]);
  const [total, setTotal] = useState(0);
  const pollIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!socket) return;
    const onPoll = (p: Poll) => {
      pollIdRef.current = p.id;
      setPoll(p);
      setCounts(p.options.map(() => 0));
      setTotal(0);
    };
    const onResults = (pollId: string, c: number[], t: number) => {
      if (pollIdRef.current !== pollId) return;
      setCounts(c);
      setTotal(t);
    };
    const onClosed = (pollId: string) => {
      if (pollIdRef.current !== pollId) return;
      setPoll((prev) => (prev ? { ...prev, isOpen: false } : prev));
    };
    socket.on('poll', onPoll);
    socket.on('pollResults', onResults);
    socket.on('pollClosed', onClosed);
    return () => {
      socket.off('poll', onPoll);
      socket.off('pollResults', onResults);
      socket.off('pollClosed', onClosed);
    };
  }, [socket]);

  return { poll, counts, total };
}
