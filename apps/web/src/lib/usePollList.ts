import { useEffect, useState } from 'react';
import type { Poll } from '@sparkplug/shared';
import type { SparkPlugSocket } from './socket';

/** pollId ごとの集計（counts と total） */
export interface PollResult {
  counts: number[];
  total: number;
}

export interface PollListState {
  /** 下書き・実施中・締切済みを含む全アンケート一覧 */
  polls: Poll[];
  /** pollId → 集計。実施中・締切済みのものだけ蓄積される */
  resultsByPollId: Record<string, PollResult>;
}

/**
 * Host 専用。全アンケート一覧と各アンケートの集計をリアルタイム購読するフック。
 * join 時の一括同期（polls）・作成/開始/締切ごとの更新（polls）と、
 * 集計（pollResults）を蓄積して返す。
 */
export function usePollList(socket: SparkPlugSocket | null): PollListState {
  const [polls, setPolls] = useState<Poll[]>([]);
  const [resultsByPollId, setResultsByPollId] = useState<Record<string, PollResult>>({});

  useEffect(() => {
    if (!socket) return;
    // 全件置き換え（作成/開始/締切のたび、および join 時に届く）
    const onPolls = (list: Poll[]) => setPolls(list);
    // pollId ごとに最新の集計を蓄積する
    const onResults = (pollId: string, counts: number[], total: number) =>
      setResultsByPollId((prev) => ({ ...prev, [pollId]: { counts, total } }));
    socket.on('polls', onPolls);
    socket.on('pollResults', onResults);
    return () => {
      socket.off('polls', onPolls);
      socket.off('pollResults', onResults);
    };
  }, [socket]);

  return { polls, resultsByPollId };
}
