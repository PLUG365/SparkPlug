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
npm run dev:server     # http://localhost:3001 (ヘルスチェック: /health)
npm run dev:web        # http://localhost:5173
```

※ 初回は `npm run build` で `packages/shared` をビルドしてから dev を起動すること。

## Roadmap

- [x] モノレポ雛形（web / server / shared）
- [ ] リアクション送受信のリアルタイムデモ（ルーム = イベント単位）
- [ ] コメント流し + SE 再生（Web Audio API）
- [ ] 選択式アンケート + リアルタイム集計
- [ ] Dockerfile + Azure Container Apps デプロイ（Bicep）
- [ ] Azure Static Web Apps デプロイ + GitHub Actions CD
- [ ] イベントログ永続化（Cosmos DB）+ CSV エクスポート
- [ ] 発表者ビュー（エモメーター・バックチャンネル・質問トリアージ）
- [ ] AI 振り返り分析

## ブランドアセット

| ファイル | 用途 |
|---|---|
| `assets/logo.svg` | メインロゴ（点火するプラグ） |
| `assets/icon.svg` + `icon-192/512.png` | PWA・ファビコン用アイコン |
| `assets/wordmark.svg` | サイトヘッダー・ドキュメント用ワードマーク |
| `assets/plug-community-logo.png` | PLUG コミュニティ本体のロゴ |

SparkPlug は [PLUG（Power Platform Local User Group）](https://github.com/PLUG365) 発のプロジェクトです。

## License

MIT
