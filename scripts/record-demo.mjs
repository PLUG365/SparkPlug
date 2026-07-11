// 会場スクリーン（/e/{eventId}/screen）を実際に開いてデモ動画を録画するスクリプト。
// getDisplayMedia を Canvas 製のプレゼンスライドに差し替えて「画面を共有」を実行し、
// その上に demo-seed のリアクション・コメント・AA・アンケートを重ねた様子を録画する。
//
// 使い方: node scripts/record-demo.mjs [eventId]
//   SERVER_URL   サーバーURL（既定 http://localhost:3001。web ビルドも同一オリジン配信していること）
//   OUTPUT_WEBM  録画の出力先（既定 /tmp/demo-raw.webm。エンコードは呼び出し側で行う）
// 前提: playwright がインストール済みで Chromium が利用可能なこと（CI: record-demo.yml 参照）
import { spawn } from 'node:child_process';
import { copyFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const eventId = process.argv[2] ?? 'demo';
const serverUrl = process.env.SERVER_URL ?? 'http://localhost:3001';
const outputWebm = process.env.OUTPUT_WEBM ?? '/tmp/demo-raw.webm';
const WIDTH = 1280;
const HEIGHT = 720;

// ページ読み込み前に getDisplayMedia を乗っ取り、Canvas に描いたスライドの映像ストリームを返す。
// スライドは2枚構成で、SLIDE_SWITCH_MS 経過後に2枚目（機能紹介）へ切り替わる。
const fakeDisplayMedia = `
  const SLIDE_SWITCH_MS = 9000;
  navigator.mediaDevices.getDisplayMedia = async () => {
    const canvas = document.createElement('canvas');
    canvas.width = ${WIDTH};
    canvas.height = ${HEIGHT};
    const ctx = canvas.getContext('2d');
    const start = performance.now();
    const JP = '"Noto Sans CJK JP", "Noto Sans JP", sans-serif';

    function frame(x, y, w, h) {
      ctx.fillStyle = '#fafafa';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#d0342c';
      ctx.fillRect(0, 0, canvas.width, 10);
      ctx.fillStyle = '#f5c400';
      ctx.fillRect(0, 10, canvas.width, 4);
      ctx.fillStyle = '#999';
      ctx.font = '20px ' + JP;
      ctx.textAlign = 'left';
      ctx.fillText('PLUG Community Meetup', 48, 690);
    }

    function wordmark(cx, cy, size) {
      ctx.textAlign = 'center';
      ctx.font = 'bold ' + size + 'px ' + JP;
      const sparkW = ctx.measureText('Spark').width;
      const boltW = ctx.measureText('⚡').width;
      const plugW = ctx.measureText('Plug').width;
      const total = sparkW + boltW + plugW;
      let x = cx - total / 2;
      ctx.textAlign = 'left';
      ctx.fillStyle = '#1a1a1a';
      ctx.fillText('Spark', x, cy);
      x += sparkW;
      ctx.fillStyle = '#f5a300';
      ctx.fillText('⚡', x, cy);
      x += boltW;
      ctx.fillStyle = '#d0342c';
      ctx.fillText('Plug', x, cy);
    }

    function slide1() {
      frame();
      wordmark(640, 320, 96);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#1a1a1a';
      ctx.font = 'bold 42px ' + JP;
      ctx.fillText('コミュニティイベントを、もっと熱く。', 640, 420);
      ctx.fillStyle = '#666';
      ctx.font = '26px ' + JP;
      ctx.fillText('リアルタイム盛り上げ + 振り返りアプリ', 640, 470);
      ctx.font = '20px ' + JP;
      ctx.fillStyle = '#999';
      ctx.textAlign = 'right';
      ctx.fillText('1 / 2', 1232, 690);
    }

    function slide2() {
      frame();
      ctx.textAlign = 'left';
      ctx.fillStyle = '#1a1a1a';
      ctx.font = 'bold 48px ' + JP;
      ctx.fillText('3つの機能軸', 96, 130);
      ctx.fillStyle = '#d0342c';
      ctx.fillRect(96, 152, 268, 6);
      const rows = [
        ['🔥', '盛り上げ', 'コメント流し・リアクション爆発・効果音'],
        ['🎤', '拾い上げ', 'アンケート・投票・質問トリアージ'],
        ['📊', '振り返り', 'ログCSVエクスポート → AI分析'],
      ];
      rows.forEach(([emoji, title, desc], i) => {
        const y = 250 + i * 130;
        ctx.font = '56px ' + JP;
        ctx.fillStyle = '#1a1a1a';
        ctx.fillText(emoji, 110, y + 18);
        ctx.font = 'bold 38px ' + JP;
        ctx.fillText(title, 210, y);
        ctx.font = '26px ' + JP;
        ctx.fillStyle = '#666';
        ctx.fillText(desc, 210, y + 42);
      });
      ctx.font = '20px ' + JP;
      ctx.fillStyle = '#999';
      ctx.textAlign = 'right';
      ctx.fillText('2 / 2', 1232, 690);
    }

    function draw() {
      if (performance.now() - start < SLIDE_SWITCH_MS) slide1();
      else slide2();
    }
    draw();
    setInterval(draw, 100);
    return canvas.captureStream(15);
  };
`;

function runDemoSeed() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['scripts/demo-seed.mjs', eventId], {
      stdio: 'inherit',
      env: { ...process.env, SERVER_URL: serverUrl },
    });
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`demo-seed exited with ${code}`))));
    child.on('error', reject);
  });
}

async function main() {
  const videoDir = '/tmp/record-demo-video';
  await mkdir(videoDir, { recursive: true });

  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: WIDTH, height: HEIGHT },
    recordVideo: { dir: videoDir, size: { width: WIDTH, height: HEIGHT } },
  });
  const page = await context.newPage();
  await page.addInitScript(fakeDisplayMedia);

  console.log(`[record-demo] open ${serverUrl}/e/${eventId}/screen`);
  await page.goto(`${serverUrl}/e/${eventId}/screen`);
  await page.getByText('人が参加中').waitFor({ timeout: 15000 });

  // 「画面を共有」→ 偽の getDisplayMedia がスライド映像を返し、背景に敷かれる
  await page.getByRole('button', { name: '画面を共有' }).click();
  await page.getByRole('button', { name: '共有を終了' }).waitFor();
  // 録画に操作ボタンが映り込まないよう、左下のコントロール一帯を隠す
  await page.evaluate(() => {
    for (const b of document.querySelectorAll('button')) {
      if (b.textContent.includes('共有を終了')) b.closest('div').style.visibility = 'hidden';
    }
  });

  // スライドだけの状態を少し見せてから、リアクション・コメント・アンケートを流し込む
  await page.waitForTimeout(1500);
  console.log('[record-demo] run demo-seed');
  await runDemoSeed();
  // 流し終わったコメントが画面を渡りきり、アンケート結果が見えている余韻を録る
  await page.waitForTimeout(6000);

  const video = page.video();
  await context.close();
  await browser.close();
  const recorded = await video.path();
  await mkdir(path.dirname(outputWebm), { recursive: true });
  await copyFile(recorded, outputWebm);
  console.log(`[record-demo] saved ${outputWebm}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
