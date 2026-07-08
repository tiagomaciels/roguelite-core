import { describe, expect, it } from "vitest";
import { deriveSeed, fnv1a } from "./hash";

describe("deriveSeed", () => {
  it("é determinístico", () => {
    expect(deriveSeed(42, "map1")).toBe(deriveSeed(42, "map1"));
  });

  it("rótulos diferentes produzem streams diferentes", () => {
    expect(deriveSeed(42, "map1")).not.toBe(deriveSeed(42, "map2"));
    expect(deriveSeed(42, "n1:battle")).not.toBe(deriveSeed(42, "n1:xp"));
  });

  it("seeds-base diferentes produzem resultados diferentes", () => {
    expect(deriveSeed(1, "x")).not.toBe(deriveSeed(2, "x"));
  });

  it("fnv1a produz uint32", () => {
    for (const s of ["", "a", "Agumon:hp", "um texto qualquer"]) {
      const h = fnv1a(s);
      expect(Number.isInteger(h)).toBe(true);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThanOrEqual(0xffffffff);
    }
  });
});
