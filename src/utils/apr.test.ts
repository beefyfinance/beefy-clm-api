import Decimal from 'decimal.js';
import { calculateLastApr, prepareAprState, evictOldAprEntries, AprState, aprToApy } from './apr';

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

  test('do not crash when TVL is zero now', () => {
    let aprState = prepareAprState([
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
    expect(res.apr.toNumber()).toBeCloseTo(127.75, 4);
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
    expect(aprState.length).toEqual(2);
  });

  test('should compute apr properly with one entry of zero duration', () => {
    let aprState = prepareAprState([
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

  test('Should calculate APR with one entry only, non regression for 0% apr on uniswap-cow-arb-weth-usdc.e-prod', async () => {
    let aprState = [
      {
        collectedAmount: new Decimal('0.00032000437230484107316'),
        collectTimestamp: new Date('2024-06-17T15:51:35.000Z'),
        totalValueLocked: new Decimal('0.394765342131080541588'),
      },
    ];

    const res = calculateLastApr(aprState, 86400 * 1000, new Date('2024-06-18T07:26:11.773Z'));

    expect(res.apr.toNumber()).toBeCloseTo(0.45586, 3);
    expect(res.apy.toNumber()).toBeCloseTo(0.57709, 3);
  });

  test('should compute apr in the simplest case', () => {
    let aprState = prepareAprState([
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
    let aprState = prepareAprState([
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
    let aprState = prepareAprState([
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
    expect(res.apr.toNumber()).toBeCloseTo(18.25, 4);
  });

  test('should compute apr when total value locked changes', () => {
    let aprState = prepareAprState([
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
    expect(res.apr.toNumber()).toBeCloseTo(54.75, 4);
  });

  test('should compute apr when yield and total value locked changes', () => {
    let aprState = prepareAprState([
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
    expect(res.apr.toNumber()).toBeCloseTo(127.75, 4);
  });

  test('should allow multiple changes in the same timestamp/block (multicall)', () => {
    let aprState = prepareAprState([
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
    expect(res.apr.toNumber()).toBeCloseTo(127.75, 4);
  });

  test('should compute apr when the day is not over yet', () => {
    let aprState: AprState = [];

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
    expect(res.apr.toNumber()).toBeCloseTo(80.3, 4);
  });

  test('Should properly compute mooBeefy APR', () => {
    let aprState = prepareAprState([
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

    // 0.006869940091 + 0.013107066358 + 0.001774573046 + 0.000123153802
    // => 0.021874733297
    //
    // 1711312513 - 1711226113
    // => 86400
    //
    // TVL = 518.557670492
    //
    // 0.021874733297 / 518.557670492
    // => 0.0000421838004560 / day
    //
    // (0.021874733297 / 518.557670492) * 365
    // => 0.015397087166466233
    // => 1.5397087166466233% APR
    const now = new Date(1711312513 * 1000);
    const res = calculateLastApr(prepareAprState(aprState), ONE_DAY, now);
    expect(res.apr.toNumber()).toBeCloseTo(0.015624358078677, 3);
  });

  test('Should convert APR to APY correctly', () => {
    expect(aprToApy(new Decimal('0.025'), 12).toNumber()).toBeCloseTo(0.0253, 3);
    expect(aprToApy(new Decimal('0.06'), 365).toNumber()).toBeCloseTo(0.0618, 3);
    expect(aprToApy(new Decimal('0.06'), 12).toNumber()).toBeCloseTo(0.0617, 3);
  });
});
