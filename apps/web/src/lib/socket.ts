import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@sparkplug/shared';

export const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? 'http://localhost:3001';

export type SparkPlugSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export function createSocket(): SparkPlugSocket {
  return io(SERVER_URL, { autoConnect: false });
}
