import assert from "node:assert/strict";
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
import {
  clickScreen,
  detailsProps,
  ebookViewHarness,
  menuEvent,
  ofKind,
} from "./helpers/ebook-view-harness.ts";
import { all as treeNodes } from "./helpers/tree-render.ts";

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

const covered = book("source:p:1", "Dune", { cover: "dune.jpg" });

test("eBook cards and the featured book open the dedicated wheel menu", async () => {
  const view = ebookViewHarness({ sourceItems: [covered] });
  await view.settle(view.render);
  const tree = view.renderTree();
  const card = ofKind(tree, view.exports.EBookCard)[0];
  const cardButton = treeNodes(card).find((node) => node.type === "button")!;
  const hero = treeNodes(tree).find((node) => node.type === "section" && node.props.onContextMenu)!;
  const cardEvent = menuEvent(10, 20);
  cardButton.props.onContextMenu(cardEvent);
  assert.equal(cardEvent.prevented, true);
  const target = (menu: { props: Record<string, any> }) => {
    const { ebook, x, y } = menu.props.target;
    return [ebook.id, x, y];
  };
  let menu = ofKind(view.render(), "EBookWheelMenu")[0];
  assert.deepEqual(target(menu), [covered.id, 10, 20]);
  menu.props.onClose();
  assert.equal(ofKind(view.render(), "EBookWheelMenu").length, 0);

  hero.props.onContextMenu(menuEvent(30, 40));
  menu = ofKind(view.render(), "EBookWheelMenu")[0];
  assert.deepEqual(target(menu), [covered.id, 30, 40]);
});

test("eBook pages suppress the native context menu without removing wheel handlers", async () => {
  const view = ebookViewHarness({ sourceItems: [covered] });
  const tree = await view.settle(view.render);
  const page = treeNodes(tree).find((node) => node.type === "main");
  assert.equal(page?.props["data-ebook-page"], true, "the browse page is marked");
  const capture = view.listeners.find((l) => l.target === "document" && l.type === "contextmenu");
  assert.equal(capture?.options, true, "the listener runs in the capture phase");
  const fire = (target: unknown) => {
    const event = { target, prevented: false, preventDefault: () => (event.prevented = true) };
    view.fire("document", "contextmenu", event);
    return event.prevented;
  };
  assert.equal(fire(view.element(true)), true, "inside an eBook page the native menu is blocked");
  assert.equal(fire(view.element(false)), false, "elsewhere the native menu stays");
  assert.equal(fire({}), false, "a non-element target is left alone");
  const card = treeNodes(view.renderTree()).find(
    (node) => node.type === "button" && node.props.onContextMenu,
  );
  assert.ok(card, "the wheel handler stays on the card");

  const details = view.component("EBookDetails");
  const { props } = detailsProps(covered);
  assert.equal(details.render(props).props["data-ebook-page"], true, "the details page is marked");
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

  const grouped = {
    ...deduped[0],
    altTitle: "a|b|c|d|e|f|g",
    sourceAliases: ["The Wandering Inn"],
  };
  const view = ebookViewHarness({
    chapters: {
      [latin.id]: [{ id: "c1", title: "One" }],
      [arabic.id]: [{ id: "c2", title: "Two" }],
    },
  });
  const details = view.component("EBookDetails");
  const { props } = detailsProps(grouped);
  const tree = await view.settle(() => details.render(props));
  assert.deepEqual(
    view.calls.catalogSearches,
    ["pirateaba", "The Wandering Inn", "a", "b", "c", "d", "e"].map((query) => [query, "all"]),
    "the author, then each distinct title and alias at most six, are searched in every source",
  );
  const picker = ofKind(tree, details.exports.EBookDetailDropdown)[0];
  assert.deepEqual(
    picker.props.options.map((option: { id: string }) => option.id),
    [latin.id, arabic.id],
  );
  assert.equal(picker.props.selected, latin.id);
  assert.deepEqual(view.calls.chapters, [latin.id], "chapters load for the selected source");
  picker.props.onSelect(arabic.id);
  const switched = await view.settle(() => details.render(props));
  assert.equal(ofKind(switched, details.exports.EBookDetailDropdown)[0].props.selected, arabic.id);
  assert.deepEqual(
    view.calls.chapters,
    [latin.id, arabic.id],
    "picking a source loads its chapters",
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
  assert.equal(
    menuLabels(wheelHarness(wheelBook, { resume: { chapterId: "c1" } }))[0],
    "Continue Reading",
  );

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
  assert.ok(
    all(wheel.render()).some((node) => node.type === "Loader2"),
    "stats show a spinner",
  );
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

  // Opening one member of a grouped book refreshes that member and keeps the group.
  const first = book("source:en:7", "Group", { authors: ["Ann"] });
  const second = book("source:ar:7", "Group", { authors: ["Ann"] });
  const fresher = { ...second, description: "Fresh detail" };
  const view = ebookViewHarness({
    ebookId: second.id,
    sourceItems: [first, second],
    detail: (id) => (id === second.id ? fresher : null),
  });
  const page = await view.settle(view.render);
  const shown = page.props.ebook;
  assert.equal(shown.id, first.id, "the group keeps its own identity");
  assert.deepEqual(
    shown.books.map((item: { description: string }) => item.description),
    ["", "Fresh detail"],
  );
});

test("continue reading persists a profile-scoped chapter resume", async () => {
  const { api: state, store, events } = loadReaderState();
  state.saveEBookResume("alice", "book/1", { chapterId: "c3", chapterTitle: "Chapter 3" });
  assert.deepEqual([...store.keys()], ["harbor.ebook.resume.v1.alice.book%2F1"]);
  assert.equal(state.loadEBookResume("alice", "book/1")?.chapterId, "c3");
  assert.equal(state.loadEBookResume("bob", "book/1"), null, "another profile has no resume");
  assert.deepEqual(
    events.map((event) => [event.type, event.detail]),
    [["harbor:ebook-resume", "book/1"]],
  );

  const saved = book("source:p:9", "Saved");
  const chapters = [
    { id: "c1", title: "One", position: 1 },
    { id: "c2", title: "Two", position: 2, chapter: "2", volume: "1" },
  ];
  const view = ebookViewHarness({
    chapters: { [saved.id]: chapters },
    resumes: { [`alice|${saved.id}`]: { chapterId: "c2", updatedAt: 1 } },
  });
  const details = view.component("EBookDetails");
  const { props, log } = detailsProps(saved, { autoRead: true });
  const tree = await view.settle(() => details.render(props));
  const reader = ofKind(tree, "EBookReader")[0];
  assert.equal(reader?.props.chapter.id, "c2", "continue reading opens the resumed chapter");
  assert.equal(log.consumed, 1);
  assert.deepEqual(view.calls.resumeSaves[0], [
    "alice",
    saved.id,
    { chapterId: "c2", chapterTitle: "Two", chapterLabel: "2", volumeLabel: "Volume 1" },
  ]);
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

test("the eBook home replaces Universes with the live Shelf view", async () => {
  const shelved = book("source:p:2", "Shelved");
  const view = ebookViewHarness({ sourceItems: [covered], saved: [shelved] });
  await view.settle(view.render);
  const names = treeNodes(view.renderTree()).map((node) =>
    typeof node.type === "function" ? node.type.name : node.type,
  );
  assert.ok(!names.some((name) => /Universe/.test(String(name))), "no Universes screen or entry");
  clickScreen(view, "Shelf");
  const grid = () => ofKind(view.render(), view.exports.EBookGrid)[0];
  assert.deepEqual(
    grid().props.items.map((item: { id: string }) => item.id),
    [shelved.id],
  );
  view.saved.push(covered);
  view.fire("window", "harbor:ebook-library");
  assert.deepEqual(
    grid().props.items.map((item: { id: string }) => item.id),
    [shelved.id, covered.id],
    "the Shelf follows library changes live",
  );
});

test("the home bookmark rail is distinct from the Shelf collection", async () => {
  const reading = book("source:p:3", "Reading");
  const shelved = book("source:p:4", "Shelved");
  const view = ebookViewHarness({
    sourceItems: [covered, reading],
    saved: [shelved],
    resumes: { [`alice|${reading.id}`]: { chapterId: "c1", updatedAt: 1 } },
  });
  await view.settle(view.render);
  const bookmarks = () =>
    ofKind(view.render(), view.exports.EBookRail).find(
      (rail) => rail.props.title === "Continue your bookmarks",
    );
  assert.deepEqual(
    bookmarks()?.props.items.map((item: { id: string }) => item.id),
    [reading.id],
  );
  assert.equal(bookmarks()?.props.resumeReading, true);
  view.resumes.set(`alice|${covered.id}`, { chapterId: "c9", updatedAt: 2 });
  view.fire("window", "harbor:ebook-resume");
  assert.deepEqual(
    bookmarks()?.props.items.map((item: { id: string }) => item.id),
    [covered.id, reading.id],
    "a new resume joins the rail, newest first",
  );
  bookmarks()!.props.onOpen(reading);
  assert.deepEqual(view.calls.opened, [reading.id]);
  view.view.ebookId = reading.id;
  assert.equal(view.render().props.autoRead, true, "opening from the rail resumes reading");

  view.view.ebookId = undefined;
  clickScreen(view, "Shelf");
  const shelf = ofKind(view.render(), view.exports.EBookGrid)[0];
  assert.deepEqual(
    shelf.props.items.map((item: { id: string }) => item.id),
    [shelved.id],
  );
  assert.equal(shelf.props.resumeProfile, "alice");
  assert.equal(shelf.props.hideZeroProgress, true);
});

test("book showcases distinguish read and partially read titles", async () => {
  const read = book("source:p:5", "Read");
  const partial = book("source:p:6", "Partial");
  const unread = book("source:p:7", "Unread");
  const view = ebookViewHarness({
    tracking: { [read.id]: { status: "COMPLETED", progress: 0 } },
    resumes: { [`alice|${partial.id}`]: { chapterId: "c1", updatedAt: 1 } },
    progress: { [`alice|${partial.id}|c1:harbor`]: 12 },
  });
  const mark = (ebook: unknown) => {
    const card = view.component("EBookCard");
    return ofKind(card.render({ ebook, onOpen: () => {} }), card.exports.EBookReadMark)[0]?.props
      .status;
  };
  assert.equal(mark(read), "read");
  assert.equal(mark(partial), "partial", "a saved reading line counts as partly read");
  assert.equal(mark(unread), undefined);

  const details = view.component("EBookDetails");
  const tree = details.render(detailsProps(read).props);
  const cover = treeNodes(tree).find(
    (node) => node.props.className === "ebook-details-book-cover",
  )!;
  const inside = treeNodes(cover.props.children);
  assert.ok(inside.some((node) => node.props.className === "ebook-details-book-spine"));
  assert.equal(
    inside.find((node) => node.type === details.exports.EBookReadMark)?.props.status,
    "read",
  );
});

test("book details recommendations come from installed sources and share a genre", async () => {
  const current = book("source:p:8", "Current", { genres: ["Fantasy", "Horror"] });
  const both = book("source:q:1", "Both", { genres: ["Dark Fantasy", "Horror"] });
  const one = book("source:q:2", "One", { genres: ["fantasy"] });
  const none = book("source:q:3", "None", { genres: ["Romance"] });
  const view = ebookViewHarness({ recommendationItems: [one, none, current, both] });
  const details = view.component("EBookDetails");
  const { props } = detailsProps(current);
  const tree = await view.settle(() => details.render(props));
  assert.ok(view.calls.sourcePages.some(([query, provider]) => !query && provider === "all"));
  const rail = ofKind(tree, details.exports.EBookRail).find(
    (node) => node.props.title === "Recommended eBooks",
  );
  assert.deepEqual(
    rail?.props.items.map((item: { title: string }) => item.title),
    ["Both", "One"],
  );
});
