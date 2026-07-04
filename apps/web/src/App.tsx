import { Link } from 'react-router-dom';

export default function App() {
  const demoEventId = 'demo';
  return (
    <main style={{ fontFamily: 'sans-serif', padding: '2rem' }}>
      <h1>SparkPlug ⚡</h1>
      <p>コミュニティイベントを、リアルタイムに盛り上げ・拾い上げ・振り返る。</p>
      <ul>
        <li><Link to={`/e/${demoEventId}/host`}>主催者ホスト画面</Link></li>
        <li><Link to={`/e/${demoEventId}/presenter`}>発表者ビュー</Link></li>
        <li><Link to={`/e/${demoEventId}`}>参加者ビュー</Link></li>
        <li><Link to={`/e/${demoEventId}/screen`}>会場スクリーン</Link></li>
      </ul>
    </main>
  );
}
