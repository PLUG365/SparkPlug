import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { ChatComment, Question, Reaction, ReactionKind, Se, SeKind } from '@sparkplug/shared';
import { useEvent } from '../lib/useEvent';
import { usePoll } from '../lib/usePoll';
import { useQuestions } from '../lib/useQuestions';
import { useEventSettings } from '../lib/useEventSettings';
import { sePlayer } from '../lib/sound';
import { AUDIENCE_BASE_URL } from '../lib/socket';
import { BRAND, pillBadgeStyle } from '../lib/theme';

const EMOJI: Record<ReactionKind, string> = {
  like: '👍', laugh: '😆', heart: '❤️', surprise: '😲',
};

const SE_LABEL: Record<SeKind, string> = {
  don: '🥁シャンシャン！', ka: 'カッ', clap: '👏👏👏',
};

type FlyingComment = ChatComment & { top: number };
type FlyingQuestion = Question & { top: number };
type FloatingReaction = Reaction & { uid: string; left: number };
type SePop = { uid: string; label: string; left: number; top: number };

export default function Screen() {
  const { eventId } = useParams();
  const { socket, connected, participantCount } = useEvent(eventId, 'screen');
  const [comments, setComments] = useState<FlyingComment[]>([]);
  const [questions, setQuestions] = useState<FlyingQuestion[]>([]);
  const [reactions, setReactions] = useState<FloatingReaction[]>([]);
  const [sePops, setSePops] = useState<SePop[]>([]);
  const [soundOn, setSoundOn] = useState(false);
  // 画面共有（getDisplayMedia）用の状態。videoRef は背景に敷く映像への参照
  const videoRef = useRef<HTMLVideoElement>(null);
  const [shareError, setShareError] = useState<string | null>(null);
  const [isSharing, setIsSharing] = useState(false);
  const { poll, counts, total } = usePoll(socket);
  const { qrVisible, soundEnabled } = useEventSettings(socket);
  // onSe は [socket] 依存の effect 内で購読するため、最新の soundEnabled を ref 経由で参照する
  // （依存に含めて毎回 re-subscribe すると他のリスナーまで貼り直しになるため）
  const soundEnabledRef = useRef(soundEnabled);
  soundEnabledRef.current = soundEnabled;
  const [pollVisible, setPollVisible] = useState(false);
  const allQuestions = useQuestions(socket);
  // status='now' の質問を画面下部中央にピン留め。複数あれば最新1件だけ
  const pinnedQuestion = allQuestions
    .filter((q) => q.status === 'now')
    .sort((a, b) => b.at - a.at)[0];

  useEffect(() => {
    if (!poll) return;
    setPollVisible(true);
    if (poll.status !== 'open') {
      const timer = setTimeout(() => setPollVisible(false), 8000);
      return () => clearTimeout(timer);
    }
  }, [poll]);

  useEffect(() => {
    if (!socket) return;
    const onComment = (c: ChatComment) => {
      setComments((prev) => [...prev, { ...c, top: 5 + Math.random() * 60 }]);
      setTimeout(() => setComments((prev) => prev.filter((x) => x.id !== c.id)), 12000);
    };
    const onQuestion = (q: Question) => {
      // 質問は通常コメントよりゆっくり流す（18秒）
      setQuestions((prev) => [...prev, { ...q, top: 5 + Math.random() * 60 }]);
      setTimeout(() => setQuestions((prev) => prev.filter((x) => x.id !== q.id)), 18000);
    };
    const onReaction = (r: Reaction) => {
      const uid = crypto.randomUUID();
      setReactions((prev) => [...prev, { ...r, uid, left: 5 + Math.random() * 90 }]);
      setTimeout(() => setReactions((prev) => prev.filter((x) => x.uid !== uid)), 3000);
    };
    const onSe = (se: Se) => {
      // 音だけをミュート制御する。ポップ演出は soundEnabled に関わらず従来通り表示する
      if (soundEnabledRef.current) sePlayer.play(se.kind);
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
  }, [socket]);

  // アンマウント時（別ルートへ遷移など）に共有中のトラックを止め、
  // ブラウザの「共有中」インジケータが残らないようにする
  useEffect(() => {
    return () => {
      const stream = videoRef.current?.srcObject as MediaStream | null;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // 画面共有を開始。getDisplayMedia はセキュアコンテキスト（localhost / https）でのみ存在する
  const startShare = async () => {
    setShareError(null);
    if (!navigator.mediaDevices?.getDisplayMedia) {
      setShareError('この機能は localhost または HTTPS でのみ使えます。会場PCで http://localhost:5173/... を開いてください。');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      if (videoRef.current) videoRef.current.srcObject = stream;
      // ブラウザ側の「共有を停止」操作を検知して自動的に元に戻す
      stream.getVideoTracks()[0].addEventListener('ended', () => {
        setIsSharing(false);
        if (videoRef.current) videoRef.current.srcObject = null;
      });
      setIsSharing(true);
    } catch (err) {
      // ユーザーがピッカーをキャンセルした場合(NotAllowedError等)は静かに無視、それ以外はメッセージ表示
      if (err instanceof DOMException && err.name === 'NotAllowedError') return;
      setShareError('画面共有を開始できませんでした。');
    }
  };

  const stopShare = () => {
    const stream = videoRef.current?.srcObject as MediaStream | null;
    stream?.getTracks().forEach((t) => t.stop());
    if (videoRef.current) videoRef.current.srcObject = null;
    setIsSharing(false);
  };

  return (
    <main style={{ position: 'relative', overflow: 'hidden', background: '#111', color: '#fff', minHeight: '100vh', fontFamily: 'sans-serif' }}>
      {/* 画面共有の映像を背景に敷く。stream が無ければ黒背景のまま＝従来の見た目 */}
      {/* main の最初の子なので、以降の絶対配置の演出は DOM順で自然にこの上へ重なる */}
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', background: '#111' }}
      />

      <style>{`
        @keyframes flyLeft { from { transform: translateX(100vw); } to { transform: translateX(-100%); } }
        @keyframes floatUp { 0% { transform: translateY(0); opacity: 1; } 100% { transform: translateY(-40vh); opacity: 0; } }
        @keyframes popIn { 0% { transform: scale(0.3); opacity: 0; } 15% { transform: scale(1.15); opacity: 1; } 30% { transform: scale(1); } 80% { opacity: 1; } 100% { opacity: 0; } }
      `}</style>

      <div style={{ position: 'absolute', top: 16, left: 24, fontSize: '1.1rem', color: '#cddc29', display: 'flex', alignItems: 'center', gap: 10 }}>
        <span>SparkPlug ⚡ {eventId}</span>
        {/* 参加者数を黄緑ピルで軽く強調（未接続時はグレーピル） */}
        <span style={pillBadgeStyle(connected)}>
          {connected ? `${participantCount}人が参加中` : '接続中…'}
        </span>
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

      {questions.map((q) => (
        <div
          key={q.id}
          style={{
            position: 'absolute', top: `${q.top}%`, left: 0, whiteSpace: 'nowrap',
            fontSize: '2.2rem', fontWeight: 700, textShadow: '0 0 6px #000',
            // 通常コメントよりゆっくり（18秒）＋枠付きボックスで質問だと明示
            animation: 'flyLeft 18s linear forwards', willChange: 'transform',
            border: '3px solid #f5c400', background: 'rgba(0,0,0,0.7)',
            borderRadius: 12, padding: '0.4rem 1rem',
          }}
        >
          <span style={{ marginRight: 8 }}>❓</span>
          {q.body}
          <span style={{ fontSize: '1rem', color: '#f5c400', marginLeft: 8 }}>@{q.displayName}</span>
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

      {poll && pollVisible && (
        <div
          style={{
            position: 'absolute', right: 24, top: 64, width: 'min(420px, 42vw)',
            background: 'rgba(0,0,0,0.75)', border: '2px solid #cddc29', borderRadius: 12,
            padding: '1rem 1.2rem',
          }}
        >
          <div style={{ fontSize: '1.3rem', fontWeight: 700, marginBottom: 4 }}>
            📊 {poll.question}
          </div>
          <div style={{ fontSize: '0.85rem', color: '#cddc29', marginBottom: 10 }}>
            {poll.status === 'open' ? `投票受付中 ｜ ${total}票` : `締切 ｜ ${total}票`}
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
                  <div style={{ width: `${pct}%`, background: '#cddc29', height: '100%', borderRadius: 5, transition: 'width 0.4s' }} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* status='now' の質問を画面下部中央にピン留め表示 */}
      {pinnedQuestion && (
        <div
          style={{
            position: 'absolute', bottom: '6%', left: '50%', transform: 'translateX(-50%)',
            width: 'min(720px, 80vw)', textAlign: 'center',
            background: 'rgba(0,0,0,0.82)', border: '3px solid #f5c400', borderRadius: 16,
            padding: '1rem 1.4rem',
          }}
        >
          <div style={{ fontSize: '1rem', color: '#f5c400', fontWeight: 700, marginBottom: 6 }}>
            🎤 いま答えている質問
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 700, lineHeight: 1.3 }}>
            {pinnedQuestion.body}
          </div>
          <div style={{ fontSize: '1rem', color: '#cddc29', marginTop: 6 }}>
            @{pinnedQuestion.displayName}
          </div>
        </div>
      )}

      {/* 左下コーナー：音の有効化ボタンと画面共有コントロールを縦に並べる */}
      <div style={{ position: 'absolute', bottom: 16, left: 24, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 8 }}>
        {!soundOn && (
          <button
            onClick={() => { sePlayer.enable(); setSoundOn(true); }}
            style={{
              padding: '0.6rem 1.2rem',
              borderRadius: 999, border: `2px solid ${BRAND.lime}`, background: 'transparent',
              color: BRAND.lime, fontSize: '1rem', cursor: 'pointer',
            }}
          >
            🔊 音を有効にする
          </button>
        )}
        {isSharing ? (
          <button
            onClick={stopShare}
            style={{
              padding: '0.6rem 1.2rem',
              borderRadius: 999, border: `2px solid ${BRAND.lime}`, background: 'transparent',
              color: BRAND.lime, fontSize: '1rem', cursor: 'pointer',
            }}
          >
            ⏹ 共有を終了
          </button>
        ) : (
          <button
            onClick={startShare}
            style={{
              padding: '0.6rem 1.2rem',
              borderRadius: 999, border: `2px solid ${BRAND.lime}`, background: 'transparent',
              color: BRAND.lime, fontSize: '1rem', cursor: 'pointer',
            }}
          >
            🖥️ 画面を共有
          </button>
        )}
        {shareError && (
          <div style={{ color: '#ff8080', fontSize: '0.85rem', maxWidth: 360 }}>
            {shareError}
          </div>
        )}
      </div>

      {/* 右下：スマホ参加用QRコード（host からON/OFF可能）。
          背景に画面共有映像が乗っても読み取れるよう、必ず不透明な白背景の箱に収める */}
      {qrVisible && (
        <div style={{
          position: 'absolute', bottom: 16, right: 24,
          background: '#fff', borderRadius: 14, padding: '8px 8px 6px',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
        }}>
          <img
            src={`https://api.qrserver.com/v1/create-qr-code/?size=110x110&data=${encodeURIComponent(`${AUDIENCE_BASE_URL}/e/${eventId}`)}`}
            alt="スマホで参加するQRコード"
            width={110}
            height={110}
          />
          <span style={{ fontSize: '0.7rem', color: '#1a1a1a', fontWeight: 600 }}>📱 スマホで参加</span>
        </div>
      )}
    </main>
  );
}
