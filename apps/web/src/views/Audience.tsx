import { useState } from 'react';
import { useParams } from 'react-router-dom';
import type { QuestionStatus, ReactionKind, SeKind } from '@sparkplug/shared';
import { useEvent } from '../lib/useEvent';
import { usePoll } from '../lib/usePoll';
import { useQuestions } from '../lib/useQuestions';
import { BRAND, headerBarStyle, pillBadgeStyle, pillButtonStyle, circleButtonStyle } from '../lib/theme';

/** 参加者一覧に出すステータスバッジ（新着はバッジなし） */
const STATUS_BADGE: Record<QuestionStatus, string | null> = {
  new: null,
  now: '🎤 いま回答中',
  later: '⏳ あとで',
  offline: '📮 後日回答',
  done: '✅ 回答済み',
};

/** 質問一覧の最大表示件数 */
const QUESTION_DISPLAY_LIMIT = 20;

const SOUNDS: { kind: SeKind; emoji: string; label: string }[] = [
  { kind: 'don', emoji: '🥁', label: 'タンバリン' },
  { kind: 'ka', emoji: '🪵', label: 'カッ' },
  { kind: 'clap', emoji: '👏', label: '拍手' },
];

const REACTIONS: { kind: ReactionKind; emoji: string; label: string }[] = [
  { kind: 'like', emoji: '👍', label: 'いいね' },
  { kind: 'laugh', emoji: '😆', label: 'ウケる' },
  { kind: 'heart', emoji: '❤️', label: 'すき' },
  { kind: 'surprise', emoji: '😲', label: 'えっ' },
];

export default function Audience() {
  const { eventId } = useParams();
  const { socket, connected, participantCount } = useEvent(eventId, 'audience');
  const { poll, counts, total } = usePoll(socket);
  const questions = useQuestions(socket);
  const [comment, setComment] = useState('');
  const [name, setName] = useState('');
  // ON のとき質問として送る（表示名必須）
  const [asQuestion, setAsQuestion] = useState(false);
  // ON のとき AA（アスキーアート）として送る。改行・空白を保持して等幅で流す
  const [aaMode, setAaMode] = useState(false);
  const [myVote, setMyVote] = useState<{ pollId: string; index: number } | null>(null);
  // 自分がいいねした質問 id（ローカル表示用トグル）
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());

  const toggleLike = (questionId: string) => {
    if (!socket) return;
    socket.emit('likeQuestion', questionId);
    setLikedIds((prev) => {
      const next = new Set(prev);
      if (next.has(questionId)) next.delete(questionId);
      else next.add(questionId);
      return next;
    });
  };

  // いいね降順 → 新しい順。表示は最大 QUESTION_DISPLAY_LIMIT 件
  const sortedQuestions = [...questions].sort((a, b) => b.likes - a.likes || b.at - a.at);
  const visibleQuestions = sortedQuestions.slice(0, QUESTION_DISPLAY_LIMIT);
  const overflowCount = sortedQuestions.length - visibleQuestions.length;

  const vote = (index: number) => {
    if (poll?.status !== 'open' || !socket) return;
    socket.emit('vote', poll.id, index);
    setMyVote({ pollId: poll.id, index });
  };

  const sendComment = () => {
    if (!socket) return;
    if (asQuestion) {
      // 質問として送る。表示名は必須
      const body = comment.trim();
      if (!body) return;
      const trimmedName = name.trim();
      if (!trimmedName) return;
      socket.emit('question', body, trimmedName);
    } else if (aaMode) {
      // AA として送る。空白判定にだけ trim を使い、送信は改行・インデントを潰さない素の値を渡す
      if (!comment.trim()) return;
      socket.emit('comment', comment, name.trim() || undefined, true);
    } else {
      const body = comment.trim();
      if (!body) return;
      socket.emit('comment', body, name.trim() || undefined);
    }
    setComment('');
  };

  return (
    <main style={{ fontFamily: 'sans-serif', padding: '1.5rem', maxWidth: 480, margin: '0 auto' }}>
      <header style={headerBarStyle}>
        <h1 style={{ fontSize: '1.3rem', fontWeight: 700, margin: 0 }}>SparkPlug ⚡</h1>
        <span style={pillBadgeStyle(connected)}>
          {connected ? `🟢 ${participantCount}人` : '🔴 接続中…'}
        </span>
      </header>

      {poll && poll.status === 'open' && (
        <section aria-label="アンケート" style={{ margin: '1.5rem 0', padding: '1rem', border: `3px solid ${BRAND.red}`, borderRadius: 18 }}>
          <h2 style={{ fontSize: '1.05rem', marginTop: 0 }}>
            📊 {poll.question}
          </h2>
          {poll.options.map((opt, i) => {
            const isMine = myVote?.pollId === poll.id && myVote.index === i;
            const pct = total ? Math.round(((counts[i] ?? 0) / total) * 100) : 0;
            return (
              <button
                key={i}
                onClick={() => vote(i)}
                style={{
                  display: 'block', width: '100%', textAlign: 'left', marginBottom: 6,
                  padding: '0.6rem 0.8rem', borderRadius: 12, cursor: 'pointer',
                  border: isMine ? `3px solid ${BRAND.red}` : '2px solid #ccc',
                  background: `linear-gradient(90deg, #f2f7c4 ${pct}%, #fff ${pct}%)`,
                }}
              >
                {isMine ? '✅ ' : ''}{opt}
                <span style={{ float: 'right', color: '#888', fontSize: '0.85rem' }}>{pct}%</span>
              </button>
            );
          })}
          <p style={{ fontSize: '0.8rem', color: '#888', margin: '4px 0 0' }}>
            {total}票・タップで投票（変更可）
          </p>
        </section>
      )}

      <section aria-label="リアクション" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', margin: '1.5rem 0' }}>
        {REACTIONS.map(({ kind, emoji, label }, i) => {
          // 4色（黄緑・赤・黄・黒）を順番に割り当て
          const borderColors = [BRAND.lime, BRAND.red, BRAND.yellow, BRAND.black];
          return (
            <button
              key={kind}
              onClick={() => socket?.emit('reaction', kind)}
              disabled={!connected}
              style={{ ...circleButtonStyle(borderColors[i % borderColors.length], 56), fontSize: '1.8rem' }}
              aria-label={label}
            >
              {emoji}
            </button>
          );
        })}
      </section>

      <section aria-label="効果音" style={{ margin: '0 0 1.5rem' }}>
        <p style={{ fontSize: '0.8rem', color: '#888', margin: '0 0 6px' }}>会場に音を鳴らす 🔊</p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {SOUNDS.map(({ kind, emoji, label }, i) => {
            // リアクションと同様、4色を順番に割り当て（SEは3種）
            const borderColors = [BRAND.lime, BRAND.red, BRAND.yellow, BRAND.black];
            return (
              <button
                key={kind}
                onClick={() => socket?.emit('se', kind)}
                disabled={!connected}
                style={{ ...circleButtonStyle(borderColors[i % borderColors.length], 56), fontSize: '1.8rem' }}
                aria-label={label}
              >
                {emoji}
              </button>
            );
          })}
        </div>
      </section>

      <section aria-label="コメント">
        {/* 質問・AA の2モードは排他。片方をONにするともう片方は自動でOFFにする */}
        <div style={{ display: 'flex', gap: 16, marginBottom: 8 }}>
          <label
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              fontSize: '0.85rem', color: asQuestion ? BRAND.yellow : '#666', cursor: 'pointer',
            }}
          >
            <input
              type="checkbox"
              checked={asQuestion}
              onChange={(e) => {
                setAsQuestion(e.target.checked);
                if (e.target.checked) setAaMode(false);
              }}
            />
            ❓ 質問として送信
          </label>
          <label
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              fontSize: '0.85rem', color: aaMode ? BRAND.red : '#666', cursor: 'pointer',
            }}
          >
            <input
              type="checkbox"
              checked={aaMode}
              onChange={(e) => {
                setAaMode(e.target.checked);
                if (e.target.checked) setAsQuestion(false);
              }}
            />
            🎨 AAとして送信
          </label>
        </div>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={asQuestion ? '表示名（質問には必須）' : '表示名（空なら匿名）'}
          maxLength={20}
          style={{
            width: '100%', padding: '0.5rem', marginBottom: 8, boxSizing: 'border-box',
            // 質問モードでは表示名入力欄を黄色ボーダーで必須と明示。通常は太さ2px黒縁取り
            border: asQuestion ? `2px solid ${BRAND.yellow}` : `2px solid ${BRAND.black}`,
            borderRadius: 10,
            // iOS Safari はフォーカス時 font-size が16px未満だと自動ズームするため明示指定
            fontSize: 16,
          }}
        />
        <div style={{ display: 'flex', gap: 8, alignItems: aaMode ? 'flex-end' : 'stretch' }}>
          {aaMode ? (
            // AAモードでは複数行・等幅で貼り付けられるよう textarea に切り替える
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="AAをここに貼り付け…"
              rows={6}
              maxLength={500}
              style={{
                flex: 1, padding: '0.6rem',
                border: `2px solid ${BRAND.red}`,
                borderRadius: 10,
                fontFamily: 'monospace',
                // iOS Safari はフォーカス時 font-size が16px未満だと自動ズームするため明示指定
                fontSize: 16,
                resize: 'vertical',
                boxSizing: 'border-box',
              }}
            />
          ) : (
            <input
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && sendComment()}
              placeholder={asQuestion ? '発表者への質問…（例: マイクの音量どうですか？）' : 'コメントを流す…'}
              maxLength={200}
              style={{
                flex: 1, padding: '0.6rem',
                // 質問モードでは黄色ボーダーで「質問として送る」状態を明示。通常は太さ2px黒縁取り
                border: asQuestion ? `2px solid ${BRAND.yellow}` : `2px solid ${BRAND.black}`,
                borderRadius: 10,
                // iOS Safari はフォーカス時 font-size が16px未満だと自動ズームするため明示指定
                fontSize: 16,
              }}
            />
          )}
          <button
            onClick={sendComment}
            // 質問モードでは表示名が空なら送信不可
            disabled={!connected || !comment.trim() || (asQuestion && !name.trim())}
            style={pillButtonStyle({ disabled: !connected || !comment.trim() || (asQuestion && !name.trim()) })}
          >
            送信
          </button>
        </div>
      </section>

      {/* ── 質問一覧（いいねできる） ─────────────────── */}
      {questions.length > 0 && (
        <section aria-label="質問一覧" style={{ marginTop: '1.5rem' }}>
          <h2 style={{ fontSize: '1.05rem', marginBottom: 8 }}>❓ みんなの質問</h2>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {visibleQuestions.map((q) => {
              const badge = STATUS_BADGE[q.status];
              const liked = likedIds.has(q.id);
              return (
                <li
                  key={q.id}
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: 8,
                    padding: '0.6rem 0.8rem', marginBottom: 6, borderRadius: 14,
                    background: '#fafafa', border: '2px solid #eee',
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <span style={{ color: '#d0342c', fontWeight: 600, marginRight: 8 }}>
                      {q.displayName}
                    </span>
                    {badge && (
                      <span
                        style={{
                          fontSize: '0.7rem', color: '#888', border: '1px solid #ddd',
                          borderRadius: 999, padding: '0.1rem 0.5rem', marginRight: 6,
                        }}
                      >
                        {badge}
                      </span>
                    )}
                    <br />
                    {q.body}
                  </div>
                  <button
                    onClick={() => toggleLike(q.id)}
                    disabled={!connected}
                    style={{
                      whiteSpace: 'nowrap', fontSize: '0.85rem', padding: '0.3rem 0.8rem',
                      borderRadius: 999, cursor: 'pointer',
                      border: liked ? `2px solid ${BRAND.yellow}` : '2px solid #ccc',
                      background: liked ? '#fffbe6' : '#fff', fontWeight: 600,
                    }}
                  >
                    👍 {q.likes}
                  </button>
                </li>
              );
            })}
          </ul>
          {overflowCount > 0 && (
            <p style={{ fontSize: '0.8rem', color: '#888', margin: '4px 0 0' }}>
              他{overflowCount}件
            </p>
          )}
        </section>
      )}
    </main>
  );
}
