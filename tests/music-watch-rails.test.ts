const compactCss = (value: string) =>
  value
    .replace(/\s*([{}:;,/])\s*/g, "$1")
    .replace(/\s+/g, " ")
    .replace(/@media\s+\(/g, "@media(")
    .replace(/;}/g, "}");
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { MusicQueueOrder } from "../src/lib/music/queue-order";
import type { MusicTrack } from "../src/lib/music/types";
import { flushPromises } from "./helpers/hook-harness.ts";
import { allNodes as all, byClass, mountWatch, watchTrack } from "./helpers/music-watch-harness.ts";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const watchCss = compactCss(read("../src/components/music/music-watch.css"));
const langs = [
  "ar",
  "de",
  "en",
  "es",
  "fr",
  "hi",
  "id",
  "it",
  "ja",
  "ko",
  "pl",
  "pt",
  "ru",
  "tr",
  "vi",
  "zh",
];
const track = watchTrack;

const off = { shuffle: false, repeat: "off" as const };
const one = (order: MusicQueueOrder, queue: MusicTrack[], index: number, modes = off) =>
  order.upcoming(queue, index, modes, 1)[0] ?? null;

test("Up next takes the real next queue entry, not a search result", () => {
  const queue = [track("a"), track("b"), track("c")];
  assert.equal(one(new MusicQueueOrder(), queue, 0)?.id, "b");
  assert.equal(one(new MusicQueueOrder(), queue, 1)?.id, "c");
});

test("an empty queue or a last-position index yields nothing to render", () => {
  assert.equal(one(new MusicQueueOrder(), [], 0), null);
  assert.equal(one(new MusicQueueOrder(), [], -1), null);
  const queue = [track("a"), track("b")];
  assert.equal(one(new MusicQueueOrder(), queue, 1), null);
  assert.equal(one(new MusicQueueOrder(), [track("a")], 0), null);
});

test("repeat-one has no next entry because the current video plays again", () => {
  const queue = [track("a"), track("b")];
  assert.equal(one(new MusicQueueOrder(), queue, 0, { shuffle: false, repeat: "one" }), null);
});

test("repeat-all wraps to the head of the queue from the last position", () => {
  const queue = [track("a"), track("b"), track("c")];
  assert.equal(one(new MusicQueueOrder(), queue, 2, { shuffle: false, repeat: "all" })?.id, "a");
});

test("what Up next shows is what advancing actually plays, shuffle included", () => {
  const queue = [track("a"), track("b"), track("c"), track("d"), track("e")];
  const modes = { shuffle: true, repeat: "off" as const };
  const order = new MusicQueueOrder();
  let seed = 7;
  const random = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const shown = order.upcoming(queue, 0, modes, 1, random)[0];
  assert.ok(shown);
  assert.notEqual(shown.id, "a");
  assert.equal(order.next(queue, 0, modes, true, null, random)?.id, shown.id);
});

const aside = (tree: unknown) => all(tree).find((n) => n.type === "aside")!;
const upNextBox = (tree: unknown) => byClass(aside(tree), "music-watch-up-next")[0];
const headings = (tree: unknown) =>
  all(aside(tree))
    .filter((n) => n.type === "h3")
    .map((n) => ({ className: n.props.className, text: n.props.children }));

test("the queue entry may be a song, so its kind is labelled rather than assumed", async () => {
  const queue = [track("a"), track("b", "audio")];
  assert.equal(one(new MusicQueueOrder(), queue, 0)?.mediaKind, "audio");
  const w = await mountWatch({ queue, index: 0, similar: [track("c")] });
  const badges = all(upNextBox(w.loaded)).filter((n) => n.type === "MusicMediaBadge");
  assert.deepEqual(
    badges.map((n) => n.props),
    [{ kind: "audio", compact: true }],
  );
  const related = byClass(aside(w.loaded), "music-watch-next-list")[0];
  assert.equal(
    all(related).some((n) => n.type === "MusicMediaBadge"),
    false,
    "only the queue entry carries a kind badge",
  );
});

test("the music video page reads the same queue source the now-playing pull-out reads", async () => {
  const queue = [track("a"), track("b"), track("c")];
  const wrap = await mountWatch({
    queue,
    index: 2,
    modes: (transport) => transport.cycleMusicRepeat(),
  });
  assert.equal(wrap.transport.getMusicTransport().repeat, "all");
  const shown = wrap.rows(upNextBox(wrap.loaded))[0]?.props.item;
  assert.equal(shown?.id, "a", "repeat-all wraps Up next to the head, as playback does");
  assert.equal(shown?.id, wrap.transport.musicUpcoming(queue, 2, 1)[0]?.id);
  assert.ok(wrap.subscribers.length > 0, "the page subscribes to shuffle and repeat changes");

  const once = await mountWatch({
    queue,
    index: 0,
    modes: (transport) => {
      transport.cycleMusicRepeat();
      transport.cycleMusicRepeat();
    },
  });
  assert.equal(once.transport.getMusicTransport().repeat, "one");
  assert.equal(upNextBox(once.loaded), undefined, "repeat-one replays the current video");
});

test("Up next renders nothing at all when there is no next entry, never a bare heading", async () => {
  for (const tree of [
    (await mountWatch({ queue: [track("a")], index: 0, similar: [track("c")] })).loaded,
    (await mountWatch({ queue: [track("a"), track("b")], index: 1, similar: [track("c")] })).loaded,
  ]) {
    assert.equal(upNextBox(tree), undefined);
    assert.deepEqual(
      headings(tree).map((h) => h.text),
      ["music.videos.next"],
    );
  }
});

test("a singular Up next sits above the related rail, which is now After that", async () => {
  const w = await mountWatch({
    queue: [track("a"), track("b")],
    index: 0,
    similar: [track("c"), track("d")],
  });
  assert.deepEqual(
    headings(w.loaded).map((h) => h.text),
    ["music.row.upNext", "music.videos.next"],
  );
  assert.deepEqual(
    w.rows(upNextBox(w.loaded)).map((n) => n.props.item.id),
    ["b"],
    "Up next holds exactly one entry",
  );
});

test("both rail labels ship translated in every language rather than English", async () => {
  const labels = async (lang: string) => ({
    ...(await import(`../src/lib/i18n/locales/${lang}/music-videos.ts`)).default,
    ...(await import(`../src/lib/i18n/locales/${lang}/music-queue.ts`)).default,
  });
  const english = await labels("en");
  for (const lang of langs) {
    const table = await labels(lang);
    const after = table["music.videos.next"];
    const upNext = table["music.row.upNext"];
    assert.ok(after, `${lang} is missing music.videos.next`);
    assert.ok(upNext, `${lang} is missing music.row.upNext`);
    assert.notEqual(after, upNext, `${lang} gives both rails the same label`);
    if (lang !== "en") {
      assert.notEqual(after, english["music.videos.next"], `${lang} still carries English`);
      assert.notEqual(upNext, english["music.row.upNext"], `${lang} still carries English`);
    }
  }
});

test("the two headings share one rule so the rails read as one column", async () => {
  const w = await mountWatch({ queue: [track("a"), track("b")], index: 0, similar: [track("c")] });
  assert.deepEqual(
    headings(w.loaded).map((h) => h.className),
    ["music-watch-next-heading", "music-watch-next-heading"],
  );
  assert.match(watchCss, /\.music-watch-next-heading\{/);
  assert.match(watchCss, /\.music-watch-up-next\{[^}]*border-bottom:/);
});

test("the loading skeletons still belong to the related rail alone", async () => {
  const w = await mountWatch({
    queue: [track("a"), track("b")],
    index: 0,
    similar: [track("c"), track("d"), track("e"), track("f"), track("g")],
  });
  const lists = byClass(aside(w.busy), "music-watch-next-list");
  assert.equal(lists.length, 1);
  assert.equal(lists[0].props.role, "status");
  assert.equal(byClass(lists[0], "music-watch-video-next music-watch-next-skeleton").length, 4);
  assert.equal(
    all(upNextBox(w.busy)).some((n) => String(n.props?.className).includes("skeleton")),
    false,
    "Up next shows its real entry while related videos load",
  );
  assert.deepEqual(
    w.rows(upNextBox(w.busy)).map((n) => n.props.item.id),
    ["b"],
  );
  const more = byClass(w.busy, "music-watch-more relative z-10")[0];
  assert.equal(
    byClass(
      more,
      "music-watch-video-next music-watch-next-skeleton music-watch-next-skeleton-stacked",
    ).length,
    6,
  );
  assert.equal(
    all(w.loaded).some((n) => String(n.props?.className).includes("skeleton")),
    false,
    "loaded rows replace every skeleton",
  );
});

test("the entry shown as Up next is not repeated as the first row of After that", async () => {
  const similar = ["b", "c", "d", "e", "f", "g"].map((id) => track(id));
  const w = await mountWatch({ queue: [track("a"), track("b")], index: 0, similar });
  const rail = byClass(aside(w.loaded), "music-watch-next-list")[0];
  assert.deepEqual(
    w.rows(rail).map((n) => n.props.item.id),
    ["c", "d", "e", "f"],
  );
  const more = byClass(w.loaded, "music-watch-more relative z-10")[0];
  assert.deepEqual(
    w.rows(more).map((n) => n.props.item.id),
    ["g"],
  );
  // The rails must queue the list they display, or clicking row two skips a video.
  const before = w.plays.length;
  all(w.rows(rail)[1])
    .find((n) => n.type === "button")!
    .props.onClick();
  await flushPromises();
  const played = w.plays.slice(before);
  assert.equal(played.length, 1);
  assert.equal(played[0].track.id, "d");
  assert.deepEqual(
    played[0].queue.map((item) => item.id),
    ["c", "d", "e", "f", "g"],
  );
});

test("both rails identify a track the way the rest of music search does", async () => {
  const next = { ...track("b"), connectorId: "youtube", sourceId: "X" };
  const sameVideo = { ...track("other"), connectorId: "youtube", sourceId: "X" };
  const sameIdElsewhere = { ...track("b"), connectorId: "catalog", sourceId: "Y" };
  const w = await mountWatch({
    queue: [track("a"), next],
    index: 0,
    similar: [sameVideo, sameIdElsewhere, track("c")],
  });
  const rail = byClass(aside(w.loaded), "music-watch-next-list")[0];
  assert.deepEqual(
    w.rows(rail).map((n) => `${n.props.item.connectorId ?? ""}:${n.props.item.id}`),
    ["catalog:b", ":c"],
  );
});
