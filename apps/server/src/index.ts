import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import express from 'express';
import { Server } from 'socket.io';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  JoinPayload,
} from '@sparkplug/shared';

const PORT = Number(process.env.PORT ?? 3001);
const CORS_ORIGIN = process.env.CORS_ORIGIN ?? 'http://localhost:5173';

const app = express();
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

const httpServer = createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: { origin: CORS_ORIGIN },
});

function roomOf(eventId: string): string {
  return `event:${eventId}`;
}

io.on('connection', (socket) => {
  let joinedEventId: string | undefined;

  socket.on('join', async ({ eventId, role }: JoinPayload) => {
    joinedEventId = eventId;
    await socket.join(roomOf(eventId));
    const count = (await io.in(roomOf(eventId)).fetchSockets()).length;
    socket.emit('joined', { eventId, participantCount: count });
    io.to(roomOf(eventId)).emit('participantCount', count);
    console.log(`[join] event=${eventId} role=${role} socket=${socket.id}`);
  });

  socket.on('reaction', (kind) => {
    if (!joinedEventId) return;
    io.to(roomOf(joinedEventId)).emit('reaction', {
      kind,
      eventId: joinedEventId,
      at: Date.now(),
    });
  });

  socket.on('comment', (body, displayName) => {
    if (!joinedEventId) return;
    const trimmed = body.trim().slice(0, 200);
    if (!trimmed) return;
    io.to(roomOf(joinedEventId)).emit('comment', {
      id: randomUUID(),
      eventId: joinedEventId,
      body: trimmed,
      displayName,
      at: Date.now(),
    });
  });

  socket.on('disconnect', async () => {
    if (!joinedEventId) return;
    const count = (await io.in(roomOf(joinedEventId)).fetchSockets()).length;
    io.to(roomOf(joinedEventId)).emit('participantCount', count);
  });
});

httpServer.listen(PORT, () => {
  console.log(`SparkPlug server listening on http://localhost:${PORT}`);
});
