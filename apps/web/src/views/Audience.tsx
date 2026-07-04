import { useState } from 'react';
import { useParams } from 'react-router-dom';
import type { ReactionKind, SeKind } from '@sparkplug/shared';
import { useEvent } from '../lib/useEvent';
import { usePoll } from '../lib/usePoll';

const SOUNDS: { kind: SeKind; emoji: string; label: string }[] = [
  { kind: 'don', emoji: '🥁', label: 'ドン' },
  { kind: 'ka', emoji: '🪵', label: 'カッ' },
  { kind: 'clap', emoji: '👏', label: '拍手' },
  { kind: 'drumroll', emoji: '🌀', label: 'ドラムロール' },
  { kind: 'fanfare', emoji: '🎺', label: 'ファンファーレ' },
];

const REACTIONS: { kind: ReactionKind; emoji: string; label: string }[] = [
  { kind: 'clap', emoji: '👏', label: '拍手' },
  { kind: 'fire', emoji: '🔥', label: 'アツい' },
  { kind: 'laugh', emoji: '😂', label: 'ウケる' },
  { kind: 'heart', emoji: '❤️', label: 'すき' },
  { kind: 'surprise', emoji: '😲', label: 'えっ' },
];

export default function Audience() {
  const { eventId } = useParams();
  const { socket, connected, participantCount } = useEvent(eventId, 'audience');
  const { poll, counts, total } = usePoll(socket);
  const [comment, setComment] = useState('');
  const [name, setName] = useState('');
  const [myVote, setMyVote] = useState<{ pollId: string; index: number } | null>(null);

  const vote = (index: number) => {
    if (!poll?.isOpen || !socket) return;
    socket.emit('vote', poll.id, index);
    setMyVote({ pollId: poll.id, index });
  };

  const sendComment = () => {
    const body = comment.trim();
    if (!body || !socket) return;
    socket.emit('comment', body, name.trim() || undefined);
    setComment('');
  };

  return (
    <main style={{ fontFamily: 'sans-serif', padding: '1.5rem', maxWidth: 480, margin: '0 auto' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h1 style={{ fontSize: '1.3rem' }}>SparkPlug ⚡ {eventId}</h1>
        <span style={{ fontSize: '0.85rem', color: '#666' }}>
          {connected ? `🟢 ${participantCount}人` : '🔴 接続中…'}
        </span>
      </header>

      {poll && (
        <section aria-label="アンケート" style={{ margin: '1.5rem 0', padding: '1rem', border: '2px solid #d0342c', borderRadius: 12 }}>
          <h2 style={{ fontSize: '1.05rem', marginTop: 0 }}>
            📊 {poll.question} {poll.isOpen ? '' : '（締切）'}
          </h2>
          {poll.options.map((opt, i) => {
            const isMine = myVote?.pollId === poll.id && myVote.index === i;
            const pct = total ? Math.round(((counts[i] ?? 0) / total) * 100) : 0;
            return (
              <button
                key={i}
                onClick={() => vote(i)}
                disabled={!poll.isOpen}
                style={{
                  display: 'block', width: '100%', textAlign: 'left', marginBottom: 6,
                  padding: '0.6rem 0.8rem', borderRadius: 8, cursor: poll.isOpen ? 'pointer' : 'default',
                  border: isMine ? '2px solid #d0342c' : '1px solid #ccc',
                  background: `linear-gradient(90deg, #f2f7c4 ${pct}%, #fff ${pct}%)`,
                }}
              >
                {isMine ? '✅ ' : ''}{opt}
                <span style={{ float: 'right', color: '#888', fontSize: '0.85rem' }}>{pct}%</span>
              </button>
            );
          })}
          <p style={{ fontSize: '0.8rem', color: '#888', margin: '4px 0 0' }}>
            {total}票{poll.isOpen ? '・タップで投票（変更可）' : ''}
          </p>
        </section>
      )}

      <section aria-label="リアクション" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '1.5rem 0' }}>
        {REACTIONS.map(({ kind, emoji, label }) => (
          <button
            key={kind}
            onClick={() => socket?.emit('reaction', kind)}
            disabled={!connected}
            style={{
              fontSize: '1.8rem', padding: '0.6rem 1rem', borderRadius: 12,
              border: '2px solid #cddc29', background: '#fff', cursor: 'pointer',
            }}
            aria-label={label}
          >
            {emoji}
          </button>
        ))}
      </section>

      <section aria-label="効果音" style={{ margin: '0 0 1.5rem' }}>
        <p style={{ fontSize: '0.8rem', color: '#888', margin: '0 0 6px' }}>会場に音を鳴らす 🔊</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {SOUNDS.map(({ kind, emoji, label }) => (
            <button
              key={kind}
              onClick={() => socket?.emit('se', kind)}
              disabled={!connected}
              style={{
                fontSize: '1rem', padding: '0.5rem 0.8rem', borderRadius: 12,
                border: '2px solid #d0342c', background: '#fff', cursor: 'pointer',
              }}
            >
              {emoji} {label}
            </button>
          ))}
        </div>
      </section>

      <section aria-label="コメント">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="表示名（空なら匿名）"
          maxLength={20}
          style={{ width: '100%', padding: '0.5rem', marginBottom: 8, boxSizing: 'border-box' }}
        />
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && sendComment()}
            placeholder="コメントを流す…"
            maxLength={200}
            style={{ flex: 1, padding: '0.6rem' }}
          />
          <button
            onClick={sendComment}
            disabled={!connected || !comment.trim()}
            style={{
              padding: '0.6rem 1.2rem', borderRadius: 8, border: 'none',
              background: '#d0342c', color: '#fff', fontWeight: 600, cursor: 'pointer',
            }}
          >
            送信
          </button>
        </div>
      </section>
    </main>
  );
}
