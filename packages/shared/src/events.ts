/** イベント参加者のロール。4つのビューに対応する。 */
export type Role = 'host' | 'presenter' | 'audience' | 'screen';

/** 参加者が送るリアクションの種類。MVPでは絵文字ベース。 */
export type ReactionKind = 'clap' | 'fire' | 'laugh' | 'heart' | 'surprise';

export interface Reaction {
  kind: ReactionKind;
  /** イベント（ルーム）ID */
  eventId: string;
  /** サーバーが付与するタイムスタンプ (epoch ms) */
  at: number;
}

/** SE（効果音）の種類。会場スクリーン側で Web Audio API により合成再生される。 */
export type SeKind = 'don' | 'ka' | 'clap' | 'drumroll' | 'fanfare';

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

export interface JoinPayload {
  eventId: string;
  role: Role;
}

/** クライアント → サーバー */
export interface ClientToServerEvents {
  join: (payload: JoinPayload) => void;
  reaction: (kind: ReactionKind) => void;
  comment: (body: string, displayName?: string) => void;
  se: (kind: SeKind) => void;
}

/** サーバー → クライアント */
export interface ServerToClientEvents {
  joined: (payload: { eventId: string; participantCount: number }) => void;
  reaction: (reaction: Reaction) => void;
  comment: (comment: ChatComment) => void;
  se: (se: Se) => void;
  participantCount: (count: number) => void;
}
