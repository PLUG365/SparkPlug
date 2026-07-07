import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { SERVER_URL } from './lib/socket';

export default function App() {
  const demoEventId = 'demo';
  // 開発補助: 既定シークレット時のみサーバーが demo のトークンを返す（本番は 403 → トークンなし）
  const [hostToken, setHostToken] = useState<string | null>(null);
  useEffect(() => {
    fetch(`${SERVER_URL}/events/${demoEventId}/host-link`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setHostToken(d.token))
      .catch(() => {});
  }, []);
  const t = hostToken ? `?t=${hostToken}` : '';

  return (
    <main style={{ fontFamily: 'sans-serif', padding: '2rem' }}>
      <h1>SparkPlug ⚡</h1>
      <p>コミュニティイベントを、リアルタイムに盛り上げ・拾い上げ・振り返る。</p>
      <ul>
        <li><Link to={`/e/${demoEventId}/host${t}`}>主催者ホスト画面</Link></li>
        <li><Link to={`/e/${demoEventId}/presenter${t}`}>発表者ビュー</Link></li>
        <li><Link to={`/e/${demoEventId}`}>参加者ビュー</Link></li>
        <li><Link to={`/e/${demoEventId}/screen`}>会場スクリーン</Link></li>
      </ul>
      {!hostToken && (
        <p style={{ color: '#999', fontSize: '0.85rem' }}>
          ※ ホスト/発表者は権限トークンが必要です。<code>npm run host-link -- {demoEventId}</code> で発行できます。
        </p>
      )}
    </main>
  );
}
