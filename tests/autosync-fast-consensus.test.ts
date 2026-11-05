// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import * as fpGate from "../src/lib/subtitles/autosync/fp-gate.ts";
import * as language from "../src/lib/subtitles/language.ts";
import * as arabic from "../src/lib/subtitles/arabic-normalize.ts";
import { runAutoSync, type PipelineContext } from "../src/lib/subtitles/autosync/pipeline.ts";
import { consensusAnchorFit } from "../src/lib/subtitles/autosync/smart-layer.ts";
import { autoSyncHarness } from "./helpers/autosync-harness.ts";
import { flushPromises, hookHarness, loadModule } from "./helpers/hook-harness.ts";

const { measuredQuality } = fpGate;

const quality = (ncc: number) =>
  measuredQuality({ ncc, coverage: 0.8, z: 8 }, "test-held-out-score", {
    kind: "held-out",
    windowIds: ["validation-middle-a", "validation-middle-b"],
  });

const anchors = (n: number, offset: number, jitter = 0) =>
  Array.from(
    { length: n },
    (_, i) => [i * 30, i * 30 + offset + (i % 2 ? jitter : -jitter)] as [number, number],
  );

const ctx: PipelineContext = {
  mediaUrl: "file:///movie.mkv",
  sourceKind: "local",
  durationSec: 3600,
  cues: [[10, 12]],
  audioLanguage: "en",
  subtitleLanguage: "en",
  preferredSubtitleLanguages: ["en"],
  subtitleFormat: "srt",
  languages: ["en"],
};

test("consensus anchors produce a fast transform only when there are enough and they agree", () => {
  const right = (textAnchors: unknown) =>
    consensusAnchorFit({
      verdict: "right",
      bestCandidate: null,
      agreement: 1,
      textAnchors,
    } as never);
  const fit = right(anchors(8, 2.5));
  assert.ok(fit && Math.abs(fit.offsetSec - 2.5) < 1e-6 && Math.abs(fit.ratio - 1) < 1e-6);
  assert.equal(right(anchors(7, 2.5)), null, "seven anchors are not enough");
  assert.equal(right(anchors(12, 2.5, 0.8)), null, "a noisy fit is not trusted");
  assert.equal(
    consensusAnchorFit({
      verdict: "wrong",
      bestCandidate: null,
      agreement: 1,
      textAnchors: anchors(9, 1),
    } as never),
    null,
  );
});

test("the pipeline starts consensus and the quality probe before the hash tier", async () => {
  const order: string[] = [];
  await runAutoSync(ctx, {
    measureQuality: async () => {
      order.push("quality");
      return quality(0.5);
    },
    consensus: async () => {
      order.push("consensus");
      return null;
    },
    hashExact: async () => {
      order.push("hash");
      return null;
    },
  });
  assert.deepEqual(order.slice(0, 3), ["quality", "consensus", "hash"]);
});

test("the fast consensus tier runs before audio VAD and stays an offer when audio cannot confirm", async () => {
  const order: string[] = [];
  const outcome = await runAutoSync(ctx, {
    measureQuality: async (_c, t) => quality(t.kind === "affine" && t.offsetSec === 0 ? 0.4 : 0.7),
    consensus: async () => {
      order.push("consensus");
      return { verdict: "right", bestCandidate: null, agreement: 1, textAnchors: anchors(10, 3) };
    },
    vadAffine: async () => {
      order.push("vad");
      return null;
    },
  });
  assert.deepEqual(order, ["consensus", "vad"]);
  assert.equal(outcome.decision.decision, "offer");
  assert.equal(outcome.bestEffort, true);
  assert.equal((outcome.candidate as { offsetSec: number }).offsetSec, 3);
});

function consensus(userLines: string[], refs: Array<[string, string[]]>) {
  const cue = (i: number) => [i * 4, i * 4 + 2] as [number, number];
  const results = refs.map(([source], i) => ({
    url: `https://subs.test/${i}`,
    lang: "en",
    source,
  }));
  const api = loadModule("src/lib/subtitles/autosync/consensus.ts", {
    "@/lib/debug": { dinfo() {}, dwarn() {} },
    "@/lib/subtitles/search": { searchSubtitles: async () => results },
    "@/lib/subtitles/prepare": {
      prepareSubtitle: async ({ url }: { url: string }) => ({
        format: "srt",
        cues: refs[Number(url.split("/").pop())][1].map((text, i) => ({
          start: cue(i)[0] + 1.5,
          end: cue(i)[1] + 1.5,
          text,
        })),
        cleanup() {},
      }),
    },
    "@/lib/subtitles/provider-auth": { providerSubtitleDownloadHeaders: () => undefined },
    "@/lib/subtitles/language": language,
    "@/lib/subtitles/arabic-normalize": arabic,
    "@/lib/subtitles/addon-source": { gatherSubtitleAddons: async () => [] },
  });
  return api.runConsensus(
    { ...ctx, cues: userLines.map((_, i) => cue(i)), cueText: userLines, durationSec: 600 },
    { providers: { addons: false }, fetchTimeoutMs: 200 },
  );
}

const words = [
  "amber",
  "brook",
  "cinder",
  "delta",
  "ember",
  "fjord",
  "grove",
  "harbor",
  "iris",
  "jade",
];
const lines = (prefix: string) =>
  Array.from(
    { length: 30 },
    (_, i) => `${prefix} line number ${i} says something quite unique ${i * 7}`,
  );
const otherFilm = Array.from(
  { length: 30 },
  (_, i) =>
    `${words[i % 10]} ${words[(i * 3) % 10]} wanders ${i * 11} quietly ${words[(i * 7) % 10]}`,
);

test("single-source subtitles can still vote on the offset", async () => {
  const story = lines("story");
  const same = await consensus(story, [
    ["opensubtitles", story],
    ["opensubtitles", story],
  ]);
  assert.equal(same.verdict, "right");
  assert.ok(same.textAnchors && same.textAnchors.length >= 8);
  const one = await consensus(story, [["opensubtitles", story]]);
  assert.equal(one.verdict, "unknown", "one peer is not a vote");
  const split = await consensus(story, [
    ["opensubtitles", story],
    ["opensubtitles", otherFilm],
  ]);
  assert.equal(split.verdict, "unknown", "one agreeing peer out of two is not a vote");
});

test("a wrong-content verdict needs two independent sources", async () => {
  const story = lines("story");
  const single = await consensus(story, [
    ["opensubtitles", otherFilm],
    ["opensubtitles", otherFilm],
  ]);
  assert.equal(single.verdict, "unknown", "one source cannot call the subtitle wrong");
  const multi = await consensus(story, [
    ["opensubtitles", otherFilm],
    ["wyzie", otherFilm],
  ]);
  assert.equal(multi.verdict, "wrong");
  const agree = await consensus(story, [
    ["opensubtitles", story],
    ["wyzie", story],
  ]);
  assert.equal(agree.verdict, "right");
  const disputed = await consensus(story, [
    ["opensubtitles", story],
    ["wyzie", otherFilm],
  ]);
  assert.equal(disputed.verdict, "unknown", "no majority backed by two sources");
});

/** Resolves the value, or "pending" when the promise is still unsettled after the microtask queue drains. */
const settled = <T>(p: Promise<T>) =>
  Promise.race([p, flushPromises().then(() => "pending" as const)]);

test("every audio and network port is timeout-bounded", async () => {
  const timers: number[] = [];
  const api = loadModule(
    "src/lib/subtitles/autosync/context.ts",
    {
      "@tauri-apps/api/core": { invoke: () => new Promise(() => {}) },
      "@/lib/debug": { dinfo() {}, dwarn() {} },
      "@/lib/subtitles/auto-sync": { estimateSubtitleOffset: () => new Promise(() => {}) },
      "./fp-gate": fpGate,
      "./direct-validation": {
        directScoreInvokeArgs: () => ({}),
        directScoreMeasurement: () => null,
        nativeScoreMeasurement: () => null,
        torrentScoreInvokeArgs: () => ({}),
      },
      "./opensubtitles": {
        resolveTier0: () => new Promise(() => {}),
        resolveSwapCues: async () => null,
      },
      "./consensus": { createConsensusPort: () => async () => null },
      "./crowd-db": {
        createCrowdDbPort: () => () => new Promise(() => {}),
        crowdConfigFromSettings: () => ({}),
      },
      "@/lib/subtitles/language": language,
      "./language-context": { consensusLanguages: () => ["en"] },
    },
    {
      setTimeout: (fn: () => void, ms: number) => {
        timers.push(ms);
        fn();
        return 0;
      },
      clearTimeout() {},
    },
  );
  const settings = { subtitleAutoSyncCrowd: true, subProvidersEnabled: {}, preferredSubLangs: [] };
  const ports = api.buildTierPorts(ctx, settings, {
    osConfig: { apiKey: "k", userAgent: "ua" },
  });
  const measured = await settled(
    ports.measureQuality(ctx, { kind: "affine", offsetSec: 0, ratio: 1 }),
  );
  assert.equal((measured as { status: string }).status, "unknown");
  assert.equal(await settled(ports.vadAffine(ctx, {})), null);
  assert.equal(await settled(ports.hashExact(ctx)), null);
  assert.equal(await settled(ports.crowdDb(ctx)), null);
  assert.deepEqual(timers, [4000, 45000, 4000, 3000], "score, VAD, hash and crowd each time out");

  timers.length = 0;
  const torrent = api.buildTierPorts(
    { ...ctx, sourceKind: "torrent", infoHash: "a".repeat(40) },
    settings,
    {},
  );
  await settled(torrent.measureQuality(ctx, { kind: "affine", offsetSec: 0, ratio: 1 }));
  await settled(torrent.vadAffine(ctx, {}));
  assert.deepEqual(timers, [6000, 60000], "torrent ports get longer limits");
});

test("auto-sync is a real toggle: stop reverts, and the menu turns it off", async () => {
  const apply = {
    decision: { decision: "apply", reason: "fixture", pCorrect: 1 },
    tiersRun: [],
    candidate: { kind: "affine", offsetSec: 2 },
  };
  const h = autoSyncHarness({ outcome: apply });
  const track = { id: "1", lang: "en" };
  h.render("https://media.test/a.mkv", track, 0.5);
  await flushPromises();
  h.render("https://media.test/a.mkv", track, 2).stop();
  assert.deepEqual(h.calls.slice(-1), ["delay 0.5"]);
  assert.equal(h.render("https://media.test/a.mkv", track).status, "idle");

  type N = { type: unknown; props: Record<string, any> & { children?: unknown } };
  const element = (type: unknown, props: N["props"]) => ({ type, props });
  const all = (n: unknown): N[] =>
    Array.isArray(n)
      ? n.flatMap(all)
      : n && typeof n === "object"
        ? [n as N, ...all((n as N).props?.children)]
        : [];
  const calls: string[] = [];
  const menu = hookHarness(
    "src/components/player/subtitle-menu/sync-control.tsx",
    "SyncControl",
    {
      "lucide-react": { AudioLines: "a", ChevronDown: "c", Loader2: "l" },
      "@/components/ui-icon": { UiIcon: "UiIcon" },
      "@/components/player/autosync/autosync-store": {
        useAutoSyncHandle: () => ({
          status: "best-effort",
          stop: () => calls.push("stop"),
          run: () => calls.push("run"),
        }),
      },
      "@/lib/i18n": {
        useT: () => (s: string, v?: Record<string, string>) => s.replace("{label}", v?.label ?? ""),
      },
      "@/lib/player/sub-sync": { openSyncBar() {} },
      "react/jsx-runtime": { jsx: element, jsxs: element, Fragment: "Fragment" },
    },
    { window: { addEventListener() {}, removeEventListener() {} } },
  );
  const props = {
    canAutoSync: true,
    canLiveSync: true,
    delaySec: 0,
    delayNonZero: false,
    onClose: () => calls.push("close"),
  };
  const trigger = all(menu.render(props)).find((n) => n.props["aria-expanded"] === false)!;
  assert.equal(trigger.props["aria-label"], "Synced: on, sync options", "best effort shows as on");
  trigger.props.onClick();
  const toggle = all(menu.render(props)).find(
    (n) => n.type === "button" && [n.props.children].flat().includes("Turn off auto-sync"),
  )!;
  toggle.props.onClick();
  assert.deepEqual(calls, ["stop"], "turning it off neither reruns nor closes");
});
