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

// ── イベントログ（サーバー内部型。shared には置かない） ──────────────
/** イベントログの1行。CSV エクスポートの元データ。 */
interface LogEntry {
  /** 発生時刻 (epoch ms) */
  at: number;
  /** 種別（例: 参加 / リアクション / コメント / SE / 投票 …） */
  type: string;
  /** 内容（種別ごとに意味が変わる） */
  content: string;
  /** 表示名（コメントのみ入りうる） */
  displayName?: string;
}

/** 1イベントあたりのログ上限。超えたら新規追加を無視する。 */
const LOG_LIMIT = 50_000;

/** eventId → ログ配列 */
const eventLogs = new Map<string, LogEntry[]>();

/** ログを1行追記する。上限を超えていたら黙って無視する。 */
function appendLog(eventId: string, entry: LogEntry): void {
  let log = eventLogs.get(eventId);
  if (!log) {
    log = [];
    eventLogs.set(eventId, log);
  }
  if (log.length >= LOG_LIMIT) return;
  log.push(entry);
}

// ── CSV ヘルパー ────────────────────────────────────────────────
/** epoch ms を JST(UTC+9) の `YYYY-MM-DD HH:MM:SS` に整形する（実行環境のTZに依存しない）。 */
function formatJst(at: number): string {
  const d = new Date(at + 9 * 60 * 60 * 1000); // UTC+9 を明示的に加算し UTC ゲッターで読む
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  return (
    `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ` +
    `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`
  );
}

/** CSV の1フィールドをエスケープする。カンマ・引用符・改行を含む場合は "" で囲む。 */
function csvField(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

// ── CSV エクスポートエンドポイント ──────────────────────────────
// ログが空でもヘッダー行だけ返す（404 にしない）。Excel 対策で UTF-8 BOM 付き。
app.get('/events/:eventId/export.csv', (req, res) => {
  const eventId = req.params.eventId;
  const log = eventLogs.get(eventId) ?? [];

  const header = '日時,種別,内容,表示名';
  const lines = log.map((e) =>
    [
      csvField(formatJst(e.at)),
      csvField(e.type),
      csvField(e.content),
      csvField(e.displayName ?? ''),
    ].join(','),
  );
  // 先頭に UTF-8 BOM、改行は CRLF
  const body = '﻿' + [header, ...lines].join('\r\n') + '\r\n';

  // ファイル名: ASCII セーフ版を filename に、原文（日本語可）を RFC 5987 の filename* に
  const yyyymmdd = formatJst(Date.now()).slice(0, 10).replace(/-/g, '');
  const asciiSafeId = eventId.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  const asciiName = `sparkplug-${asciiSafeId}-${yyyymmdd}.csv`;
  const utf8Name = encodeURIComponent(`sparkplug-${eventId}-${yyyymmdd}.csv`);

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${asciiName}"; filename*=UTF-8''${utf8Name}`,
  );
  res.send(body);
});

const httpServer = createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: { origin: CORS_ORIGIN },
});

function roomOf(eventId: string): string {
  return `event:${eventId}`;
}

/** ロール別ルーム名。質問のように特定ロールにだけ配信したいとき使う */
function roleRoomOf(eventId: string, role: Role): string {
  return `event:${eventId}:role:${role}`;
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
    // ロール別ルームにも join（質問の宛先絞り込みに使う）
    await socket.join(roleRoomOf(eventId, role));
    const count = (await io.in(roomOf(eventId)).fetchSockets()).length;
    socket.emit('joined', { eventId, participantCount: count });
    io.to(roomOf(eventId)).emit('participantCount', count);
    const active = activePolls.get(eventId);
    if (active) {
      socket.emit('poll', active.poll);
      socket.emit('pollResults', active.poll.id, countsOf(active), active.voters.size);
    }
    appendLog(eventId, { at: Date.now(), type: '参加', content: role });
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
    // content: `質問: 選択肢1 / 選択肢2 / ...`
    appendLog(joinedEventId, {
      at: active.poll.at,
      type: 'アンケート開始',
      content: `${q}: ${opts.join(' / ')}`,
    });
  });

  socket.on('vote', (pollId, optionIndex) => {
    if (!joinedEventId) return;
    const active = activePolls.get(joinedEventId);
    if (!active || !active.poll.isOpen || active.poll.id !== pollId) return;
    if (!Number.isInteger(optionIndex) || optionIndex < 0 || optionIndex >= active.poll.options.length) return;
    active.voters.set(socket.id, optionIndex);
    emitResults(joinedEventId, active);
    // 投票し直しも1行ずつそのまま記録。content は選ばれた選択肢のラベル
    appendLog(joinedEventId, {
      at: Date.now(),
      type: '投票',
      content: active.poll.options[optionIndex],
    });
  });

  socket.on('closePoll', () => {
    if (!joinedEventId || joinedRole !== 'host') return;
    const active = activePolls.get(joinedEventId);
    if (!active || !active.poll.isOpen) return;
    active.poll.isOpen = false;
    emitResults(joinedEventId, active);
    io.to(roomOf(joinedEventId)).emit('pollClosed', active.poll.id);
    // content: `質問: 選択肢1=3票 / 選択肢2=1票` の最終集計
    const counts = countsOf(active);
    const summary = active.poll.options.map((o, i) => `${o}=${counts[i]}票`).join(' / ');
    appendLog(joinedEventId, {
      at: Date.now(),
      type: 'アンケート締切',
      content: `${active.poll.question}: ${summary}`,
    });
  });

  socket.on('reaction', (kind) => {
    if (!joinedEventId) return;
    io.to(roomOf(joinedEventId)).emit('reaction', {
      kind,
      eventId: joinedEventId,
      at: Date.now(),
    });
    appendLog(joinedEventId, { at: Date.now(), type: 'リアクション', content: kind });
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
    appendLog(joinedEventId, {
      at: Date.now(),
      type: 'コメント',
      content: trimmed,
      displayName: displayName ?? '',
    });
  });

  socket.on('question', (body, displayName) => {
    if (!joinedEventId) return;
    const trimmedBody = body.trim().slice(0, 200);
    const trimmedName = displayName.trim().slice(0, 20);
    // 本文・表示名のどちらかが空なら無視（質問には表示名が必須）
    if (!trimmedBody || !trimmedName) return;
    const question = {
      id: randomUUID(),
      eventId: joinedEventId,
      body: trimmedBody,
      displayName: trimmedName,
      at: Date.now(),
    };
    // presenter / screen / host のロール別ルームに配信（audience には届かない）
    for (const role of ['presenter', 'screen', 'host'] as const) {
      io.to(roleRoomOf(joinedEventId, role)).emit('question', question);
    }
    appendLog(joinedEventId, {
      at: question.at,
      type: '質問',
      content: trimmedBody,
      displayName: trimmedName,
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
    // スロットルを通過したものだけ記録する
    appendLog(joinedEventId, { at: now, type: 'SE', content: kind });
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
