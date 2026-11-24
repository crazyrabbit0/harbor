import { useCallback, useEffect, useState } from "react";
import { alertDialog, confirmDialog } from "@/lib/dialog";
import {
  notifyPlayerChromeChanged,
  readPlayerChromeConfig,
  resetPlayerChromeConfig,
  writePlayerChromeConfig,
  type PanelId,
  type PlayerChromeConfig,
  type PlayerControlId,
  type ThemeId,
} from "@/lib/player-chrome";
import {
  createProfile,
  deleteProfile as deleteProfileApi,
  exportProfileJson,
  getActiveProfile,
  importProfileJson,
  listProfiles,
  PROFILE_DB_KEY,
  renameProfile as renameProfileApi,
  setActiveProfile,
} from "@/lib/player-chrome-profiles";
import { useT } from "@/lib/i18n";
import { readAtVersion } from "@/lib/read-at-version";
import { sameConfig } from "./config-helpers";
import { useChromeEdits } from "./use-chrome-edits";

/** Draft, saved copy and profile actions behind the layout editor, shared by Settings and the player. */
export function useLayoutEditor(theme: ThemeId, onThemeChange: (theme: ThemeId) => void) {
  const t = useT();
  const [saved, setSaved] = useState<PlayerChromeConfig>(() => readPlayerChromeConfig(theme));
  const [draft, setDraft] = useState<PlayerChromeConfig>(saved);
  const [selectedId, setSelectedId] = useState<PlayerControlId | null>(null);
  const [selectedPanelId, setSelectedPanelId] = useState<PanelId | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const [profileVersion, setProfileVersion] = useState(0);
  const [configVersion, setConfigVersion] = useState(0);
  const bumpProfiles = useCallback((reloadConfig = true) => {
    setProfileVersion((v) => v + 1);
    if (reloadConfig) setConfigVersion((v) => v + 1);
  }, []);

  const profiles = readAtVersion(profileVersion, () => listProfiles(theme));
  const activeProfileId = readAtVersion(profileVersion, () => getActiveProfile(theme)?.id ?? null);

  const currentKey = `${theme}:${configVersion}`;
  const [loadedKey, setLoadedKey] = useState(currentKey);
  if (loadedKey !== currentKey) {
    setLoadedKey(currentKey);
    const next = readPlayerChromeConfig(theme);
    setSaved(next);
    setDraft(next);
    setSelectedId(null);
    setSelectedPanelId(null);
  }

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === PROFILE_DB_KEY) bumpProfiles();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [bumpProfiles]);

  const dirty = !sameConfig(draft, saved);
  const edits = useChromeEdits(setDraft, selectedId, theme);

  const flashSaved = () => {
    setJustSaved(true);
    window.setTimeout(() => setJustSaved(false), 1600);
  };

  const onSave = () => {
    const res = writePlayerChromeConfig(theme, draft);
    if (!res.ok) {
      void alertDialog(t("Couldn't save your layout. {error}", { error: res.error }));
      return;
    }
    setSaved(draft);
    bumpProfiles();
    notifyPlayerChromeChanged(theme);
    flashSaved();
  };

  const onSwitchProfile = async (id: string) => {
    if (!sameConfig(draft, saved)) {
      const ok = await confirmDialog(
        t("You have unsaved changes that will be lost when switching profiles. Continue?"),
      );
      if (!ok) return;
    }
    const res = setActiveProfile(theme, id);
    if (!res.ok) {
      void alertDialog(t("Couldn't switch profile. {error}", { error: res.error }));
      return;
    }
    bumpProfiles();
    notifyPlayerChromeChanged(theme);
  };

  const onSaveAsNew = (name: string) => {
    const res = createProfile(theme, name, draft);
    if (!res.ok) {
      void alertDialog(t("Couldn't create the profile. {error}", { error: res.error }));
      return;
    }
    bumpProfiles();
    notifyPlayerChromeChanged(theme);
    flashSaved();
  };

  const onRenameProfile = (newName: string) => {
    if (!activeProfileId) return;
    const res = renameProfileApi(activeProfileId, newName);
    if (!res.ok) {
      void alertDialog(t("Couldn't rename the profile. {error}", { error: res.error }));
      return;
    }
    bumpProfiles(false);
  };

  const onDeleteProfile = () => {
    if (!activeProfileId) return;
    const res = deleteProfileApi(activeProfileId);
    if (!res.ok) {
      void alertDialog(t("Couldn't delete the profile. {error}", { error: res.error }));
      return;
    }
    bumpProfiles();
    notifyPlayerChromeChanged(theme);
  };

  const onExportProfile = () => {
    if (!activeProfileId) return;
    const json = exportProfileJson(activeProfileId);
    if (!json) return;
    const active = getActiveProfile(theme);
    const safeName = (active?.name ?? "layout").replace(/[^a-zA-Z0-9._-]+/g, "-");
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `harbor-${theme}-${safeName}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const onImportProfile = (text: string) => {
    const res = importProfileJson(text);
    if (!res.ok) {
      void alertDialog(t("Couldn't import that file. {error}", { error: res.error }));
      return;
    }
    bumpProfiles();
    notifyPlayerChromeChanged(res.profile.themeId);
    if (res.profile.themeId !== theme) onThemeChange(res.profile.themeId);
  };

  const resetAll = () => {
    const baseline = resetPlayerChromeConfig(theme);
    setSaved(baseline);
    setDraft(baseline);
    notifyPlayerChromeChanged(theme);
    setSelectedId(null);
    return baseline;
  };

  const onResetToDefaults = () => {
    resetAll();
    bumpProfiles();
  };

  const discard = () => {
    setDraft(saved);
    setSelectedId(null);
    setSelectedPanelId(null);
  };

  /** Asks before throwing away unsaved edits; resolves true when the editor may close. */
  const confirmClose = async () => {
    if (!sameConfig(draft, saved)) {
      const ok = await confirmDialog(
        t("You have unsaved changes. Close the editor and discard them?"),
      );
      if (!ok) return false;
      discard();
    }
    return true;
  };

  return {
    saved,
    draft,
    setDraft,
    dirty,
    justSaved,
    selectedId,
    setSelectedId,
    selectedPanelId,
    setSelectedPanelId,
    profiles,
    activeProfileId,
    edits,
    onSave,
    onSwitchProfile,
    onSaveAsNew,
    onRenameProfile,
    onDeleteProfile,
    onExportProfile,
    onImportProfile,
    onResetToDefaults,
    resetAll,
    discard,
    confirmClose,
  };
}

export type LayoutEditorState = ReturnType<typeof useLayoutEditor>;

/** The EditorOverlay props that come straight from the editor state. */
export function editorOverlayProps(s: LayoutEditorState) {
  return {
    config: s.draft,
    selectedId: s.selectedId,
    onSelect: s.setSelectedId,
    selectedPanelId: s.selectedPanelId,
    onSelectPanel: s.setSelectedPanelId,
    onSetPanelCorner: s.edits.setPanelCorner,
    onTogglePanelHidden: s.edits.togglePanelHidden,
    onMoveSlot: s.edits.moveSlot,
    onMoveOrder: s.edits.moveOrder,
    onDropControl: s.edits.dropControl,
    onToggleHidden: s.edits.toggleHidden,
    onResetControl: s.edits.resetControl,
    onSetCustomIcon: s.edits.setCustomIcon,
    onSetVariant: s.edits.setVariant,
    profiles: s.profiles,
    activeProfileId: s.activeProfileId,
    dirty: s.dirty,
    justSaved: s.justSaved,
    onSave: s.onSave,
    onSwitchProfile: s.onSwitchProfile,
    onSaveAsNew: s.onSaveAsNew,
    onRenameProfile: s.onRenameProfile,
    onDeleteProfile: s.onDeleteProfile,
    onExportProfile: s.onExportProfile,
    onImportProfile: s.onImportProfile,
    onResetToDefaults: s.onResetToDefaults,
    onUnhide: s.edits.unhideControl,
  };
}
