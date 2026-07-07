# SparkPlug ⚡

<img src="assets/logo.svg" alt="SparkPlug logo" width="160" align="right" />

<img src="assets/wordmark.svg" alt="SparkPlug" width="300" />

**発表者と参加者の間に流れる情報を可視化・拡張・保存する** — コミュニティイベント向けのリアルタイム盛り上げ + 振り返りアプリ。

> Spark plug = 点火プラグ。エンジンをかける。場に火をつける。

## 3つの機能軸

| 軸 | 機能 |
|---|---|
| 🔥 盛り上げ | コメント流し・リアクション爆発・SE/音・演出 |
| 🎤 拾い上げ | アンケート・投票・自由記述・クイズ |
| 📊 振り返り | ログ分析・AIまとめ・タイムライン・繋がり可視化 |

## アーキテクチャ

```
参加者 / 発表者 / ホスト / 会場スクリーン (ブラウザ SPA)
        │ HTTPS / WebSocket
        ▼
┌─ Azure Static Web Apps Free ─── apps/web (React + Vite)
└─ Azure Container Apps ───────── apps/server (Express + Socket.IO)
        │
        ├─ Cosmos DB Free Tier (イベントログ / アンケート結果)
        └─ AI 分析: GitHub Models (試作) → Azure OpenAI (本番)
CI/CD: GitHub Actions
```

コスト方針: 開発中はほぼ ¥0（SWA Free + Container Apps scale-to-zero + Cosmos Free Tier）。イベント当日のみ min replica 1 に上げて数十〜数百円/日。

## リポジトリ構成

```
apps/
  web/       React + Vite SPA（host / presenter / audience / screen の4ビュー）
  server/    Express + Socket.IO リアルタイムサーバー
packages/
  shared/    クライアント/サーバー共有の Socket.IO イベント型定義
```

## 開発

```bash
npm install
npm run build          # shared → server → web の順にビルド
```

`dev:server` と `dev:web` は**2つのターミナルで同時に**起動しておく（片方だけだと画面は開けてもリアルタイム通信が繋がらない）。

```bash
npm run dev:server     # http://localhost:3001 (ヘルスチェック: /health)
npm run dev:web        # http://localhost:5173
```

※ 初回は `npm run build` で `packages/shared` をビルドしてから dev を起動すること。

### 動作確認（4つのビュー）

イベントID（`demo`など好きな文字列）ごとに以下のURLを開く:

| ビュー | URL |
|---|---|
| ホスト | `/e/{eventId}/host?t=<token>` （要権限トークン） |
| 発表者 | `/e/{eventId}/presenter?t=<token>` （要権限トークン） |
| 参加者 | `/e/{eventId}` |
| 会場スクリーン | `/e/{eventId}/screen` |

会場スクリーンの画面共有機能（Screen Capture API）はセキュアコンテキスト（`localhost` / `https`）でのみ動くため、**必ず `localhost` 経由で開く**こと。

### ホスト/発表者リンク（権限トークン）

ホスト・発表者ビューは乗っ取り防止のため**権限トークン付きURL**が必要（参加者・会場スクリーンは不要）。トークンは `eventId` ごとにサーバー秘密鍵から導出される。

```bash
npm run host-link -- <eventId>                      # host/presenter のURLを出力（既定 baseUrl は http://localhost:5173）
npm run host-link -- <eventId> https://<本番URL>     # 本番用リンクを発行
```

- サーバー秘密鍵は `HOST_SECRET` 環境変数で設定する。**本番デプロイ時は必ず設定すること**（未設定だと開発用の既定値が使われトークンが推測可能。サーバー起動時に警告が出る）。
- `host-link` を実行する側もサーバーと同じ `HOST_SECRET` を使う（例: `HOST_SECRET=xxxx npm run host-link -- plug2026`）。
- 開発時のみ `GET /events/{eventId}/host-link` でもトークンを取得できる（`HOST_SECRET` 設定済みの本番では 403）。ローカルのトップページ `/` の「主催者ホスト画面 / 発表者ビュー」リンクはこれを使って自動でトークン付きになる。
- トークンが無い / 誤っているとアクセス拒否画面が表示される。

### スマホなど別端末からアクセスする（同一LAN）

`dev:web`（`vite --host`）は既にLAN内へバインドされるので、PCのLAN IPで `apps/web/.env.local`（gitignore対象・各自作成）に以下を設定するだけでよい:

```
VITE_SERVER_URL=http://<PCのLAN IP>:3001
VITE_AUDIENCE_URL=http://<PCのLAN IP>:5173
```

`VITE_AUDIENCE_URL` は会場スクリーンのQRコードに埋め込む参加者URLの基点。スクリーンを画面共有のため `localhost` 経由で開いた場合でも、QRにはスマホから読めるLAN IPが埋め込まれるようにするための設定。

### デモ用の活動を流し込む（スクリーンショット・録画用）

実際に参加者を集めなくても、会場スクリーンにリアクション連打・コメント流し・AA・アンケート（開始→投票→締切）をまとめて流せるスクリプトがある。参加者UIは経由せず `socket.io-client` で直接サーバーに接続する:

```bash
npm run demo:seed -- <eventId>   # 例: npm run demo:seed -- demo
```

`dev:server` を起動した状態で、会場スクリーン（`/e/{eventId}/screen`）を開いておいてから実行する。`SERVER_URL` 環境変数でサーバーURLを上書き可能（既定 `http://localhost:3001`）。中身は `scripts/demo-seed.mjs`。

## Roadmap

- [x] モノレポ雛形（web / server / shared）
- [x] リアクション送受信のリアルタイムデモ（ルーム = イベント単位）
- [x] コメント流し（参加者 → 会場スクリーン、匿名/記名）
- [x] コメントの流れ方（横流れ ⇄ 下から上）をホストから切り替え（通常コメントのみ、既定は横流れ）
- [x] AAコメント対応（ニコニコ動画的な複数行アスキーアート、等幅・改行保持でゆっくり流す）
- [x] SE 再生（ドン/カッ/拍手。フリー素材 mp3 + Web Audio API 合成フォールバック）
- [x] 選択式アンケート + リアルタイム集計（ホスト作成/締切、投票し直し可、スクリーンにライブ表示）
- [ ] Dockerfile + Azure Container Apps デプロイ（Bicep）
- [ ] Azure Static Web Apps デプロイ + GitHub Actions CD
- [x] ログ CSV エクスポート（UTF-8 BOM、Excel対応。※現状 in-memory、サーバー再起動で消える）
- [ ] イベントログ永続化（Cosmos DB）
- [x] 発表者ビュー: エモメーター（波形＋熱量＋バイブ）・質問（参加者が表示名付きで発表者に送る）
- [x] 質問トリアージ（いいね・今答える/後で/後日の振り分け、後ではいいね順、スクリーンにピン留め）
- [x] 会場スクリーンのQRコード表示・効果音ON/OFFをホストから制御（共に既定ON）
- [x] ホスト/発表者の権限トークン（URL手打ちでの乗っ取り防止、`?t=` 方式・`HOST_SECRET` 本番必須）
- [x] 画面共有（発表スライド等を会場スクリーンの背景に取り込み、演出はその上に重ねる）
- [ ] AI 振り返り分析

## ブランドアセット

| ファイル | 用途 |
|---|---|
| `assets/logo.svg` | メインロゴ（点火するプラグ） |
| `assets/icon.svg` + `icon-192/512.png` | PWA・ファビコン用アイコン |
| `assets/wordmark.svg` | サイトヘッダー・ドキュメント用ワードマーク |
| `assets/plug-community-logo.png` | PLUG コミュニティ本体のロゴ |

SparkPlug は [PLUG（Power Platform Local User Group）](https://github.com/PLUG365) 発のプロジェクトです。

## クレジット

効果音素材: [OtoLogic](https://otologic.jp/)（CC BY 4.0）
`apps/web/public/se/` の mp3 は OtoLogic 素材（Tambourine / Hyoshigi01 / Applause02）をリネームして使用。

## License

MIT（効果音 mp3 を除く。上記クレジット参照）
