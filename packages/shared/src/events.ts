/** イベント参加者のロール。4つのビューに対応する。 */
export type Role = 'host' | 'presenter' | 'audience' | 'screen';

/** 参加者が送るリアクションの種類。MVPでは絵文字ベース。 */
export type ReactionKind = 'clap' | 'laugh' | 'heart' | 'surprise';

export interface Reaction {
  kind: ReactionKind;
  /** イベント（ルーム）ID */
  eventId: string;
  /** サーバーが付与するタイムスタンプ (epoch ms) */
  at: number;
}

/** SE（効果音）の種類。会場スクリーン側で再生される。 */
export type SeKind = 'don' | 'ka' | 'clap';

export interface Se {
  kind: SeKind;
  eventId: string;
  at: number;
}

export interface ChatComment {
  id: string;
  eventId: string;
  body: string;
  /** 匿名可。表示名を選んだ場合のみ入る */
  displayName?: string;
  at: number;
}

/** 質問のトリアージ状態。new=新着 / now=今答える / later=後で / offline=後日回答 / done=回答済み */
export type QuestionStatus = 'new' | 'now' | 'later' | 'offline' | 'done';

/** 参加者から発表者への質問。表示名は必須 */
export interface Question {
  id: string;
  eventId: string;
  body: string;
  /** 質問には表示名が必須 */
  displayName: string;
  at: number;
  /** トリアージ状態。初期値は 'new' */
  status: QuestionStatus;
  /** いいね数（1接続1票） */
  likes: number;
}

/** アンケートの状態。draft=下書き（未開始） / open=実施中 / closed=締切済み */
export type PollStatus = 'draft' | 'open' | 'closed';

/** 選択式アンケート。事前に複数下書きを作り、好きなタイミングで開始できる。 */
export interface Poll {
  id: string;
  eventId: string;
  question: string;
  options: string[];
  status: PollStatus;
  at: number;
}

export interface JoinPayload {
  eventId: string;
  role: Role;
}

/** クライアント → サーバー */
export interface ClientToServerEvents {
  join: (payload: JoinPayload) => void;
  reaction: (kind: ReactionKind) => void;
  comment: (body: string, displayName?: string) => void;
  /** 発表者に届く質問。表示名は必須 */
  question: (body: string, displayName: string) => void;
  /** 質問へのいいね。1接続1票のトグル */
  likeQuestion: (questionId: string) => void;
  /** 質問のトリアージ振り分け。presenter / host のみ */
  triageQuestion: (questionId: string, status: QuestionStatus) => void;
  se: (kind: SeKind) => void;
  /** host ロールのみ。下書き（status='draft'）として作成するだけで、開始はしない */
  createPoll: (question: string, options: string[]) => void;
  /** host ロールのみ。下書きを開始する。実施中の別アンケートがあれば自動的に締め切られる */
  startPoll: (pollId: string) => void;
  /** host ロールのみ。指定した実施中アンケートを締め切る */
  closePoll: (pollId: string) => void;
  /** 投票し直し可（同一接続の最後の投票が有効） */
  vote: (pollId: string, optionIndex: number) => void;
}

/** サーバー → クライアント */
export interface ServerToClientEvents {
  joined: (payload: { eventId: string; participantCount: number }) => void;
  reaction: (reaction: Reaction) => void;
  comment: (comment: ChatComment) => void;
  /** ルーム全体に配信される質問（表示名付き） */
  question: (question: Question) => void;
  /** いいね数・ステータス変更の通知 */
  questionUpdated: (question: Question) => void;
  /** join 時の質問一覧の一括同期 */
  questions: (questions: Question[]) => void;
  se: (se: Se) => void;
  participantCount: (count: number) => void;
  /** アンケート開始（startPoll 実行時にのみ room 全体へ配信。途中参加者には join 時に現状が送られる） */
  poll: (poll: Poll) => void;
  pollResults: (pollId: string, counts: number[], total: number) => void;
  pollClosed: (pollId: string) => void;
  /** 全アンケート一覧（下書き・実施中・締切済み）。host ロールにのみ配信 */
  polls: (polls: Poll[]) => void;
}
