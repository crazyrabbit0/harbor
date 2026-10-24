import { useCallback, useEffect, useState } from "react";
import { confirmDialog } from "@/lib/dialog";
import { type ThemeId, type TimeFormat, type VolumeStyle } from "@/lib/player-chrome";
import { useSettings } from "@/lib/settings";
import { resolveChromeTheme } from "@/lib/theme";
import { sameConfig } from "./config-helpers";
import { EditorOverlay } from "./editor-overlay";
import { OptionsSection } from "./options-section";
import { EditLayoutCard, ThemeTabs, usePlayerLayoutPageActions } from "./panel-bars";
import { editorOverlayProps, useLayoutEditor } from "./use-layout-editor";
import { AdvisoryPreview } from "./advisory-preview";
import { AdvisoryIgnoreRow } from "./advisory-ignore-row";
import { SeekBarPanel } from "../player-panel";
import { FullscreenClockSettings } from "../theme-panel/fullscreen-clock-settings";
import { Section, Segmented, ToggleRow } from "../shared";
import { pushActivityHint } from "@/lib/discord/activity-hint";
import { useT } from "@/lib/i18n";
import { CONTENT_ADVISORY_NUDGE, useOnboarding } from "@/lib/onboarding";

function themeIdFromSettings(settings: ReturnType<typeof useSettings>["settings"]): ThemeId {
  return resolveChromeTheme(settings.theme, settings.playerChromeTheme);
}

export function PlayerLayoutPanel() {
  const t = useT();
  const { settings, update } = useSettings();
  const { dismiss } = useOnboarding();
  const appTheme = themeIdFromSettings(settings);
  const [theme, setTheme] = useState<ThemeId>(appTheme);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const editor = useLayoutEditor(theme, setTheme);
  const { draft, setDraft, saved, dirty, justSaved, profiles, activeProfileId } = editor;

  useEffect(() => {
    setConfirmingReset(false);
  }, [theme]);

  useEffect(() => {
    setTheme(appTheme);
  }, [appTheme]);

  useEffect(() => {
    return pushActivityHint({
      details: editorOpen ? t("Designing the player layout") : t("Customizing the player"),
      state: t("Player layout"),
    });
  }, [editorOpen]);

  useEffect(() => {
    if (!confirmingReset) return;
    const id = window.setTimeout(() => setConfirmingReset(false), 4000);
    return () => window.clearTimeout(id);
  }, [confirmingReset]);

  const onSave = editor.onSave;
  const onDiscard = editor.discard;
  const { resetAll } = editor;
  const onResetAll = useCallback(() => {
    if (!confirmingReset) {
      setConfirmingReset(true);
      return;
    }
    resetAll();
    setConfirmingReset(false);
  }, [confirmingReset, resetAll]);

  const visibleCount = draft.controls.filter((c) => !c.hidden).length;
  const hiddenCount = draft.controls.length - visibleCount;

  usePlayerLayoutPageActions({
    dirty,
    justSaved,
    confirmingReset,
    onSave,
    onDiscard,
    onResetAll,
  });

  return (
    <div className="flex flex-col gap-10">
      <Section
        title={t("Player layout")}
        subtitle={t(
          "The button set your layout is built on. Your customizations are kept separately for each style.",
        )}
      >
        <EditLayoutCard
          theme={theme}
          config={draft}
          visibleCount={visibleCount}
          hiddenCount={hiddenCount}
          activeProfileName={profiles.find((p) => p.id === activeProfileId)?.name ?? null}
          onOpen={() => setEditorOpen(true)}
        />
        <ThemeTabs
          value={theme}
          onChange={async (id) => {
            if (id === theme) return;
            if (!sameConfig(draft, saved)) {
              const ok = await confirmDialog(
                t(
                  "You have unsaved changes that will be lost when switching player styles. Continue?",
                ),
              );
              if (!ok) return;
            }
            update({ playerChromeTheme: id });
            setTheme(id);
          }}
        />
        <ToggleRow
          label={t("True black menus")}
          sub={t("Force player menus and panels to pure black, ignoring your theme tint.")}
          value={settings.playerMenuBlack}
          onChange={(v) => update({ playerMenuBlack: v })}
        />
        <ToggleRow
          label={t("Player screen lock")}
          sub={t(
            "Show a lock control in the player that blocks mouse, keyboard, remote, and media-key input until you unlock it.",
          )}
          value={settings.playerScreenLockEnabled}
          onChange={(v) => update({ playerScreenLockEnabled: v })}
        />
      </Section>

      <Section
        title={t("Control bar")}
        subtitle={t("How the on-screen controls read while you watch.")}
      >
        <OptionsSection
          config={draft}
          theme={theme}
          onTimeFormat={(v: TimeFormat) =>
            setDraft((cur) => ({ ...cur, options: { ...cur.options, timeFormat: v } }))
          }
          onVolumeStyle={(v: VolumeStyle) =>
            setDraft((cur) => ({ ...cur, options: { ...cur.options, volumeStyle: v } }))
          }
        />
      </Section>

      <Section
        title={t("While you watch")}
        subtitle={t("Optional overlays that appear over the video.")}
      >
        <ToggleRow
          label={t("Show P2P status chip")}
          sub={t(
            "Peers, speed and progress on the player while a P2P stream plays. Sits top left, clear of the exit button.",
          )}
          value={settings.playerP2pChip}
          onChange={(v) => update({ playerP2pChip: v })}
        />
        <ToggleRow
          label={t("Content advisory on start")}
          sub={t(
            "When a movie or episode starts, briefly show its IMDb parental guide (violence, profanity, substances, frightening scenes and more) with severity. Fades on its own.",
          )}
          value={settings.contentAdvisoryToast}
          onChange={(v) => {
            dismiss(CONTENT_ADVISORY_NUDGE);
            update({ contentAdvisoryToast: v });
          }}
          preview={<AdvisoryPreview />}
        />
        {settings.contentAdvisoryToast && (
          <Segmented
            label={t("Content advisory theme")}
            sub={t(
              "Choose whether the content advisory appears in full color or a restrained monochrome tone.",
            )}
            value={settings.contentAdvisoryTheme}
            options={[
              { value: "colored", label: t("Colored") },
              { value: "monochrome", label: t("Monochrome") },
            ]}
            onChange={(v) => update({ contentAdvisoryTheme: v })}
          />
        )}
        {settings.contentAdvisoryToast && (
          <ToggleRow
            label={t("Show ignore title button")}
            sub={t(
              "Display a button on the content advisory card to permanently ignore the title.",
            )}
            value={settings.contentAdvisoryShowIgnore}
            onChange={(v) => update({ contentAdvisoryShowIgnore: v })}
          />
        )}
        {settings.contentAdvisoryToast && settings.contentAdvisoryShowIgnore && (
          <AdvisoryIgnoreRow
            featureOn={settings.contentAdvisoryToast && settings.contentAdvisoryShowIgnore}
          />
        )}
      </Section>

      <Section
        title={t("Fullscreen clock")}
        subtitle={t(
          "Keep your local time visible during fullscreen playback and choose how it looks.",
        )}
      >
        <FullscreenClockSettings />
      </Section>

      <Section
        title={t("Seek bar")}
        subtitle={t(
          "Style the timeline at the bottom of the player. Swap the dot for a sticker, change the bar height, recolor it. Settings live-preview right here.",
        )}
        newId="playerLayout:seek-bar"
      >
        <SeekBarPanel />
      </Section>

      {editorOpen && (
        <EditorOverlay
          theme={theme}
          {...editorOverlayProps(editor)}
          onClose={async () => {
            if (await editor.confirmClose()) setEditorOpen(false);
          }}
        />
      )}
    </div>
  );
}
