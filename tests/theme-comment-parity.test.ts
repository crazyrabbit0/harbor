// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import * as mentions from "../src/lib/social/mentions.ts";
import * as textSafety from "../src/views/profile/text-safety.ts";
import * as bbcode from "../src/views/settings/theme-panel/custom-themes-section/community-store/comments/bbcode.ts";
import { hookHarness, loadModule } from "./helpers/hook-harness.ts";

const store = "src/views/settings/theme-panel/custom-themes-section/community-store";

type N = { type: unknown; key?: unknown; props: Record<string, any> & { children?: unknown } };
const element = (type: unknown, props: N["props"], key?: unknown) => ({ type, props, key });
const jsx = { jsx: element, jsxs: element, Fragment: "Fragment" };
const icons = new Proxy({}, { get: (_t, name) => String(name) });
const keyT = () => (s: string) => s;

// Resolves function components into their output so the whole tree is host elements.
const expand = (n: unknown): unknown => {
  if (Array.isArray(n)) return n.map(expand);
  if (!n || typeof n !== "object") return n;
  const node = n as N;
  if (typeof node.type === "function")
    return expand((node.type as (p: unknown) => unknown)(node.props));
  return { ...node, props: { ...node.props, children: expand(node.props?.children) } };
};
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
const describe = (n: unknown): string[] => {
  if (typeof n === "string") return [`text:${n}`];
  if (Array.isArray(n)) return n.flatMap(describe);
  if (!n || typeof n !== "object") return [];
  const node = n as N;
  if (node.type === "MentionLink") return [`mention:${node.props.handle}:${node.props.label}`];
  if (node.props.title === "Hidden language") return [`masked:${text(node)}`];
  return describe(node.props.children);
};

function themeBody(body: string) {
  const h = hookHarness(`${store}/comments/comment-render.tsx`, "CommentBody", {
    "@/lib/social/link-out-activation": { handleLinkOutActivation: () => {} },
    "@/lib/social/link-out": { openLinkOut: () => {} },
    "@/lib/i18n": { useT: keyT },
    "@/lib/social/mentions": mentions,
    "@/views/profile/mention-link": { MentionLink: "MentionLink" },
    "@/views/profile/text-safety": textSafety,
    "./bbcode": bbcode,
    "react/jsx-runtime": jsx,
  });
  return expand(h.render({ text: body }));
}

function profileBody(body: string) {
  const h = hookHarness(
    "src/views/profile/comment-item.tsx",
    "SafeBody",
    {
      "lucide-react": icons,
      "@/lib/i18n": { useT: keyT },
      "@/lib/social/mentions": mentions,
      "./profile-bits": { Avatar: "Avatar", timeAgo: () => "now" },
      "./comment-compose": { CommentCompose: "CommentCompose" },
      "./mention-link": { MentionLink: "MentionLink" },
      "./text-safety": textSafety,
      "./user-hover-card": { UserHoverCard: "UserHoverCard" },
      "./use-self-avatar": { useSelfAvatar: () => ({ handle: null, avatar: null }) },
      "@/views/account/verified-badge": { VerifiedBadge: "VerifiedBadge" },
      "react/jsx-runtime": jsx,
    },
    {},
    ["SafeBody"],
  );
  return expand(h.render({ body }));
}

test("theme comments linkify mentions like profile comments do", () => {
  const body = "hey @ada and @bob look";
  const theme = themeBody(body);
  const links = all(theme).filter((n) => n.type === "MentionLink");
  assert.deepEqual(
    links.map((n) => [n.props.handle, n.props.label]),
    [
      ["ada", "@ada"],
      ["bob", "@bob"],
    ],
  );
  assert.deepEqual(describe(theme), describe(profileBody(body)));
});

test("theme comments mask profanity like profile comments do", () => {
  const body = "well shit happens";
  const theme = themeBody(body);
  assert.deepEqual(describe(theme), ["text:well ", "masked:shit", "text: happens"]);
  assert.deepEqual(describe(theme), describe(profileBody(body)));
});

test("mentions survive inside bbcode formatting", () => {
  const tree = themeBody("[b]hi @ada[/b] and [i]@bob[/i]");
  const strong = all(tree).find((n) => n.type === "strong")!;
  assert.deepEqual(
    all(strong)
      .filter((n) => n.type === "MentionLink")
      .map((n) => n.props.handle),
    ["ada"],
  );
  const em = all(tree).find((n) => n.type === "em")!;
  assert.deepEqual(
    all(em)
      .filter((n) => n.type === "MentionLink")
      .map((n) => n.props.handle),
    ["bob"],
  );
});

function themeItem(comment: Record<string, unknown>) {
  const opened: string[] = [];
  const h = hookHarness(`${store}/comments/comment-item.tsx`, "CommentItem", {
    "../../../../icons": icons,
    "@/lib/i18n": { useT: keyT },
    "@/views/profile/user-hover-card": { UserHoverCard: "UserHoverCard" },
    "@/views/profile/profile-bits": { Avatar: "Avatar" },
    "@/lib/social/open-profile": { requestOpenProfile: (handle: string) => opened.push(handle) },
    "@/views/settings/kit": { ROW_ACTION: "", ROW_ACTION_DANGER: "" },
    "@/views/settings/shared": { ROW_TITLE: "" },
    "./comment-render": { CommentBody: "CommentBody" },
    "./comment-composer": { CommentComposer: "CommentComposer" },
    "../time-ago": { timeAgo: () => "now" },
    "react/jsx-runtime": jsx,
  });
  const base = { id: "c1", body: "hi", createdAt: "2026-01-01", canDelete: false };
  return { tree: h.render({ comment: { ...base, ...comment }, onDelete: async () => {} }), opened };
}

function profileItem(authorHandle: string) {
  const opened: string[] = [];
  const h = hookHarness("src/views/profile/comment-item.tsx", "CommentItem", {
    "lucide-react": icons,
    "@/lib/i18n": { useT: keyT },
    "@/lib/social/mentions": mentions,
    "./profile-bits": { Avatar: "Avatar", timeAgo: () => "now" },
    "./comment-compose": { CommentCompose: "CommentCompose" },
    "./mention-link": { MentionLink: "MentionLink" },
    "./text-safety": textSafety,
    "./user-hover-card": { UserHoverCard: "UserHoverCard" },
    "./use-self-avatar": { useSelfAvatar: () => ({ handle: null, avatar: null }) },
    "@/views/account/verified-badge": { VerifiedBadge: "VerifiedBadge" },
    "react/jsx-runtime": jsx,
  });
  const c = { id: "c1", body: "hi", at: "2026-01-01", authorHandle, authorAlias: "Ada" };
  const tree = h.render({
    c,
    canDelete: false,
    onDelete: () => {},
    onOpenAuthor: (handle: string) => opened.push(handle),
  });
  return { tree, opened };
}

test("the author is clickable and hoverable in both surfaces", () => {
  for (const [name, surface] of [
    ["theme", themeItem({ author: "Ada", authorHandle: "ada" })],
    ["profile", profileItem("ada")],
  ] as const) {
    const cards = all(surface.tree).filter((n) => n.type === "UserHoverCard");
    assert.ok(cards.length >= 2, `${name} avatar and name each get a hover card`);
    assert.ok(
      cards.every((n) => n.props.handle === "ada"),
      `${name} hover cards target the author`,
    );
    assert.ok(
      all(surface.tree).some((n) => n.type === "Avatar"),
      `${name} comments show an avatar`,
    );
    for (const card of cards) (card.props.children as N).props.onClick();
    assert.deepEqual(surface.opened, ["ada", "ada"], `${name} clicks open the author's profile`);
  }
});

test("a theme comment without an author handle has no hover card or profile link", () => {
  const { tree } = themeItem({ author: "Ada", authorHandle: null });
  assert.equal(
    all(tree).some((n) => n.type === "UserHoverCard" || n.type === "Avatar"),
    false,
  );
});

test("the theme comment type carries the fields the server now returns", async () => {
  const comments = [
    { id: "a", authorHandle: "ada", authorAvatar: "/avatars/a.png", body: "x" },
    { id: "b", authorHandle: 7, authorAvatar: "https://cdn.test/b.png", body: "y" },
    { id: "c", body: "z" },
  ];
  const mod = loadModule(
    "src/lib/theme-store.ts",
    {
      "@/lib/custom-themes": {},
      "@/lib/theme-scan": {},
      "@/lib/safe-fetch": {
        safeFetch: async () => ({ ok: true, json: async () => ({ comments }) }),
      },
      "./theme-auth": { authToken: () => null },
      "@/lib/theme-updates": {},
      "@/lib/harborstyle": {},
      "@/lib/config/endpoints": { HARBOR_API_BASE: "https://api.test", HARBOR_DATA_BASE: "" },
    },
    {},
  );
  const listed = await mod.listComments("t1");
  assert.deepEqual(
    listed.map((c: Record<string, unknown>) => [c.authorHandle, c.authorAvatar]),
    [
      ["ada", "https://api.test/avatars/a.png"],
      [null, "https://cdn.test/b.png"],
      [null, null],
    ],
  );
});
