
export function backtestContract(
  contract: ContractType,
  digitsInput: number[],
  quotesInput: number[],
): ContractEvidence {
  const digits = validDigits(digitsInput)
  const quotes = quotesInput.filter(Number.isFinite)

  const isMovement =
    contract === 'rise' || contract === 'fall'

  const length = isMovement
    ? quotes.length
    : digits.length

  const firstTest = Math.max(20, length - MAX_BACKTEST_TESTS)

  let tests = 0
  let hits = 0

  for (let i = firstTest; i < length; i++) {
    if (isMovement) {
      const pastQuotes = quotes.slice(0, i)
      const prediction = predictNextMovement(pastQuotes)

      if (!prediction) continue

      const actual =
        quotes[i] > quotes[i - 1]
          ? 'rise'
          : quotes[i] < quotes[i - 1]
            ? 'fall'
            : null

      if (actual === null) continue

      tests++

      // Evaluate the contract the user actually selected.
      if (actual === contract) {
        hits++
      }
    } else {
      const pastDigits = digits.slice(0, i)
      const prediction = predictNextDigit(pastDigits)

      if (!prediction) continue

      const actual = digits[i]
      let successful = false

      switch (contract) {
        case 'matches':
          successful = actual === prediction.ranked[0]
          break

        case 'differs':
          successful = actual !== prediction.ranked[9]
          break

        case 'even':
          successful = actual % 2 === 0
          break

        case 'odd':
          successful = actual % 2 === 1
          break
      }

      tests++

      if (successful) hits++
    }
  }

  const baseline =
    contract === 'matches'
      ? 10
      : contract === 'differs'
        ? 90
        : 50

  const accuracy =
    tests > 0 ? (hits / tests) * 100 : null

  const lower = wilsonLowerBound(hits, tests)

  const edgeDemonstrated =
    tests >= MIN_TESTS &&
    lower !== null &&
    lower * 100 > baseline

  return {
    contract,
    selection:
      contract === 'matches'
        ? 'Highest estimated digit'
        : contract === 'differs'
          ? 'Lowest estimated digit'
          : contract === 'even'
            ? 'Even'
            : contract === 'odd'
              ? 'Odd'
              : contract === 'rise'
                ? 'Rise'
                : 'Fall',
    probability: 0,
    tests,
    hits,
    accuracy,
    baseline,
    lowerBound: lower === null ? null : lower * 100,
    edgeDemonstrated,
    signal: edgeDemonstrated ? 'CHECK' : 'WAIT',
    reason:
      tests < MIN_TESTS
        ? `Only ${tests} valid tests. At least ${MIN_TESTS} are required.`
        : edgeDemonstrated
          ? 'The conservative historical accuracy estimate exceeded the reference baseline. This does not guarantee the next result.'
          : 'The historical tests have not demonstrated an edge above the reference baseline.',
  }
}
