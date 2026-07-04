import { useParams } from 'react-router-dom';

export default function Host() {
  const { eventId } = useParams();
  return (
    <main style={{ fontFamily: 'sans-serif', padding: '2rem' }}>
      <h1>🎛️ 主催者ホスト画面</h1>
      <p>イベント: {eventId}</p>
      <p>TODO: アンケート仕込み / 演出コントロール / ダッシュボード / モデレーション</p>
    </main>
  );
}
