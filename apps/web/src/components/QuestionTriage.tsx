import type { Question, QuestionStatus } from '@sparkplug/shared';

/** ステータス別セクションの定義（表示順） */
const SECTIONS: { status: QuestionStatus; label: string }[] = [
  { status: 'new', label: '🆕 新着' },
  { status: 'now', label: '🎤 今答える' },
  { status: 'later', label: '⏳ 後で' },
  { status: 'offline', label: '📮 後日' },
  { status: 'done', label: '✅ 回答済み' },
];

/** ステータス変更ボタンのラベル（今のステータス以外を出す） */
const STATUS_BUTTONS: { status: QuestionStatus; label: string }[] = [
  { status: 'now', label: '🎤 今答える' },
  { status: 'later', label: '⏳ 後で' },
  { status: 'offline', label: '📮 後日' },
  { status: 'done', label: '✅ 答えた' },
];

/** epoch ms を HH:MM に整形（表示用・ローカルTZ） */
function hhmm(at: number): string {
  const d = new Date(at);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}

export interface QuestionTriageProps {
  questions: Question[];
  onTriage: (questionId: string, status: QuestionStatus) => void;
}

/** 発表者・ホスト共通の質問トリアージUI */
export default function QuestionTriage({ questions, onTriage }: QuestionTriageProps) {
  return (
    <div>
      {SECTIONS.map(({ status, label }) => {
        // 「後で」はいいね数の降順、他は新しい順
        const list = questions.filter((q) => q.status === status);
        list.sort((a, b) => (status === 'later' ? b.likes - a.likes : b.at - a.at));

        // 空セクションは見出しごと非表示。ただし新着だけは空状態テキストを出す
        if (list.length === 0 && status !== 'new') return null;

        return (
          <section key={status} aria-label={label} style={{ marginBottom: 16 }}>
            <h3 style={{ fontSize: '0.95rem', margin: '0 0 6px' }}>
              {label} {list.length > 0 && <span style={{ color: '#aaa' }}>({list.length})</span>}
            </h3>
            {list.length === 0 ? (
              <p style={{ fontSize: '0.85rem', color: '#aaa', padding: '0.4rem 0' }}>
                参加者からの質問はここに届きます
              </p>
            ) : (
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {list.map((q) => (
                  <li
                    key={q.id}
                    style={{
                      padding: '0.6rem 0.8rem', marginBottom: 6, borderRadius: 8,
                      // 回答済みは薄いグレー背景で控えめに
                      background: status === 'done' ? '#f2f2f2' : '#fafafa',
                      // 新着セクションは黄色ボーダーで強調
                      border: status === 'new' ? '2px solid #f5c400' : '1px solid #eee',
                    }}
                  >
                    <div
                      style={{
                        marginBottom: 6,
                        // 回答済みは文字色をグレー寄せにして「済んだ」感を出す
                        color: status === 'done' ? '#999' : undefined,
                      }}
                    >
                      <span style={{ fontSize: '0.75rem', color: '#aaa', marginRight: 8 }}>
                        {hhmm(q.at)}
                      </span>
                      <span
                        style={{
                          color: status === 'done' ? '#999' : '#d0342c',
                          fontWeight: 600, marginRight: 8,
                        }}
                      >
                        {q.displayName}
                      </span>
                      <span style={{ fontSize: '0.8rem', color: '#888' }}>👍 {q.likes}</span>
                      <br />
                      {/* 回答済みは本文に打ち消し線 */}
                      <span style={{ textDecoration: status === 'done' ? 'line-through' : undefined }}>
                        {q.body}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {STATUS_BUTTONS.filter((b) => b.status !== q.status).map((b) => (
                        <button
                          key={b.status}
                          onClick={() => onTriage(q.id, b.status)}
                          style={{
                            fontSize: '0.75rem', padding: '0.2rem 0.5rem', borderRadius: 6,
                            border: '1px solid #cddc29', background: '#fff', cursor: 'pointer',
                          }}
                        >
                          {b.label}
                        </button>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
