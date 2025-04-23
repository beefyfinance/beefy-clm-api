import Decimal from 'decimal.js';
import {
  type AprState,
  aprToApy,
  calculateLastApr,
  evictOldAprEntries,
  mergeUnique,
  prepareAprState,
} from './apr';

const ONE_WEEK = 7 * 24 * 60 * 60 * 1000;
const ONE_DAY = 24 * 60 * 60 * 1000;
const ZERO_BD = new Decimal(0);

describe('Apr', () => {
  test('Can create apr calc with no state', () => {
    const aprState = prepareAprState([]);
    const now = new Date(ONE_WEEK);
    const res = calculateLastApr(aprState, ONE_DAY, now);
    expect(res.apr.toNumber()).toEqual(ZERO_BD.toNumber());
  });

  test('merges arrays correctly', () => {
    const baseArray: {
      __typename?: 'ClassicHarvestEvent';
      timestamp: string;
      underlyingAmount: string;
      compoundedAmount: string;
      underlyingToNativePrice: string;
      nativeToUSDPrice: string;
    }[] = [
      {
        timestamp: '1711201231',
        underlyingAmount: '100',
        compoundedAmount: '100',
        underlyingToNativePrice: '1',
        nativeToUSDPrice: '1',
      },
      {
        timestamp: '1711201235',
        underlyingAmount: '100',
        compoundedAmount: '100',
        underlyingToNativePrice: '1',
        nativeToUSDPrice: '1',
      },
    ];

    const extraArray: {
      __typename?: 'ClassicHarvestEvent';
      timestamp: string;
      underlyingAmount: string;
      compoundedAmount: string;
      underlyingToNativePrice: string;
      nativeToUSDPrice: string;
    }[] = [
      {
        //duplicate item, shouldn't be added
        timestamp: '1711201231',
        underlyingAmount: '100',
        compoundedAmount: '100',
        underlyingToNativePrice: '1',
        nativeToUSDPrice: '1',
      },
      {
        timestamp: '1711201236',
        underlyingAmount: '100',
        compoundedAmount: '100',
        underlyingToNativePrice: '1',
        nativeToUSDPrice: '1',
      },
    ];

    const mergedArray = mergeUnique(baseArray, extraArray);
    expect(mergedArray.length).toEqual(3);
  });

  test('do not crash when TVL is zero now', () => {
    const aprState = prepareAprState([
      {
        collectedAmount: new Decimal(100),
        collectTimestamp: new Date(0),
        totalValueLocked: new Decimal(1000),
      },
      {
        collectedAmount: new Decimal(200),
        collectTimestamp: new Date(10_000_000),
        totalValueLocked: new Decimal(2000),
      },
      {
        collectedAmount: new Decimal(300),
        collectTimestamp: new Date(ONE_DAY),
        totalValueLocked: new Decimal(0),
      },
    ]);

    const now = new Date(ONE_DAY);
    const res = calculateLastApr(aprState, ONE_DAY, now);
    expect(res.apr.toNumber()).toBeCloseTo(70.404622, 4);
  });

  test('should evict old entries', () => {
    let aprState = prepareAprState([
      {
        collectedAmount: new Decimal(100),
        collectTimestamp: new Date(100 * 1000),
        totalValueLocked: new Decimal(1000),
      },
      {
        collectedAmount: new Decimal(200),
        collectTimestamp: new Date(200 * 1000),
        totalValueLocked: new Decimal(2000),
      },
      {
        collectedAmount: new Decimal(300),
        collectTimestamp: new Date(69382300 * 1000),
        totalValueLocked: new Decimal(3000),
      },
      {
        collectedAmount: new Decimal(400),
        collectTimestamp: new Date(69382400 * 1000),
        totalValueLocked: new Decimal(4000),
      },
    ]);
    const now = new Date(69382400 * 1000);
    aprState = evictOldAprEntries(aprState, ONE_DAY, now);
    expect(aprState.length).toEqual(3);
  });

  test('should compute apr properly with one entry of zero duration', () => {
    const aprState = prepareAprState([
      {
        collectedAmount: new Decimal(100),
        collectTimestamp: new Date(100 * 1000),
        totalValueLocked: new Decimal(1000),
      },
    ]);

    const now = new Date(100 * 1000);
    const res = calculateLastApr(aprState, ONE_DAY, now);
    expect(res.apr.toNumber()).toEqual(ZERO_BD.toNumber());
  });

  test('Should calculate APR with one entry only, should be 0', async () => {
    const aprState = [
      {
        collectedAmount: new Decimal('0.00032000437230484107316'),
        collectTimestamp: new Date('2024-06-17T15:51:35.000Z'),
        totalValueLocked: new Decimal('0.394765342131080541588'),
      },
    ];

    const res = calculateLastApr(aprState, 86400 * 1000, new Date('2024-06-18T07:26:11.773Z'));

    expect(res.apr.toNumber()).toBeCloseTo(0, 3);
    expect(res.apy.toNumber()).toBeCloseTo(0, 3);
  });

  test('Should calculate APR with 1 entry in current period with additional entry previous to it', async () => {
    const aprState = [
      {
        collectedAmount: new Decimal('1.52862409877410972716'),
        collectTimestamp: new Date('2025-04-10T00:49:05.000Z'), //Entry happening over 24h from desired period
        totalValueLocked: new Decimal('23960.55152220372208423456'),
      },
      {
        collectedAmount: new Decimal('156.67283090769483794841'),
        collectTimestamp: new Date('2025-04-12T11:28:58.000Z'), //Only entry falling into the 1day period
        totalValueLocked: new Decimal('22026.66919334588149167308'),
      },
    ];

    const res = calculateLastApr(aprState, 86400 * 1000, new Date('2025-04-12T11:28:58.000Z'));
    expect(res.apr.toNumber()).toBeCloseTo(0.9763914502623975, 3);
  });

  test('should compute apr in the simplest case', () => {
    const aprState = prepareAprState([
      {
        collectedAmount: new Decimal(10),
        collectTimestamp: new Date(0),
        totalValueLocked: new Decimal(1000),
      },
      {
        collectedAmount: new Decimal(10),
        collectTimestamp: new Date(ONE_DAY),
        totalValueLocked: new Decimal(1000),
      },
    ]);

    const now = new Date(ONE_DAY);
    const res = calculateLastApr(aprState, ONE_DAY, now);
    expect(res.apr.toNumber()).toBeCloseTo(3.65, 4);
  });

  test('should compute apr in the simplest case when the full period has not elapsed', () => {
    const aprState = prepareAprState([
      {
        collectedAmount: new Decimal(10),
        collectTimestamp: new Date(0),
        totalValueLocked: new Decimal(1000),
      },
      {
        collectedAmount: new Decimal(10),
        collectTimestamp: new Date(ONE_DAY),
        totalValueLocked: new Decimal(1000),
      },
    ]);

    const now = new Date(ONE_DAY);
    const res = calculateLastApr(aprState, ONE_WEEK, now);
    expect(res.apr.toNumber()).toBeCloseTo(3.65, 4);
  });

  test('should compute apr when yield changes', () => {
    const aprState = prepareAprState([
      {
        collectedAmount: new Decimal(10),
        collectTimestamp: new Date(0),
        totalValueLocked: new Decimal(1000),
      },
      {
        collectedAmount: new Decimal(20),
        collectTimestamp: new Date(10000 * 1000),
        totalValueLocked: new Decimal(1000),
      },
      {
        collectedAmount: new Decimal(30),
        collectTimestamp: new Date(ONE_DAY),
        totalValueLocked: new Decimal(1000),
      },
    ]);

    const now = new Date(ONE_DAY);
    const res = calculateLastApr(aprState, ONE_DAY, now);
    expect(res.apr.toNumber()).toBeCloseTo(13.1396862, 4);
  });

  test('should compute apr when total value locked changes', () => {
    const aprState = prepareAprState([
      {
        collectedAmount: new Decimal(100),
        collectTimestamp: new Date(0),
        totalValueLocked: new Decimal(1000),
      },
      {
        collectedAmount: new Decimal(100),
        collectTimestamp: new Date(10000 * 1000),
        totalValueLocked: new Decimal(2000),
      },
      {
        collectedAmount: new Decimal(100),
        collectTimestamp: new Date(ONE_DAY),
        totalValueLocked: new Decimal(3000),
      },
    ]);

    const now = new Date(ONE_DAY);
    const res = calculateLastApr(aprState, ONE_DAY, now);
    expect(res.apr.toNumber()).toBeCloseTo(25.0369379, 4);
  });

  test('should compute apr when yield and total value locked changes', () => {
    const aprState = prepareAprState([
      {
        collectedAmount: new Decimal(100),
        collectTimestamp: new Date(0),
        totalValueLocked: new Decimal(1000),
      },
      {
        collectedAmount: new Decimal(200),
        collectTimestamp: new Date(10000 * 1000),
        totalValueLocked: new Decimal(2000),
      },
      {
        collectedAmount: new Decimal(300),
        collectTimestamp: new Date(ONE_DAY),
        totalValueLocked: new Decimal(3000),
      },
    ]);

    const now = new Date(ONE_DAY);
    const res = calculateLastApr(aprState, ONE_DAY, now);
    expect(res.apr.toNumber()).toBeCloseTo(70.40462, 4);
  });

  test('should allow multiple changes in the same timestamp/block (multicall)', () => {
    const aprState = prepareAprState([
      {
        collectedAmount: new Decimal(100),
        collectTimestamp: new Date(0),
        totalValueLocked: new Decimal(1000),
      },
      {
        collectedAmount: new Decimal(100),
        collectTimestamp: new Date(10000 * 1000),
        totalValueLocked: new Decimal(2000),
      },
      {
        collectedAmount: new Decimal(100),
        collectTimestamp: new Date(10000 * 1000),
        totalValueLocked: new Decimal(2000),
      },
      {
        collectedAmount: new Decimal(300),
        collectTimestamp: new Date(ONE_DAY),
        totalValueLocked: new Decimal(3000),
      },
    ]);

    const now = new Date(ONE_DAY);
    const res = calculateLastApr(aprState, ONE_DAY, now);
    expect(res.apr.toNumber()).toBeCloseTo(70.4046, 4);
  });

  test('should compute apr when the day is not over yet', () => {
    const aprState: AprState = [];

    // using 6 decimals
    const one = new Decimal('1000000');

    // whatever$ at 00:00, tvl of $100
    // => 0% apr for the first hour
    let now = new Date(0);
    aprState.push({
      collectedAmount: new Decimal(0),
      collectTimestamp: now,
      totalValueLocked: one.times(100),
    });
    expect(evictOldAprEntries(aprState, ONE_DAY, now).length).toEqual(1);
    let res = calculateLastApr(prepareAprState(aprState), ONE_DAY, now);
    expect(res.apr.toNumber()).toBeCloseTo(0, 4);

    // 2: 1$ at 01:00, tvl of $100 => +1% for the first hour
    // => APR_24H is 1% * 24 * 365 => 8760%
    now = new Date(60 * 60 * 1000);
    aprState.push({
      collectedAmount: one,
      collectTimestamp: now,
      totalValueLocked: one.times(100),
    });
    expect(evictOldAprEntries(aprState, ONE_DAY, now).length).toEqual(2);
    res = calculateLastApr(prepareAprState(aprState), ONE_DAY, now);
    expect(res.apr.toNumber()).toBeCloseTo(87.6, 4);

    // 3: deposit of $100 at 12:00, claiming 10$ => +10% for 11h (because tvl was $100 for the whole period)
    // => +$11 over 12h for a tvl of $100 => +11% over 12h
    // => APR_24h is 11% * 2 * 365 : 8030%
    now = new Date(12 * 60 * 60 * 1000);
    aprState.push({
      collectedAmount: one.times(10),
      collectTimestamp: now,
      totalValueLocked: one.times(200),
    });
    expect(evictOldAprEntries(aprState, ONE_DAY, now).length).toEqual(3);
    res = calculateLastApr(prepareAprState(aprState), ONE_DAY, now);
    expect(res.apr.toNumber()).toBeCloseTo(79.69624060150376, 4);
  });

  test('Should properly compute mooBeefy APR', () => {
    const aprState = prepareAprState([
      // these ones should be ignored
      {
        collectedAmount: new Decimal(0),
        collectTimestamp: new Date(1711201231 * 1000),
        totalValueLocked: new Decimal('507.5882781815525135710848872656791'),
      },
      {
        collectedAmount: new Decimal('0.004065784550081421262762731034373881'),
        collectTimestamp: new Date(1711204513 * 1000),
        totalValueLocked: new Decimal('516.1787253846584915657179517695577'),
      },
      // these ones should be used
      {
        collectedAmount: new Decimal('0.02430711381950250190531710544653613'),
        collectTimestamp: new Date(1711226113 * 1000),
        totalValueLocked: new Decimal('513.4946880572305829489501989140695'),
      },
      {
        collectedAmount: new Decimal('0.006869940091541016837589566381232779'),
        collectTimestamp: new Date(1711247715 * 1000),
        totalValueLocked: new Decimal('506.0724423742907934604618462166345'),
      },
      {
        collectedAmount: new Decimal('0.01310706635829128889638'),
        collectTimestamp: new Date(1711269313 * 1000),
        totalValueLocked: new Decimal('508.1091471133737574196901844200933'),
      },
      {
        collectedAmount: new Decimal('0.001774573046281402321668824352704134'),
        collectTimestamp: new Date(1711290913 * 1000),
        totalValueLocked: new Decimal('516.3820906223624723194813255682192'),
      },
      {
        collectedAmount: new Decimal('0.00012315380232791303052005'),
        collectTimestamp: new Date(1711312513 * 1000),
        totalValueLocked: new Decimal('518.5576704920643326430271310797996'),
      },
    ]);

    const now = new Date(1711312513 * 1000);
    const res = calculateLastApr(prepareAprState(aprState), ONE_DAY, now);
    expect(res.apr.toNumber()).toBeCloseTo(0.011185160623593739, 3);
  });

  test('Should convert APR to APY correctly', () => {
    expect(aprToApy(new Decimal('0.025'), 12).toNumber()).toBeCloseTo(0.0253, 3);
    expect(aprToApy(new Decimal('0.06'), 365).toNumber()).toBeCloseTo(0.0618, 3);
    expect(aprToApy(new Decimal('0.06'), 12).toNumber()).toBeCloseTo(0.0617, 3);
  });
});
