import type { CSSProperties } from 'react';

/**
 * 「陽気なフェス系」共有スタイル定数。
 * 見た目の重複を避けるため、各ビューはここの色・スタイル関数を使う。
 * ※ここに書くのは style 値のみ。ロジックは持たない。
 */

/** ブランドカラー */
export const BRAND = {
  black: '#1a1a1a',
  lime: '#cddc29',
  red: '#d0342c',
  yellow: '#f5c400',
} as const;

/** 黒地・白文字・角丸14pxのヘッダーバー */
export const headerBarStyle: CSSProperties = {
  background: BRAND.black,
  color: '#fff',
  padding: '0.7rem 1rem',
  borderRadius: 14,
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
};

/**
 * 参加者数などに使うピルバッジ。
 * active=true は黄緑地・黒文字、false（未接続時）はグレー地・薄い文字。
 */
export function pillBadgeStyle(active: boolean): CSSProperties {
  return {
    display: 'inline-block',
    borderRadius: 999,
    padding: '0.15rem 0.7rem',
    fontSize: '0.75rem',
    fontWeight: 600,
    whiteSpace: 'nowrap',
    background: active ? BRAND.lime : '#555',
    color: active ? BRAND.black : '#ddd',
  };
}

/**
 * 送信・開始などの主要CTAボタン用のピル型スタイル。
 * デフォルトは赤地・白太字。color で背景色を差し替え可能。
 * 黄緑・黄地は明るく白文字だとコントラスト不足になるため、その場合は自動的に黒文字にする。
 * disabled 時はグレー地・カーソル既定。
 */
export function pillButtonStyle(opts: { disabled?: boolean; color?: string } = {}): CSSProperties {
  const { disabled = false, color = BRAND.red } = opts;
  const lightBackgrounds: string[] = [BRAND.lime, BRAND.yellow];
  const textColor = lightBackgrounds.includes(color) ? BRAND.black : '#fff';
  return {
    borderRadius: 999,
    border: 'none',
    fontWeight: 700,
    padding: '0.5rem 1.2rem',
    background: disabled ? '#ccc' : color,
    color: disabled ? '#666' : textColor,
    cursor: disabled ? 'default' : 'pointer',
  };
}

/**
 * リアクション/SE用の円形・太さ3px縁取りボタン。
 * borderColor で縁の色、size で直径（px）を指定（既定52px）。
 */
export function circleButtonStyle(borderColor: string, size = 52): CSSProperties {
  return {
    width: size,
    height: size,
    borderRadius: '50%',
    border: `3px solid ${borderColor}`,
    background: '#fff',
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
    lineHeight: 1,
  };
}
