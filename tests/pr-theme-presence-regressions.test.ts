// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import "./_localstorage-stub.ts";
import * as presence from "../src/lib/social/presence.ts";
import {
  matchesThemeBehavior,
  themeBehavior,
} from "../src/views/settings/theme-panel/custom-themes-section/community-store/theme-behavior-filter.ts";
import { flushPromises, hookHarness } from "./helpers/hook-harness.ts";

const { PRESENCE_META, presenceStatusLabel, resolvePresence } = presence;

type N = { type: unknown; key?: unknown; props: Record<string, any> & { children?: unknown } };
const element = (type: unknown, props: N["props"], key?: unknown) => ({ type, props, key });
const jsx = { jsx: element, jsxs: element, Fragment: "Fragment" };
const all = (n: unknown): N[] =>
  Array.isArray(n)
    ? n.flatMap(all)
    : n && typeof n === "object"
      ? [n as N, ...all((n as N).props?.children)]
      : [];
const text = (n: unknown): string =>
  typeof n === "string" || typeof n === "number"
    ? String(n)
    : Array.isArray(n)
      ? n.map(text).join("")
      : n && typeof n === "object"
        ? text((n as N).props?.children)
        : "";
const icons = new Proxy({}, { get: (_t, name) => String(name) });
const keyT = () => (s: string) => s;

function friendsPanel(friends: Array<Record<string, unknown>>) {
  const h = hookHarness("src/views/profile/friends-panel.tsx", "FriendsPanel", {
    "lucide-react": icons,
    "@/lib/i18n": { useT: keyT },
    "@/lib/social/presence": presence,
    "./add-friends-modal": { AddFriendsModal: "AddFriendsModal" },
    "./profile-bits": { Avatar: "Avatar" },
    "./user-hover-card": { UserHoverCard: "UserHoverCard" },
    "react/jsx-runtime": jsx,
  });
  const tree = h.render({ friends });
  const rows = all(tree).filter((n) => typeof n.type === "function");
  return {
    tree,
    handles: rows.map((n) => n.props.f.handle as string),
    online: all(tree).find((n) => n.type === "span" && n.props.className === "text-success"),
    headers: all(tree)
      .filter((n) => n.type === "div" && typeof n.props.children === "string")
      .map((n) => n.props.children as string),
  };
}

async function hoverCard(presenceOverride?: string) {
  const h = hookHarness(
    "src/views/profile/user-hover-card.tsx",
    "ProfileHoverCard",
    {
      "react-dom": { createPortal: (tree: unknown) => tree },
      "@/lib/social/open-profile": { requestOpenProfile: () => {} },
      "@/lib/region-flags": { regionFlagSrc: () => null },
      "@/lib/use-reduced-motion": { useReducedMotion: () => false },
      "@/lib/i18n": { useT: keyT },
      "@/lib/social/presence": presence,
      "@/lib/social/profile-api": {
        fetchSummary: async (handle: string) => ({
          handle,
          alias: "Ada",
          presence: "online",
          online: true,
        }),
        fetchBadges: async () => [],
      },
      "@/lib/social/badge-catalog": { orderShownBadges: (b: unknown[]) => b },
      "@/components/hover-tooltip": { HoverTooltip: "HoverTooltip" },
      "./profile-bits": { Avatar: "Avatar", VerifiedCheck: "VerifiedCheck" },
      "./use-self-avatar": { useSelfAvatar: () => ({ handle: null, avatar: null }) },
      "react/jsx-runtime": jsx,
    },
    { window: { innerWidth: 1200, innerHeight: 800 }, document: { body: {} } },
  );
  const props = {
    handle: "ada",
    presence: presenceOverride,
    anchor: { left: 600, right: 700, top: 100, bottom: 140 },
    onEnter: () => {},
    onLeave: () => {},
  };
  h.render(props);
  await flushPromises();
  return h.render(props);
}

test("legacy and absent layouts map to their effective theme behavior", () => {
  for (const layout of [null, undefined, "", "sidebar", "dracula", "nord", "forest"]) {
    assert.equal(themeBehavior(layout), "sidebar", `${String(layout)} should use the sidebar`);
  }
  assert.equal(themeBehavior("royal"), "topdock");
});

test("direct theme behaviors retain their own filter identity", () => {
  for (const behavior of [
    "sidebar",
    "topdock",
    "rail",
    "stremio",
    "minui",
    "cinematic",
    "custom",
  ] as const) {
    assert.equal(themeBehavior(behavior), behavior);
    assert.equal(matchesThemeBehavior(behavior, behavior), true);
  }
  assert.equal(themeBehavior("unknown-layout"), null);
});

test("explicit presence wins over a stale online compatibility boolean", () => {
  assert.equal(resolvePresence("offline", true), "offline");
  assert.equal(resolvePresence("online", false), "online");
  assert.equal(resolvePresence("away", false), "away");
  assert.equal(resolvePresence("dnd", true), "dnd");
  assert.equal(resolvePresence(undefined, true), "online");
  assert.equal(resolvePresence(undefined, false), "offline");
});

test("offline presence is described as state, not as the owner's visibility action", () => {
  assert.notEqual(presenceStatusLabel("offline"), PRESENCE_META.offline.label);
  for (const status of ["online", "away", "dnd"] as const) {
    assert.equal(presenceStatusLabel(status), PRESENCE_META[status].label);
  }
});

test("the hover card shows the resolved presence state label", async () => {
  const offline = text(await hoverCard("offline"));
  assert.ok(offline.includes(presenceStatusLabel("offline")));
  assert.ok(!offline.includes(PRESENCE_META.offline.label));
  assert.ok(text(await hoverCard("dnd")).includes(PRESENCE_META.dnd.label));
  assert.ok(
    text(await hoverCard()).includes(PRESENCE_META.online.label),
    "without an override the loaded summary decides",
  );
});

test("friends are counted, ordered, and grouped through resolved presence", () => {
  const friends = [
    { handle: "stale", presence: "offline", online: true },
    { handle: "explicit", presence: "online", online: false },
    { handle: "status-away", status: "away", online: false },
    { handle: "flag-only", online: true },
    { handle: "gone", online: false },
    { handle: "busy", presence: "dnd", online: false },
  ];
  const panel = friendsPanel(friends);
  assert.deepEqual(panel.handles, [
    "explicit",
    "status-away",
    "flag-only",
    "busy",
    "stale",
    "gone",
  ]);
  assert.equal(panel.online?.props.children, 4, "the counter uses resolved presence");
  assert.deepEqual(panel.headers, ["Online now", "Offline"]);
});

test("the visible page keeps online friends ahead of offline ones", () => {
  const offline = ["o1", "o2", "o3", "o4"].map((handle) => ({ handle, online: false }));
  const online = ["n1", "n2", "n3", "n4"].map((handle) => ({ handle, online: true }));
  const panel = friendsPanel([...offline, ...online]);
  assert.deepEqual(panel.handles, ["n1", "n2", "n3", "n4", "o1", "o2"]);
});
