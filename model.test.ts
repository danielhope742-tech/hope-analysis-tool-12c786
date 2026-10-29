import { describe, expect, it } from "vitest";
import { featuresFor, predictDigit, trainDigitModel } from "./model";
import { evaluateChronologically, parseDigitSequence } from "./evaluate";
describe("experimental trained digit model", () => {
  const sequence = Array.from({ length: 500 }, (_, i) => (i * 7 + Math.floor(i / 11) * 3) % 10);
  it("requires enough history to build features", () => {
    expect(featuresFor([1, 2, 3])).toBeNull();
    expect(featuresFor(Array.from({ length: 20 }, (_, i) => i % 10))).toHaveLength(30);
  });
  it("returns normalized probabilities for ten digits", () => {
    const model = trainDigitModel(sequence.slice(0, 350), { epochs: 5 });
    const result = predictDigit(model, sequence.slice(0, 400));
    expect(result).not.toBeNull();
    expect(result!.distribution).toHaveLength(10);
    expect(result!.distribution.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 8);
  });
  it("separates chronological validation and final test", () => {
    const report = evaluateChronologically(sequence);
    expect(report.split.trainEnd).toBeLessThan(report.split.validationEnd);
    expect(report.split.validationEnd).toBeLessThan(report.split.testEnd);
    expect(report.model.test.samples).toBeGreaterThan(0);
    expect(report.baselines.uniform.samples).toBe(report.model.test.samples);
  });
  it("parses only digits 0 to 9", () => {
    expect(parseDigitSequence("1, 2\n3 4")).toEqual([1, 2, 3, 4]);
    expect(() => parseDigitSequence("1,12,3")).toThrow();
  });
});
