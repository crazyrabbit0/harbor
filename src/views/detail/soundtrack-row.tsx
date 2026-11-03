import type { FilmSoundtrack } from "@/lib/providers/musicbrainz-soundtrack";
import { useViewActions } from "@/lib/view";

const loadMusicNavigation = () => import("@/lib/music/navigation");
const loadMusicDeepLink = () => import("@/lib/music/deep-link");

export function SoundtrackRow({ album }: { album: FilmSoundtrack }) {
  const { setView } = useViewActions();
  const open = () => {
    setView("music");
    void Promise.all([loadMusicNavigation(), loadMusicDeepLink()]).then(
      ([{ requestMusicSearch }, { musicDeepLinkQuery }]) =>
        requestMusicSearch(
          musicDeepLinkQuery({ kind: "album", artist: album.artist, name: album.title }).trim(),
        ),
    );
  };
  return (
    <button
      type="button"
      onClick={open}
      className="rounded-md text-ink underline-offset-4 transition-colors hover:text-accent hover:underline"
    >
      {album.title}
    </button>
  );
}
