import { useParams } from 'react-router-dom';

export default function Presenter() {
  const { eventId } = useParams();
  return (
    <main style={{ fontFamily: 'sans-serif', padding: '2rem' }}>
      <h1>🎤 発表者ビュー</h1>
      <p>イベント: {eventId}</p>
      <p>TODO: エモメーター / バックチャンネル / 質問トリアージ</p>
    </main>
  );
}
