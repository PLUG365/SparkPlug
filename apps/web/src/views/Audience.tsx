import { useParams } from 'react-router-dom';

export default function Audience() {
  const { eventId } = useParams();
  return (
    <main style={{ fontFamily: 'sans-serif', padding: '2rem' }}>
      <h1>🙌 参加者ビュー</h1>
      <p>イベント: {eventId}</p>
      <p>TODO: リアクション / コメント / アンケート回答 / SE 鳴らし</p>
    </main>
  );
}
