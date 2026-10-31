import {
  getCustomThemes,
  parseThemeJson,
  saveCustomTheme,
  type CustomTheme,
} from "@/lib/custom-themes";
import { scanTheme } from "@/lib/theme-scan";
import { safeFetch } from "@/lib/safe-fetch";
import { authToken } from "./theme-auth";
import { getDownloadRecords, recordDownloadedTheme } from "@/lib/theme-updates";
import { parseHarborStyle } from "@/lib/harborstyle";
import { HARBOR_API_BASE, HARBOR_DATA_BASE } from "@/lib/config/endpoints";

const ORIGIN = HARBOR_API_BASE;
const API = `${ORIGIN}/themes/api`;
const INDEX_BASE = `${HARBOR_DATA_BASE}/themes`;
export const THEME_SUBMIT_URL =
  "https://github.com/crazyrabbit0/harbor/blob/main/data/themes/README.md";
const UPLOADS_KEY = "harbor.theme-uploads.v1";
const CLIENT_KEY = "harbor.theme-client-id";

export type StoreTheme = {
  id: string;
  name: string;
  author: string;
  authorHandle?: string | null;
  authorAvatar: string | null;
  blurb: string;
  swatch: string[];
  cover: string | null;
  screenshots: string[];
  layout: string | null;
  downloads: number;
  ratingAvg: number;
  ratingCount: number;
  visibility: "public" | "unlisted";
  status: "pending" | "approved" | "rejected";
  share: string;
  createdAt: string;
  updatedAt?: string;
  versionsCount?: number;
  hasPendingUpdate?: boolean;
  updateSubmittedAt?: string | null;
};

function abs(u: string | null | undefined): string | null {
  if (!u) return null;
  return u.startsWith("http") ? u : `${ORIGIN}${u}`;
}

function bust(u: string | null, rev: string | number | undefined): string | null {
  if (!u || rev == null || rev === "") return u;
  return `${u}${u.includes("?") ? "&" : "?"}v=${encodeURIComponent(String(rev))}`;
}

function normalize(t: Record<string, unknown>): StoreTheme {
  const rev = (t.versionsCount as number | undefined) ?? (t.updatedAt as string | undefined);
  return {
    ...(t as unknown as StoreTheme),
    authorAvatar: abs(t.authorAvatar as string | null),
    cover: bust(abs(t.cover as string | null), rev),
    screenshots: ((t.screenshots as string[]) || [])
      .map((s) => bust(abs(s), rev) as string)
      .filter(Boolean),
  };
}

export function clientId(): string {
  let id = localStorage.getItem(CLIENT_KEY);
  if (!id) {
    id = (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`)
      .replace(/-/g, "")
      .slice(0, 24);
    localStorage.setItem(CLIENT_KEY, id);
  }
  return id;
}

function authHeaders(): Record<string, string> {
  const token = authToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

type IndexEntry = {
  id: string;
  name: string;
  author?: string;
  blurb?: string;
  swatch?: string[];
  layout?: string | null;
  file: string;
  cover?: string | null;
  screenshots?: string[];
  version?: number;
  createdAt?: string;
  updatedAt?: string;
};

const SAFE_FILE = /^[a-z0-9][a-z0-9._-]*$/i;

function indexAsset(name: string | null | undefined): string | null {
  if (!name) return null;
  if (name.startsWith("https://")) return name;
  return SAFE_FILE.test(name) ? `${INDEX_BASE}/${name}` : null;
}

function fromIndex(e: IndexEntry): StoreTheme {
  const rev = e.version ?? 1;
  return {
    id: e.id,
    name: e.name,
    author: e.author ?? "",
    authorHandle: null,
    authorAvatar: null,
    blurb: e.blurb ?? "",
    swatch: Array.isArray(e.swatch) ? e.swatch : [],
    cover: bust(indexAsset(e.cover), rev),
    screenshots: (e.screenshots ?? [])
      .map((s) => bust(indexAsset(s), rev))
      .filter((s): s is string => !!s),
    layout: e.layout ?? null,
    downloads: 0,
    ratingAvg: 0,
    ratingCount: 0,
    visibility: "public",
    status: "approved",
    share: `https://github.com/crazyrabbit0/harbor/blob/main/data/themes/${e.file}`,
    createdAt: e.createdAt ?? "",
    updatedAt: e.updatedAt,
    versionsCount: rev,
  };
}

let indexCache: { at: number; entries: IndexEntry[] } | null = null;
const INDEX_TTL_MS = 10 * 60_000;

// The theme library is the read-only index in the repo's data/themes folder.
async function loadIndex(): Promise<IndexEntry[]> {
  if (indexCache && Date.now() - indexCache.at < INDEX_TTL_MS) return indexCache.entries;
  const r = await safeFetch(`${INDEX_BASE}/index.json`, { cache: "no-cache" });
  if (!r.ok) throw new Error("Could not reach the theme library.");
  const d = (await r.json()) as { themes?: unknown };
  const entries = (Array.isArray(d.themes) ? d.themes : []).filter(
    (e): e is IndexEntry =>
      !!e &&
      typeof (e as IndexEntry).id === "string" &&
      typeof (e as IndexEntry).name === "string" &&
      typeof (e as IndexEntry).file === "string" &&
      SAFE_FILE.test((e as IndexEntry).file),
  );
  indexCache = { at: Date.now(), entries };
  return entries;
}

export async function browseThemes(sort = "top", q = ""): Promise<StoreTheme[]> {
  const needle = q.trim().toLowerCase();
  const list = (await loadIndex())
    .map(fromIndex)
    .filter((t) => !needle || `${t.name} ${t.author} ${t.blurb}`.toLowerCase().includes(needle));
  if (sort === "new") list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return list;
}

export async function downloadTheme(
  id: string,
  preview?: string | null,
  versionsCount?: number,
): Promise<CustomTheme> {
  const entry = (await loadIndex()).find((e) => e.id === id);
  if (!entry) throw new Error("Theme not found.");
  const r = await safeFetch(`${INDEX_BASE}/${entry.file}`, { cache: "no-cache" });
  if (!r.ok) throw new Error("Download failed.");
  const text = await r.text();
  const parsed = entry.file.endsWith(".json") ? parseThemeJson(text) : parseHarborStyle(text);
  if (!parsed.ok) throw new Error(parsed.error);
  const existing = Object.entries(getDownloadRecords()).find(
    ([savedId, rec]) => rec.storeId === id && getCustomThemes().some((t) => t.id === savedId),
  );
  const base: CustomTheme = {
    ...parsed.theme,
    ...(existing ? { id: existing[0] } : {}),
    origin: "community",
  };
  // parseThemeJson never carries previewImage, and the update path passes no new
  // preview, so an update would blank the card. Fall back to the saved preview.
  const prevPreview = existing
    ? getCustomThemes().find((t) => t.id === existing[0])?.previewImage
    : undefined;
  const nextPreview = preview ?? prevPreview;
  const theme = nextPreview ? { ...base, previewImage: nextPreview } : base;
  const scan = scanTheme({ css: theme.css, js: theme.js, html: theme.html });
  if (scan.verdict === "block") {
    const f = scan.findings.find((x) => x.severity === "block");
    throw new Error(
      `Blocked for your safety: this theme's code looks unsafe (${f?.rule ?? "malicious pattern"}). ${f?.rationale ?? ""}`.trim(),
    );
  }
  if (!saveCustomTheme(theme)) {
    throw new Error(
      "Storage is full, so this theme could not be saved. Remove some downloaded themes or background images and try again.",
    );
  }
  markUnseenDownload(theme.id);
  recordDownloadedTheme(theme.id, id, versionsCount ?? 0, theme.name);
  return theme;
}

const UNSEEN_KEY = "harbor.theme-unseen.v1";
const unseenSubs = new Set<() => void>();

function readUnseen(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(UNSEEN_KEY) || "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function writeUnseen(ids: string[]): void {
  try {
    localStorage.setItem(UNSEEN_KEY, JSON.stringify(ids));
  } catch {
    /* ignore */
  }
  for (const fn of unseenSubs) fn();
}

export function getUnseenDownloads(): string[] {
  return readUnseen();
}

export function markUnseenDownload(id: string): void {
  const cur = readUnseen();
  if (!cur.includes(id)) writeUnseen([...cur, id]);
}

export function clearUnseenDownloads(): void {
  if (readUnseen().length) writeUnseen([]);
}

export function subscribeUnseen(fn: () => void): () => void {
  unseenSubs.add(fn);
  return () => {
    unseenSubs.delete(fn);
  };
}

export async function rateTheme(id: string, value: number): Promise<StoreTheme> {
  const r = await safeFetch(`${API}/themes/${id}/rate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ value, clientId: clientId() }),
  });
  if (!r.ok) throw new Error("Could not save your rating.");
  return normalize(await r.json());
}

export type ThemeComment = {
  id: string;
  themeId: string;
  parentId?: string | null;
  author: string;
  authorId: string;
  authorHandle?: string | null;
  authorAvatar?: string | null;
  body: string;
  createdAt: string;
  canDelete: boolean;
};

function normalizeComment(c: Record<string, unknown>): ThemeComment {
  return {
    ...(c as unknown as ThemeComment),
    parentId: typeof c.parentId === "string" ? c.parentId : null,
    authorHandle: typeof c.authorHandle === "string" ? c.authorHandle : null,
    authorAvatar: abs(c.authorAvatar as string | null),
  };
}

export async function listComments(themeId: string): Promise<ThemeComment[]> {
  const r = await safeFetch(`${API}/themes/${themeId}/comments`, { headers: authHeaders() });
  if (!r.ok) throw new Error("Could not load comments.");
  const d = await r.json();
  return ((d.comments as Record<string, unknown>[]) || []).map(normalizeComment);
}

export async function postComment(
  themeId: string,
  body: string,
  parentId?: string,
): Promise<ThemeComment> {
  const r = await safeFetch(`${API}/themes/${themeId}/comments`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(parentId ? { body, parentId } : { body }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || "Could not post your comment.");
  return normalizeComment(d as Record<string, unknown>);
}

export async function deleteComment(themeId: string, commentId: string): Promise<void> {
  const r = await safeFetch(`${API}/themes/${themeId}/comments/${commentId}/delete`, {
    method: "POST",
    headers: authHeaders(),
  });
  if (!r.ok) throw new Error("Could not delete this comment.");
}

export async function getTheme(id: string): Promise<StoreTheme> {
  const entry = (await loadIndex()).find((e) => e.id === id);
  if (!entry) throw new Error("Theme not found.");
  return fromIndex(entry);
}

export type ThemeNotification = {
  id: string;
  type: "downloads" | "stars" | "comment";
  themeId: string;
  themeName: string;
  cover: string | null;
  count: number | null;
  actor: string | null;
  createdAt: string;
  read: boolean;
};

export async function listNotifications(): Promise<{
  notifications: ThemeNotification[];
  unread: number;
}> {
  const r = await safeFetch(`${API}/me/notifications`, { headers: authHeaders() });
  if (!r.ok) throw new Error("Could not load notifications.");
  const d = await r.json();
  const notifications = ((d.notifications || []) as ThemeNotification[]).map((n) => ({
    ...n,
    cover: abs(n.cover),
  }));
  return { notifications, unread: d.unread || 0 };
}

export async function markNotificationsRead(ids?: string[]): Promise<number> {
  const r = await safeFetch(`${API}/me/notifications/read`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(ids ? { ids } : {}),
  });
  if (!r.ok) throw new Error("Could not update notifications.");
  const d = await r.json();
  return d.unread || 0;
}

export type MyUpload = { id: string; ownerToken: string; name: string; share: string };

export function getMyUploads(): MyUpload[] {
  try {
    const v = JSON.parse(localStorage.getItem(UPLOADS_KEY) || "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function saveMyUploads(list: MyUpload[]): void {
  try {
    localStorage.setItem(UPLOADS_KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}

export function recordUpload(u: MyUpload): void {
  saveMyUploads([u, ...getMyUploads().filter((x) => x.id !== u.id)]);
}

export function forgetUpload(id: string): void {
  saveMyUploads(getMyUploads().filter((x) => x.id !== id));
}

export async function uploadTheme(
  themeJson: string,
  cover: Blob,
  screenshots: Blob[],
  author: string,
): Promise<{ id: string; ownerToken: string; share: string }> {
  const fd = new FormData();
  fd.append("theme", new Blob([themeJson], { type: "application/json" }), "theme.json");
  fd.append("cover", cover, "cover.png");
  for (const s of screenshots.slice(0, 6)) fd.append("screenshots", s, "shot.png");
  if (author) fd.append("author", author);
  const r = await fetch(`${API}/themes`, { method: "POST", headers: authHeaders(), body: fd });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || "Upload failed.");
  return d;
}

export async function setVisibility(
  id: string,
  ownerToken: string,
  visibility: "public" | "unlisted",
): Promise<void> {
  const r = await safeFetch(`${API}/themes/${id}/visibility`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${ownerToken}` },
    body: JSON.stringify({ visibility }),
  });
  if (!r.ok) throw new Error("Could not change visibility.");
}

export async function deleteUpload(id: string, ownerToken: string): Promise<void> {
  const r = await safeFetch(`${API}/themes/${id}/delete`, {
    method: "POST",
    headers: { Authorization: `Bearer ${ownerToken}` },
  });
  if (!r.ok) throw new Error("Could not delete.");
  forgetUpload(id);
}

export async function myThemes(): Promise<StoreTheme[]> {
  const r = await safeFetch(`${API}/me/themes`, { headers: authHeaders() });
  if (!r.ok) throw new Error("Could not load your themes.");
  const d = await r.json();
  return (d.themes || []).map(normalize);
}

export async function updateTheme(
  id: string,
  themeJson: string,
  cover: Blob | null,
  screenshots: Blob[],
  changelog: string,
): Promise<StoreTheme> {
  const fd = new FormData();
  fd.append("theme", new Blob([themeJson], { type: "application/json" }), "theme.json");
  if (cover) fd.append("cover", cover, "cover.png");
  for (const s of screenshots.slice(0, 6)) fd.append("screenshots", s, "shot.png");
  if (changelog) fd.append("changelog", changelog);
  const r = await fetch(`${API}/themes/${id}/update`, {
    method: "POST",
    headers: authHeaders(),
    body: fd,
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || "Update failed.");
  return normalize(d);
}

export async function themeVersions(
  id: string,
): Promise<{ v: number; changelog: string; createdAt: string }[]> {
  const r = await safeFetch(`${API}/themes/${id}/versions`, { headers: authHeaders() });
  if (!r.ok) throw new Error("Could not load version history.");
  const d = await r.json();
  return d.versions || [];
}

export async function claimTheme(id: string, ownerToken: string): Promise<StoreTheme> {
  const r = await safeFetch(`${API}/themes/${id}/claim`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ ownerToken }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || "Could not claim this theme.");
  return normalize(d);
}
