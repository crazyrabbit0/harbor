import { invoke } from "@tauri-apps/api/core";
import { useEffect, useRef, useState } from "react";
import { t } from "@/lib/i18n";
import {
  captureBaseTitle,
  captureDir,
  captureDirLabel,
  formatStamp,
  joinPath,
  safeName,
} from "@/lib/player/capture-path";
import type { FrameGrabToast } from "./use-frame-grab";
import type { PlayerSrc } from "@/lib/view";

const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export function useClipRecorder(params: { src: PlayerSrc; seconds: number; folder?: string }): {
  saving: boolean;
  chooserOpen: boolean;
  toast: FrameGrabToast | null;
  openChooser: () => void;
  closeChooser: () => void;
  saveClip: (withSubs: boolean) => void;
} {
  const { src, seconds, folder } = params;
  const [saving, setSaving] = useState(false);
  const [chooserOpen, setChooserOpen] = useState(false);
  const [toast, setToast] = useState<FrameGrabToast | null>(null);
  const busyRef = useRef(false);
  const dismissRef = useRef<number | null>(null);

  const openChooser = () => {
    if (busyRef.current) return;
    setChooserOpen((o) => !o);
  };
  const closeChooser = () => setChooserOpen(false);

  const saveClip = async (withSubs: boolean) => {
    setChooserOpen(false);
    if (!isTauri || busyRef.current) return;
    busyRef.current = true;
    setSaving(true);
    if (dismissRef.current) window.clearTimeout(dismissRef.current);
    setToast({ id: Date.now(), kind: "busy", text: t("Saving clip…") });
    const work = async () => {
      const filename = `${safeName(captureBaseTitle(src))} - ${formatStamp(new Date())}.mp4`;
      const dir = await captureDir(folder);
      const outPath = dir ? await joinPath(dir, filename) : filename;
      const result = await invoke<{ path: string; duration: number }>("mpv_clip_save", {
        withSubs,
        beforeSec: seconds,
        outPath,
      });
      setToast({
        id: Date.now(),
        kind: "ok",
        text: t("Clip saved to {path}", { path: captureDirLabel(dir, folder) }),
        path: result.path,
      });
    };
    await work()
      .then(
        () => {},
        (e) => {
          setToast({
            id: Date.now(),
            kind: "error",
            text: typeof e === "string" ? e : t("Clip save failed"),
          });
        },
      )
      .finally(() => {
        setSaving(false);
        busyRef.current = false;
        dismissRef.current = window.setTimeout(() => setToast(null), 6000);
      });
  };

  useEffect(
    () => () => {
      if (dismissRef.current) window.clearTimeout(dismissRef.current);
    },
    [],
  );

  return { saving, chooserOpen, toast, openChooser, closeChooser, saveClip };
}
