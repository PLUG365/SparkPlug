import type { SeKind } from '@sparkplug/shared';

/**
 * ファイル素材がある SE。無いものは Web Audio API 合成にフォールバックする。
 * mp3 は OtoLogic (https://otologic.jp/) の CC BY 4.0 素材。クレジットは README 参照。
 */
const SE_FILES: Partial<Record<SeKind, string>> = {
  don: '/se/don.mp3',
  ka: '/se/ka.mp3',
  clap: '/se/clap.mp3',
};

/**
 * SE プレイヤー。public/se/ にファイルがある音はそれを再生し、
 * 無い音（drumroll / fanfare）は Web Audio API で合成する。
 * ブラウザの自動再生制限のため、ユーザー操作を起点に enable() を呼ぶこと。
 */
export class SePlayer {
  private ctx: AudioContext | null = null;
  private buffers = new Map<SeKind, AudioBuffer>();

  enable(): void {
    this.ctx ??= new AudioContext();
    void this.ctx.resume();
    void this.preload();
  }

  get enabled(): boolean {
    return this.ctx?.state === 'running';
  }

  private async preload(): Promise<void> {
    const ctx = this.ctx;
    if (!ctx) return;
    await Promise.all(
      (Object.entries(SE_FILES) as [SeKind, string][]).map(async ([kind, url]) => {
        if (this.buffers.has(kind)) return;
        try {
          const res = await fetch(url);
          if (!res.ok) return;
          const buf = await ctx.decodeAudioData(await res.arrayBuffer());
          this.buffers.set(kind, buf);
        } catch {
          // 取得失敗時は合成フォールバックに任せる
        }
      }),
    );
  }

  play(kind: SeKind): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const buffer = this.buffers.get(kind);
    if (buffer) {
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(ctx.destination);
      src.start();
      return;
    }
    const t = ctx.currentTime;
    switch (kind) {
      case 'don': this.don(ctx, t); break;
      case 'ka': this.ka(ctx, t); break;
      case 'clap': this.clap(ctx, t); break;
    }
  }

  private noiseBuffer(ctx: AudioContext, seconds: number): AudioBuffer {
    const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * seconds), ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  private noiseHit(
    ctx: AudioContext, at: number,
    { seconds, filterType, freq, q, gain }: {
      seconds: number; filterType: BiquadFilterType; freq: number; q: number; gain: number;
    },
  ): void {
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer(ctx, seconds);
    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = freq;
    filter.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, at);
    g.gain.exponentialRampToValueAtTime(0.001, at + seconds);
    src.connect(filter).connect(g).connect(ctx.destination);
    src.start(at);
  }

  /** 太鼓「ドン」: 低域サイン波のピッチ落ち + 皮鳴りノイズ */
  private don(ctx: AudioContext, t: number): void {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(140, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.22);
    const g = ctx.createGain();
    g.gain.setValueAtTime(1.0, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    osc.connect(g).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.4);
    this.noiseHit(ctx, t, { seconds: 0.08, filterType: 'lowpass', freq: 220, q: 0.8, gain: 0.5 });
  }

  /** 太鼓のフチ「カッ」: 高域ノイズの短いクリック */
  private ka(ctx: AudioContext, t: number): void {
    this.noiseHit(ctx, t, { seconds: 0.06, filterType: 'highpass', freq: 2200, q: 1.2, gain: 0.7 });
  }

  /** 拍手: 帯域ノイズの三連バースト */
  private clap(ctx: AudioContext, t: number): void {
    for (const dt of [0, 0.025, 0.055]) {
      this.noiseHit(ctx, t + dt, { seconds: 0.14, filterType: 'bandpass', freq: 1500, q: 1.0, gain: 0.55 });
    }
  }

}

export const sePlayer = new SePlayer();
