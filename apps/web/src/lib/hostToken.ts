import { useEffect, useState } from 'react';

/**
 * 特権ロール（host / presenter）用のトークンを URL の ?t= から一度だけ読み取るフック。
 * 読み取り後は履歴からクエリを取り除く（画面共有・履歴・ログ経由の漏洩を軽減）。
 * 取得値は state に保持したまま join に使う。
 */
export function useHostToken(): string | undefined {
  const [token] = useState<string | undefined>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('t') ?? undefined;
  });

  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.has('t')) {
      url.searchParams.delete('t');
      window.history.replaceState({}, '', url.pathname + url.search + url.hash);
    }
  }, []);

  return token;
}
