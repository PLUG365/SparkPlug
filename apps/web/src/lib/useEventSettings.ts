import { useEffect, useState } from 'react';
import type { EventSettings } from '@sparkplug/shared';
import type { SparkPlugSocket } from './socket';

/**
 * イベントごとのスクリーン設定をリアルタイム購読するフック。
 * join 時の同期・host のトグル操作（eventSettings）を反映する。
 * 初期値は既定 ON（join 同期が届く前でもデフォルトONの見た目になるように）。
 */
export function useEventSettings(socket: SparkPlugSocket | null): EventSettings {
  const [settings, setSettings] = useState<EventSettings>({ qrVisible: true, soundEnabled: true });

  useEffect(() => {
    if (!socket) return;
    const onSettings = (s: EventSettings) => setSettings(s);
    socket.on('eventSettings', onSettings);
    return () => {
      socket.off('eventSettings', onSettings);
    };
  }, [socket]);

  return settings;
}
