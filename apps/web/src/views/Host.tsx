import { useState } from 'react';
import { useParams } from 'react-router-dom';
import type { QuestionStatus } from '@sparkplug/shared';
import { useEvent } from '../lib/useEvent';
import { usePoll } from '../lib/usePoll';
import { useQuestions } from '../lib/useQuestions';
import QuestionTriage from '../components/QuestionTriage';
import { SERVER_URL } from '../lib/socket';

const MAX_OPTIONS = 6;

export default function Host() {
  const { eventId } = useParams();
  const { socket, connected, participantCount } = useEvent(eventId, 'host');
  const { poll, counts, total } = usePoll(socket);
  const questions = useQuestions(socket);
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState<string[]>(['', '']);

  const triage = (questionId: string, status: QuestionStatus) => {
    socket?.emit('triageQuestion', questionId, status);
  };

  const filled = options.map((o) => o.trim()).filter(Boolean);
  const canCreate = connected && question.trim() && filled.length >= 2;

  const createPoll = () => {
    if (!canCreate || !socket) return;
    socket.emit('createPoll', question.trim(), filled);
    setQuestion('');
    setOptions(['', '']);
  };

  return (
    <main style={{ fontFamily: 'sans-serif', padding: '2rem', maxWidth: 640, margin: '0 auto' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h1 style={{ fontSize: '1.4rem' }}>🎛️ ホスト｜{eventId}</h1>
        <div style={{ display: 'flex', gap: 12, alignItems: 'baseline' }}>
          <span style={{ fontSize: '0.9rem', color: '#666' }}>
            {connected ? `🟢 ${participantCount}人が参加中` : '🔴 接続中…'}
          </span>
          {/* イベントログを CSV でダウンロード（Excel 対応・BOM 付き） */}
          <a
            href={`${SERVER_URL}/events/${encodeURIComponent(eventId ?? '')}/export.csv`}
            download
            style={{
              fontSize: '0.85rem', fontWeight: 600, textDecoration: 'none',
              padding: '0.25rem 0.7rem', borderRadius: 8,
              border: '2px solid #cddc29', color: '#d0342c', whiteSpace: 'nowrap',
            }}
          >
            📥 ログCSV
          </a>
        </div>
      </header>

      <section aria-label="アンケート作成" style={{ margin: '1.5rem 0', padding: '1rem', border: '2px solid #cddc29', borderRadius: 12 }}>
        <h2 style={{ fontSize: '1.1rem', marginTop: 0 }}>📊 アンケートを作る</h2>
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="設問（例: 今日の内容、試したことある？）"
          maxLength={100}
          style={{ width: '100%', padding: '0.6rem', marginBottom: 8, boxSizing: 'border-box' }}
        />
        {options.map((opt, i) => (
          <input
            key={i}
            value={opt}
            onChange={(e) => setOptions(options.map((o, j) => (j === i ? e.target.value : o)))}
            placeholder={`選択肢 ${i + 1}`}
            maxLength={50}
            style={{ width: '100%', padding: '0.5rem', marginBottom: 6, boxSizing: 'border-box' }}
          />
        ))}
        <div style={{ display: 'flex', gap: 8 }}>
          {options.length < MAX_OPTIONS && (
            <button onClick={() => setOptions([...options, ''])} style={{ padding: '0.4rem 0.8rem' }}>
              ＋選択肢を追加
            </button>
          )}
          <button
            onClick={createPoll}
            disabled={!canCreate}
            style={{
              padding: '0.4rem 1.2rem', borderRadius: 8, border: 'none', fontWeight: 600,
              background: canCreate ? '#d0342c' : '#ccc', color: '#fff',
              cursor: canCreate ? 'pointer' : 'default',
            }}
          >
            開始
          </button>
        </div>
        {poll?.isOpen && (
          <p style={{ fontSize: '0.8rem', color: '#888' }}>※開始すると実施中のアンケートは自動で締め切られます</p>
        )}
      </section>

      {poll && (
        <section aria-label="集計" style={{ padding: '1rem', border: '1px solid #ddd', borderRadius: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <h2 style={{ fontSize: '1.1rem', margin: 0 }}>
              {poll.isOpen ? '🔴 実施中' : '⏹ 締切'}: {poll.question}
            </h2>
            {poll.isOpen && (
              <button onClick={() => socket?.emit('closePoll')} style={{ padding: '0.3rem 0.8rem' }}>
                締め切る
              </button>
            )}
          </div>
          <p style={{ color: '#666', fontSize: '0.9rem' }}>{total}票</p>
          {poll.options.map((opt, i) => {
            const pct = total ? Math.round(((counts[i] ?? 0) / total) * 100) : 0;
            return (
              <div key={i} style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.95rem' }}>
                  <span>{opt}</span>
                  <span>{counts[i] ?? 0}票 ({pct}%)</span>
                </div>
                <div style={{ background: '#eee', borderRadius: 6, height: 14 }}>
                  <div style={{ width: `${pct}%`, background: '#cddc29', height: '100%', borderRadius: 6, transition: 'width 0.3s' }} />
                </div>
              </div>
            );
          })}
        </section>
      )}

      {/* ── 質問トリアージ ───────────────────────────── */}
      <section aria-label="質問" style={{ marginTop: '1.5rem' }}>
        <h2 style={{ fontSize: '1.1rem', marginBottom: 8 }}>❓ 質問</h2>
        <QuestionTriage questions={questions} onTriage={triage} />
      </section>
    </main>
  );
}
