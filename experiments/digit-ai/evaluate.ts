
import { trainDigitModel, predictDigit } from "./model";

type Metrics = {
  samples: number;
  exactAccuracy: number;
  top3Accuracy: number;
  meanLogLoss: number;
};

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
 * Chronological evaluation:
 * 70% training, 15% validation, 15% held-out testing.
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

  const actual: number[] = [];
  const probabilities: number[][] = [];
  const ranked: number[][] = [];

  for (let i = validationEnd; i < digits.length; i++) {
    const prediction = predictDigit(model, digits.slice(0, i));

    if (!prediction) continue;

    actual.push(digits[i]);
    probabilities.push(prediction.distribution);
    ranked.push(prediction.ranked);
  }

  const counts = Array(10).fill(0) as number[];
  for (const digit of train) counts[digit]++;

  const baseline = counts.map(
    count => (count + 1) / (train.length + 10)
  );

  const baselineProbabilities = actual.map(() => baseline);
  const baselineRanked = actual.map(() =>
    baseline
      .map((_, i) => i)
      .sort((a, b) => baseline[b] - baseline[a])
  );

  const uniform = Array(10).fill(0.1) as number[];
  const uniformProbabilities = actual.map(() => uniform);
  const uniformRanked = actual.map(() =>
    Array.from({ length: 10 }, (_, i) => i)
  );

  return {
    totalDigits: digits.length,
    trainingDigits: train.length,
    validationDigits: validation.length,
    testDigits: test.length,
    model: metrics(actual, probabilities, ranked),
    frequencyBaseline: metrics(
      actual,
      baselineProbabilities,
      baselineRanked
    ),
    uniformBaseline: metrics(
      actual,
      uniformProbabilities,
      uniformRanked
    )
  };
}
