import { createServer } from 'node:http';
import { randomUUID, createHmac } from 'node:crypto';
import express from 'express';
import { Server } from 'socket.io';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  EventSettings,
  JoinPayload,
  Poll,
  Question,
  QuestionStatus,
  Role,
} from '@sparkplug/shared';

const PORT = Number(process.env.PORT ?? 3001);
// CORS_ORIGIN 未指定なら true（リクエスト元 origin を反射して許可）。
// dev で LAN 実機（スマホ）テストするための緩和。本番デプロイ時は CORS_ORIGIN を必ず明示すること。
const CORS_ORIGIN: string | boolean = process.env.CORS_ORIGIN ?? true;

// ── 特権ロール（host / presenter）の権限トークン（乗っ取り対策） ─────────────
// 誰でも /e/:id/host を開けば host を名乗れる問題を塞ぐ。特権ロールは eventId ごとに
// サーバー秘密鍵から導出したトークンの提示を必須にする。トークンはURLの ?t= で配布する。
//   token = HMAC-SHA256(HOST_SECRET, eventId) の先頭20文字（base64url）
// 秘密鍵はデプロイ時に HOST_SECRET を必ず設定すること（未設定＝開発用の既定値）。
const DEFAULT_HOST_SECRET = 'sparkplug-dev-secret';
const HOST_SECRET = process.env.HOST_SECRET ?? DEFAULT_HOST_SECRET;
const HOST_SECRET_IS_DEFAULT = HOST_SECRET === DEFAULT_HOST_SECRET;
const PRIVILEGED_ROLES: ReadonlySet<Role> = new Set<Role>(['host', 'presenter']);

/** eventId に対する特権ロール用トークンを導出する（サーバー秘密鍵に依存、決定的） */
function hostTokenFor(eventId: string): string {
  return createHmac('sha256', HOST_SECRET).update(eventId).digest('base64url').slice(0, 20);
}

const app = express();
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// 開発補助: 既定シークレット使用時（＝未設定＝開発）のみ、指定イベントの特権トークンを返す。
// 本番（HOST_SECRET 設定済み）では 403。トークンは秘密鍵から導出されるため公開してはならない。
app.get('/events/:eventId/host-link', (req, res) => {
  if (!HOST_SECRET_IS_DEFAULT) {
    res.status(403).json({ error: 'disabled when HOST_SECRET is set; use scripts/host-link.mjs' });
    return;
  }
  res.json({ token: hostTokenFor(req.params.eventId) });
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

/** AAコメントのサニタイズ。行頭・行内の空白は整列に必要なので保持し、全体の trim と行数・文字数の上限だけ適用する */
function sanitizeAsciiArt(raw: string): string {
  const lines = raw.replace(/\r\n/g, '\n').split('\n').slice(0, 20); // 最大20行
  return lines.join('\n').slice(0, 500).trim(); // 最大500文字、前後の空行のみ除去
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

// ── スクリーン設定ストア ────────────────────────────────────────
/** スクリーン設定の既定値。QRコード表示・効果音とも初期は ON */
const DEFAULT_EVENT_SETTINGS: EventSettings = { qrVisible: true, soundEnabled: true, commentFlow: 'horizontal' };

/** eventId → スクリーン設定 */
const eventSettings = new Map<string, EventSettings>();

/** イベントのスクリーン設定を返す。無ければ既定値で作成して格納する（遅延初期化） */
function getEventSettings(eventId: string): EventSettings {
  let settings = eventSettings.get(eventId);
  if (!settings) {
    settings = { ...DEFAULT_EVENT_SETTINGS };
    eventSettings.set(eventId, settings);
  }
  return settings;
}

/** アンケート1件と、投票状況。下書き・実施中・締切済みのすべてを保持する */
interface PollRecord {
  poll: Poll;
  /** socket.id → 選んだ選択肢 index。投票し直しは上書き */
  voters: Map<string, number>;
}

/** 1イベントあたりのアンケート保持上限。超えたら新規作成を無視する。 */
const POLL_LIMIT = 100;

/** eventId → アンケートレコード配列（作成順。下書き・実施中・締切済みを含む全履歴） */
const eventPolls = new Map<string, PollRecord[]>();

// ── 質問ストア ──────────────────────────────────────────────────
/** 質問1件と、いいねした socket.id の集合 */
interface QuestionRecord {
  question: Question;
  /** いいねした socket.id。likes = likedBy.size */
  likedBy: Set<string>;
}

/** 1イベントあたりの質問保持上限。超えたら新規質問を無視する。 */
const QUESTION_LIMIT = 200;

/** eventId → 質問レコード配列（古い順） */
const eventQuestions = new Map<string, QuestionRecord[]>();

/** triageQuestion のログ用ラベル（offline は「後日」で記録） */
const TRIAGE_LOG_LABEL: Record<QuestionStatus, string> = {
  new: '新着',
  now: '今答える',
  later: '後で',
  offline: '後日',
  done: '回答済み',
};

function countsOf(record: PollRecord): number[] {
  const counts = record.poll.options.map(() => 0);
  for (const idx of record.voters.values()) counts[idx]++;
  return counts;
}

function emitResults(eventId: string, record: PollRecord): void {
  io.to(roomOf(eventId)).emit('pollResults', record.poll.id, countsOf(record), record.voters.size);
}

/** host ロールのルームへ、そのイベントの全アンケート一覧を配信する */
function emitPollsList(eventId: string): void {
  const polls = (eventPolls.get(eventId) ?? []).map((r) => r.poll);
  io.to(roleRoomOf(eventId, 'host')).emit('polls', polls);
}

const SE_THROTTLE_MS = 400;

io.on('connection', (socket) => {
  let joinedEventId: string | undefined;
  let joinedRole: Role | undefined;
  let lastSeAt = 0;

  socket.on('join', async ({ eventId, role, token }: JoinPayload) => {
    // 特権ロール（host / presenter）はトークン照合。不一致・欠如なら権限を与えず拒否して終了。
    if (PRIVILEGED_ROLES.has(role) && token !== hostTokenFor(eventId)) {
      socket.emit('authRejected', { role });
      console.warn(`[security] rejected privileged join event=${eventId} role=${role} socket=${socket.id}`);
      return;
    }
    joinedEventId = eventId;
    joinedRole = role;
    await socket.join(roomOf(eventId));
    // ロール別ルームにも join（質問の宛先絞り込みに使う）
    await socket.join(roleRoomOf(eventId, role));
    const count = (await io.in(roomOf(eventId)).fetchSockets()).length;
    socket.emit('joined', { eventId, participantCount: count });
    io.to(roomOf(eventId)).emit('participantCount', count);
    // 実施中のアンケートがあれば本人にだけ現状を送る（全ロール共通）
    const polls = eventPolls.get(eventId);
    const openRecord = polls?.find((r) => r.poll.status === 'open');
    if (openRecord) {
      socket.emit('poll', openRecord.poll);
      socket.emit('pollResults', openRecord.poll.id, countsOf(openRecord), openRecord.voters.size);
    }
    // host には下書き含む全件を初回同期する
    if (role === 'host') {
      socket.emit('polls', polls?.map((r) => r.poll) ?? []);
      // 締切済み分も含め全アンケートの集計を個別に再送する。
      // openRecord のみ再送だと、host のページ再読み込みで締切済みの票数が 0 に見えてしまうため。
      for (const record of polls ?? []) {
        socket.emit('pollResults', record.poll.id, countsOf(record), record.voters.size);
      }
    }
    // その時点の質問一覧を本人にだけ一括同期（アンケート同期と同じパターン）
    const records = eventQuestions.get(eventId);
    if (records && records.length > 0) {
      socket.emit('questions', records.map((r) => r.question));
    }
    // スクリーン設定を本人にだけ同期（全ロール共通。無ければ既定値で作られる）
    socket.emit('eventSettings', getEventSettings(eventId));
    appendLog(eventId, { at: Date.now(), type: '参加', content: role });
    console.log(`[join] event=${eventId} role=${role} socket=${socket.id}`);
  });

  socket.on('createPoll', (question, options) => {
    if (!joinedEventId || joinedRole !== 'host') return;
    const q = question.trim().slice(0, 100);
    const opts = options.map((o) => o.trim().slice(0, 50)).filter(Boolean);
    if (!q || opts.length < 2 || opts.length > 6) return;
    // アンケートストアを確保し、上限を超えていたら新規作成を無視する
    let records = eventPolls.get(joinedEventId);
    if (!records) {
      records = [];
      eventPolls.set(joinedEventId, records);
    }
    if (records.length >= POLL_LIMIT) return;
    // 下書きとして追加するだけ。room 全体への poll 配信・CSVログは開始時まで行わない
    records.push({
      poll: {
        id: randomUUID(),
        eventId: joinedEventId,
        question: q,
        options: opts,
        status: 'draft',
        at: Date.now(),
      },
      voters: new Map(),
    });
    emitPollsList(joinedEventId);
  });

  socket.on('startPoll', (pollId) => {
    if (!joinedEventId || joinedRole !== 'host') return;
    const records = eventPolls.get(joinedEventId);
    const target = records?.find((r) => r.poll.id === pollId && r.poll.status === 'draft');
    if (!records || !target) return;
    // 実施中の別アンケートがあれば自動的に締め切る
    const openRecord = records.find((r) => r.poll.status === 'open');
    if (openRecord) {
      openRecord.poll.status = 'closed';
      io.to(roomOf(joinedEventId)).emit('pollClosed', openRecord.poll.id);
    }
    target.poll.status = 'open';
    io.to(roomOf(joinedEventId)).emit('poll', target.poll);
    emitResults(joinedEventId, target);
    emitPollsList(joinedEventId);
    // content: `質問: 選択肢1 / 選択肢2 / ...`。開始時にのみ記録する
    appendLog(joinedEventId, {
      at: Date.now(),
      type: 'アンケート開始',
      content: `${target.poll.question}: ${target.poll.options.join(' / ')}`,
    });
  });

  socket.on('vote', (pollId, optionIndex) => {
    if (!joinedEventId) return;
    const records = eventPolls.get(joinedEventId);
    const record = records?.find((r) => r.poll.id === pollId && r.poll.status === 'open');
    if (!record) return;
    if (!Number.isInteger(optionIndex) || optionIndex < 0 || optionIndex >= record.poll.options.length) return;
    record.voters.set(socket.id, optionIndex);
    emitResults(joinedEventId, record);
    // 投票し直しも1行ずつそのまま記録。content は選ばれた選択肢のラベル
    appendLog(joinedEventId, {
      at: Date.now(),
      type: '投票',
      content: record.poll.options[optionIndex],
    });
  });

  socket.on('closePoll', (pollId) => {
    if (!joinedEventId || joinedRole !== 'host') return;
    const records = eventPolls.get(joinedEventId);
    const record = records?.find((r) => r.poll.id === pollId);
    if (!record || record.poll.status !== 'open') return;
    record.poll.status = 'closed';
    emitResults(joinedEventId, record);
    io.to(roomOf(joinedEventId)).emit('pollClosed', record.poll.id);
    emitPollsList(joinedEventId);
    // content: `質問: 選択肢1=3票 / 選択肢2=1票` の最終集計
    const counts = countsOf(record);
    const summary = record.poll.options.map((o, i) => `${o}=${counts[i]}票`).join(' / ');
    appendLog(joinedEventId, {
      at: Date.now(),
      type: 'アンケート締切',
      content: `${record.poll.question}: ${summary}`,
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

  socket.on('comment', (body, displayName, isAsciiArt) => {
    if (!joinedEventId) return;
    // AA は整列のため空白・改行を保持したサニタイズ、通常コメントは従来通り1行 trim
    const trimmed = isAsciiArt ? sanitizeAsciiArt(body) : body.trim().slice(0, 200);
    if (!trimmed) return;
    io.to(roomOf(joinedEventId)).emit('comment', {
      id: randomUUID(),
      eventId: joinedEventId,
      body: trimmed,
      displayName,
      isAsciiArt: isAsciiArt || undefined,
      at: Date.now(),
    });
    appendLog(joinedEventId, {
      at: Date.now(),
      type: isAsciiArt ? 'AA' : 'コメント',
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
    // 質問ストアを確保し、上限を超えていたら新規質問を無視する
    let records = eventQuestions.get(joinedEventId);
    if (!records) {
      records = [];
      eventQuestions.set(joinedEventId, records);
    }
    if (records.length >= QUESTION_LIMIT) return;
    const question: Question = {
      id: randomUUID(),
      eventId: joinedEventId,
      body: trimmedBody,
      displayName: trimmedName,
      at: Date.now(),
      status: 'new',
      likes: 0,
    };
    records.push({ question, likedBy: new Set() });
    // 参加者もいいねのために一覧を見られるよう、ルーム全体に配信する
    io.to(roomOf(joinedEventId)).emit('question', question);
    appendLog(joinedEventId, {
      at: question.at,
      type: '質問',
      content: trimmedBody,
      displayName: trimmedName,
    });
  });

  socket.on('likeQuestion', (questionId) => {
    if (!joinedEventId) return;
    const records = eventQuestions.get(joinedEventId);
    const record = records?.find((r) => r.question.id === questionId);
    if (!record) return;
    // トグル: 既に押していれば外す、なければ追加
    if (record.likedBy.has(socket.id)) {
      record.likedBy.delete(socket.id);
    } else {
      record.likedBy.add(socket.id);
    }
    record.question.likes = record.likedBy.size;
    // いいねはノイズになるため CSV ログには記録しない
    io.to(roomOf(joinedEventId)).emit('questionUpdated', record.question);
  });

  socket.on('triageQuestion', (questionId, status) => {
    // presenter / host のみ振り分け可
    if (!joinedEventId || (joinedRole !== 'presenter' && joinedRole !== 'host')) return;
    if (status !== 'new' && status !== 'now' && status !== 'later' && status !== 'offline' && status !== 'done') return;
    const records = eventQuestions.get(joinedEventId);
    const record = records?.find((r) => r.question.id === questionId);
    if (!record) return;
    record.question.status = status;
    io.to(roomOf(joinedEventId)).emit('questionUpdated', record.question);
    appendLog(joinedEventId, {
      at: Date.now(),
      type: '質問振り分け',
      content: `${record.question.body} → ${TRIAGE_LOG_LABEL[status]}`,
      displayName: record.question.displayName,
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

  socket.on('setQrVisible', (visible) => {
    if (!joinedEventId || joinedRole !== 'host') return;
    getEventSettings(joinedEventId).qrVisible = visible;
    // トグル操作はノイズになるため CSV ログには記録しない
    io.to(roomOf(joinedEventId)).emit('eventSettings', getEventSettings(joinedEventId));
  });

  socket.on('setSoundEnabled', (enabled) => {
    if (!joinedEventId || joinedRole !== 'host') return;
    getEventSettings(joinedEventId).soundEnabled = enabled;
    // トグル操作はノイズになるため CSV ログには記録しない
    io.to(roomOf(joinedEventId)).emit('eventSettings', getEventSettings(joinedEventId));
  });

  socket.on('setCommentFlow', (flow) => {
    if (!joinedEventId || joinedRole !== 'host') return;
    if (flow !== 'horizontal' && flow !== 'vertical') return;
    getEventSettings(joinedEventId).commentFlow = flow;
    // トグル操作はノイズになるため CSV ログには記録しない
    io.to(roomOf(joinedEventId)).emit('eventSettings', getEventSettings(joinedEventId));
  });

  socket.on('disconnect', async () => {
    if (!joinedEventId) return;
    const count = (await io.in(roomOf(joinedEventId)).fetchSockets()).length;
    io.to(roomOf(joinedEventId)).emit('participantCount', count);
  });
});

httpServer.listen(PORT, () => {
  console.log(`SparkPlug server listening on http://localhost:${PORT}`);
  if (HOST_SECRET_IS_DEFAULT) {
    console.warn(
      '[security] HOST_SECRET 未設定: 既定の開発用シークレットを使用中。' +
        '本番デプロイ前に必ず HOST_SECRET を設定すること（設定しないと host/presenter トークンが推測可能）。',
    );
  }
});
