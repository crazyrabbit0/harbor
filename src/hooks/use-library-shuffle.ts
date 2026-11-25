import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  LIBRARY_SHUFFLE_CHANGED,
  libraryShuffleKey,
  nextLibraryShuffleSeed,
  parseLibraryShuffle,
  type LibraryShuffle,
} from "@/lib/games/library-shuffle";

function writeLibraryShuffle(profile: string, enabled: boolean, reshuffle: boolean) {
  const raw = localStorage.getItem(libraryShuffleKey(profile));
  let previous: LibraryShuffle;
  try {
    previous = parseLibraryShuffle(raw);
  } catch (error) {
    if (!reshuffle) throw error;
    previous = parseLibraryShuffle(null);
  }
  const next: LibraryShuffle = {
    version: 1,
    enabled,
    seed:
      reshuffle || (enabled && raw === null)
        ? nextLibraryShuffleSeed(previous.seed)
        : previous.seed,
  };
  localStorage.setItem(libraryShuffleKey(profile), JSON.stringify(next));
  return next;
}

export function useLibraryShuffle(profile: string) {
  const [state, setState] = useState<{ profile: string; data: LibraryShuffle; error: boolean }>(
    () => ({ profile: "", data: parseLibraryShuffle(null), error: false }),
  );
  const current = useRef(profile);
  useLayoutEffect(() => {
    current.current = profile;
  }, [profile]);
  useEffect(() => {
    const read = () => {
      try {
        setState({
          profile,
          data: parseLibraryShuffle(localStorage.getItem(libraryShuffleKey(profile))),
          error: false,
        });
      } catch {
        setState({ profile, data: parseLibraryShuffle(null), error: true });
      }
    };
    const changed = (event: Event) => {
      if (
        event instanceof StorageEvent
          ? event.key === libraryShuffleKey(profile) || event.key === null
          : (event as CustomEvent).detail === profile
      )
        read();
    };
    read();
    window.addEventListener("storage", changed);
    window.addEventListener(LIBRARY_SHUFFLE_CHANGED, changed);
    return () => {
      window.removeEventListener("storage", changed);
      window.removeEventListener(LIBRARY_SHUFFLE_CHANGED, changed);
    };
  }, [profile]);
  const data = state.profile === profile ? state.data : parseLibraryShuffle(null);
  const save = (enabled: boolean, reshuffle = false) => {
    if (current.current !== profile) return false;
    try {
      const next = writeLibraryShuffle(profile, enabled, reshuffle);
      setState({ profile, data: next, error: false });
      window.dispatchEvent(new CustomEvent(LIBRARY_SHUFFLE_CHANGED, { detail: profile }));
      return true;
    } catch {
      setState((previous) => ({ ...previous, error: true }));
      return false;
    }
  };
  return {
    ...data,
    ready: state.profile === profile,
    error: state.profile === profile && state.error,
    save,
  };
}
