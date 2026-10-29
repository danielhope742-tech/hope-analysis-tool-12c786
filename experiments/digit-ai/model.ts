
/**
 * TickLens Experimental AI Digit Model
 * Version 1: Logistic regression
 * Experimental estimates only — no guaranteed predictions.
 */

export type Digit = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export interface TrainedDigitModel {
  version: "ticklens-digit-logreg-v1";
  featureLength: number;
  weights: number[][];
  bias: number[];
  trainingExamples: number;
}

export interface ModelPrediction {
  distribution: number[];
  ranked: Digit[];
  digit: Digit;
  confidence: number;
}

const CLASSES = 10;
const WINDOW = 20;
const FEATURE_LENGTH = 30;

function validDigits(values: readonly number[]): Digit[] {
  return values.filter(
    (n): n is Digit =>
      Number.isInteger(n) && n >= 0 && n <= 9
  );
}

/**
 * Features:
 * 10 digit frequencies
 * 10 last-digit flags
 * 10 transition frequencies
 */
export function featuresFor(
  input: readonly number[]
): number[] | null {
  const history = validDigits(input);

  if (history.length < WINDOW) return null;

  const window = history.slice(-WINDOW);
  const frequencies = Array(10).fill(0) as number[];

  for (const digit of window) {
    frequencies[digit] += 1 / WINDOW;
  }

  const last = window[window.length - 1];
  const lastFlags = Array(10).fill(0) as number[];
  lastFlags[last] = 1;

  const transitions = Array(10).fill(0) as number[];
  let count = 0;

  for (let i = 0; i < history.length - 1; i++) {
    if (history[i] === last) {
      transitions[history[i + 1]]++;
      count++;
    }
  }

  if (count > 0) {
    for (let digit = 0; digit < 10; digit++) {
      transitions[digit] /= count;
    }
  } else {
    transitions.fill(0.1);
  }

  return [...frequencies, ...lastFlags, ...transitions];
}

function softmax(logits: number[]): number[] {
  const max = Math.max(...logits);

  const exps = logits.map(value =>
    Math.exp(Math.max(-40, Math.min(40, value - max)))
  );

  const total = exps.reduce((a, b) => a + b, 0);

  return exps.map(value => value / total);
}

/**
 * Train chronologically without shuffling historical examples.
 */
export function trainDigitModel(
  input: readonly number[],
  options: {
    epochs?: number;
    learningRate?: number;
    l2?: number;
  } = {}
): TrainedDigitModel {
  const sequence = validDigits(input);

  const epochs = Math.max(
    1,
    Math.min(300, Math.floor(options.epochs ?? 60))
  );

  const learningRate = options.learningRate ?? 0.06;
  const l2 = options.l2 ?? 0.002;

  const weights = Array.from(
    { length: CLASSES },
    () => Array(FEATURE_LENGTH).fill(0) as number[]
  );

  const bias = Array(CLASSES).fill(0) as number[];

  const examples: { x: number[]; y: number }[] = [];

  for (let i = WINDOW; i < sequence.length; i++) {
    const x = featuresFor(sequence.slice(0, i));

    if (x) {
      examples.push({ x, y: sequence[i] });
    }
  }

  if (examples.length < 20) {
    throw new Error(
      "Need at least 40 valid historical digits to train this experimental model."
    );
  }

  for (let epoch = 0; epoch < epochs; epoch++) {
    for (const { x, y } of examples) {
      const probabilities = softmax(
        weights.map((row, k) =>
          row.reduce(
            (sum, weight, j) => sum + weight * x[j],
            bias[k]
          )
        )
      );

      for (let k = 0; k < CLASSES; k++) {
        const error = probabilities[k] - (k === y ? 1 : 0);

        for (let j = 0; j < FEATURE_LENGTH; j++) {
          weights[k][j] -= learningRate *
            (error * x[j] + l2 * weights[k][j]);
        }

        bias[k] -= learningRate * error;
      }
    }
  }

  return {
    version: "ticklens-digit-logreg-v1",
    featureLength: FEATURE_LENGTH,
    weights,
    bias,
    trainingExamples: examples.length
  };
}
function isValidTrainedModel(
  model: TrainedDigitModel
): boolean {
  return (
    model.version === "ticklens-digit-logreg-v1" &&
    model.featureLength === FEATURE_LENGTH &&
    model.weights.length === CLASSES &&
    model.weights.every(
      row =>
        row.length === FEATURE_LENGTH &&
        row.every(Number.isFinite)
    ) &&
    model.bias.length === CLASSES &&
    model.bias.every(Number.isFinite) &&
    Number.isInteger(model.trainingExamples) &&
    model.trainingExamples >= 20
  );
}
/**
 * Predict a probability distribution from observed digits.
 */
export function predictDigit(
  model: TrainedDigitModel,
  history: readonly number[]
): ModelPrediction | null {  if (!isValidTrainedModel(model)) {
    return null;
}
  const x = featuresFor(history);

  if (!x) return null;

  const distribution = softmax(
    model.weights.map((row, k) =>
      row.reduce(
        (sum, weight, j) => sum + weight * x[j],
        model.bias[k]
      )
    )
  );

  const ranked = distribution
    .map((_, i) => i as Digit)
    .sort((a, b) => distribution[b] - distribution[a]);

  return {
    distribution,
    ranked,
    digit: ranked[0],
    confidence: distribution[ranked[0]]
  };
}
