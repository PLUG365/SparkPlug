import type { SeKind } from '@sparkplug/shared';

/**
 * SE をすべて Web Audio API で合成再生するプレイヤー。音声ファイル不要。
 * ブラウザの自動再生制限のため、ユーザー操作を起点に enable() を呼ぶこと。
 */
export class SePlayer {
  private ctx: AudioContext | null = null;

  enable(): void {
    this.ctx ??= new AudioContext();
    void this.ctx.resume();
  }

  get enabled(): boolean {
    return this.ctx?.state === 'running';
  }

  play(kind: SeKind): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const t = ctx.currentTime;
    switch (kind) {
      case 'don': this.don(ctx, t); break;
      case 'ka': this.ka(ctx, t); break;
      case 'clap': this.clap(ctx, t); break;
      case 'drumroll': this.drumroll(ctx, t); break;
      case 'fanfare': this.fanfare(ctx, t); break;
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

  /** ドラムロール: 加速するスネア連打 */
  private drumroll(ctx: AudioContext, t: number): void {
    let at = t;
    let interval = 0.09;
    for (let i = 0; i < 20; i++) {
      this.noiseHit(ctx, at, { seconds: 0.07, filterType: 'bandpass', freq: 700, q: 0.9, gain: 0.4 });
      at += interval;
      interval = Math.max(0.035, interval * 0.93);
    }
    this.don(ctx, at + 0.05);
  }

  /** ファンファーレ: パンパカパーン */
  private fanfare(ctx: AudioContext, t: number): void {
    const note = (freq: number, at: number, dur: number, gain = 0.25) => {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.setValueAtTime(gain, at);
      g.gain.setValueAtTime(gain, at + dur * 0.7);
      g.gain.exponentialRampToValueAtTime(0.001, at + dur);
      osc.connect(g).connect(ctx.destination);
      osc.start(at);
      osc.stop(at + dur);
    };
    const C5 = 523.25, E5 = 659.25, G5 = 783.99, C6 = 1046.5;
    note(C5, t, 0.14);
    note(C5, t + 0.16, 0.1);
    note(C5, t + 0.28, 0.1);
    for (const f of [C5, E5, G5, C6]) note(f, t + 0.42, 0.7, 0.18);
  }
}

export const sePlayer = new SePlayer();
