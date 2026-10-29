
# TickLens Experimental Digit AI

## Purpose

This is an experimental digit-classification model.
It is separate from the existing TickLens analyzer.

It estimates probabilities for digits 0–9 using historical
digit frequencies, the most recent digit, and observed
digit transitions.

It cannot guarantee the next digit or trading profit.

## Files

- `model.ts` — feature extraction, model training, and predictions.
- `evaluate.ts` — chronological holdout evaluation.
- `model.test.ts` — automated model tests.

## Requirements

This experiment uses TypeScript and Vitest for tests.

Install Vitest in the repository's existing development
environment if it is not already installed.

## Historical data

Use actual observed Deriv tick digits, stored in chronological
order from oldest to newest.

The evaluation requires at least 200 valid digits.

Do not shuffle the data before evaluation. The final 15% is
reserved as the out-of-sample test segment.

## Important limitations

- Historical patterns may not predict future digits.
- A probability estimate is not a guarantee.
- Test performance may differ from live performance.
- This model does not connect to Deriv or place trades.
- Do not use results as a promise of profit.
