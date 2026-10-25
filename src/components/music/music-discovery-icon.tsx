import { useEffect, useState } from "react";

const SOURCES = import.meta.glob<string>("/src/assets/music-genres/*.svg", {
  query: "?raw",
  import: "default",
});

const FILES: Record<number, string> = {
  132: "pop",
  116: "hip-hop",
  152: "rock",
  165: "rnb",
  10001: "nightcore",
  10002: "jumpstyle",
  10003: "hardstyle",
  10004: "funk-carioca",
  10005: "pagode",
  10006: "amapiano",
  10007: "k-pop",
  10008: "j-pop",
  122: "reggaeton",
  106: "electronic",
  113: "dance",
  85: "alternative",
  10009: "afrobeats",
  10010: "house",
  10011: "techno",
  10012: "drum-and-bass",
  10013: "phonk",
  10014: "hyperpop",
  10015: "trap",
  10016: "indie-pop",
  129: "jazz",
  169: "soul-funk",
  98: "classical",
  464: "metal",
  84: "country",
  153: "blues",
  466: "folk",
  144: "reggae",
  10017: "samba",
  10018: "bossa-nova",
  10019: "sertanejo",
  10020: "forro",
  10021: "mpb",
  10022: "piseiro",
  10023: "axe",
  10024: "brazilian-trap",
  67: "salsa",
  71: "cumbia",
  65: "regional-mexican",
  10025: "bachata",
  10026: "merengue",
  10027: "dembow",
  10028: "corridos-tumbados",
  10029: "mariachi",
  10030: "banda",
  10031: "norteno",
  10032: "latin-trap",
  10033: "reggae-en-espanol",
  10034: "dancehall",
  10035: "soca",
  10036: "dub",
  10037: "kompa",
  10038: "zouk",
  10039: "gqom",
  10040: "kwaito",
  10041: "highlife",
  10042: "afrobeat",
  10043: "bongo-flava",
  10044: "singeli",
  10045: "gengetone",
  10046: "soukous",
  10047: "kuduro",
  10048: "kizomba",
  10049: "rai",
  10050: "gnawa",
  10051: "mbalax",
  10052: "city-pop",
  10053: "j-rock",
  10054: "anime",
  10055: "vocaloid",
  10056: "cantopop",
  10057: "mandopop",
  10058: "opm",
  10059: "v-pop",
  10060: "thai-pop",
  10061: "dangdut",
  10062: "indonesian-pop",
  10063: "bollywood",
  10064: "punjabi",
  10065: "bhangra",
  10066: "qawwali",
  10067: "carnatic",
  10068: "hindustani",
  10069: "uk-garage",
  10070: "grime",
  10071: "uk-drill",
  10072: "french-rap",
  10073: "german-rap",
  10074: "turkish-rap",
  10075: "arabic-pop",
  10076: "mahraganat",
  10077: "turkish-pop",
  10078: "persian-pop",
  10079: "flamenco",
  10080: "fado",
  10081: "chanson",
  10082: "afro-house",
  10083: "deep-house",
  10084: "tech-house",
  10085: "trance",
  10086: "psytrance",
  10087: "hardcore",
  10088: "happy-hardcore",
  10089: "frenchcore",
  10090: "eurodance",
  10091: "hands-up",
  10092: "dubstep",
  10093: "breakbeat",
  10094: "synthwave",
  10095: "ambient",
  10096: "lofi",
  10097: "punk",
  10098: "shoegaze",
  10099: "emo",
  10100: "pop-punk",
  10101: "metalcore",
  10102: "death-metal",
  10103: "black-metal",
  10104: "progressive-rock",
  10105: "neo-soul",
  10106: "disco",
  10107: "gospel",
  186: "christian",
  173: "soundtracks",
  75: "brazilian",
  2: "african",
  16: "asian",
  81: "indian",
  197: "latin",
  95: "kids",
  10108: "russian-rap",
  10109: "russian-hyperpop",
  10110: "ukrainian-rap",
  10111: "ukrainian-wartime",
  10112: "horrorcore",
  10113: "goth",
  10115: "internet-classics",
  10116: "chicago-drill",
  10117: "new-york-drill",
  10118: "east-coast-hip-hop",
  10119: "west-coast-hip-hop",
  10120: "southern-hip-hop",
  10121: "atlanta-rap",
  10122: "houston-rap",
  10123: "memphis-rap",
  10124: "detroit-rap",
  10125: "bay-area-rap",
  10126: "g-funk",
  10127: "boom-bap",
  10128: "jazz-rap",
  10129: "conscious-hip-hop",
  10130: "alternative-hip-hop",
  10131: "crunk",
  10132: "miami-bass",
  10133: "chopped-and-screwed",
};

const FALLBACK =
  '<g stroke-width="2.3" stroke-linecap="round"><circle cx="24" cy="24" r="18"/><circle cx="24" cy="24" r="5"/><path d="M12 23a12 12 0 0 1 10-11m4 24a12 12 0 0 0 10-11"/></g>';

const bodies = new Map<number, string>();
const pending = new Map<number, Promise<string>>();

function loadBody(id: number): Promise<string> {
  const running = pending.get(id);
  if (running) return running;
  const load = SOURCES[`/src/assets/music-genres/${FILES[id]}.svg`]?.() ?? Promise.resolve("");
  const body = load
    .then((svg) => svg.match(/<svg[^>]*>([\s\S]*?)<\/svg>/)?.[1] ?? "")
    .catch(() => "")
    .then((inner) => {
      bodies.set(id, inner);
      pending.delete(id);
      return inner;
    });
  pending.set(id, body);
  return body;
}

function initialBody(id: number): string {
  if (!(id in FILES)) return FALLBACK;
  return bodies.get(id) ?? "";
}

/** Original genre drawings sharing Harbor's rounded instrument stroke. */
export function MusicDiscoveryIcon({
  genreId,
  className,
}: {
  genreId?: number;
  className?: string;
}) {
  const id = genreId ?? 0;
  const [body, setBody] = useState(() => initialBody(id));
  useEffect(() => {
    setBody(initialBody(id));
    if (!(id in FILES) || bodies.has(id)) return;
    let live = true;
    void loadBody(id).then((inner) => {
      if (live) setBody(inner);
    });
    return () => {
      live = false;
    };
  }, [id]);
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      stroke="currentColor"
      aria-hidden="true"
      className={className}
      dangerouslySetInnerHTML={{ __html: body }}
    />
  );
}
