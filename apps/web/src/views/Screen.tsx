import { useParams } from 'react-router-dom';

export default function Screen() {
  const { eventId } = useParams();
  return (
    <main style={{ fontFamily: 'sans-serif', padding: '2rem', background: '#111', color: '#fff', minHeight: '100vh' }}>
      <h1>📺 会場スクリーン</h1>
      <p>イベント: {eventId}</p>
      <p>TODO: コメント流し / 投票結果 / ワードクラウド / 盛り上がりエフェクト</p>
    </main>
  );
}
