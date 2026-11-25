import type { CollectionRules } from "@/lib/games/collection-rules";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  addCollectionGame,
  addCollectionGames,
  changePersonalCollections,
  createPersonalCollection,
  emptyPersonalCollections,
  personalCollectionsKey,
  readPersonalCollections,
  removeCollectionGame,
  removePersonalCollection,
  updatePersonalCollection,
  type PersonalGameCollection,
  type PersonalGameCollections,
} from "@/lib/games/personal-collections";
import type { PersonalCollectionGame } from "@/lib/games/personal-collections";
export function usePersonalGameCollections(profile: string) {
  const [state, setState] = useState<{ profile: string; data: PersonalGameCollections }>({
    profile,
    data: emptyPersonalCollections(),
  });
  const [ready, setReady] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const owner = useRef(profile),
    alive = useRef(true),
    pending = useRef(false);
  useLayoutEffect(() => {
    owner.current = profile;
  }, [profile]);
  const valid = () => alive.current && owner.current === profile;
  const reload = () => {
    try {
      const data = readPersonalCollections(profile);
      setState({ profile, data });
      setReady(true);
      setError("");
    } catch (e) {
      setReady(false);
      setError(e instanceof Error ? e.message : "collections_read");
    }
  };
  const [prevProfile, setPrevProfile] = useState<string | null>(null);
  if (prevProfile !== profile) {
    setPrevProfile(profile);
    setBusy(false);
    reload();
  }
  useEffect(() => {
    alive.current = true;
    const event = (e: StorageEvent) => {
      if (e.key === personalCollectionsKey(profile)) reload();
    };
    window.addEventListener("storage", event);
    return () => {
      alive.current = false;
      window.removeEventListener("storage", event);
    };
  }, [profile]);
  const change = async (update: (s: PersonalGameCollections) => PersonalGameCollections) => {
    if (!ready || pending.current) return false;
    pending.current = true;
    setBusy(true);
    return changePersonalCollections(profile, update)
      .then((data) => {
        if (valid()) {
          setState({ profile, data });
          setError("");
        }
        return true;
      })
      .catch((e: unknown) => {
        if (valid()) setError(e instanceof Error ? e.message : "collections_write");
        return false;
      })
      .finally(() => {
        pending.current = false;
        if (valid()) setBusy(false);
      });
  };
  const create = async (name: string, game?: PersonalCollectionGame) => {
    const id = crypto.randomUUID();
    return (await change((s) => {
      const next = createPersonalCollection(s, name, id);
      return game ? addCollectionGame(next, id, game) : next;
    }))
      ? id
      : null;
  };
  const createMany = async (name: string, games: PersonalCollectionGame[]) => {
    const id = crypto.randomUUID();
    return (await change((s) =>
      addCollectionGames(createPersonalCollection(s, name, id), id, games),
    ))
      ? id
      : null;
  };
  const createDynamic = async (name: string, rules: CollectionRules) => {
    const id = crypto.randomUUID();
    return (await change((s) => createPersonalCollection(s, name, id, Date.now(), rules)))
      ? id
      : null;
  };
  return {
    data: state.profile === profile ? state.data : emptyPersonalCollections(),
    ready,
    error,
    busy,
    reload,
    create,
    createMany,
    createDynamic,
    addMany: (id: string, games: PersonalCollectionGame[]) =>
      change((s) => addCollectionGames(s, id, games)),
    update: (
      id: string,
      value: Partial<Pick<PersonalGameCollection, "name" | "description" | "pinned" | "rules">>,
    ) => change((s) => updatePersonalCollection(s, id, value)),
    remove: (id: string) => change((s) => removePersonalCollection(s, id)),
    add: (id: string, game: PersonalCollectionGame) =>
      change((s) => addCollectionGame(s, id, game)),
    removeGame: (id: string, gameId: string) => change((s) => removeCollectionGame(s, id, gameId)),
    dismissError: () => setError(""),
  };
}
export type PersonalGameCollectionsState = ReturnType<typeof usePersonalGameCollections>;
