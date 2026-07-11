import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { ChatComment, Question, Reaction, ReactionKind, Se, SeKind } from '@sparkplug/shared';
import { useEvent } from '../lib/useEvent';
import { useEventSettings } from '../lib/useEventSettings';
import { usePoll } from '../lib/usePoll';
import { useQuestions } from '../lib/useQuestions';
import { BRAND, pillBadgeStyle } from '../lib/theme';

const EMOJI: Record<ReactionKind, string> = {
  like: '👍', laugh: '😆', heart: '❤️', surprise: '😲',
};

const SE_LABEL: Record<SeKind, string> = {
  don: '🥁シャンシャン！', ka: 'カッ', clap: '👏👏👏',
};

type FlyingComment = ChatComment & { top: number; left?: number };
type FlyingQuestion = Question & { top: number };
type FloatingReaction = Reaction & { uid: string; left: number };
type SePop = { uid: string; label: string; left: number; top: number };

function nextLaneTop(laneRef: { current: number }, laneCount: number, minPct: number, maxPct: number): number {
  const lane = laneRef.current % laneCount;
  laneRef.current += 1;
  return laneCount > 1 ? minPct + ((maxPct - minPct) * lane) / (laneCount - 1) : minPct;
}

function isEnabled(params: URLSearchParams, name: string, defaultValue = true): boolean {
  const value = params.get(name);
  if (value == null) return defaultValue;
  return !['0', 'false', 'off', 'no'].includes(value.toLowerCase());
}

function useTransparentDocumentBackground(): void {
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const root = document.getElementById('root');
    const previous = {
      htmlBackground: html.style.background,
      htmlHeight: html.style.height,
      bodyBackground: body.style.background,
      bodyHeight: body.style.height,
      bodyMargin: body.style.margin,
      bodyOverflow: body.style.overflow,
      rootBackground: root?.style.background,
      rootHeight: root?.style.height,
    };

    html.style.background = 'transparent';
    html.style.height = '100%';
    body.style.background = 'transparent';
    body.style.height = '100%';
    body.style.margin = '0';
    body.style.overflow = 'hidden';
    if (root) {
      root.style.background = 'transparent';
      root.style.height = '100%';
    }

    return () => {
      html.style.background = previous.htmlBackground;
      html.style.height = previous.htmlHeight;
      body.style.background = previous.bodyBackground;
      body.style.height = previous.bodyHeight;
      body.style.margin = previous.bodyMargin;
      body.style.overflow = previous.bodyOverflow;
      if (root) {
        root.style.background = previous.rootBackground ?? '';
        root.style.height = previous.rootHeight ?? '';
      }
    };
  }, []);
}

export default function Overlay() {
  const { eventId } = useParams();
  const { socket, connected, participantCount } = useEvent(eventId, 'screen');
  const { poll, counts, total } = usePoll(socket);
  const { commentFlow } = useEventSettings(socket);
  const allQuestions = useQuestions(socket);
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const layers = useMemo(() => ({
    reactions: isEnabled(params, 'reactions'),
    comments: isEnabled(params, 'comments'),
    questions: isEnabled(params, 'questions'),
    se: isEnabled(params, 'se'),
    poll: isEnabled(params, 'poll'),
    debug: isEnabled(params, 'debug', false),
  }), [params]);

  const [comments, setComments] = useState<FlyingComment[]>([]);
  const [asciiComments, setAsciiComments] = useState<FlyingComment[]>([]);
  const [questions, setQuestions] = useState<FlyingQuestion[]>([]);
  const [reactions, setReactions] = useState<FloatingReaction[]>([]);
  const [sePops, setSePops] = useState<SePop[]>([]);
  const [pollVisible, setPollVisible] = useState(false);
  const commentLaneRef = useRef(0);
  const commentColRef = useRef(0);
  const asciiLaneRef = useRef(0);
  const questionLaneRef = useRef(0);

  useTransparentDocumentBackground();

  const pinnedQuestion = layers.questions
    ? allQuestions
        .filter((q) => q.status === 'now')
        .sort((a, b) => b.at - a.at)[0]
    : undefined;

  useEffect(() => {
    if (!poll || !layers.poll) return;
    setPollVisible(true);
    if (poll.status !== 'open') {
      const timer = setTimeout(() => setPollVisible(false), 8000);
      return () => clearTimeout(timer);
    }
  }, [layers.poll, poll]);

  useEffect(() => {
    if (!socket) return;
    const onComment = (c: ChatComment) => {
      if (!layers.comments) return;
      if (c.isAsciiArt) {
        setAsciiComments((prev) => [...prev, { ...c, top: nextLaneTop(asciiLaneRef, 6, 5, 45) }]);
        setTimeout(() => setAsciiComments((prev) => prev.filter((x) => x.id !== c.id)), 12000);
        return;
      }
      setComments((prev) => [...prev, {
        ...c,
        top: nextLaneTop(commentLaneRef, 10, 5, 65),
        left: nextLaneTop(commentColRef, 8, 4, 74),
      }]);
      setTimeout(() => setComments((prev) => prev.filter((x) => x.id !== c.id)), 12000);
    };
    const onQuestion = (q: Question) => {
      if (!layers.questions) return;
      setQuestions((prev) => [...prev, { ...q, top: nextLaneTop(questionLaneRef, 8, 5, 65) }]);
      setTimeout(() => setQuestions((prev) => prev.filter((x) => x.id !== q.id)), 18000);
    };
    const onReaction = (r: Reaction) => {
      if (!layers.reactions) return;
      const uid = crypto.randomUUID();
      setReactions((prev) => [...prev, { ...r, uid, left: 5 + Math.random() * 90 }]);
      setTimeout(() => setReactions((prev) => prev.filter((x) => x.uid !== uid)), 3000);
    };
    const onSe = (se: Se) => {
      if (!layers.se) return;
      const uid = crypto.randomUUID();
      setSePops((prev) => [...prev, {
        uid, label: SE_LABEL[se.kind],
        left: 20 + Math.random() * 50, top: 25 + Math.random() * 40,
      }]);
      setTimeout(() => setSePops((prev) => prev.filter((x) => x.uid !== uid)), 1500);
    };
    socket.on('comment', onComment);
    socket.on('question', onQuestion);
    socket.on('reaction', onReaction);
    socket.on('se', onSe);
    return () => {
      socket.off('comment', onComment);
      socket.off('question', onQuestion);
      socket.off('reaction', onReaction);
      socket.off('se', onSe);
    };
  }, [layers, socket]);

  return (
    <main
      style={{
        position: 'fixed', inset: 0, overflow: 'hidden', background: 'transparent',
        color: '#fff', fontFamily: 'sans-serif', pointerEvents: 'none',
      }}
    >
      <style>{`
        @keyframes flyLeft { from { transform: translateX(100vw); } to { transform: translateX(-100%); } }
        @keyframes flyUp { from { transform: translateY(100vh); } to { transform: translateY(-100%); } }
        @keyframes floatUp { 0% { transform: translateY(0); opacity: 1; } 100% { transform: translateY(-40vh); opacity: 0; } }
        @keyframes popIn { 0% { transform: scale(0.3); opacity: 0; } 15% { transform: scale(1.15); opacity: 1; } 30% { transform: scale(1); } 80% { opacity: 1; } 100% { opacity: 0; } }
      `}</style>

      {layers.debug && (
        <div style={{ position: 'absolute', left: 16, bottom: 16, display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ color: BRAND.lime, fontWeight: 700 }}>SparkPlug OBS</span>
          <span style={pillBadgeStyle(connected)}>
            {connected ? `${participantCount}人` : '接続中...'}
          </span>
        </div>
      )}

      {comments.map((c) => (
        <div
          key={c.id}
          style={
            commentFlow === 'vertical'
              ? {
                  position: 'absolute', top: 0, left: `${c.left ?? 50}%`, maxWidth: '22vw',
                  whiteSpace: 'normal', wordBreak: 'break-word', textAlign: 'center',
                  fontSize: '2rem', fontWeight: 700,
                  textShadow: '-1.5px -1.5px 0 #000, 1.5px -1.5px 0 #000, -1.5px 1.5px 0 #000, 1.5px 1.5px 0 #000, 0 0 6px #000',
                  animation: 'flyUp 12s linear forwards', willChange: 'transform',
                }
              : {
                  position: 'absolute', top: `${c.top}%`, left: 0, whiteSpace: 'nowrap',
                  fontSize: '2.2rem', fontWeight: 700,
                  textShadow: '-1.5px -1.5px 0 #000, 1.5px -1.5px 0 #000, -1.5px 1.5px 0 #000, 1.5px 1.5px 0 #000, 0 0 6px #000',
                  animation: 'flyLeft 12s linear forwards', willChange: 'transform',
                }
          }
        >
          {c.body}
          {c.displayName && <span style={{ fontSize: '1rem', color: BRAND.lime, marginLeft: 8 }}>@{c.displayName}</span>}
        </div>
      ))}

      {asciiComments.map((c) => (
        <div
          key={c.id}
          style={{
            position: 'absolute', top: `${c.top}%`, left: 0, whiteSpace: 'pre',
            fontFamily: 'monospace', fontSize: '1.1rem', lineHeight: 1.15, fontWeight: 700,
            color: '#fff', background: 'rgba(0,0,0,0.75)', padding: '0.5rem 1rem', borderRadius: 8,
            animation: 'flyLeft 12s linear forwards', willChange: 'transform',
          }}
        >
          {c.body}
          {c.displayName && (
            <div style={{ fontSize: '0.75rem', color: BRAND.lime, marginTop: 4 }}>@{c.displayName}</div>
          )}
        </div>
      ))}

      {questions.map((q) => (
        <div
          key={q.id}
          style={{
            position: 'absolute', top: `${q.top}%`, left: 0, whiteSpace: 'nowrap',
            fontSize: '2.2rem', fontWeight: 700, textShadow: '0 0 6px #000',
            animation: 'flyLeft 18s linear forwards', willChange: 'transform',
            border: `3px solid ${BRAND.yellow}`, background: 'rgba(0,0,0,0.7)',
            borderRadius: 12, padding: '0.4rem 1rem',
          }}
        >
          <span style={{ marginRight: 8 }}>❓</span>
          {q.body}
          <span style={{ fontSize: '1rem', color: BRAND.yellow, marginLeft: 8 }}>@{q.displayName}</span>
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
            fontSize: '3.5rem', fontWeight: 900, color: BRAND.yellow, textShadow: '0 0 10px #000',
            animation: 'popIn 1.5s ease-out forwards', willChange: 'transform, opacity',
          }}
        >
          {p.label}
        </div>
      ))}

      {layers.poll && poll && pollVisible && (
        <div
          style={{
            position: 'absolute', right: 24, top: 64, width: 'min(420px, 42vw)',
            background: 'rgba(0,0,0,0.75)', border: `2px solid ${BRAND.lime}`, borderRadius: 12,
            padding: '1rem 1.2rem',
          }}
        >
          <div style={{ fontSize: '1.3rem', fontWeight: 700, marginBottom: 4 }}>
            📊 {poll.question}
          </div>
          <div style={{ fontSize: '0.85rem', color: BRAND.lime, marginBottom: 10 }}>
            {poll.status === 'open' ? `投票受付中 | ${total}票` : `締切 | ${total}票`}
          </div>
          {poll.options.map((opt, i) => {
            const pct = total ? Math.round(((counts[i] ?? 0) / total) * 100) : 0;
            return (
              <div key={i} style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1rem' }}>
                  <span>{opt}</span>
                  <span>{pct}%</span>
                </div>
                <div style={{ background: '#333', borderRadius: 5, height: 12 }}>
                  <div style={{ width: `${pct}%`, background: BRAND.lime, height: '100%', borderRadius: 5, transition: 'width 0.4s' }} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {pinnedQuestion && (
        <div
          style={{
            position: 'absolute', bottom: '6%', left: '50%', transform: 'translateX(-50%)',
            width: 'min(720px, 80vw)', textAlign: 'center',
            background: 'rgba(0,0,0,0.82)', border: `3px solid ${BRAND.yellow}`, borderRadius: 16,
            padding: '1rem 1.4rem',
          }}
        >
          <div style={{ fontSize: '1rem', color: BRAND.yellow, fontWeight: 700, marginBottom: 6 }}>
            🎤 いま答えている質問
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 700, lineHeight: 1.3 }}>
            {pinnedQuestion.body}
          </div>
          <div style={{ fontSize: '1rem', color: BRAND.lime, marginTop: 6 }}>
            @{pinnedQuestion.displayName}
          </div>
        </div>
      )}
    </main>
  );
}
