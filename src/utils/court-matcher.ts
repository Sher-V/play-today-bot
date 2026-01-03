// courtMatcher.ts
// Возвращает TennisSiteId по названию корта от пользователя (fuzzy match через TF-IDF char n-grams + cosine).
// Без внешних библиотек.

type TennisSiteId = string; // если у вас enum TennisSiteId — можно заменить на него

const RU_STOPWORDS_LIGHT = new Set([
  "теннис", "теннисный", "корт", "корты", "клуб", "центр", "стадион",
  "москва", "московский", "м", "метро", "станция",
  "ул", "улица", "проспект", "шоссе", "дом", "стр", "строение", "пр",
  "lawn", "club", "the", "ru"
]);

const SYNONYMS: Array<[RegExp, string]> = [
  [/\bспартак\b/giu, "spartak"],
  [/\bлужники\b/giu, "luzhniki"],
  [/\bwe\s*gym\b/giu, "wegym"],
  [/\bitc\b/giu, "itc"],
  [/галерея/giu, "gallery"],
  [/галлерея/giu, "gallery"],
  [/gallery/giu, "gallery"],
  [/\bтеннис\s*капитал\b/giu, "tennis capital"],
  [/\bтэннис\s*капитал\b/giu, "tennis capital"],
  [/\bтеннис77\b/giu, "tennis77"],
  
  // PRO TENNIS aliases
  [/про\s*теннис/giu, "pro tennis каширке"],
  [/pro\s*tennis/giu, "pro tennis каширке"],

  // tennis.ru aliases
  [/теннис\s*ру/giu, "tennis ru"],
  [/теннис\.ру/giu, "tennis ru"],
  [/tennis\s*ru/giu, "tennis ru"],
  [/tennis\.ru/giu, "tennis ru"],
  
  // новые корты без онлайн бронирования
  [/эйс/giu, "ace"],
  [/ace/giu, "ace"],
  [/\bбудь\s*здоров\b/giu, "bud zorov"],
  [/\bлегион\b/giu, "legion"],
  [/плэй\s*парк/giu, "play park"],
  [/play\s*park/giu, "play park"],
  [/авантаж/giu, "avantage"],
  [/avantage/giu, "avantage"],
  [/\bодинцово\s*40\s*love\b/giu, "odintsovo 40 love"],
  [/\b40\s*love\b/giu, "40 love"],
  [/ракетлон/giu, "raketlon"],
  [/raketlon/giu, "raketlon"],
  [/теннис\s*арт/giu, "tennis art"],
  [/теннис\s*парк/giu, "tennis park"],
  [/tennis\s*art/giu, "tennis art"],
  [/tennis\s*park/giu, "tennis park"],
  [/\bвтб\s*арена\b/giu, "vtb arena"],
  [/\bдинамо\b/giu, "dinamo"],
  
  // Fly Tennis aliases
  [/флай\s*теннис/giu, "fly tennis"],
  [/флайтеннис/giu, "fly tennis"],
  [/fly\s*tennis/giu, "fly tennis"],
  [/flytennis/giu, "fly tennis"],
];

function normalizeName(s: string): string {
  let t = (s ?? "").trim().toLowerCase().replace(/ё/g, "е");

  // Сначала применяем синонимы/алиасы (до удаления знаков препинания)
  for (const [re, rep] of SYNONYMS) t = t.replace(re, rep);

  // Затем оставляем только буквы/цифры/пробел
  t = t.replace(/[^a-zа-я0-9\s]+/giu, " ");
  t = t.replace(/\s+/g, " ").trim();

  // лёгкие стоп-слова
  const tokens = t.split(" ").filter(tok => tok && !RU_STOPWORDS_LIGHT.has(tok));
  return tokens.join(" ");
}

/**
 * Char "word boundary" n-grams (3..5).
 * Отлично ловит опечатки/сокращения/транслит: "савелов" ~ "савеловская".
 */
function charWbNgrams(text: string, nMin = 3, nMax = 5): string[] {
  const tokens = text.split(/\s+/).filter(Boolean);
  const out: string[] = [];

  for (const tok of tokens) {
    const padded =  ` ${tok} ` ;
    for (let n = nMin; n <= nMax; n++) {
      if (padded.length < n) continue;
      for (let i = 0; i <= padded.length - n; i++) {
        out.push(padded.slice(i, i + n));
      }
    }
  }
  return out;
}

function tf(grams: string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const g of grams) m.set(g, (m.get(g) ?? 0) + 1);
  return m;
}

function dot(a: Map<string, number>, b: Map<string, number>): number {
  let s = 0;
  const [small, big] = a.size <= b.size ? [a, b] : [b, a];
  for (const [k, v] of small) {
    const w = big.get(k);
    if (w) s += v * w;
  }
  return s;
}

function norm(v: Map<string, number>): number {
  let s = 0;
  for (const x of v.values()) s += x * x;
  return Math.sqrt(s);
}

function buildDf(docNgrams: string[][]): Map<string, number> {
  const df = new Map<string, number>();
  for (const grams of docNgrams) {
    const seen = new Set(grams);
    for (const g of seen) df.set(g, (df.get(g) ?? 0) + 1);
  }
  return df;
}

function tfidfVector(
  grams: string[],
  df: Map<string, number>,
  N: number
): Map<string, number> {
  const tfMap = tf(grams);
  const vec = new Map<string, number>();

  for (const [term, count] of tfMap) {
    const dfi = df.get(term) ?? 0;
    // сглаженный idf
    const idf = Math.log((N + 1) / (dfi + 1)) + 1;
    vec.set(term, count * idf);
  }
  return vec;
}

export type MatchDebug = {
  siteId: TennisSiteId | null;
  score: number;
  top: Array<{ siteId: TennisSiteId; score: number; name: string }>;
};

/**
 * Возвращает TennisSiteId по пользовательскому вводу.
 * @param userInput строка от пользователя ("спартак грунт", "теннис капитал савелов", "теннис ру" и т.д.)
 * @param courts Record<TennisSiteId, string> (ваш TENNIS_COURT_NAMES)
 * @param opts minScore — порог уверенности, returnDebug — вернуть топ-кандидатов
 */
export function matchTennisCourtSiteId(
  userInput: string,
  courts: Record<TennisSiteId, string>,
  opts?: { minScore?: number; returnDebug?: boolean }
): TennisSiteId | null | MatchDebug {
  const minScore = opts?.minScore ?? 0.25;
  const returnDebug = opts?.returnDebug ?? false;

  const ids = Object.keys(courts);
  const names = ids.map(id => courts[id]);

  const normQuery = normalizeName(userInput);
  if (!normQuery || ids.length === 0) {
    return returnDebug ? { siteId: null, score: 0, top: [] } : null;
  }

  const normDocs = names.map(normalizeName);

  const docNgrams = normDocs.map(t => charWbNgrams(t, 3, 5));
  const queryNgrams = charWbNgrams(normQuery, 3, 5);

  const df = buildDf(docNgrams);
  const N = docNgrams.length;

  const docVecs = docNgrams.map(g => tfidfVector(g, df, N));
  const qVec = tfidfVector(queryNgrams, df, N);

  const qNorm = norm(qVec) || 1;

  const scores: number[] = [];
  for (let i = 0; i < docVecs.length; i++) {
    const dNorm = norm(docVecs[i]) || 1;
    const score = dot(qVec, docVecs[i]) / (qNorm * dNorm);
    scores.push(score);
  }

  let bestIdx = 0;
  for (let i = 1; i < scores.length; i++) {
    if (scores[i] > scores[bestIdx]) bestIdx = i;
  }

  const bestScore = scores[bestIdx] ?? 0;
  const bestId = bestScore >= minScore ? ids[bestIdx] : null;

  if (!returnDebug) return bestId;

  const topIdx = [...scores.keys()]
    .sort((a, b) => scores[b] - scores[a])
    .slice(0, 5);

  return {
    siteId: bestId,
    score: bestScore,
    top: topIdx.map(i => ({
      siteId: ids[i],
      score: scores[i],
      name: names[i]
    }))
  };
}

/* =========================
   Пример использования:

import { TENNIS_COURT_NAMES, TennisSiteId } from "./courts";
import { matchTennisCourtSiteId } from "./courtMatcher";

const res = matchTennisCourtSiteId("теннис ру", TENNIS_COURT_NAMES);
console.log(res); // -> TennisSiteId.TENNIS_RU (или null)

const dbg = matchTennisCourtSiteId("спартак грунт", TENNIS_COURT_NAMES, { returnDebug: true });
console.log(dbg);

========================= */