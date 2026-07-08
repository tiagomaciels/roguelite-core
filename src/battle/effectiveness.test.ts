import { describe, expect, it } from "vitest";
import { attributeMultiplier, elementMultiplier, totalMultiplier } from "./effectiveness";

describe("triângulo de atributos (vaccine > virus > data > vaccine)", () => {
  it("tabela completa", () => {
    expect(attributeMultiplier("vaccine", "virus")).toBe(1.5);
    expect(attributeMultiplier("virus", "data")).toBe(1.5);
    expect(attributeMultiplier("data", "vaccine")).toBe(1.5);
    expect(attributeMultiplier("virus", "vaccine")).toBe(0.67);
    expect(attributeMultiplier("data", "virus")).toBe(0.67);
    expect(attributeMultiplier("vaccine", "data")).toBe(0.67);
    expect(attributeMultiplier("vaccine", "vaccine")).toBe(1);
    expect(attributeMultiplier("free", "virus")).toBe(1);
    expect(attributeMultiplier("data", "free")).toBe(1);
  });
});

describe("chart de elementos", () => {
  it("ciclo principal: fire > nature > earth > electric > water > fire", () => {
    expect(elementMultiplier("fire", "nature")).toBe(1.25);
    expect(elementMultiplier("nature", "earth")).toBe(1.25);
    expect(elementMultiplier("earth", "electric")).toBe(1.25);
    expect(elementMultiplier("electric", "water")).toBe(1.25);
    expect(elementMultiplier("water", "fire")).toBe(1.25);
  });

  it("interações extras: wind/ice/light/dark", () => {
    expect(elementMultiplier("wind", "earth")).toBe(1.25);
    expect(elementMultiplier("ice", "nature")).toBe(1.25);
    expect(elementMultiplier("ice", "wind")).toBe(1.25);
    expect(elementMultiplier("fire", "ice")).toBe(1.25);
    expect(elementMultiplier("light", "dark")).toBe(1.25);
    expect(elementMultiplier("dark", "light")).toBe(1.25);
  });

  it("desvantagem é o inverso (×0.8); neutral não interage", () => {
    expect(elementMultiplier("nature", "fire")).toBe(0.8);
    expect(elementMultiplier("fire", "water")).toBe(0.8);
    expect(elementMultiplier("neutral", "fire")).toBe(1);
    expect(elementMultiplier("fire", "neutral")).toBe(1);
    expect(elementMultiplier("fire", "fire")).toBe(1);
  });
});

describe("totalMultiplier", () => {
  it("compõe triângulo × elemento × STAB", () => {
    // vaccine/fire ataca virus/nature com golpe fire: 1.5 × 1.25 × 1.5 (STAB)
    expect(totalMultiplier("vaccine", "fire", "fire", "virus", "nature")).toBeCloseTo(2.8125);
    // pior caso: data/nature ataca virus/fire: 0.67 × 0.8 × 1.5
    expect(totalMultiplier("data", "nature", "nature", "virus", "fire")).toBeCloseTo(0.804);
  });
});
