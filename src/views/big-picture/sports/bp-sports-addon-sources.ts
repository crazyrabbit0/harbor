import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { gatherCatalogAddons, type Addon } from "@/lib/addons";
import { isAddonEnabled } from "@/lib/addon-store";
import { useAuth } from "@/lib/auth";
import { useProfiles } from "@/lib/profiles";
import type { SportsGame } from "@/lib/sports/espn-types";
import {
  clearSportsAddonCatalogCache,
  loadSportsAddonListings,
  refreshSportsAddonManifests,
} from "@/lib/sports/addon-sources";
import { sportsAddonCatalogs, type SportsAddonListing } from "@/lib/sports/addon-sources-model";
import { useSportsConsent } from "@/views/sports/access-gate";

export type BpSportsAddonSources = {
  rows: SportsAddonListing[];
  matching: SportsAddonListing[];
  loading: boolean;
  failed: boolean;
  installed: boolean;
  available: boolean;
  matched: boolean;
  enabledProviders: () => Addon[];
  reload: () => void;
  hardReload: () => void;
};

const EMPTY_ROWS: SportsAddonListing[] = [];

export function useBpSportsAddonSources(game: SportsGame): BpSportsAddonSources {
  const consent = useSportsConsent();
  const { authKey } = useAuth();
  const { activeId } = useProfiles();
  const [tick, setTick] = useState(0);
  const providers = useRef<Addon[]>([]);
  const gameRef = useRef(game);
  useLayoutEffect(() => {
    gameRef.current = game;
  }, [game]);

  const active = consent.status === "accepted" && game.state !== "post";
  const identity = JSON.stringify([
    game.startMs,
    game.home.name,
    game.away.name,
    game.context?.name,
    game.broadcasts,
  ]);
  const reqKey = active ? `${authKey ?? ""}\0${activeId ?? ""}\0${identity}\0${tick}` : "";
  const [state, setState] = useState<{
    key: string;
    rows: SportsAddonListing[];
    loading: boolean;
    failed: boolean;
    installed: boolean;
  }>({ key: "", rows: EMPTY_ROWS, loading: false, failed: false, installed: false });

  useEffect(() => {
    if (!active || !reqKey) {
      providers.current = [];
      return;
    }
    const controller = new AbortController();
    void (async () => {
      const gathered = await gatherCatalogAddons(authKey);
      if (controller.signal.aborted) return;
      const hydrated = await refreshSportsAddonManifests(gathered, controller.signal);
      if (controller.signal.aborted) return;
      providers.current = hydrated.addons;
      const eligible = hydrated.addons.filter((addon) => sportsAddonCatalogs(addon).length > 0);
      const hasInstalled = eligible.length > 0;
      setState({
        key: reqKey,
        rows: EMPTY_ROWS,
        loading: true,
        failed: false,
        installed: hasInstalled,
      });
      const result = await loadSportsAddonListings(
        eligible,
        gameRef.current,
        controller.signal,
        (partial) => {
          if (!controller.signal.aborted) {
            setState((cur) => ({
              key: reqKey,
              rows: partial,
              loading: cur.key === reqKey ? cur.loading : true,
              failed: false,
              installed: hasInstalled,
            }));
          }
        },
      );
      if (controller.signal.aborted) return;
      setState({
        key: reqKey,
        rows: result.rows,
        loading: false,
        failed: result.failed > 0 || hydrated.failed > 0,
        installed: hasInstalled,
      });
    })().catch(() => {
      if (!controller.signal.aborted) {
        setState((cur) => ({
          key: reqKey,
          rows: cur.key === reqKey ? cur.rows : EMPTY_ROWS,
          loading: false,
          failed: true,
          installed: cur.key === reqKey ? cur.installed : false,
        }));
      }
    });
    return () => controller.abort();
  }, [active, reqKey, authKey]);

  const settled = active && state.key === reqKey;
  const rows = settled ? state.rows : EMPTY_ROWS;
  const loading = active && (!settled || state.loading);
  const failed = settled && state.failed;
  const installed = settled && state.installed;

  const matching = useMemo(() => rows.filter((row) => row.match !== null), [rows]);

  const enabledProviders = useCallback(
    () => providers.current.filter((addon) => isAddonEnabled(addon.transportUrl)),
    [],
  );

  const reload = useCallback(() => setTick((n) => n + 1), []);

  const hardReload = useCallback(() => {
    clearSportsAddonCatalogCache();
    setTick((n) => n + 1);
  }, []);

  return {
    rows,
    matching,
    loading,
    failed,
    installed,
    available: active && rows.length > 0,
    matched: active && matching.length > 0,
    enabledProviders,
    reload,
    hardReload,
  };
}
