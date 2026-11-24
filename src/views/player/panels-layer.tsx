import { memo } from "react";
import { EpisodePanel } from "@/components/player/episode-panel";
import { ResumePrompt } from "@/components/player/resume-prompt";
import type { Meta } from "@/lib/cinemeta";
import type { PanelCorner } from "@/lib/player-chrome";
import type { PlayEpisode } from "@/lib/view";
import { useT } from "@/lib/i18n";
import { HeaderWarning, NoAudioWarning } from "./header-warning";
import { KeyChips } from "@/components/player/transport/hotkey-label";

export const PanelsLayer = memo(function PanelsLayer({
  tenFoot,
  engine,
  isSeriesPlayback,
  meta,
  currentEpisode,
  episodePanelOpen,
  onOpenEpisodePanel,
  onCloseEpisodePanel,
  upNextButtonVisible,
  episodesCorner,
  episodesHidden,
  roomGuest,
  onHostAdvance,
  watchedFor,
  nextEp,
  onRestart,
  pendingResumeSec,
  durationSec,
  resumeTitle,
  onResume,
  onStartOver,
  showHeaderWarning,
  showNoAudioWarning,
  onUseMpv,
  onDismissNoAudio,
  onPickAnother,
}: {
  /** Big Picture renders its own resume fork and needs no hover-side tab. */
  tenFoot: boolean;
  engine: "html5" | "mpv";
  isSeriesPlayback: boolean;
  meta: Meta;
  currentEpisode: PlayEpisode | undefined;
  episodePanelOpen: boolean;
  onOpenEpisodePanel: () => void;
  onCloseEpisodePanel: () => void;
  upNextButtonVisible: boolean;
  episodesCorner: PanelCorner;
  episodesHidden: boolean;
  roomGuest: boolean;
  onHostAdvance: (ep: PlayEpisode) => void;
  watchedFor: (ep: PlayEpisode) => boolean;
  nextEp: PlayEpisode | null;
  onRestart: () => void;
  pendingResumeSec: number | null;
  durationSec: number;
  resumeTitle: string;
  onResume: () => void;
  onStartOver: () => void;
  showHeaderWarning: boolean;
  showNoAudioWarning: boolean;
  onUseMpv: () => void;
  onDismissNoAudio: () => void;
  onPickAnother: () => void;
}) {
  const t = useT();
  return (
    <>
      {!tenFoot && (
        <button
          onClick={onOpenEpisodePanel}
          aria-label={t("Up next")}
          tabIndex={upNextButtonVisible ? 0 : -1}
          aria-hidden={!upNextButtonVisible}
          className={`group absolute top-1/2 z-20 flex min-h-36 -translate-y-1/2 flex-col items-center justify-center gap-3 py-5 bg-elevated/85 text-ink shadow-[0_8px_28px_-8px_rgba(0,0,0,0.75)] backdrop-blur-md transition-[padding,background,opacity] duration-300 hover:bg-elevated ${
            upNextButtonVisible
              ? "pointer-events-auto opacity-90 hover:opacity-100"
              : "pointer-events-none opacity-0"
          } ${
            episodesCorner === "top-left" || episodesCorner === "bottom-left"
              ? "left-0 rounded-r-2xl border-y border-r border-edge pl-3.5 pr-3.5 hover:pr-4"
              : "right-0 rounded-l-2xl border-y border-l border-edge pl-3.5 pr-3.5 hover:pl-4"
          }`}
        >
          <img
            src="/player-icons/up-next.png"
            width={28}
            height={28}
            alt=""
            draggable={false}
            aria-hidden
            className="select-none"
          />
          <span
            className="whitespace-nowrap text-xs font-bold uppercase tracking-[0.28em]"
            style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
          >
            {t("Up Next")}
          </span>
          <KeyChips ids={["playerEpisodePanel"]} />
        </button>
      )}

      {isSeriesPlayback && (
        <EpisodePanel
          engine={engine}
          open={episodePanelOpen && !episodesHidden}
          onClose={onCloseEpisodePanel}
          meta={meta}
          currentEpisode={currentEpisode}
          corner={episodesCorner}
          roomGuest={roomGuest}
          onHostAdvance={onHostAdvance}
          watchedFor={watchedFor}
          nextEp={nextEp}
          onRestart={onRestart}
        />
      )}

      {pendingResumeSec != null && !tenFoot && (
        <ResumePrompt
          resumeSec={pendingResumeSec}
          totalSec={durationSec}
          title={resumeTitle}
          onResume={onResume}
          onStartOver={onStartOver}
        />
      )}

      {showHeaderWarning && <HeaderWarning onPickAnother={onPickAnother} />}
      {showNoAudioWarning && <NoAudioWarning onUseMpv={onUseMpv} onDismiss={onDismissNoAudio} />}
    </>
  );
});
