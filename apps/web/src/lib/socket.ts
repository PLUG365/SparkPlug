import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@sparkplug/shared';

export const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? 'http://localhost:3001';

/**
 * QRコードに埋め込む参加者URLの基点。LAN実機テストでは Screen が localhost 経由で
 * 開かれる場合があり（画面共有APIのセキュアコンテキスト要件のため）、その場合
 * window.location.origin は "localhost" になってしまいスマホから読み取れない。
 * そのため明示的な環境変数で上書きできるようにする。未設定時は window.location.origin にフォールバック。
 */
export const AUDIENCE_BASE_URL = import.meta.env.VITE_AUDIENCE_URL ?? window.location.origin;

export type SparkPlugSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export function createSocket(): SparkPlugSocket {
  return io(SERVER_URL, { autoConnect: false });
}
