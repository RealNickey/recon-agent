import { describe, expect, it } from "bun:test";
import { pathIsInsideRepo } from "./util";

describe("pathIsInsideRepo", () => {
  it("rejects paths that resolve inside the repo", () => {
    expect(pathIsInsideRepo("data/ground-truth.json")).toBe(true);
    expect(pathIsInsideRepo("./src/types.ts")).toBe(true);
  });
  it("accepts paths outside the repo", () => {
    expect(pathIsInsideRepo("C:\\Windows\\Temp\\ground-truth.json")).toBe(false);
  });
});
