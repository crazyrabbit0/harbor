import "./_localstorage-stub.ts";
import assert from "node:assert/strict";
import test from "node:test";
import { mangaRemoteUiUrl, remoteUiUrl, remoteWsUrl } from "../src/lib/remote/protocol.ts";
import {
  REMOTE_KEY_STORAGE,
  readRemoteKey,
  remoteFrameAllowed,
  withRemoteKey,
} from "../src/lib/remote/remote-auth.ts";
import { handoffUrl } from "../src/lib/tv-handoff/handoff-code.ts";

const KEY = "ab".repeat(32);

test("phone remote URLs carry the pairing key", () => {
  assert.equal(remoteUiUrl("192.168.1.5", KEY), `http://192.168.1.5:11471/remote?k=${KEY}`);
  assert.equal(mangaRemoteUiUrl("192.168.1.5", KEY), `http://192.168.1.5:11471/reader?k=${KEY}`);
  assert.equal(remoteWsUrl("10.0.0.2", 11471, KEY), `ws://10.0.0.2:11471/api/remote?k=${KEY}`);
});

test("URLs without a key stay bare", () => {
  assert.equal(remoteUiUrl("h", null), "http://h:11471/remote");
  assert.equal(remoteWsUrl("h"), "ws://h:11471/api/remote");
});

test("withRemoteKey appends to an existing query with &", () => {
  assert.equal(
    withRemoteKey("http://h:1/setup?setup=ABC", KEY),
    `http://h:1/setup?setup=ABC&k=${KEY}`,
  );
  assert.equal(withRemoteKey("http://h:1/", "a b"), "http://h:1/?k=a%20b");
  assert.equal(withRemoteKey("http://h:1/", ""), "http://h:1/");
});

test("the TV hand-off link carries the key so the phone stays a remote afterwards", () => {
  assert.equal(
    handoffUrl("192.168.1.5", "ABCD", 11471, KEY),
    `http://192.168.1.5:11471/setup?setup=ABCD&k=${KEY}`,
  );
});

test("readRemoteKey takes k from the page URL and remembers it", () => {
  localStorage.removeItem(REMOTE_KEY_STORAGE);
  assert.equal(readRemoteKey(`?x=1&k=${KEY}`), KEY);
  assert.equal(localStorage.getItem(REMOTE_KEY_STORAGE), KEY);
  assert.equal(readRemoteKey(""), KEY);
  assert.equal(readRemoteKey("?k=not-hex"), KEY);
  localStorage.removeItem(REMOTE_KEY_STORAGE);
  assert.equal(readRemoteKey(""), null);
});

test("authed connections pass every frame", () => {
  assert.equal(
    remoteFrameAllowed({ t: "cmd", command: { action: "seek", positionSec: 1 } }, true),
    true,
  );
});

test("unauthed connections lose every control command", () => {
  for (const command of [
    { action: "togglePlayback" },
    { action: "seek", positionSec: 4 },
    { action: "nav", key: "select" },
    { action: "setText", value: "x" },
    { action: "setProfile", id: "p" },
    {
      action: "libraryAction",
      metaId: "tt1",
      metaType: "movie",
      op: { kind: "watched", on: true },
    },
    { action: "castDiscover" },
    { action: "mangaTurnPage", dir: "next" },
    { action: "playMeta", metaId: "tt1", metaType: "movie" },
    { action: "setConfig", settings: { a: true } },
  ]) {
    assert.equal(remoteFrameAllowed({ t: "cmd", command } as never, false), false, command.action);
  }
});

test("unauthed connections keep the frames other subsystems authenticate or need", () => {
  assert.equal(remoteFrameAllowed({ t: "hello", client: "harbor-remote", proto: 1 }, false), true);
  assert.equal(remoteFrameAllowed({ t: "cmd", command: { action: "ping" } }, false), true);
  const playOn = {
    t: "cmd",
    id: "c1",
    command: { action: "playMeta", metaId: "tt1", metaType: "movie", fromInstance: "peer-1" },
  };
  assert.equal(
    remoteFrameAllowed(playOn as never, false),
    false,
    "Play-on frames are verified by their pairing token in play-on-route, not let through here",
  );
});
