import assert from "node:assert/strict";
import test from "node:test";
import { profileRosterFor } from "./helpers/profile-roster.ts";

function roster(value: unknown) {
  const raw = typeof value === "string" ? value : JSON.stringify(value);
  return profileRosterFor({ getItem: (key) => (key === "harbor.profiles.v1" ? raw : null) });
}

const state = {
  activeId: "kid",
  profiles: [
    { id: "main", isPrimary: true },
    { id: "kid", settingsLinked: false, shareStremioWith: "main" },
    { id: "guest", shareStremioWith: "gone" },
  ],
};

test("settings scope follows the active profile's link", () => {
  const r = roster(state);
  assert.deepEqual(r.activeSettingsSource(), { profileId: "kid", linked: false });
  assert.equal(r.separateProfileKey("harbor.ratings.v1", "harbor.ratings"), "harbor.ratings.kid");
  const linked = roster({ ...state, activeId: "main" });
  assert.equal(
    linked.separateProfileKey("harbor.ratings.v1", "harbor.ratings"),
    "harbor.ratings.v1",
  );
});

test("Stremio data follows a share target only when it exists", () => {
  assert.equal(roster(state).stremioDataProfileId(), "main");
  assert.equal(roster({ ...state, activeId: "guest" }).stremioDataProfileId(), "guest");
  assert.equal(roster({ ...state, activeId: "missing" }).stremioDataProfileId(), "main");
  assert.equal(roster({ ...state, activeId: "kid" }).primaryOrStremioProfileId(), "main");
});

test("a missing or corrupt roster reads as empty with the default scope", () => {
  for (const value of [null, "{not json", { profiles: "x" }]) {
    const r = roster(value === null ? "" : value);
    assert.deepEqual(r.readRoster(), { profiles: [], activeId: null });
    assert.deepEqual(r.activeSettingsSource(), { profileId: "default", linked: true });
    assert.equal(r.stremioDataProfileId(), "");
  }
});
