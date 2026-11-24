import { useCallback, useEffect, useState } from "react";
import { currentAuthor, subscribeAuthor } from "@/lib/theme-auth";
import {
  listNotifications,
  markNotificationsRead,
  type ThemeNotification,
} from "@/lib/theme-store";

export function useNotifications() {
  const [items, setItems] = useState<ThemeNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(() => !!currentAuthor());
  const [authed, setAuthed] = useState(!!currentAuthor());
  const [prevAuthed, setPrevAuthed] = useState(authed);
  if (prevAuthed !== authed) {
    setPrevAuthed(authed);
    if (!authed) {
      setItems([]);
      setUnread(0);
      setLoading(false);
    } else {
      setLoading(true);
    }
  }

  useEffect(() => subscribeAuthor(() => setAuthed(!!currentAuthor())), []);

  const refresh = useCallback(async () => {
    if (!currentAuthor()) {
      setItems([]);
      setUnread(0);
      return;
    }
    setLoading(true);
    await listNotifications()
      .then((d) => {
        setItems(d.notifications);
        setUnread(d.unread);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!authed) return;
    let cancelled = false;
    void listNotifications()
      .then((d) => {
        if (cancelled) return;
        setItems(d.notifications);
        setUnread(d.unread);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    const iv = window.setInterval(() => {
      if (document.hidden) return;
      void refresh();
    }, 60000);
    const onVis = () => {
      if (!document.hidden) void refresh();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelled = true;
      window.clearInterval(iv);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [authed, refresh]);

  const markAllRead = async () => {
    if (!unread) return;
    setUnread(0);
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    await markNotificationsRead().catch(() => {});
  };

  return { items, unread, loading, authed, refresh, markAllRead };
}
