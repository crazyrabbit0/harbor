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
  const [loading, setLoading] = useState(false);
  const [authed, setAuthed] = useState(!!currentAuthor());

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
    if (!authed) {
      setItems([]);
      setUnread(0);
      return;
    }
    refresh();
    const iv = window.setInterval(() => {
      if (document.hidden) return;
      refresh();
    }, 60000);
    const onVis = () => {
      if (!document.hidden) refresh();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearInterval(iv);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [authed, refresh]);

  const markAllRead = useCallback(async () => {
    if (!unread) return;
    setUnread(0);
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    await markNotificationsRead().catch(() => {});
  }, [unread]);

  return { items, unread, loading, authed, refresh, markAllRead };
}
