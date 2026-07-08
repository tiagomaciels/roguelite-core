import { describe, expect, it } from "vitest";
import { mulberry32 } from "./mulberry32";

describe("mulberry32", () => {
  it("é determinístico: mesmo seed produz a mesma sequência", () => {
    const a = mulberry32(12345);
    const b = mulberry32(12345);
    const seqA = Array.from({ length: 100 }, () => a());
    const seqB = Array.from({ length: 100 }, () => b());
    expect(seqA).toEqual(seqB);
  });

  it("seeds diferentes produzem sequências diferentes", () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    const seqA = Array.from({ length: 10 }, () => a());
    const seqB = Array.from({ length: 10 }, () => b());
    expect(seqA).not.toEqual(seqB);
  });

  it("gera valores no intervalo [0, 1)", () => {
    const rng = mulberry32(987654321);
    for (let i = 0; i < 1000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});
