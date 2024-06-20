import Decimal from 'decimal.js';
import { getLoggerFor } from './log';

const logger = getLoggerFor('AprState');
const ONE_YEAR = 365 * 24 * 60 * 60 * 1000;
const ZERO_BD = new Decimal(0);

type AprStateEntry = {
  collectedAmount: Decimal;
  collectTimestamp: Date;
  totalValueLocked: Decimal;
};

export type AprState = Array<AprStateEntry>;

// merge entries with the same timestamp
export function prepareAprState(state: AprState): AprState {
  if (state.length === 0) {
    return state;
  }
  const cleanedEntries: AprState = [];
  // sort entries by timestamp in ascending order
  state.sort((a, b) => a.collectTimestamp.getTime() - b.collectTimestamp.getTime());
  let lastEntry = state[0];
  for (let i = 1; i < state.length; i++) {
    const entry = state[i];
    if (entry.collectTimestamp.getTime() === lastEntry.collectTimestamp.getTime()) {
      lastEntry.collectedAmount = lastEntry.collectedAmount.plus(entry.collectedAmount);
      lastEntry.totalValueLocked = entry.totalValueLocked;
    } else {
      cleanedEntries.push(lastEntry);
      lastEntry = entry;
    }
  }
  cleanedEntries.push(lastEntry);
  return cleanedEntries;
}

export function evictOldAprEntries(state: AprState, periodMs: number, now: Date): AprState {
  const threshold = now.getTime() - periodMs;
  return state.filter(entry => entry.collectTimestamp.getTime() >= threshold);
}

export function calculateLastApr(
  state: AprState,
  periodMs: number,
  now: Date
): { apr: Decimal; apy: Decimal } {
  if (periodMs <= 0) {
    logger.error('AprCalc: period cannot be negative or zero, got {}', [periodMs.toString()]);
    throw Error('AprCalc: period cannot be negative or zero');
  }
  // we need at least 1 entry to compute the apr
  if (state.length === 0) {
    return { apr: ZERO_BD, apy: ZERO_BD };
  }

  // we place ourselves at the last collect timestamp
  //const now = this.state.collects[this.state.collects.length - 1].collectTimestamp
  const periodStart = now.getTime() - periodMs;

  // first, eliminate the entries that are not in the period anymore
  state = evictOldAprEntries(state, periodMs, now);

  // special cases for 0 or 1 entries after eviction
  if (state.length === 0) {
    return { apr: ZERO_BD, apy: ZERO_BD };
  }

  if (state.length === 1) {
    const entry = state[0];
    const sliceDuration = new Decimal(now.getTime() - entry.collectTimestamp.getTime());
    const sliceCollected = entry.collectedAmount;
    const sliceTvl = entry.totalValueLocked;

    if (sliceTvl.isZero()) {
      return { apr: ZERO_BD, apy: ZERO_BD };
    }
    if (sliceDuration.isZero()) {
      return { apr: ZERO_BD, apy: ZERO_BD };
    }

    const rewardRate = sliceCollected.div(sliceTvl).div(sliceDuration);
    const apr = rewardRate.times(ONE_YEAR);
    const apy = aprToApy(apr, ONE_YEAR / periodMs);
    return { apr, apy };
  }

  // for each time slice, we get the APR and duration for it
  const APRs = new Array<Decimal>();
  const durations = new Array<Decimal>();
  let compoundCount = 0;
  for (let idx = 1; idx < state.length; idx++) {
    const prev = state[idx - 1];
    const curr = state[idx];

    const sliceStart = Math.max(periodStart, prev.collectTimestamp.getTime());
    const sliceEnd = curr.collectTimestamp.getTime();
    const sliceDuration = new Decimal(Math.max(sliceEnd - sliceStart, 1));

    // account for slices beginning before the period start
    const slicePercentSpan = sliceDuration.div(
      curr.collectTimestamp.getTime() - prev.collectTimestamp.getTime()
    );
    const sliceCollected = curr.collectedAmount.times(slicePercentSpan);

    // consider the previous TVL as it's updated on the same block as the collected amount
    const sliceTvl = prev.totalValueLocked;

    // if the slice has no TVL, we skip it since it doesn't contribute to the APR
    if (!sliceTvl.isZero() && !sliceDuration.isZero()) {
      // we compute the reward rate for the slice per unit of tvl
      const rewardRate = sliceCollected.div(sliceTvl).div(sliceDuration);

      // We normalize the APR to a yearly rate
      APRs.push(rewardRate.times(ONE_YEAR));
      durations.push(sliceDuration);
    }

    compoundCount++;
  }

  let durationSum = ZERO_BD;
  let timeWeight = ZERO_BD;
  let weighedAPRSum = ZERO_BD;

  // linearly weight the APRs, most recent APRs have full impact
  for (let i = 0; i < APRs.length; i++) {
    durationSum = durationSum.plus(durations[i].dividedBy(periodMs));
    timeWeight = timeWeight.plus(durations[i].times(durationSum));
    weighedAPRSum = weighedAPRSum.plus(APRs[i].times(timeWeight));
  }

  const apr = weighedAPRSum.div(timeWeight);
  // we compound the APR to get the APY
  const annualPeriods = ONE_YEAR / periodMs;
  const annualCompounds = annualPeriods * compoundCount;
  const apy = aprToApy(apr, annualCompounds);
  return { apr, apy };
}

export function aprToApy(apr: Decimal, annualCompounds: number): Decimal {
  // APY = [1 + (r ÷ n)] ^ n – 1
  // where r is the APR and n is the number of compounding periods
  return apr.div(annualCompounds).plus(1).pow(annualCompounds).minus(1);
}
