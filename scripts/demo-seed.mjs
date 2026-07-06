// デモ・スクリーンショット撮影用に、リアクション連打・コメント流し・AA・アンケートを
// まとめて1イベントに流し込むスクリプト。実際の参加者UIは一切経由せず、
// socket.io-client で直接サーバーに接続してイベントを発火する。
//
// 使い方: npm run demo:seed -- <eventId>
//   例: npm run demo:seed -- demo
//   SERVER_URL 環境変数でサーバーのURLを上書き可能（既定 http://localhost:3001）
import { io } from 'socket.io-client';

const eventId = process.argv[2] ?? 'demo';
const serverUrl = process.env.SERVER_URL ?? 'http://localhost:3001';

const REACTION_KINDS = ['like', 'laugh', 'heart', 'surprise'];
const COMMENT_BODIES = ['盛り上がってきた！', 'これめっちゃいい', 'なるほどねー', 'すごい', 'いいね〜', '勉強になる', '次も見たい'];
const COMMENT_NAMES = ['ミノ', 'ハセ', 'アキラ', 'ユホ', 'タロウ'];
const AA = '  ∧,,∧\n (,,・∀・)\n  ⊂　　>\n  (＿＿）';
// アンケートの投票内訳（0/1/2 が選択肢のindex）。伸び方に差が出るよう偏りを持たせている
const POLL_VOTE_PATTERN = [0, 1, 0, 2, 1, 0, 1, 0, 2, 1, 0, 1];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function connect(role) {
  return new Promise((resolve) => {
    const socket = io(serverUrl);
    socket.on('connect', () => {
      socket.emit('join', { eventId, role });
      resolve(socket);
    });
  });
}

/** リアクションを100msごとに2発、25回（計50発）まとめて撃つ */
async function fireReactions(audiences) {
  for (let i = 0; i < 25; i++) {
    for (let k = 0; k < 2; k++) {
      const kind = REACTION_KINDS[Math.floor(Math.random() * REACTION_KINDS.length)];
      audiences[(i + k) % audiences.length].emit('reaction', kind);
    }
    await sleep(100);
  }
}

/** コメントを280ms間隔で1件ずつ流す */
async function fireComments(audiences) {
  for (let i = 0; i < COMMENT_BODIES.length; i++) {
    audiences[i % audiences.length].emit('comment', COMMENT_BODIES[i], COMMENT_NAMES[i % COMMENT_NAMES.length]);
    await sleep(280);
  }
}

/** AAコメントを1件流す */
function fireAsciiArt(audiences) {
  audiences[0].emit('comment', AA, 'ミノ', true);
}

/** アンケートを新規作成→開始→投票を少しずつ流し込み→締切、まで一気通貫でやる */
async function firePoll(host) {
  const question = `デモ用アンケート ${Date.now()}`;
  const pollId = await new Promise((resolve) => {
    const onPolls = (list) => {
      const draft = list.find((p) => p.status === 'draft' && p.question === question);
      if (draft) {
        host.off('polls', onPolls);
        resolve(draft.id);
      }
    };
    host.on('polls', onPolls);
    host.emit('createPoll', question, ['盛り上がる', 'めっちゃ盛り上がる', '最高']);
  });

  host.emit('startPoll', pollId);
  await sleep(600); // 開始直後の0%状態を少し見せてから投票を流し始める

  for (const optionIndex of POLL_VOTE_PATTERN) {
    const voter = await connect('audience');
    await sleep(80);
    voter.emit('vote', pollId, optionIndex);
    await sleep(350); // 棒グラフが1本ずつ伸びるのが見えるよう間隔をあける
    voter.disconnect();
  }

  host.emit('closePoll', pollId);
}

async function main() {
  console.log(`[demo-seed] event=${eventId} server=${serverUrl}`);
  const audiences = await Promise.all([1, 2, 3, 4, 5].map(() => connect('audience')));
  const host = await connect('host');
  console.log('[demo-seed] 接続完了。リアクション + コメント + AA + アンケートを同時に流します…');

  await Promise.all([
    fireReactions(audiences),
    fireComments(audiences),
    Promise.resolve(fireAsciiArt(audiences)),
    firePoll(host),
  ]);

  console.log('[demo-seed] 完了。切断します。');
  for (const s of audiences) s.disconnect();
  host.disconnect();
  process.exit(0);
}

main();
