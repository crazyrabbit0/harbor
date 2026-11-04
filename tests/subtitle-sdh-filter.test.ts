// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import { readFileSync } from "node:fs";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import ts from "typescript";
import { sdhFilterAllowed, stripSdhText } from "../src/lib/subtitles/sdh-filter.ts";
import { parseSubtitle } from "../src/lib/subtitles/parser.ts";
import { prepareSubtitleBytes } from "../src/lib/subtitles/prepare.ts";
import { html5BridgeHarness } from "./helpers/html5-bridge-harness.ts";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("bracketed sound descriptions go, but only in latin script", () => {
  assert.equal(stripSdhText("[door creaks]"), "");
  assert.equal(stripSdhText("[DOOR CREAKS]"), "");
  assert.equal(stripSdhText("[скрип двери]"), "[скрип двери]");
  assert.equal(stripSdhText("[موسيقى حزينة]"), "[موسيقى حزينة]");
  assert.equal(stripSdhText("[הדלת חורקת]"), "[הדלת חורקת]");
  assert.equal(stripSdhText("[歌詞]"), "[歌詞]");
  assert.equal(stripSdhText("[music] [more]"), "");
  assert.equal(stripSdhText("- [door slams]"), "");
  assert.equal(stripSdhText("[door creaks] {whispered dialogue}"), "{whispered dialogue}");
  assert.equal(stripSdhText("[a] mid [b] line"), "mid line");
});

test("all-caps latin speaker labels go, and nothing else that ends in a colon does", () => {
  assert.equal(stripSdhText("JOHN: I told you so."), "I told you so.");
  assert.equal(stripSdhText("JOHN AND MARY: hello"), "hello");
  assert.equal(stripSdhText("MAN #2: over here"), "over here");
  assert.equal(stripSdhText("MAN ON TV: The storm."), "The storm.");
  assert.equal(stripSdhText("- JOHN: Hi."), "- Hi.");
  assert.equal(stripSdhText("OK: fine"), "fine");
  assert.equal(stripSdhText("MAN: (angrily) Get out!"), "(angrily) Get out!");

  assert.equal(stripSdhText("john: lowercase speaker"), "john: lowercase speaker");
  assert.equal(stripSdhText("Dr. Smith: hello there"), "Dr. Smith: hello there");
  assert.equal(stripSdhText("Note: bring the keys."), "Note: bring the keys.");
  assert.equal(stripSdhText("Chapter 3: The Reckoning"), "Chapter 3: The Reckoning");
  assert.equal(stripSdhText("The score was 3:1 at half."), "The score was 3:1 at half.");
  assert.equal(stripSdhText("Meet me at 10:30 tonight."), "Meet me at 10:30 tonight.");
  assert.equal(stripSdhText("Visit https://harbor.tv now."), "Visit https://harbor.tv now.");
});

test("shouting is not a speaker label", () => {
  assert.equal(stripSdhText("STOP THE CAR RIGHT NOW"), "STOP THE CAR RIGHT NOW");
  assert.equal(stripSdhText("I SAID NO!"), "I SAID NO!");
  assert.equal(stripSdhText("THE END"), "THE END");
  assert.equal(stripSdhText("NASA sent a probe."), "NASA sent a probe.");
  assert.equal(stripSdhText("НЕТ! Я НЕ ПОЙДУ!"), "НЕТ! Я НЕ ПОЙДУ!");
});

test("the all-caps rule is ascii only, so non-latin speaker labels survive untouched", () => {
  assert.equal(stripSdhText("МАША: Привет"), "МАША: Привет");
  assert.equal(stripSdhText("ПЁТР: Привет"), "ПЁТР: Привет");
  assert.equal(stripSdhText("أحمد: أين أنت؟"), "أحمد: أين أنت؟");
  assert.equal(stripSdhText("דוד: בוא הנה"), "דוד: בוא הנה");
  assert.equal(stripSdhText("田中：こっちへ来い。"), "田中：こっちへ来い。");
  assert.equal(stripSdhText("李明：你在哪里？"), "李明：你在哪里？");
  assert.equal(stripSdhText("こんにちは"), "こんにちは");
  assert.equal(stripSdhText("مرحبا يا صديقي"), "مرحبا يا صديقي");
});

test("parentheses only go when the content is shouted latin, so real asides survive", () => {
  assert.equal(stripSdhText("(OMINOUS MUSIC)"), "");
  assert.equal(stripSdhText("he said (MUSIC) loudly"), "he said (MUSIC) loudly");
  assert.equal(stripSdhText("(A) start"), "start");

  assert.equal(stripSdhText("(ominous music)"), "(ominous music)");
  assert.equal(stripSdhText("(Ominous music)"), "(Ominous music)");
  assert.equal(stripSdhText("(He walks in slowly.)"), "(He walks in slowly.)");
  assert.equal(stripSdhText("Il a dit (bonjour) fort"), "Il a dit (bonjour) fort");
  assert.equal(stripSdhText("(музыка)"), "(музыка)");
  assert.equal(stripSdhText("(歌詞)"), "(歌詞)");
  assert.equal(stripSdhText("（ドアの音）"), "（ドアの音）");
  assert.equal(stripSdhText("【重要】"), "【重要】");
  assert.equal(stripSdhText("Text with (unclosed paren"), "Text with (unclosed paren");
});

test("song lyrics are the film, not furniture, so music notes are never touched", () => {
  const lyric = "♪ Hello darkness my old friend ♪";
  assert.equal(stripSdhText(lyric), lyric);
  assert.equal(stripSdhText("♪ 今日はいい天気 ♪"), "♪ 今日はいい天気 ♪");
  assert.equal(stripSdhText("♪ (music) ♪"), "♪ (music) ♪");
  assert.equal(stripSdhText("♪♪♪"), "♪♪♪");
});

test("multi-line cues drop only the lines that empty out", () => {
  assert.equal(stripSdhText("[door creaks]\nHello there"), "Hello there");
  assert.equal(stripSdhText("[DOOR CREAKS]\n[WIND HOWLS]"), "");
  assert.equal(stripSdhText("JOHN:\nI told you so."), "I told you so.");
  assert.equal(stripSdhText("- JOHN: Hi.\n- MARY: Bye."), "- Hi.\n- Bye.");
  assert.equal(stripSdhText("[sighs]\nJOHN: Fine.\n(quietly) Go."), "Fine.\n(quietly) Go.");
});

test("a line that keeps any real character is kept, orphan punctuation and all", () => {
  assert.equal(stripSdhText("Meet me at [REDACTED]."), "Meet me at .");
  assert.equal(stripSdhText("MAN (V.O.): Long ago."), "MAN (V.O.): Long ago.");
  assert.equal(stripSdhText("— SFX: [glass shatters]"), "— SFX:");
  assert.equal(stripSdhText("1. Numbered list item"), "1. Numbered list item");
});

test("empty and absent input round-trips rather than throwing", () => {
  assert.equal(stripSdhText(""), "");
  assert.equal(stripSdhText("   "), "");
  assert.equal(stripSdhText("\n\n"), "");
});

test("the filter never invents ass override tags or eats existing ones", () => {
  assert.equal(stripSdhText("{\\an8}[wind howls] top"), "{\\an8} top");
  assert.equal(stripSdhText("{\\k50}La {\\k50}la ♪"), "{\\k50}La {\\k50}la ♪");
});

const SDH_SRT = "1\n00:00:01,000 --> 00:00:03,000\n[door creaks]\nJOHN: Hi.\n\n";
const SDH_CUES = [{ start: 1, end: 3, text: "[door creaks]\nJOHN: Hi." }];

test("parsing and preparing keep SDH text in the stored cues", async () => {
  assert.deepEqual(
    parseSubtitle(SDH_SRT, "srt").map(({ start, end, text }) => ({ start, end, text })),
    SDH_CUES,
  );
  const prepared = await prepareSubtitleBytes(
    "https://subs.test/a.srt",
    new TextEncoder().encode(SDH_SRT),
    { format: "srt", filename: "a.srt" },
    { createPlayable: async () => ({ url: "blob:a", cleanup() {} }), limits: { minimumCues: 1 } },
  );
  assert.equal(prepared.cues[0].text, "[door creaks]\nJOHN: Hi.");
});

test("the html5 engine strips at read time and never mutates the parsed cue model", async () => {
  const h = html5BridgeHarness({ "C:/subs/a.srt": SDH_CUES });
  assert.equal(await h.bridge.addSubtitle("C:/subs/a.srt", "en", "A", true), true);
  h.at(2);
  assert.equal(h.snapshot().subText, "[door creaks]\nJOHN: Hi.");
  h.bridge.setSubHideSdh?.(true);
  assert.equal(h.snapshot().subText, "Hi.", "turning the filter on rereads the current cue");
  assert.equal(h.bridge.getSelectedTrackCues()?.[0].text, "[door creaks]\nJOHN: Hi.");
  h.bridge.setSubHideSdh?.(false);
  assert.equal(h.snapshot().subText, "[door creaks]\nJOHN: Hi.", "turning it off restores it");
});

async function mpvSdhProps(settings: Record<string, unknown>, sdhAllowed?: boolean) {
  const sent = new Map<string, unknown>();
  const code = ts.transpileModule(read("src/lib/player/sub-style.ts"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const mod: { applySubStyle?: (s: unknown, c?: unknown) => Promise<void> } = {};
  new Function("require", "exports", code)((name: string) => {
    assert.equal(name, "@tauri-apps/api/core", `Unexpected import ${name}`);
    return {
      invoke: async (_cmd: string, { name: prop, value }: { name: string; value: unknown }) => {
        sent.set(prop, value);
      },
    };
  }, mod);
  await mod.applySubStyle!(
    { subFontFamily: "inter", subFontColor: "#ffffff", subBorderColor: "#000000", ...settings },
    { assNativeActive: false, imageNativeActive: false, sdhFilterAllowed: sdhAllowed },
  );
  return sent;
}

test("mpv gets the safe filter level only, and never a rewritten enclosure list", async () => {
  const on = await mpvSdhProps({ subHideSdh: true });
  assert.equal(on.get("sub-filter-sdh"), true);
  assert.equal(on.get("sub-filter-sdh-harder"), false);
  assert.equal(on.has("sub-filter-sdh-enclosures"), false);
  assert.equal(on.has("sub-filter-regex"), false);
  assert.equal((await mpvSdhProps({ subHideSdh: false })).get("sub-filter-sdh"), false);
  assert.equal((await mpvSdhProps({ subHideSdh: true }, false)).get("sub-filter-sdh"), false);
});

test("the setting is off by default and gated off for forced and foreign-only tracks", async () => {
  const { DEFAULT } = await import("../src/lib/settings/defaults.ts");
  assert.equal(DEFAULT.subHideSdh, false);
  assert.equal(sdhFilterAllowed(null), true);
  assert.equal(sdhFilterAllowed({ lang: "en" }), true);
  assert.equal(sdhFilterAllowed({ lang: "en", forced: true }), false);
  assert.equal(sdhFilterAllowed({ lang: "en", foreignOnly: true }), false);
  assert.equal(sdhFilterAllowed({ lang: "ar" }), false);
});
