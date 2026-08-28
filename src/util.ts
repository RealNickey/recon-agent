import { createHash } from "node:crypto";
import { resolve } from "node:path";

/** mulberry32 — tiny seeded PRNG, deterministic across platforms. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic shuffle (Fisher–Yates with the provided rng). */
export function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = a[i]!;
    a[i] = a[j]!;
    a[j] = tmp;
  }
  return a;
}

export function pick<T>(arr: T[], rng: () => number): T {
  const item = arr[Math.floor(rng() * arr.length)];
  if (item === undefined) throw new Error("pick from empty array");
  return item;
}

export function randInt(rng: () => number, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

/** Round to 2dp as a number (display only — never use for comparisons). */
export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Random date within [startISO, startISO + spanDays], as YYYY-MM-DD. */
export function randomDate(rng: () => number, startISO: string, spanDays: number): string {
  const start = new Date(startISO + "T00:00:00Z").getTime();
  const d = new Date(start + randInt(rng, 0, spanDays) * 86400000);
  return d.toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Stable content hash — used to fingerprint datasets without exposing content. */
export function contentHash(s: string): string {
  return createHash("sha256").update(s).digest("hex").slice(0, 16);
}

/** True if `p` resolves inside `repoRoot` (the answer key must never live here). */
export function pathIsInsideRepo(p: string, repoRoot = "."): boolean {
  const abs = resolve(p);
  const repo = resolve(repoRoot);
  return abs === repo || abs.startsWith(repo + "\\") || abs.startsWith(repo + "/");
}

/**
 * Resolve the external answer-key path. Returns null if unset.
 * Exits the process if the path would land inside the repo.
 */
export function resolveExternalTruthPath(target?: boolean | string): string | null {
  const isHard = target === "hard" || (typeof target === "string" && target.includes("hard"));
  const isHoldout = target === true || target === "holdout" || (typeof target === "string" && target.includes("holdout"));

  let envPath: string | undefined;
  if (isHard) {
    envPath = process.env.GROUND_TRUTH_HARD_PATH;
    if (!envPath && process.env.GROUND_TRUTH_PATH) {
      envPath = process.env.GROUND_TRUTH_PATH.replace(/(\.[^.]*)?$/, (m) => (m ? `-hard${m}` : "-hard.json"));
    }
  } else if (isHoldout) {
    envPath =
      process.env.GROUND_TRUTH_HOLDOUT_PATH ??
      (process.env.GROUND_TRUTH_PATH
        ? process.env.GROUND_TRUTH_PATH.replace(/(\.[^.]*)?$/, (m) => (m ? `-holdout${m}` : "-holdout.json"))
        : undefined);
  } else {
    envPath = process.env.GROUND_TRUTH_PATH;
  }

  if (!envPath) return null;
  if (pathIsInsideRepo(envPath)) {
    console.error("REFUSED: answer-key path resolves inside the repo. Point GROUND_TRUTH_PATH outside.");
    process.exit(1);
  }
  return envPath;
}
