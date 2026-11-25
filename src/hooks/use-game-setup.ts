import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  mergeSetupJob,
  setupInstalledExecutable,
  setupLibraryGame,
  setupPath,
  type SetupJob,
  type SetupSource,
} from "@/lib/games/setup";
import { setupVerificationFailed } from "@/lib/games/setup-progress";
import { readSetupContexts, rememberSetupContext } from "@/lib/games/setup-context";
import {
  customLaunchError,
  emptyLaunchConfig,
  type LaunchConfig,
} from "@/lib/games/custom-library";
import type { CustomGameLibrary } from "./use-custom-game-library";

export function useGameSetup(profile: string, active: boolean, library?: CustomGameLibrary) {
  const [state, setState] = useState<{ profile: string; jobs: SetupJob[] }>({ profile, jobs: [] });
  const generation = useRef(0);
  const owner = useRef(profile);
  const jobsRef = useRef(state);
  const libraryRef = useRef(library);
  useLayoutEffect(() => {
    owner.current = profile;
    jobsRef.current = state;
    libraryRef.current = library;
  }, [profile, state, library]);
  const attempted = useRef(new Set<string>());
  const registeringJobs = useRef(new Set<string>());
  const [registration, setRegistration] = useState<{
    profile: string;
    pending: string[];
    errors: Record<string, string>;
  }>({ profile, pending: [], errors: {} });
  const [prevProfile, setPrevProfile] = useState(profile);
  if (prevProfile !== profile) {
    setPrevProfile(profile);
    setRegistration({ profile, pending: [], errors: {} });
  }
  useEffect(() => {
    attempted.current.clear();
  }, [profile]);
  useEffect(() => {
    if (state.profile !== profile || !library || library.profile !== profile) return;
    const contexts = readSetupContexts(profile);
    for (const job of state.jobs) {
      if (
        job.status !== "finished" ||
        job.exitCode !== 0 ||
        job.error ||
        setupVerificationFailed(job) ||
        !job.destination
      )
        continue;
      const context = contexts[job.id];
      if (!context) continue;
      const executable = setupInstalledExecutable(job, context.game?.name ?? context.name);
      if (
        !executable ||
        library.data.games.some(
          (game) => setupPath(game.config.executable) === setupPath(executable),
        )
      )
        continue;
      const key = `${profile}:${job.id}:${job.updatedAt}`;
      const pendingKey = `${profile}:${job.id}`;
      if (attempted.current.has(key) || registeringJobs.current.has(pendingKey)) continue;
      attempted.current.add(key);
      registeringJobs.current.add(pendingKey);
      setRegistration((old) => ({
        profile,
        pending: [...(old.profile === profile ? old.pending : []), job.id],
        errors: old.profile === profile ? old.errors : {},
      }));
      void invoke<LaunchConfig>("games_validate_custom_launch", {
        config: { ...emptyLaunchConfig(), executable },
      })
        .then(async (config) => {
          const currentLibrary = libraryRef.current;
          if (owner.current !== profile || currentLibrary?.profile !== profile) return;
          const game = setupLibraryGame(
            context,
            config.executable,
            context.game?.name ?? context.name,
            currentLibrary.data.games,
          );
          if (!(await currentLibrary.save(game))) throw Error("launch_failed");
        })
        .catch((reason: unknown) => {
          if (owner.current === profile)
            setRegistration((old) => ({
              ...old,
              errors: { ...old.errors, [job.id]: customLaunchError(reason) },
            }));
        })
        .finally(() => {
          registeringJobs.current.delete(pendingKey);
          if (owner.current === profile)
            setRegistration((old) => ({
              ...old,
              pending: old.pending.filter((id) => id !== job.id),
            }));
        });
    }
  }, [state, profile, library?.data.games]);
  useEffect(() => {
    const revision = ++generation.current;
    if (!active || !isTauri()) return;
    let live = true,
      pending = false;
    const current = () => live && generation.current === revision;
    const refresh = async () => {
      if (pending || !current()) return;
      pending = true;
      await invoke<SetupJob[]>("games_setup_jobs", { profile })
        .then((records) => {
          if (current())
            setState((previous) => ({
              profile,
              jobs: records.reduce(
                (jobs, record) => mergeSetupJob(jobs, record, profile),
                previous.profile === profile ? previous.jobs : [],
              ),
            }));
        })
        // Older binaries keep completed-file actions available without a job feed.
        .catch(() => {})
        .finally(() => {
          pending = false;
        });
    };
    const stop = listen<SetupJob>("games:setup-job", ({ payload }) => {
      if (current() && payload.profile === profile)
        setState((previous) => ({
          profile,
          jobs: mergeSetupJob(previous.profile === profile ? previous.jobs : [], payload, profile),
        }));
    }).catch(() => () => {});
    void stop.then(() => {
      if (current()) void refresh();
    });
    const timer = window.setInterval(() => {
      if (
        jobsRef.current.profile === profile &&
        jobsRef.current.jobs.some((job) => job.status === "running")
      )
        void refresh();
    }, 5000);
    window.addEventListener("focus", refresh);
    return () => {
      live = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      void stop.then((unlisten) => unlisten());
    };
  }, [profile, active]);
  const accept = (job: SetupJob, source?: SetupSource) => {
    if (job.profile === profile && owner.current === profile) {
      if (source) rememberSetupContext(profile, job.id, source);
      setState((previous) => ({
        profile,
        jobs: mergeSetupJob(previous.profile === profile ? previous.jobs : [], job, profile),
      }));
    }
  };
  return {
    jobs: state.profile === profile ? state.jobs : [],
    accept,
    registering: registration.profile === profile ? registration.pending : [],
    registrationErrors: registration.profile === profile ? registration.errors : {},
  };
}
export type GameSetupState = ReturnType<typeof useGameSetup>;
