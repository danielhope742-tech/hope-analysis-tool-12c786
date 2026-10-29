# TickLens experimental trained digit model

This experiment is isolated from production. It does not change `src/lib/analysis.ts` or `src/hooks/use-deriv.ts`.

## Contents
- `model.ts`: multinomial logistic regression, fitted from a chronological digit sequence.
- `evaluate.ts`: 70% training, 15% validation, 15% final test; includes uniform and smoothed training-frequency baselines.
- `model.test.ts`: Vitest unit tests.

## How it works
The model uses the previous 20 digits' frequencies, the most recent digit, and historical transitions following that digit. It trains with multiclass logistic regression and regularization. This is a small trained statistical model, not a large neural network.

## Add these files
On GitHub, make sure the branch selector shows `experiment/trained-digit-model-v1`. Create each path above and paste its matching content from the package. Do not edit production analyzer files.

## Test
From the repository root:
```bash
npm test -- experiments/digit-ai/model.test.ts
npm run typecheck
```
If the Vitest configuration only discovers tests under `src`, move the test file to `src/experiments/digit-ai/model.test.ts` and adjust imports to the colocated files.

## Evaluation rules
Use raw digits from one market, in original tick order, using one consistent quote/pip digit-extraction method. Do not shuffle ticks. The final 15% is held out from fitting and should not be used to choose settings. Report sample size, exact accuracy, top-3 accuracy, and log loss alongside both baselines.

The uniform baseline is 10% exact accuracy by chance under a uniform digit assumption; top-3 baseline is 30% under that same assumption. Synthetic-index digit probabilities and market behavior should not be assumed without testing. A single run cannot prove a lasting edge. This tool does not guarantee the next digit or profit and should not be connected to real-money execution based on this experiment alone.
