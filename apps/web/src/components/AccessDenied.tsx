/**
 * 特権ロール（host / presenter）の参加がトークン不一致で拒否されたときに表示する画面。
 * 主催者用リンク（?t= 付き）が必要であることと、その発行方法を案内する。
 */
export default function AccessDenied({ roleLabel }: { roleLabel: string }) {
  return (
    <main style={{ fontFamily: 'sans-serif', padding: '2rem', maxWidth: 640, margin: '0 auto' }}>
      <h1 style={{ fontSize: '1.4rem' }}>🔒 アクセス権限がありません</h1>
      <p>この{roleLabel}画面を開くには、主催者用のリンク（トークン付き）が必要です。</p>
      <p style={{ color: '#666', fontSize: '0.9rem' }}>
        リンクは <code>npm run host-link -- &lt;イベントID&gt;</code> で発行できます。
      </p>
    </main>
  );
}
