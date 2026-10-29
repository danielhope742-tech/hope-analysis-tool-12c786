import {
  featuresFor,
  trainDigitModel,
  predictDigit,
  type TrainedDigitModel
} from "./model";

describe("TickLens experimental digit model", () => {
  const history = Array.from(
    { length: 100 },
    (_, i) => (i * 7 + 3) % 10
  );

  it("creates 30 features from sufficient history", () => {
    const features = featuresFor(history);

    expect(features).not.toBeNull();
    expect(features).toHaveLength(30);
  });

  it("returns null when history is too short", () => {
    expect(featuresFor([1, 2, 3])).toBeNull();
  });

  it("trains a model on historical digits", () => {
    const model = trainDigitModel(history);

    expect(model.version).toBe("ticklens-digit-logreg-v1");
    expect(model.trainingExamples).toBeGreaterThan(0);
    expect(model.weights).toHaveLength(10);
  });

  it("returns probabilities adding up to approximately one", () => {
    const model = trainDigitModel(history);
    const prediction = predictDigit(model, history);

    expect(prediction).not.toBeNull();

    const total = prediction!.distribution.reduce(
      (sum, probability) => sum + probability,
      0
    );

    expect(total).toBeCloseTo(1, 6);
    expect(prediction!.ranked).toHaveLength(10);
  });

  it("ranks digits from highest to lowest probability", () => {
    const model = trainDigitModel(history);
    const prediction = predictDigit(model, history)!;

    for (let i = 0; i < 9; i++) {
      expect(
        prediction.distribution[prediction.ranked[i]]
      ).toBeGreaterThanOrEqual(
        prediction.distribution[prediction.ranked[i + 1]]
      );
    }
  });
  it("rejects a model with invalid weights", () => {
    const model = trainDigitModel(history);

    const invalidModel: TrainedDigitModel = {
      ...model,
      weights: []
    };

    expect(
      predictDigit(invalidModel, history)
    ).toBeNull();
  });
});
