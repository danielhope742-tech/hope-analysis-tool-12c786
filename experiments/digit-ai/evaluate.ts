
import { featuresFor, trainDigitModel, predictDigit } from "./model";

type Metrics = {
  samples: number;
  exactAccuracy: number;
  top3Accuracy: number;
  meanLogLoss: number;
};

function parseDigits(text: string): number[] {
  return text
    .trim()
    .split(/[\s,;]+/)
    .map(Number)
    .filter(n => Number.isInteger(n) && n >= 0 && n <= 9);
}

function metrics(
  actual: number[],
  predictions: number[][],
  ranked: number[][]
): Metrics {
  let exact = 0;
  let top3 = 0;
  let loss = 0;

  for (let i = 0; i < actual.length; i++) {
    const target = actual[i];
    const probabilities = predictions[i];

    if (ranked[i][0] === target) exact++;
    if (ranked[i].slice(0, 3).includes(target)) top3++;

    loss -= Math.log(
      Math.max(1e-12, probabilities[target])
    );
  }

  const n = actual.length;

  return {
    samples: n,
    exactAccuracy: exact / n,
    top3Accuracy: top3 / n,
    meanLogLoss: loss / n
  };
}

/**
 * Split by time order: first 70% train, next 15% validate,
 * final 15% held out for testing.
 */
export function evaluateDigits(rawDigits: number[]) {
  const digits = rawDigits.filter(
    n => Number.isInteger(n) && n >= 0 && n <= 9
  );

  if (digits.length < 200) {
    throw new Error("Provide at least 200 historical digits.");
  }

  const trainEnd = Math.floor(digits.length * 0.70);
  const validationEnd = Math.floor(digits.length * 0.85);

  const train = digits.slice(0, trainEnd);
  const validation = digits.slice(trainEnd, validationEnd);
  const test = digits.slice(validationEnd);

  const model = trainDigitModel(train);

  const testActual: number[] = [];
  const testProbabilities: number[][] = [];
  const testRanked: number[][] = [];

  for (let i = validationEnd; i < digits.length; i++) {
    const prediction = predictDigit(model, digits.slice(0, i));

    if (!prediction) continue;

    testActual.push(digits[i]);
    testProbabilities.push(prediction.distribution);
    testRanked.push(prediction.ranked);
  }

  const modelMetrics = metrics(
    testActual,
    testProbabilities,
    testRanked
  );

  const counts = Array(10).fill(0) as number[];
  for (const digit of train) counts[digit]++;

  const total = train.length;
  const baseline = counts.map(count => (count + 1) / (total + 10));

  const baselineProbabilities = testActual.map(() => baseline);
  const baselineRanked = testActual.map(() =>
    baseline
      .map((_, i) => i)
      .sort((a, b) => baseline[b] - baseline[a])
  );

  const uniform = Array(10).fill(0.1) as number[];
  const uniformProbabilities = testActual.map(() => uniform);
  const uniformRanked = testActual.map(() =>
    Array.from({ length: 10 }, (_, i) => i)
  );

  return {
    totalDigits: digits.length,
    trainingDigits: train.length,
    validationDigits: validation.length,
    testDigits: test.length,
    model: modelMetrics,
    frequencyBaseline: metrics(
      testActual,
      baselineProbabilities,
      baselineRanked
    ),
    uniformBaseline: metrics(
      testActual,
      uniformProbabilities,
      uniformRanked
    )
  };
}

/**
 * Example:
 * const result = evaluateDigits([1,2,3,...]);
 * console.log(result);
 */
