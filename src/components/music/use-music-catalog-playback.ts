import { useEffect, useRef, useState } from "react";
import { useMusicSourcePicker } from "./music-source-picker";
import { albumTracks, artistTop, catalogPlaylistTracks, stationTracks } from "@/lib/music/catalog";
import { useT } from "@/lib/i18n";
import type { MusicCatalogItem, MusicTrack } from "@/lib/music/types";
import { registerMusicCatalogOrigin, registerMusicQueueOrigin } from "@/lib/music/playback-origin";

let latestRequest = 0;
const nextRequest = () => (latestRequest += 1);
const isLatest = (current: number) => latestRequest === current;

const remoteTracks = (item: Exclude<MusicCatalogItem, { kind: "track" }>): Promise<MusicTrack[]> =>
  item.kind === "album"
    ? albumTracks(item)
    : item.kind === "playlist"
      ? catalogPlaylistTracks(item)
      : item.kind === "artist"
        ? artistTop(item)
        : stationTracks(item);

export function useMusicCatalogPlayback() {
  const { openSourcePicker } = useMusicSourcePicker();
  const t = useT();
  const request = useRef(0);
  const [pending, setPending] = useState<MusicCatalogItem | null>(null);
  const [error, setError] = useState("");
  useEffect(
    () => () => {
      request.current = 0;
    },
    [],
  );

  const play = async (
    item: MusicCatalogItem,
    siblings: readonly MusicCatalogItem[] = [],
    rowId?: string,
  ) => {
    const current = nextRequest();
    request.current = current;
    setError("");
    setPending(item);
    const finish = (tracks: MusicTrack[]) => {
      if (request.current !== current || !isLatest(current)) return;
      const track = item.kind === "track" ? item : tracks[0];
      if (!track) {
        setError(t("music.row.emptyRow"));
        return;
      }
      const queue = tracks.length ? tracks : [track];
      if (item.kind === "track" && rowId === "spotify:home:saved-tracks") {
        registerMusicQueueOrigin(queue, {
          kind: "spotify",
          id: "spotify:liked",
          name: t("music.spotifyLibrary.liked"),
          collection: "liked",
          nextOffset: 0,
        });
      } else registerMusicCatalogOrigin(item, queue);
      openSourcePicker(track, queue);
    };
    // A track plays from the row it sits in, so it opens the picker in the same click without waiting a tick.
    if (item.kind === "track") {
      const tracks = siblings.filter(
        (entry): entry is Extract<MusicCatalogItem, { kind: "track" }> => entry.kind === "track",
      );
      try {
        finish(tracks);
      } catch {
        if (request.current === current && isLatest(current)) setError(t("music.error.load"));
      }
      if (request.current === current) setPending(null);
      return;
    }
    return remoteTracks(item)
      .then(finish)
      .catch(() => {
        if (request.current === current && isLatest(current)) setError(t("music.error.load"));
      })
      .finally(() => {
        if (request.current === current) setPending(null);
      });
  };

  return { play, pending, error };
}
