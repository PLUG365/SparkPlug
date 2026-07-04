import { useState } from 'react';
import { useParams } from 'react-router-dom';
import type { ReactionKind } from '@sparkplug/shared';
import { useEvent } from '../lib/useEvent';

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
  const [comment, setComment] = useState('');
  const [name, setName] = useState('');

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
