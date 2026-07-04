import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { ChatComment, Reaction, ReactionKind, Se, SeKind } from '@sparkplug/shared';
import { useEvent } from '../lib/useEvent';
import { sePlayer } from '../lib/sound';

const EMOJI: Record<ReactionKind, string> = {
  clap: '👏', fire: '🔥', laugh: '😂', heart: '❤️', surprise: '😲',
};

const SE_LABEL: Record<SeKind, string> = {
  don: 'ドン！', ka: 'カッ', clap: '👏👏👏', drumroll: 'ドロロロロ…', fanfare: '🎺 パンパカパーン！',
};

type FlyingComment = ChatComment & { top: number };
type FloatingReaction = Reaction & { uid: string; left: number };
type SePop = { uid: string; label: string; left: number; top: number };

export default function Screen() {
  const { eventId } = useParams();
  const { socket, connected, participantCount } = useEvent(eventId, 'screen');
  const [comments, setComments] = useState<FlyingComment[]>([]);
  const [reactions, setReactions] = useState<FloatingReaction[]>([]);
  const [sePops, setSePops] = useState<SePop[]>([]);
  const [soundOn, setSoundOn] = useState(false);

  useEffect(() => {
    if (!socket) return;
    const onComment = (c: ChatComment) => {
      setComments((prev) => [...prev, { ...c, top: 5 + Math.random() * 60 }]);
      setTimeout(() => setComments((prev) => prev.filter((x) => x.id !== c.id)), 12000);
    };
    const onReaction = (r: Reaction) => {
      const uid = crypto.randomUUID();
      setReactions((prev) => [...prev, { ...r, uid, left: 5 + Math.random() * 90 }]);
      setTimeout(() => setReactions((prev) => prev.filter((x) => x.uid !== uid)), 3000);
    };
    const onSe = (se: Se) => {
      sePlayer.play(se.kind);
      const uid = crypto.randomUUID();
      setSePops((prev) => [...prev, {
        uid, label: SE_LABEL[se.kind],
        left: 20 + Math.random() * 50, top: 25 + Math.random() * 40,
      }]);
      setTimeout(() => setSePops((prev) => prev.filter((x) => x.uid !== uid)), 1500);
    };
    socket.on('comment', onComment);
    socket.on('reaction', onReaction);
    socket.on('se', onSe);
    return () => {
      socket.off('comment', onComment);
      socket.off('reaction', onReaction);
      socket.off('se', onSe);
    };
  }, [socket]);

  return (
    <main style={{ position: 'relative', overflow: 'hidden', background: '#111', color: '#fff', minHeight: '100vh', fontFamily: 'sans-serif' }}>
      <style>{`
        @keyframes flyLeft { from { transform: translateX(100vw); } to { transform: translateX(-100%); } }
        @keyframes floatUp { 0% { transform: translateY(0); opacity: 1; } 100% { transform: translateY(-40vh); opacity: 0; } }
        @keyframes popIn { 0% { transform: scale(0.3); opacity: 0; } 15% { transform: scale(1.15); opacity: 1; } 30% { transform: scale(1); } 80% { opacity: 1; } 100% { opacity: 0; } }
      `}</style>

      <div style={{ position: 'absolute', top: 16, left: 24, fontSize: '1.1rem', color: '#cddc29' }}>
        SparkPlug ⚡ {eventId} {connected ? `｜ ${participantCount}人が参加中` : '｜ 接続中…'}
      </div>

      {comments.map((c) => (
        <div
          key={c.id}
          style={{
            position: 'absolute', top: `${c.top}%`, left: 0, whiteSpace: 'nowrap',
            fontSize: '2.2rem', fontWeight: 700, textShadow: '0 0 6px #000',
            animation: 'flyLeft 12s linear forwards', willChange: 'transform',
          }}
        >
          {c.body}
          {c.displayName && <span style={{ fontSize: '1rem', color: '#cddc29', marginLeft: 8 }}>@{c.displayName}</span>}
        </div>
      ))}

      {reactions.map((r) => (
        <div
          key={r.uid}
          style={{
            position: 'absolute', bottom: '8%', left: `${r.left}%`, fontSize: '3rem',
            animation: 'floatUp 3s ease-out forwards', willChange: 'transform, opacity',
          }}
        >
          {EMOJI[r.kind]}
        </div>
      ))}

      {sePops.map((p) => (
        <div
          key={p.uid}
          style={{
            position: 'absolute', left: `${p.left}%`, top: `${p.top}%`,
            fontSize: '3.5rem', fontWeight: 900, color: '#f5c400', textShadow: '0 0 10px #000',
            animation: 'popIn 1.5s ease-out forwards', willChange: 'transform, opacity',
          }}
        >
          {p.label}
        </div>
      ))}

      {!soundOn && (
        <button
          onClick={() => { sePlayer.enable(); setSoundOn(true); }}
          style={{
            position: 'absolute', bottom: 16, left: 24, padding: '0.6rem 1.2rem',
            borderRadius: 8, border: '2px solid #cddc29', background: 'transparent',
            color: '#cddc29', fontSize: '1rem', cursor: 'pointer',
          }}
        >
          🔊 音を有効にする
        </button>
      )}

      <div style={{ position: 'absolute', bottom: 16, right: 24, fontSize: '0.9rem', color: '#555' }}>
        スマホで参加 → /e/{eventId}
      </div>
    </main>
  );
}
