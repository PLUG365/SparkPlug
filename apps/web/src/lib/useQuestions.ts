import { useEffect, useState } from 'react';
import type { Question } from '@sparkplug/shared';
import type { SparkPlugSocket } from './socket';

/**
 * 質問一覧をリアルタイム購読するフック。
 * join 時の一括同期（questions）・新規質問（question）・更新（questionUpdated）を反映する。
 */
export function useQuestions(socket: SparkPlugSocket | null): Question[] {
  const [questions, setQuestions] = useState<Question[]>([]);

  useEffect(() => {
    if (!socket) return;
    // join 時の一括同期。現状で丸ごと置き換える
    const onQuestions = (list: Question[]) => setQuestions(list);
    // 新規質問。既に居れば重複追加しない（念のため）
    const onQuestion = (q: Question) =>
      setQuestions((prev) => (prev.some((x) => x.id === q.id) ? prev : [...prev, q]));
    // いいね数・ステータス更新。該当 id を差し替える
    const onUpdated = (q: Question) =>
      setQuestions((prev) => prev.map((x) => (x.id === q.id ? q : x)));
    socket.on('questions', onQuestions);
    socket.on('question', onQuestion);
    socket.on('questionUpdated', onUpdated);
    return () => {
      socket.off('questions', onQuestions);
      socket.off('question', onQuestion);
      socket.off('questionUpdated', onUpdated);
    };
  }, [socket]);

  return questions;
}
