// 特権ロール（host / presenter）用のリンク（?t= 付き）を発行する。
// サーバーと同じ HOST_SECRET を使うこと（未設定なら server と同じ既定の開発用シークレット）。
// トークン導出は apps/server/src/index.ts の hostTokenFor と一致させている。
//
// 使い方: npm run host-link -- <eventId> [baseUrl]
//   例: npm run host-link -- demo
//       HOST_SECRET=xxxxx npm run host-link -- plug2026 https://sparkplug.example.com
import { createHmac } from 'node:crypto';

const eventId = process.argv[2];
if (!eventId) {
  console.error('usage: npm run host-link -- <eventId> [baseUrl]');
  process.exit(1);
}
const baseUrl = (process.argv[3] ?? 'http://localhost:5173').replace(/\/$/, '');
const HOST_SECRET = process.env.HOST_SECRET ?? 'sparkplug-dev-secret';
const token = createHmac('sha256', HOST_SECRET).update(eventId).digest('base64url').slice(0, 20);

console.log(`event    : ${eventId}`);
console.log(`host     : ${baseUrl}/e/${eventId}/host?t=${token}`);
console.log(`presenter: ${baseUrl}/e/${eventId}/presenter?t=${token}`);
