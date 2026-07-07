import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { SERVER_URL } from './lib/socket';

export default function App() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // イベント作成: 名前を送って短縮ID+ホストトークンを受け取り、そのままホスト画面へ遷移
  const createEvent = async () => {
    if (creating) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch(`${SERVER_URL}/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (!res.ok) throw new Error(`作成に失敗しました (${res.status})`);
      const data = (await res.json()) as { eventId: string; hostToken: string };
      navigate(`/e/${data.eventId}/host?t=${data.hostToken}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : '作成に失敗しました');
      setCreating(false);
    }
  };

  // 開発補助: 既定シークレット時のみサーバーが demo のトークンを返す（本番は 403 → トークンなし）
  const [demoToken, setDemoToken] = useState<string | null>(null);
  useEffect(() => {
    fetch(`${SERVER_URL}/events/demo/host-link`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setDemoToken(d.token))
      .catch(() => {});
  }, []);
  const dt = demoToken ? `?t=${demoToken}` : '';

  return (
    <main style={{ fontFamily: 'sans-serif', padding: '2rem', maxWidth: 560, margin: '0 auto' }}>
      <h1>SparkPlug ⚡</h1>
      <p>コミュニティイベントを、リアルタイムに盛り上げ・拾い上げ・振り返る。</p>

      <section aria-label="イベントを作る" style={{ margin: '1.5rem 0', padding: '1.2rem', border: '3px solid #cddc29', borderRadius: 18 }}>
        <h2 style={{ fontSize: '1.1rem', marginTop: 0 }}>✨ イベントを作る</h2>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && createEvent()}
            placeholder="イベント名（例: PLUG Meetup #12）"
            maxLength={60}
            style={{ flex: 1, minWidth: 220, fontSize: 16, padding: '0.6rem 0.8rem', borderRadius: 10, border: '2px solid #ccc' }}
          />
          <button
            onClick={createEvent}
            disabled={creating}
            style={{
              padding: '0.6rem 1.4rem', borderRadius: 999, border: 'none',
              background: '#e5352b', color: '#fff', fontSize: 16, fontWeight: 700,
              cursor: creating ? 'default' : 'pointer', opacity: creating ? 0.6 : 1,
            }}
          >
            {creating ? '作成中…' : '作成する'}
          </button>
        </div>
        <p style={{ color: '#666', fontSize: '0.85rem', margin: '0.6rem 0 0' }}>
          作成するとIDが自動発行され、そのままホスト画面（権限トークン付き）に移動します。
        </p>
        {error && <p style={{ color: '#e5352b', fontSize: '0.9rem', margin: '0.4rem 0 0' }}>{error}</p>}
      </section>

      <details>
        <summary style={{ cursor: 'pointer', color: '#666' }}>開発用: demo イベントの各ビューを直接開く</summary>
        <ul>
          <li><Link to={`/e/demo/host${dt}`}>主催者ホスト画面</Link></li>
          <li><Link to={`/e/demo/presenter${dt}`}>発表者ビュー</Link></li>
          <li><Link to="/e/demo">参加者ビュー</Link></li>
          <li><Link to="/e/demo/screen">会場スクリーン</Link></li>
        </ul>
        {!demoToken && (
          <p style={{ color: '#999', fontSize: '0.85rem' }}>
            ※ ホスト/発表者は権限トークンが必要です。<code>npm run host-link -- demo</code> で発行できます。
          </p>
        )}
      </details>
    </main>
  );
}
