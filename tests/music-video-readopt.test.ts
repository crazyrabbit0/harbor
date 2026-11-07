import test from "node:test";
import assert from "node:assert/strict";
import { flushPromises } from "./helpers/hook-harness.ts";
import {
  FakeMedia,
  loadVideoHost,
  mountVideoSurface,
  videoStream,
} from "./helpers/music-video-harness.ts";

const trackA = { id: "a", connectorId: "youtube", title: "A", mediaKind: "video" };
const trackB = { id: "b", connectorId: "youtube", title: "B", mediaKind: "video" };

function mounted(options: Parameters<typeof mountVideoSurface>[0] = { held: true }) {
  const m = mountVideoSurface(options);
  for (let i = 0; i < 3; i++) m.render({ track: trackA });
  const { video } = m.host.musicVideoHost();
  const park = m.body.children[0];
  assert.equal(video.parentElement, m.shell, "the surface never adopted the picture");
  return { ...m, video, park };
}

test("the picture is re-adopted when the track changes, not only on mount", () => {
  const m = mounted();
  m.host.parkMusicVideoHost();
  m.render({ track: trackB });
  assert.equal(m.video.parentElement, m.shell, "a track change left the picture parked");
});

test("the picture is re-adopted when a new stream resolves", async () => {
  const m = mounted({});
  m.host.parkMusicVideoHost();
  await flushPromises();
  m.render({ track: trackA });
  assert.equal(m.host.musicVideoHostSource("youtube:a"), videoStream);
  assert.equal(m.video.parentElement, m.shell, "the resolved stream left the picture parked");
});

test("adoption still reacts to fullscreen and ownership", () => {
  const m = mounted();
  m.host.parkMusicVideoHost();
  m.fullscreen.active = true;
  m.render({ track: trackA });
  assert.equal(m.video.parentElement, m.shell, "entering fullscreen left the picture parked");

  const mine = m.session.owner;
  m.session.owner = Symbol("another surface");
  m.render({ track: trackA });
  assert.equal(m.video.parentElement, m.park, "a surface that lost the session kept the picture");
  m.session.owner = mine;
  m.render({ track: trackA });
  assert.equal(m.video.parentElement, m.shell, "regaining the session did not re-adopt");

  m.render({ track: trackA, active: false });
  assert.equal(m.video.parentElement, m.park, "an inactive surface kept the picture");
  m.render({ track: trackA });
  m.render({ track: trackA });
  assert.equal(m.video.parentElement, m.shell, "reactivating did not re-adopt");
});

test("ending a session parks the picture, which is why re-adoption is required", () => {
  const m = mounted();
  m.host.releaseMusicVideoHostSource("youtube:a");
  assert.equal(m.video.parentElement, m.park);
  assert.equal(m.video.hasAttribute("src"), false);
});

test("adoption re-parents rather than rebuilding, so playback survives the move", () => {
  const { host } = loadVideoHost();
  const nodes = host.setMusicVideoHostSource("youtube:a", videoStream);
  const loads = nodes.video.loads;
  const surface = new FakeMedia();
  const placeholder = surface.appendChild(new FakeMedia());
  host.adoptMusicVideoHost(surface);
  assert.deepEqual(surface.children, [nodes.video, nodes.audio, placeholder]);
  assert.equal(host.musicVideoHost(), nodes, "adoption rebuilt the media elements");
  assert.equal(nodes.video.loads, loads, "adoption reassigned the source");
  assert.equal(nodes.video.src, videoStream.url);
});

test("the picture is adopted into the surface itself, never straight into the fullscreen stage", () => {
  const stage = new FakeMedia();
  const m = mounted({ held: true, fullscreen: { active: true, stage } });
  assert.equal(m.video.parentElement, m.shell);
  assert.equal(stage.children.length, 0);
});
