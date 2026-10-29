import { predictDigit, trainDigitModel } from "./model";
export interface Score { samples: number; exactAccuracy: number; top3Accuracy: number; meanLogLoss: number; }
export interface EvaluationReport {
  totalDigits: number;
  split: { trainEnd: number; validationEnd: number; testEnd: number };
  model: { trainingExamples: number; validation: Score; test: Score };
  baselines: { uniform: Score; trainFrequency: Score };
  note: string;
}
function validDigits(values: readonly number[]): number[] { return values.filter(n => Number.isInteger(n) && n >= 0 && n <= 9); }
function score(rows: { actual: number; probs: number[]; ranked: number[] }[]): Score {
  if (!rows.length) return { samples: 0, exactAccuracy: 0, top3Accuracy: 0, meanLogLoss: 0 };
  let exact = 0, top3 = 0, loss = 0;
  for (const row of rows) {
    if (row.ranked[0] === row.actual) exact++;
    if (row.ranked.slice(0, 3).includes(row.actual)) top3++;
    loss -= Math.log(Math.max(1e-12, row.probs[row.actual]));
  }
  return { samples: rows.length, exactAccuracy: exact / rows.length, top3Accuracy: top3 / rows.length, meanLogLoss: loss / rows.length };
}
function freq(training: number[]): number[] {
  const counts = Array(10).fill(1) as number[];
  for (const d of training) counts[d]++;
  const sum = counts.reduce((a, b) => a + b, 0);
  return counts.map(n => n / sum);
}
function rank(probs: number[]): number[] { return probs.map((_, i) => i).sort((a, b) => probs[b] - probs[a]); }
function scoreConstant(sequence: number[], start: number, end: number, probs: number[]): Score {
  const ranked = rank(probs), rows = [];
  for (let i = start; i < end; i++) rows.push({ actual: sequence[i], probs, ranked });
  return score(rows);
}
function scoreModel(sequence: number[], start: number, end: number, model: ReturnType<typeof trainDigitModel>): Score {
  const rows = [];
  for (let i = start; i < end; i++) {
    const p = predictDigit(model, sequence.slice(0, i));
    if (p) rows.push({ actual: sequence[i], probs: p.distribution, ranked: p.ranked });
  }
  return score(rows);
}
/** Train on first 70%, validate on next 15%, final 15% is held out. */
export function evaluateChronologically(input: readonly number[]): EvaluationReport {
  const sequence = validDigits(input);
  if (sequence.length < 200) throw new Error("Use at least 200 chronological digits; more data is preferable.");
  const trainEnd = Math.floor(sequence.length * 0.70), validationEnd = Math.floor(sequence.length * 0.85);
  const model = trainDigitModel(sequence.slice(0, trainEnd));
  const trainingFrequencies = freq(sequence.slice(0, trainEnd));
  return {
    totalDigits: sequence.length,
    split: { trainEnd, validationEnd, testEnd: sequence.length },
    model: {
      trainingExamples: model.trainingExamples,
      validation: scoreModel(sequence, trainEnd, validationEnd, model),
      test: scoreModel(sequence, validationEnd, sequence.length, model),
    },
    baselines: {
      uniform: scoreConstant(sequence, validationEnd, sequence.length, Array(10).fill(0.1)),
      trainFrequency: scoreConstant(sequence, validationEnd, sequence.length, trainingFrequencies),
    },
    note: "Exploratory historical evaluation only. One result does not establish a durable trading edge or guarantee the next digit.",
  };
}
export function parseDigitSequence(text: string): number[] {
  const tokens = text.trim().split(/[\s,;]+/).filter(Boolean), digits = tokens.map(Number);
  if (!digits.length || digits.some(n => !Number.isInteger(n) || n < 0 || n > 9)) {
    throw new Error("Input must contain only digits 0 through 9 separated by spaces, commas, or new lines.");
  }
  return digits;
}
