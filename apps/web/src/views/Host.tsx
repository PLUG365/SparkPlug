import { useState } from 'react';
import { useParams } from 'react-router-dom';
import type { QuestionStatus } from '@sparkplug/shared';
import { useEvent } from '../lib/useEvent';
import { usePollList } from '../lib/usePollList';
import { useQuestions } from '../lib/useQuestions';
import QuestionTriage from '../components/QuestionTriage';
import { SERVER_URL } from '../lib/socket';
import { BRAND, headerBarStyle, pillBadgeStyle, pillButtonStyle } from '../lib/theme';

const MAX_OPTIONS = 6;

export default function Host() {
  const { eventId } = useParams();
  const { socket, connected, participantCount } = useEvent(eventId, 'host');
  const { polls, resultsByPollId } = usePollList(socket);
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

  // 3グループに仕分け。実施中は最優先、下書きは作成順、締切済みは新しい順に
  const openPoll = polls.find((p) => p.status === 'open');
  const draftPolls = polls.filter((p) => p.status === 'draft');
  const closedPolls = polls.filter((p) => p.status === 'closed').sort((a, b) => b.at - a.at);

  return (
    <main style={{ fontFamily: 'sans-serif', padding: '2rem', maxWidth: 640, margin: '0 auto' }}>
      <header style={headerBarStyle}>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 700, margin: 0 }}>🎛️ ホスト｜{eventId}</h1>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <span style={pillBadgeStyle(connected)}>
            {connected ? `🟢 ${participantCount}人が参加中` : '🔴 接続中…'}
          </span>
          {/* イベントログを CSV でダウンロード（Excel 対応・BOM 付き） */}
          <a
            href={`${SERVER_URL}/events/${encodeURIComponent(eventId ?? '')}/export.csv`}
            download
            style={{
              fontSize: '0.85rem', fontWeight: 700, textDecoration: 'none',
              padding: '0.35rem 0.9rem', borderRadius: 999,
              border: `2px solid ${BRAND.lime}`, color: BRAND.lime, whiteSpace: 'nowrap',
            }}
          >
            📥 ログCSV
          </a>
        </div>
      </header>

      <section aria-label="アンケート作成" style={{ margin: '1.5rem 0', padding: '1rem', border: `3px solid ${BRAND.lime}`, borderRadius: 18 }}>
        <h2 style={{ fontSize: '1.1rem', marginTop: 0 }}>📊 アンケートを作る</h2>
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="設問（例: 今日の内容、試したことある？）"
          maxLength={100}
          // iOS Safari はフォーカス時 font-size が16px未満だと自動ズームするため明示指定
          style={{ width: '100%', padding: '0.6rem', marginBottom: 8, boxSizing: 'border-box', fontSize: 16 }}
        />
        {options.map((opt, i) => (
          <input
            key={i}
            value={opt}
            onChange={(e) => setOptions(options.map((o, j) => (j === i ? e.target.value : o)))}
            placeholder={`選択肢 ${i + 1}`}
            maxLength={50}
            style={{ width: '100%', padding: '0.5rem', marginBottom: 6, boxSizing: 'border-box', fontSize: 16 }}
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
            style={pillButtonStyle({ disabled: !canCreate })}
          >
            ＋ 下書きに追加
          </button>
        </div>
        <p style={{ fontSize: '0.8rem', color: '#888' }}>※作成した下書きは、下の一覧から「▶ 開始」で好きなタイミングで始められます</p>
      </section>

      {/* ── アンケート一覧（実施中 → 下書き → 締切済みの順） ───────── */}
      {(openPoll || draftPolls.length > 0 || closedPolls.length > 0) && (
        <section aria-label="アンケート一覧" style={{ margin: '0 0 1.5rem' }}>
          {/* 実施中：目立たせて最優先表示・ライブ集計・締め切るボタン */}
          {openPoll && (() => {
            const result = resultsByPollId[openPoll.id];
            const counts = result?.counts ?? openPoll.options.map(() => 0);
            const total = result?.total ?? 0;
            return (
              <div style={{ marginBottom: 12, padding: '1rem', border: `3px solid ${BRAND.red}`, borderRadius: 18, background: '#fff7f6' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                  <h2 style={{ fontSize: '1.1rem', margin: 0 }}>🔴 実施中：{openPoll.question}</h2>
                  <button
                    onClick={() => socket?.emit('closePoll', openPoll.id)}
                    style={pillButtonStyle({ color: BRAND.black })}
                  >
                    ⏹ 締め切る
                  </button>
                </div>
                <p style={{ color: '#666', fontSize: '0.9rem', margin: '4px 0 8px' }}>{total}票</p>
                {openPoll.options.map((opt, i) => {
                  const pct = total ? Math.round(((counts[i] ?? 0) / total) * 100) : 0;
                  return (
                    <div key={i} style={{ marginBottom: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.95rem' }}>
                        <span>{opt}</span>
                        <span>{counts[i] ?? 0}票 ({pct}%)</span>
                      </div>
                      <div style={{ background: '#eee', borderRadius: 999, height: 18 }}>
                        <div style={{ width: `${pct}%`, background: BRAND.red, height: '100%', borderRadius: 999, transition: 'width 0.3s' }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}

          {/* 下書き：設問+選択肢プレビューと開始ボタン（複数件あり得る） */}
          {draftPolls.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <h3 style={{ fontSize: '0.95rem', color: '#666', margin: '0 0 8px' }}>📝 下書き（{draftPolls.length}）</h3>
              {draftPolls.map((p) => (
                <div
                  key={p.id}
                  style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8,
                    padding: '0.7rem 0.9rem', marginBottom: 8, borderRadius: 14, border: `2px solid ${BRAND.lime}`,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: '0.98rem' }}>{p.question}</div>
                    <div style={{ fontSize: '0.82rem', color: '#888', marginTop: 2 }}>{p.options.join(' / ')}</div>
                  </div>
                  <button
                    onClick={() => socket?.emit('startPoll', p.id)}
                    style={pillButtonStyle({ color: BRAND.lime })}
                  >
                    ▶ 開始
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* 締切済み：最終集計を控えめな配色で表示（操作ボタンなし） */}
          {closedPolls.length > 0 && (
            <div>
              <h3 style={{ fontSize: '0.95rem', color: '#999', margin: '0 0 8px' }}>⏹ 締切済み（{closedPolls.length}）</h3>
              {closedPolls.map((p) => {
                const result = resultsByPollId[p.id];
                const counts = result?.counts ?? p.options.map(() => 0);
                const total = result?.total ?? 0;
                return (
                  <div key={p.id} style={{ padding: '0.8rem 0.9rem', marginBottom: 8, borderRadius: 14, border: '2px solid #eee', background: '#fafafa' }}>
                    <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#666' }}>{p.question}</div>
                    <p style={{ color: '#999', fontSize: '0.85rem', margin: '2px 0 8px' }}>{total}票</p>
                    {p.options.map((opt, i) => {
                      const pct = total ? Math.round(((counts[i] ?? 0) / total) * 100) : 0;
                      return (
                        <div key={i} style={{ marginBottom: 6 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: '#777' }}>
                            <span>{opt}</span>
                            <span>{counts[i] ?? 0}票 ({pct}%)</span>
                          </div>
                          <div style={{ background: '#eee', borderRadius: 999, height: 12 }}>
                            <div style={{ width: `${pct}%`, background: '#bbb', height: '100%', borderRadius: 999 }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}
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
