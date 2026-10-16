import { useEffect } from 'react';

const APP = 'Glasshouse';

/** The browser tab says where you are ("Server room A · Network · Glasshouse"); no title is just the app. */
export function useDocumentTitle(title: string | null): void {
  useEffect(() => {
    document.title = title ? `${title} · ${APP}` : APP;
  }, [title]);
}
