import { useEffect, useState } from "react";
import { t } from "@/lib/i18n";
import { deleteComment, listComments, postComment, type ThemeComment } from "@/lib/theme-store";

export function useComments(themeId: string) {
  const [comments, setComments] = useState<ThemeComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [prevThemeId, setPrevThemeId] = useState(themeId);
  if (prevThemeId !== themeId) {
    setPrevThemeId(themeId);
    setComments([]);
    setLoading(true);
    setError(null);
  }

  useEffect(() => {
    let cancelled = false;
    listComments(themeId)
      .then((c) => !cancelled && setComments(c))
      .catch(
        (e) =>
          !cancelled && setError(e instanceof Error ? e.message : t("Could not load comments.")),
      )
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [themeId]);

  const add = async (body: string, parentId?: string) => {
    const c = await postComment(themeId, body, parentId);
    setComments((prev) => [c, ...prev.filter((x) => x.id !== c.id)]);
  };

  const remove = async (id: string) => {
    const prev = comments;
    setComments((cur) => cur.filter((c) => c.id !== id));
    try {
      await deleteComment(themeId, id);
    } catch (e) {
      setComments(prev);
      throw e;
    }
  };

  return { comments, loading, error, add, remove };
}
