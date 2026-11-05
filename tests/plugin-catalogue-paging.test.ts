import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as catalogueBase from "../src/lib/streams/plugins/extension/catalogue-base.ts";
import { loadModule } from "./helpers/hook-harness.ts";

const SHIM = readFileSync("android-extension-compat/src/api/HomePageResponse.kt", "utf8");

type Page = { items: { name: string; url: string }[]; hasNext: boolean };

function catalogue(answer: (page: number) => Page) {
  const asked: number[] = [];
  const api = loadModule("src/lib/streams/plugins/extension/catalogue.ts", {
    "./catalogue-base": catalogueBase,
    "./detail": { capstanId: (provider: string, url: string) => `${provider}:${url}` },
    "./listing": {
      readListing: (title: string) => ({
        title,
        rest: "",
        languages: [],
        quality: [],
        resolutions: [],
        hdr: [],
        year: null,
      }),
    },
    "./meta-type": { metaType: () => "movie", providerMetaType: () => "movie" },
    "./bridge": {
      bridgeCataloguePage: async (_provider: string, _row: string, page: number) => {
        asked.push(page);
        return answer(page);
      },
    },
  });
  const cat = {
    pluginId: "plug",
    pluginName: "Plug",
    providerId: "prov",
    providerName: "Prov",
    type: "movie",
    row: "Latest",
  };
  return { asked, page: (n: number) => api.extensionCatalogueMetas(cat, n) };
}

const items = (page: number) => [{ name: `Title ${page}`, url: `https://x.invalid/${page}` }];

test("a provider that does not say whether a page follows is taken to have one", () => {
  // Kotlin fills a default argument in the declaring class, so `HomePageResponse(items)` gets this value.
  assert.match(SHIM, /^\s*val hasNext: Boolean = true,$/m);
});

test("a provider that says a page follows is asked for it", async () => {
  const c = catalogue((page) => ({ items: items(page), hasNext: true }));
  assert.deepEqual(
    (await c.page(1)).map((m: { id: string }) => m.id),
    ["prov:https://x.invalid/1"],
  );
  assert.deepEqual(
    (await c.page(2)).map((m: { id: string }) => m.id),
    ["prov:https://x.invalid/2"],
  );
  assert.deepEqual(c.asked, [1, 2]);
});

test("a provider that does say so still stops the walk", async () => {
  const c = catalogue((page) => ({ items: items(page), hasNext: page < 2 }));
  assert.equal((await c.page(1)).length, 1);
  assert.equal((await c.page(2)).length, 1);
  assert.deepEqual(await c.page(3), [], "nothing past the last page is answered");
  assert.deepEqual(await c.page(7), []);
  assert.deepEqual(
    c.asked,
    [1, 2],
    "nothing past a page a provider said was its last is asked for",
  );
});
