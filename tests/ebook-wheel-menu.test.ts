import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import * as fflate from "fflate";
import { flushPromises } from "./helpers/hook-harness.ts";
import {
  all,
  loadEBookApi,
  loadEBookProviders,
  loadOfflineExport,
  loadReaderState,
  renderDownloadRow,
  text,
  wheelHarness,
} from "./helpers/ebook-harness.ts";

const viewLines = new Set(
  readFileSync(new URL("../src/views/ebook.tsx", import.meta.url), "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim()),
);
const wired = (...lines: string[]) => {
  for (const line of lines) assert.ok(viewLines.has(line), `ebook.tsx lacks: ${line}`);
};

const api = loadEBookApi();
const book = (id: string, title: string, extra: Record<string, unknown> = {}): any => ({
  id,
  source: "source",
  title,
  authors: [],
  description: "",
  genres: [],
  ...extra,
});
const wheelBook = book("source:kol:1", "Lord of Mysteries", {
  providerName: "Kolnovel",
  authors: ["Cuttlefish"],
  description: "A steampunk mystery.",
  genres: ["Mystery", "Fantasy", "Horror", "Steampunk", "Action", "Drama"],
});
const menuLabels = (wheel: ReturnType<typeof wheelHarness>) =>
  wheel.menuItems(wheel.render()).map(text);
const clickMenu = (wheel: ReturnType<typeof wheelHarness>, label: string) =>
  wheel
    .menuItems(wheel.render())
    .find((item) => text(item) === label)!
    .props.onClick();

test("eBook cards and the featured book open the dedicated wheel menu", () => {
  wired(
    "onContextMenu={(event) => openMenu(ebook, event)}",
    "onContextMenu={(event) => current && openMenu(current, event)}",
    "<EBookWheelMenu",
    "target={wheelTarget}",
  );
});

test("eBook pages suppress the native context menu without removing wheel handlers", () => {
  wired(
    'document.addEventListener("contextmenu", preventNativeMenu, true);',
    'if (target instanceof Element && target.closest("[data-ebook-page]")) event.preventDefault();',
    "data-ebook-page",
  );
});

test("duplicate books retain all readable sources and expose the details source picker", async () => {
  const { dedupeEBooks, eBooksMatch, mergeEBookMetadata } = api;
  const latin = book("source:en:1", "The Wandering Inn", { authors: ["pirateaba"] });
  const arabic = book("source:ar:1", "النزل المتجول", {
    authors: ["بيراتيبا"],
    sourceAliases: ["The Wandering Inn"],
  });
  assert.equal(eBooksMatch(arabic, latin), true, "a source alias links the two scripts");
  const untrusted = book("source:ar:2", "النزل المتجول", {
    authors: ["بيراتيبا"],
    altTitle: "The Wandering Inn",
  });
  assert.equal(eBooksMatch(untrusted, latin), false, "an untrusted alias still needs the author");
  const dune = book("a", "Dune", { authors: ["Frank Herbert"] });
  assert.equal(eBooksMatch(dune, book("b", "Dune", { authors: ["Herbert, Frank"] })), true);
  assert.equal(eBooksMatch(dune, book("c", "Dune", { authors: ["Brian Herbert"] })), false);
  assert.equal(eBooksMatch(dune, book("d", "Dune")), true, "a missing author list cannot refute");
  assert.equal(eBooksMatch(dune, book("e", "Children of Dune")), false);
  const isbn = { sourceIdentity: { isbn: "9780441013593" } };
  assert.equal(eBooksMatch(book("f", "Dune", isbn), book("g", "Dune (1965)", isbn)), true);

  const deduped = dedupeEBooks([arabic, latin, book("source:en:2", "Unrelated")]);
  assert.equal(deduped.length, 2);
  assert.equal(deduped[0].id, latin.id, "the Latin-script entry leads the group");
  assert.deepEqual(
    deduped[0].books.map((item: any) => item.id),
    [latin.id, arabic.id],
  );
  assert.equal(deduped[1].books, undefined);
  const third = book("source:fr:1", "The Wandering Inn", { authors: ["Pirateaba"] });
  assert.deepEqual(
    dedupeEBooks([deduped[0], third])[0].books.map((item: any) => item.id),
    [latin.id, arabic.id, third.id],
    "regrouping keeps every source already collected",
  );

  const source = book("source:ar:3", "النزل المتجول", {
    seriesTitle: "The Wandering Inn",
    authors: ["pirateaba"],
  });
  const meta = book("gb:1", "The Wandering Inn", { source: "googlebooks", authors: ["pirateaba"] });
  const [enriched] = mergeEBookMetadata([source], [meta]);
  assert.equal(enriched.title, "النزل المتجول");
  assert.equal(enriched.altTitle, "The Wandering Inn");
  assert.deepEqual(enriched.verifiedAliases, ["The Wandering Inn"]);
  const respelled = book("source:en:3", "The Wandering Inn", { authors: ["Pirate Aba"] });
  assert.equal(eBooksMatch(enriched, respelled), true, "a verified alias links the scripts");

  const searches: string[] = [];
  const providers = loadEBookProviders(api, [
    {
      id: "ar",
      name: "Arabic",
      enabled: true,
      impl: {
        search: (query: string) =>
          query === "النزل"
            ? [
                {
                  id: "1",
                  title: "النزل المتجول",
                  author: "بيراتيبا",
                  altTitles: ["نزل الرحالة", "النزل الجوال", "The Wandering Inn"],
                },
              ]
            : [],
      },
    },
    {
      id: "en",
      name: "Latin",
      enabled: true,
      impl: {
        search: (query: string) => {
          searches.push(query);
          return query === "The Wandering Inn"
            ? [
                { id: "9", title: "The Wandering Inn", author: "pirateaba" },
                { id: "10", title: "Wandering Souls", author: "someone" },
              ]
            : [];
        },
      },
    },
  ]);
  const page = await providers.loadSourceEBookPage("النزل", "plugin:ar");
  const companions = await page.enriched;
  assert.deepEqual(searches, ["The Wandering Inn"], "companions are searched cross-script");
  assert.equal(companions.length, 1);
  assert.deepEqual(
    companions[0].books.map((item: any) => item.providerName),
    ["Latin", "Arabic"],
  );

  wired(
    "onSelect={setSourceRoute}",
    "void sourceEBookChapters(sourceRoute)",
    '[...new Set(queries)].slice(0, 6).map((query) => searchSourceEBookCatalog(query, "all")),',
  );
});

test("the wheel exposes every requested eBook action", () => {
  const fresh = wheelHarness(wheelBook);
  assert.deepEqual(menuLabels(fresh), [
    "Start Reading",
    "Book Details",
    "Download",
    "Add to Shelf",
    "Bookmark",
    "Mark as Read",
  ]);
  assert.equal(menuLabels(wheelHarness(wheelBook, { resume: { chapterId: "c1" } }))[0], "Continue Reading");

  clickMenu(fresh, "Book Details");
  const details = text(fresh.render());
  assert.match(details, /A steampunk mystery\./);
  assert.match(details, /From Kolnovel/);
  for (const genre of wheelBook.genres.slice(0, 5)) assert.match(details, new RegExp(genre));
  assert.doesNotMatch(details, /Drama/, "at most five genres are shown");
});

test("book details resolve source metadata and chapter statistics without a loading loop", async () => {
  const route = "source:kol:1";
  const wheel = wheelHarness(
    { ...wheelBook, description: "" },
    {
      route,
      detail: { ...wheelBook, description: "Detail summary", authors: [], genres: ["Thriller"] },
      chapters: [
        { id: "1", title: "One", volume: "1" },
        { id: "2", title: "Two", volume: "1 " },
        { id: "3", title: "Three", volume: "2" },
      ],
    },
  );
  clickMenu(wheel, "Book Details");
  wheel.render();
  assert.ok(all(wheel.render()).some((node) => node.type === "Loader2"), "stats show a spinner");
  for (let pass = 0; pass < 3; pass++) {
    await flushPromises();
    wheel.render();
  }
  const details = text(wheel.render());
  assert.deepEqual(wheel.calls.detail, [route], "detail is requested once");
  assert.deepEqual(wheel.calls.chapters, [route], "chapters are requested once");
  assert.match(details, /Detail summary/);
  assert.match(details, /Thriller/);
  assert.match(details, /Cuttlefish/, "an empty detail author list keeps the card's authors");
  assert.match(details, /2 volumes/);
  assert.match(details, /3 chapters/);
  assert.ok(!all(wheel.render()).some((node) => node.type === "Loader2"), "loading ends");

  wired("if (current.id !== detail.id) return { ...current, books };");
});

test("continue reading persists a profile-scoped chapter resume", () => {
  const { api: state, store, events } = loadReaderState();
  state.saveEBookResume("alice", "book/1", { chapterId: "c3", chapterTitle: "Chapter 3" });
  assert.deepEqual([...store.keys()], ["harbor.ebook.resume.v1.alice.book%2F1"]);
  assert.equal(state.loadEBookResume("alice", "book/1")?.chapterId, "c3");
  assert.equal(state.loadEBookResume("bob", "book/1"), null, "another profile has no resume");
  assert.deepEqual(
    events.map((event) => [event.type, event.detail]),
    [["harbor:ebook-resume", "book/1"]],
  );

  wired(
    "saveEBookResume(profile, ebook.id, {",
    "const resume = loadEBookResume(profile, ebook.id);",
    "chapters.find((chapter) => chapter.id === resume?.chapterId) ??",
  );
});

test("reopening the same chapter preserves persisted percentages", () => {
  const { api: state } = loadReaderState();
  state.saveEBookResume("profile", "book", {
    chapterId: "chapter-4",
    chapterTitle: "Chapter 4",
    chapterProgress: 63,
    bookProgress: 21,
    chapterIndex: 3,
    totalChapters: 20,
  });
  state.saveEBookResume("profile", "book", { chapterId: "chapter-4", chapterTitle: "Chapter 4" });
  assert.equal(state.loadEBookResume("profile", "book")?.chapterProgress, 63);
  assert.equal(state.loadEBookResume("profile", "book")?.bookProgress, 21);

  state.saveEBookResume("profile", "book", { chapterId: "chapter-5", chapterTitle: "Chapter 5" });
  assert.equal(state.loadEBookResume("profile", "book")?.chapterProgress, undefined);
  assert.equal(state.loadEBookResume("profile", "book")?.bookProgress, undefined);
});

test("offline export builds a valid EPUB and preserves a Unicode PDF print path", async () => {
  const epub = loadOfflineExport(3);
  const progress: any[] = [];
  const ebook = book("source:kol:2", "Tales & <Lore>", {
    authors: ["Ann", "Bo"],
    description: "Short summary",
    cover: "https://example.test/cover.png",
  });
  const saved = await epub.api.exportEBookForOffline(
    ebook,
    "epub",
    (item: any) => progress.push(item),
    { destinationPath: "/out/book.epub" },
  );
  assert.equal(saved, true);
  assert.equal(progress[0].phase, "discovering");
  const first = progress.find((item) => item.phase === "downloading" && item.completed === 1);
  assert.ok(first.downloadedBytes > 0);
  assert.ok(first.estimatedTotalBytes > first.downloadedBytes, "the total is extrapolated");
  assert.ok(first.bytesPerSecond > 0);
  assert.ok(first.etaSeconds > 0);
  assert.equal(progress.at(-1).phase, "complete");
  assert.ok(
    epub.contentCalls.every((args) => args.length === 3),
    "chapters are fetched without waiting for translation",
  );

  const [{ path, bytes }] = epub.written;
  assert.equal(path, "/out/book.epub");
  assert.match(
    Buffer.from(bytes.subarray(0, 80)).toString("latin1"),
    /mimetypeapplication\/epub\+zip/,
    "mimetype is the first entry and stored uncompressed",
  );
  const files = fflate.unzipSync(bytes);
  const read = (name: string) => fflate.strFromU8(files[name]);
  assert.match(read("META-INF/container.xml"), /full-path="EPUB\/package\.opf"/);
  const opf = read("EPUB/package.opf");
  assert.match(opf, /<dc:title>Tales &amp; &lt;Lore&gt;<\/dc:title>/);
  assert.match(opf, /<dc:creator>Ann<\/dc:creator><dc:creator>Bo<\/dc:creator>/);
  assert.match(opf, /<dc:description>Short summary<\/dc:description>/);
  assert.match(opf, /href="cover\.png"[^>]*properties="cover-image"/);
  assert.ok(files["EPUB/cover.png"]);
  assert.ok(files["EPUB/chapter-00003.xhtml"]);
  const unpacked = Object.values(files).reduce((total, file) => total + file.length, 0);
  assert.ok(bytes.length < unpacked, "chapter entries are compressed");

  const pdf = loadOfflineExport(13);
  await pdf.api.exportEBookForOffline(book("source:kol:3", "النزل المتجول"), "pdf", () => {});
  assert.match(pdf.html[0], /<meta charset="utf-8">/);
  assert.match(pdf.html[0], /النزل المتجول/);
  assert.equal(pdf.sections.length, 2, "chapters are appended in batches of twelve");
  assert.match(pdf.sections[1], /Chapter 13/);
  assert.equal(pdf.written.length, 0);
  assert.deepEqual(pdf.printed, []);
  pdf.timers.find((timer) => timer.ms === 180)!.fn();
  assert.deepEqual(pdf.printed, ["print"]);
});

test("the wheel queues downloads that the Downloads row reports with speed and ETA", async () => {
  const wheel = wheelHarness(wheelBook);
  clickMenu(wheel, "Download");
  const epubButton = all(wheel.render()).find(
    (node) => node.type === "button" && /EPUB/.test(text(node)),
  )!;
  epubButton.props.onClick();
  await flushPromises();
  assert.deepEqual(wheel.calls.exports, [[wheelBook, "epub"]]);
  assert.deepEqual(wheel.calls.views, ["downloads"]);
  assert.equal(wheel.calls.closed, 1);

  const row = text(
    renderDownloadRow({
      id: "d1",
      metaId: wheelBook.id,
      title: wheelBook.title,
      subtitle: "EPUB",
      poster: null,
      kind: "ebook",
      format: "epub",
      status: "downloading",
      ratio: 0.5,
      receivedBytes: 1_000,
      totalBytes: 2_000,
      bytesPerSec: 2 * 1024 * 1024,
      etaSeconds: 90,
    }),
  );
  assert.match(row, /2\.0 MB\/s/);
  assert.match(row, /2m left/);
});

test("the eBook home replaces Universes with the live Shelf view", () => {
  assert.ok(![...viewLines].some((line) => line.includes("EBookUniverses")));
  wired(
    'if (screen === "shelf") {',
    'onClick={() => setScreen("shelf")}',
    "items={displaySaved}",
    'window.addEventListener("harbor:ebook-library", update);',
  );
});

test("the home bookmark rail is distinct from the Shelf collection", () => {
  wired(
    '.map((ebook) => ({ ebook, resume: loadEBookResume(activeId ?? "default", ebook.id) }))',
    "items: continueBookmarks,",
    "resumeReading: true,",
    "if (rail.resumeReading) setReadIntent(ebook.id);",
    'window.addEventListener("harbor:ebook-resume", update);',
    'resumeProfile={activeId ?? "default"}',
    "hideZeroProgress",
  );
});

test("book showcases distinguish read and partially read titles", () => {
  wired(
    'tracking.status === "COMPLETED" ||',
    "savedLine > 0 ||",
    'function EBookReadMark({ status }: { status: "read" | "partial" }) {',
    "const readStatus = useEBookReadStatus(ebook, profile);",
    '<div className="ebook-details-book-cover">',
    '<span className="ebook-details-book-spine" aria-hidden="true" />',
  );
});

test("book details recommendations come from installed sources and share a genre", () => {
  wired(
    'void loadSourceEBookPage(undefined, "all")',
    ".map((item) => ({ item, score: genreScore(item) }))",
    ".filter(({ score }) => score > 0)",
  );
});
