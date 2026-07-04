import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import express from 'express';
import { Server } from 'socket.io';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  JoinPayload,
  Poll,
  Role,
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

interface ActivePoll {
  poll: Poll;
  /** socket.id → 選んだ選択肢 index。投票し直しは上書き */
  voters: Map<string, number>;
}

const activePolls = new Map<string, ActivePoll>();

function countsOf(active: ActivePoll): number[] {
  const counts = active.poll.options.map(() => 0);
  for (const idx of active.voters.values()) counts[idx]++;
  return counts;
}

function emitResults(eventId: string, active: ActivePoll): void {
  io.to(roomOf(eventId)).emit('pollResults', active.poll.id, countsOf(active), active.voters.size);
}

const SE_THROTTLE_MS = 400;

io.on('connection', (socket) => {
  let joinedEventId: string | undefined;
  let joinedRole: Role | undefined;
  let lastSeAt = 0;

  socket.on('join', async ({ eventId, role }: JoinPayload) => {
    joinedEventId = eventId;
    joinedRole = role;
    await socket.join(roomOf(eventId));
    const count = (await io.in(roomOf(eventId)).fetchSockets()).length;
    socket.emit('joined', { eventId, participantCount: count });
    io.to(roomOf(eventId)).emit('participantCount', count);
    const active = activePolls.get(eventId);
    if (active) {
      socket.emit('poll', active.poll);
      socket.emit('pollResults', active.poll.id, countsOf(active), active.voters.size);
    }
    console.log(`[join] event=${eventId} role=${role} socket=${socket.id}`);
  });

  socket.on('createPoll', (question, options) => {
    if (!joinedEventId || joinedRole !== 'host') return;
    const q = question.trim().slice(0, 100);
    const opts = options.map((o) => o.trim().slice(0, 50)).filter(Boolean);
    if (!q || opts.length < 2 || opts.length > 6) return;
    const prev = activePolls.get(joinedEventId);
    if (prev) io.to(roomOf(joinedEventId)).emit('pollClosed', prev.poll.id);
    const active: ActivePoll = {
      poll: {
        id: randomUUID(),
        eventId: joinedEventId,
        question: q,
        options: opts,
        isOpen: true,
        at: Date.now(),
      },
      voters: new Map(),
    };
    activePolls.set(joinedEventId, active);
    io.to(roomOf(joinedEventId)).emit('poll', active.poll);
    emitResults(joinedEventId, active);
  });

  socket.on('vote', (pollId, optionIndex) => {
    if (!joinedEventId) return;
    const active = activePolls.get(joinedEventId);
    if (!active || !active.poll.isOpen || active.poll.id !== pollId) return;
    if (!Number.isInteger(optionIndex) || optionIndex < 0 || optionIndex >= active.poll.options.length) return;
    active.voters.set(socket.id, optionIndex);
    emitResults(joinedEventId, active);
  });

  socket.on('closePoll', () => {
    if (!joinedEventId || joinedRole !== 'host') return;
    const active = activePolls.get(joinedEventId);
    if (!active || !active.poll.isOpen) return;
    active.poll.isOpen = false;
    emitResults(joinedEventId, active);
    io.to(roomOf(joinedEventId)).emit('pollClosed', active.poll.id);
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

  socket.on('se', (kind) => {
    if (!joinedEventId) return;
    const now = Date.now();
    if (now - lastSeAt < SE_THROTTLE_MS) return;
    lastSeAt = now;
    io.to(roomOf(joinedEventId)).emit('se', {
      kind,
      eventId: joinedEventId,
      at: now,
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
