import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { Question } from '@sparkplug/shared';
import { useEvent } from '../lib/useEvent';

// ── エモメーターのしきい値・パラメータ（ここに集約） ──────────────
/** 棒グラフの対象窓（秒）と 1 バケットの幅（秒） → 60 本 */
const METER_WINDOW_SEC = 60;
const BUCKET_SEC = 1;
const BUCKET_COUNT = METER_WINDOW_SEC / BUCKET_SEC; // 60

/** 面グラフの縦スケール下限（pt/秒）。これ未満の山は上端（赤）に届かない */
const METER_SCALE_MIN = 8;

/** 熱量ポイントの重み。コメントは書く手間が大きい分、高配点 */
const WEIGHTS = { reaction: 1, se: 2, comment: 3, question: 3 } as const;

/** 「熱量」判定に使う直近窓（秒） */
const HEAT_WINDOW_SEC = 10;
/** 熱量の段階しきい値（直近 HEAT_WINDOW_SEC 秒の合計ポイント）。上から順に判定 */
const HEAT_LEVELS: { min: number; emoji: string; label: string }[] = [
  { min: 24, emoji: '🌋', label: '大噴火' },
  { min: 8, emoji: '🔥', label: 'アツい' },
  { min: 1, emoji: '🙂', label: 'ぼちぼち' },
  { min: 0, emoji: '😴', label: '静か' },
];

/** バイブレーション: 直近 VIBRATE_WINDOW_SEC 秒で VIBRATE_THRESHOLD pt 超えたら振動 */
const VIBRATE_WINDOW_SEC = 5;
const VIBRATE_THRESHOLD = 10;
const VIBRATE_MS = 200;
/** 連続発火を防ぐクールダウン（ms） */
const VIBRATE_COOLDOWN_MS = 10_000;

/** 質問の保持上限 */
const QUESTION_LIMIT = 50;

/** epoch ms を HH:MM に整形（表示用・ローカルTZ） */
function hhmm(at: number): string {
  const d = new Date(at);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 熱量ポイントの1イベント（受信時刻と重み） */
interface HeatEvent {
  at: number;
  w: number;
}

/** 直近 sec 秒のポイント合計 */
function pointsWithin(events: HeatEvent[], now: number, sec: number): number {
  const from = now - sec * 1000;
  let sum = 0;
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i].at >= from) sum += events[i].w;
    else break; // 昇順前提。古いものに達したら打ち切り
  }
  return sum;
}

export default function Presenter() {
  const { eventId } = useParams();
  const { socket, connected, participantCount } = useEvent(eventId, 'presenter');

  // 熱量イベント（リアクション/SE/コメント/質問）を重み付きで貯める（描画は別途 1 秒ごとに再計算）
  const heatEventsRef = useRef<HeatEvent[]>([]);
  const [commentCount, setCommentCount] = useState(0);
  const [questions, setQuestions] = useState<Question[]>([]);
  const lastVibrateRef = useRef(0);
  // 1 秒ごとに再描画するための tick
  const [, setTick] = useState(0);

  // ── socket 購読 ──────────────────────────────────────────────
  useEffect(() => {
    if (!socket) return;
    const addHeat = (w: number) => heatEventsRef.current.push({ at: Date.now(), w });
    const onReaction = () => addHeat(WEIGHTS.reaction);
    const onSe = () => addHeat(WEIGHTS.se);
    const onComment = () => {
      setCommentCount((c) => c + 1);
      addHeat(WEIGHTS.comment);
    };
    const onQuestion = (question: Question) => {
      setQuestions((prev) => [question, ...prev].slice(0, QUESTION_LIMIT));
      addHeat(WEIGHTS.question);
    };
    socket.on('reaction', onReaction);
    socket.on('se', onSe);
    socket.on('comment', onComment);
    socket.on('question', onQuestion);
    return () => {
      socket.off('reaction', onReaction);
      socket.off('se', onSe);
      socket.off('comment', onComment);
      socket.off('question', onQuestion);
    };
  }, [socket]);

  // ── 1 秒ごとに再描画＋古いリアクションを間引く＋バイブ判定 ──────
  useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now();
      // 窓の外に出た古いイベントを捨てる（配列が無限に伸びないように）
      const cutoff = now - METER_WINDOW_SEC * 1000;
      const events = heatEventsRef.current;
      let drop = 0;
      while (drop < events.length && events[drop].at < cutoff) drop++;
      if (drop > 0) events.splice(0, drop);

      // バイブレーション判定（クールダウン付き・非対応環境では何もしない）
      const recent = pointsWithin(events, now, VIBRATE_WINDOW_SEC);
      if (
        recent > VIBRATE_THRESHOLD &&
        now - lastVibrateRef.current >= VIBRATE_COOLDOWN_MS
      ) {
        navigator.vibrate?.(VIBRATE_MS);
        lastVibrateRef.current = now;
      }

      setTick((t) => t + 1); // 再描画トリガー
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // ── 描画用の集計（毎レンダー計算・軽いので問題なし） ───────────
  const now = Date.now();
  const events = heatEventsRef.current;

  // 1 秒バケット 60 本のポイント合計。index 0 が最古、末尾が現在
  const buckets = new Array<number>(BUCKET_COUNT).fill(0);
  for (const e of events) {
    const ageSec = (now - e.at) / 1000;
    if (ageSec < 0 || ageSec >= METER_WINDOW_SEC) continue;
    // 新しいものほど右へ
    const idx = BUCKET_COUNT - 1 - Math.floor(ageSec / BUCKET_SEC);
    if (idx >= 0 && idx < BUCKET_COUNT) buckets[idx] += e.w;
  }
  // 面グラフの縦スケール。静かなときに小さな山が真っ赤に見えないよう下限を設ける
  const scaleMax = Math.max(...buckets, METER_SCALE_MIN);
  // 面グラフのパス（viewBox: 0..BUCKET_COUNT × 0..100、下端が 100）
  const points = buckets.map((v, i) => `${i + 0.5},${100 - (v / scaleMax) * 100}`);
  const areaPath = `M0,100 L${points.join(' L')} L${BUCKET_COUNT},100 Z`;

  // 熱量段階（重み付きポイント）
  const heatCount = pointsWithin(events, now, HEAT_WINDOW_SEC);
  const heat = HEAT_LEVELS.find((l) => heatCount >= l.min) ?? HEAT_LEVELS[HEAT_LEVELS.length - 1];

  return (
    <main style={{ fontFamily: 'sans-serif', padding: '1.5rem', maxWidth: 480, margin: '0 auto' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h1 style={{ fontSize: '1.3rem' }}>🎤 発表者ビュー {eventId}</h1>
        <span style={{ fontSize: '0.85rem', color: '#666' }}>
          {connected ? `🟢 ${participantCount}人` : '🔴 接続中…'}
        </span>
      </header>

      {/* ── エモメーター ─────────────────────────────── */}
      <section aria-label="エモメーター" style={{ margin: '1.5rem 0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
          <h2 style={{ fontSize: '1.05rem', margin: 0 }}>エモメーター</h2>
          <span style={{ fontSize: '0.85rem', color: '#888' }}>💬 {commentCount}</span>
        </div>

        {/* 現在の熱量 */}
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '0.6rem 0.9rem', borderRadius: 12,
            border: '2px solid #cddc29', background: '#fbfde6', marginBottom: 12,
          }}
        >
          <span style={{ fontSize: '2.2rem', lineHeight: 1 }}>{heat.emoji}</span>
          <div>
            <div style={{ fontWeight: 600 }}>{heat.label}</div>
            <div style={{ fontSize: '0.8rem', color: '#888' }}>
              直近{HEAT_WINDOW_SEC}秒で {heatCount}pt（コメント{WEIGHTS.comment} / SE{WEIGHTS.se} / リアクション{WEIGHTS.reaction}）
            </div>
          </div>
        </div>

        {/* 面グラフ（右端が現在）。塗りはリアクション量の縦グラデーション: 静=黄緑 → 熱=赤 */}
        <svg
          width="100%"
          height={80}
          viewBox={`0 0 ${BUCKET_COUNT} 100`}
          preserveAspectRatio="none"
          style={{ display: 'block', borderBottom: '1px solid #eee' }}
          aria-label="リアクション量の波形"
        >
          <defs>
            <linearGradient id="emoGradient" x1="0" y1="1" x2="0" y2="0">
              <stop offset="0%" stopColor="#cddc29" />
              <stop offset="55%" stopColor="#f5c400" />
              <stop offset="100%" stopColor="#d0342c" />
            </linearGradient>
          </defs>
          <path d={areaPath} fill="url(#emoGradient)" />
        </svg>
        <p style={{ fontSize: '0.75rem', color: '#aaa', margin: '4px 0 0', textAlign: 'right' }}>
          直近{METER_WINDOW_SEC}秒（{BUCKET_SEC}秒ごと）→ 現在
        </p>
      </section>

      {/* ── 質問 ───────────────────────────── */}
      <section aria-label="質問">
        <h2 style={{ fontSize: '1.05rem', marginBottom: 8 }}>❓ 質問</h2>
        {questions.length === 0 ? (
          <p style={{ fontSize: '0.85rem', color: '#aaa', padding: '0.8rem 0' }}>
            参加者からの質問はここに届きます
          </p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {questions.map((q, i) => (
              <li
                key={q.id}
                style={{
                  padding: '0.6rem 0.8rem', marginBottom: 6, borderRadius: 8,
                  background: '#fafafa',
                  // 先頭（最新）は黄色ボーダーで新着を強調
                  border: i === 0 ? '2px solid #f5c400' : '1px solid #eee',
                }}
              >
                <span style={{ fontSize: '0.75rem', color: '#aaa', marginRight: 8 }}>
                  {hhmm(q.at)}
                </span>
                <span style={{ color: '#d0342c', fontWeight: 600, marginRight: 8 }}>
                  {q.displayName}
                </span>
                {q.body}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
