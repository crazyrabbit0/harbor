import { useState } from "react";
import type { ThemeId } from "@/lib/player-chrome";
import { EditorOverlay } from "./editor-overlay";
import { editorOverlayProps, useLayoutEditor } from "./use-layout-editor";

/** The layout editor opened from the player, drawn over the playing video instead of a preview backdrop. */
export default function InPlayerLayoutEditor({
  theme: initialTheme,
  onClose,
}: {
  theme: ThemeId;
  onClose: () => void;
}) {
  const [theme, setTheme] = useState(initialTheme);
  const editor = useLayoutEditor(theme, setTheme);
  return (
    <EditorOverlay
      theme={theme}
      overVideo
      {...editorOverlayProps(editor)}
      onClose={async () => {
        if (await editor.confirmClose()) onClose();
      }}
    />
  );
}
