import { Enum, type Static } from '@sinclair/typebox';
import Decimal from 'decimal.js';
import { groupBy, keyBy } from 'lodash';
import type { ChainId } from '../config/chains';
import {
  ClassicPositionInteractionType,
  ClmPositionInteractionType,
  type InvestorTimelineClassicPositionFragment,
  type InvestorTimelineClassicPositionInteractionFragment,
  type InvestorTimelineClmPositionFragment,
  type InvestorTimelineClmPositionInteractionFragment,
  type InvestorTimelineQuery,
} from '../queries/codegen/sdk';
import { isDefined } from './array';
import { fromUnixTime } from './date';
import { interpretAsDecimal } from './decimal';
import { sortEntitiesByOrderList } from './entity-order';
import { getLoggerFor } from './log';
import type { Address } from './scalar-types';
import { type PaginatedAllSdkResult, executeOnAllSdks, paginate } from './sdk';
import { toToken } from './tokens';

const logger = getLoggerFor('timeline');

export type BalanceDelta = {
  balance: Decimal;
  delta: Decimal;
};

export type Token = {
  address: string;
  decimals: number;
  name?: string | undefined;
};

export const clmActionsEnumSchema = Enum(ClmPositionInteractionType);
export const classicActionsEnumSchema = Enum(ClassicPositionInteractionType);

type ClmActionsEnum = Static<typeof clmActionsEnumSchema>;
type ClassicActionsEnum = Static<typeof classicActionsEnumSchema>;

export type TimelineClmInteraction = {
  type: 'clm';
  datetime: Date;
  chain: ChainId;
  transactionHash: string;
  managerToken: Token;
  rewardPoolTokens: Token[];
  token0ToUsd: Decimal;
  token1ToUsd: Decimal;
  manager: BalanceDelta;
  rewardPools: BalanceDelta[];
  rewardPoolTotal: BalanceDelta;
  total: BalanceDelta;
  underlying0: BalanceDelta;
  underlying1: BalanceDelta;
  usd: BalanceDelta;
  actions: ClmActionsEnum[];
};

export type TimelineClassicInteraction = {
  type: 'classic';
  datetime: Date;
  chain: ChainId;
  transactionHash: string;
  shareToken: Token;
  underlyingToken: Token;
  underlyingBreakdownTokens: Token[];
  rewardPoolTokens: Token[];
  shareToUnderlying: Decimal;
  underlyingToUsd: Decimal;
  underlyingToBreakdown: Decimal[];
  underlyingBreakdownToUsd: Decimal[];
  vault: BalanceDelta;
  rewardPools: BalanceDelta[];
  rewardPoolTotal: BalanceDelta;
  total: BalanceDelta;
  usd: BalanceDelta;
  actions: ClassicActionsEnum[];
};

type TimelineAnyInteraction = TimelineClmInteraction | TimelineClassicInteraction;

const mergeBalanceDelta = <T extends BalanceDelta>(prev: T, next: T): T => {
  return {
    ...next,
    delta: prev.delta.add(next.delta),
  };
};

const sumBalanceDelta = <T extends BalanceDelta>(prev: T, next: T): T => {
  return {
    ...next,
    balance: prev.balance.add(next.balance),
    delta: prev.delta.add(next.delta),
  };
};

/** Merge ClmPositionInteractions that share the same tx hash */
const mergeClmPositionInteractions = (
  chain: ChainId,
  managerToken: Token,
  rewardPoolTokens: Token[],
  token0: Token,
  token1: Token,
  interactions: InvestorTimelineClmPositionInteractionFragment[]
): TimelineClmInteraction[] => {
  const mergedByTxId = interactions.reduce(
    (acc, interaction) => {
      const token0ToNative = interpretAsDecimal(interaction.token0ToNativePrice, 18);
      const token1ToNative = interpretAsDecimal(interaction.token1ToNativePrice, 18);
      const nativeToUsd = interpretAsDecimal(interaction.nativeToUSDPrice, 18);
      const token0ToUsd = token0ToNative.mul(nativeToUsd);
      const token1ToUsd = token1ToNative.mul(nativeToUsd);
      const manager: BalanceDelta = {
        balance: interpretAsDecimal(interaction.managerBalance, managerToken.decimals),
        delta: interpretAsDecimal(interaction.managerBalanceDelta, managerToken.decimals),
      };
      const rewardPools: BalanceDelta[] = rewardPoolTokens.map((rewardPoolToken, i) => ({
        balance: interpretAsDecimal(
          interaction.rewardPoolBalances[i] || '0',
          rewardPoolToken.decimals
        ),
        delta: interpretAsDecimal(
          interaction.rewardPoolBalancesDelta[i] || '0',
          rewardPoolToken.decimals
        ),
      }));
      const rewardPoolTotal: BalanceDelta = rewardPools.reduce(sumBalanceDelta, {
        balance: new Decimal(0),
        delta: new Decimal(0),
      });
      const total: BalanceDelta = {
        balance: interpretAsDecimal(interaction.totalBalance, managerToken.decimals),
        delta: manager.delta.add(rewardPoolTotal.delta),
      };
      const underlying0: BalanceDelta = {
        balance: interpretAsDecimal(interaction.underlyingBalance0, token0.decimals),
        delta: interpretAsDecimal(interaction.underlyingBalance0Delta, token0.decimals),
      };
      const underlying1: BalanceDelta = {
        balance: interpretAsDecimal(interaction.underlyingBalance1, token1.decimals),
        delta: interpretAsDecimal(interaction.underlyingBalance1Delta, token1.decimals),
      };
      const usd: BalanceDelta = {
        balance: underlying0.balance.mul(token0ToUsd).add(underlying1.balance.mul(token1ToUsd)),
        delta: underlying0.delta.mul(token0ToUsd).add(underlying1.delta.mul(token1ToUsd)),
      };
      const txHash: string = interaction.createdWith.hash;

      const existingTx = acc[txHash];
      if (existingTx) {
        const mergedManaged = mergeBalanceDelta(existingTx.manager, manager);
        const mergedRewardPools = rewardPools.map((rp, i) =>
          existingTx.rewardPools[i] ? mergeBalanceDelta(existingTx.rewardPools[i], rp) : rp
        );
        const mergedRewardPoolTotal = mergeBalanceDelta(
          existingTx.rewardPoolTotal,
          rewardPoolTotal
        );
        const mergedUnderlying0 = mergeBalanceDelta(existingTx.underlying0, underlying0);
        const mergedUnderlying1 = mergeBalanceDelta(existingTx.underlying1, underlying1);
        const mergedTotal = mergeBalanceDelta(existingTx.total, total);

        acc[txHash] = {
          ...existingTx,
          manager: mergedManaged,
          rewardPools: mergedRewardPools,
          rewardPoolTotal: mergedRewardPoolTotal,
          total: mergedTotal,
          underlying0: mergedUnderlying0,
          underlying1: mergedUnderlying1,
          usd: {
            balance: usd.balance,
            delta: mergedUnderlying1.delta
              .mul(token0ToUsd)
              .add(mergedUnderlying1.delta.mul(token1ToUsd)),
          },
          actions: [...existingTx.actions, interaction.type],
        };
      } else {
        acc[txHash] = {
          type: 'clm',
          datetime: fromUnixTime(interaction.timestamp),
          chain,
          transactionHash: txHash,
          managerToken,
          rewardPoolTokens,
          token0ToUsd,
          token1ToUsd,
          manager,
          rewardPools,
          rewardPoolTotal,
          total,
          underlying0,
          underlying1,
          usd,
          actions: [interaction.type],
        };
      }

      return acc;
    },
    {} as Record<string, TimelineClmInteraction>
  );

  return Object.values(mergedByTxId);
};

const clmPositionToInteractions = (
  chainId: ChainId,
  position: InvestorTimelineClmPositionFragment,
  interactions: InvestorTimelineClmPositionInteractionFragment[]
): TimelineClmInteraction[] => {
  const { id, clm } = position;
  const managerToken = toToken(clm.managerToken);
  const orderedRewardPoolTokenAddresses = sortEntitiesByOrderList(
    clm.rewardPoolTokens,
    'address',
    clm.rewardPoolTokensOrder
  );
  const rewardPoolTokens = orderedRewardPoolTokenAddresses.map(toToken).filter(Boolean) as Token[];
  const token0 = toToken(clm.underlyingToken0);
  const token1 = toToken(clm.underlyingToken1);
  if (!managerToken || !token0 || !token1) {
    logger.error(`Missing token for position ${id}`);
    return [];
  }

  return mergeClmPositionInteractions(
    chainId,
    managerToken,
    rewardPoolTokens,
    token0,
    token1,
    interactions
  );
};

/** Merge ClassicPositionInteractions that share the same tx hash */
const mergeClassicPositionInteractions = (
  chain: ChainId,
  shareToken: Token,
  underlyingToken: Token,
  underlyingBreakdownTokens: Token[],
  rewardPoolTokens: Token[],
  interactions: InvestorTimelineClassicPositionInteractionFragment[]
): TimelineClassicInteraction[] => {
  const mergedByTxId = interactions.reduce(
    (acc, interaction) => {
      const vaultTotalSupply = interpretAsDecimal(interaction.vaultSharesTotalSupply, 18);
      const totalUnderlyingInVault = interpretAsDecimal(interaction.vaultUnderlyingAmount, 18);
      const underlyingTotalSupply = interpretAsDecimal(interaction.vaultUnderlyingTotalSupply, 18);
      const underlyingToNative = interpretAsDecimal(interaction.underlyingToNativePrice, 18);
      const nativeToUsd = interpretAsDecimal(interaction.nativeToUSDPrice, 18);
      const shareToUnderlying = totalUnderlyingInVault.div(vaultTotalSupply);
      const underlyingToUsd = underlyingToNative.mul(nativeToUsd);
      const underlyingToBreakdown = underlyingBreakdownTokens.map((breakdownToken, i) =>
        interpretAsDecimal(
          interaction.vaultUnderlyingBreakdownBalances[i] || '0',
          breakdownToken.decimals
        ).div(underlyingTotalSupply)
      );
      const underlyingBreakdownToUsd = interaction.underlyingBreakdownToNativePrices.map(
        underlyingBreakdownToNativePrice =>
          interpretAsDecimal(underlyingBreakdownToNativePrice || '0', 18).mul(nativeToUsd)
      );

      const vault: BalanceDelta = {
        balance: interpretAsDecimal(interaction.vaultBalance, shareToken.decimals),
        delta: interpretAsDecimal(interaction.vaultBalanceDelta, shareToken.decimals),
      };
      const rewardPools: BalanceDelta[] = rewardPoolTokens.map((rewardPoolToken, i) => ({
        balance: interpretAsDecimal(
          interaction.rewardPoolBalances[i] || '0',
          rewardPoolToken.decimals
        ),
        delta: interpretAsDecimal(
          interaction.rewardPoolBalancesDelta[i] || '0',
          rewardPoolToken.decimals
        ),
      }));
      const rewardPoolTotal: BalanceDelta = rewardPools.reduce(sumBalanceDelta, {
        balance: new Decimal(0),
        delta: new Decimal(0),
      });
      const total: BalanceDelta = {
        balance: interpretAsDecimal(interaction.totalBalance, shareToken.decimals),
        delta: vault.delta.add(rewardPoolTotal.delta),
      };
      const usd: BalanceDelta = {
        balance: total.balance.mul(underlyingToUsd),
        delta: total.delta.mul(underlyingToUsd),
      };
      const txHash: string = interaction.createdWith.hash;

      const existingTx = acc[txHash];
      if (existingTx) {
        const mergedVault = mergeBalanceDelta(existingTx.vault, vault);
        const mergedRewardPools = rewardPools.map((rp, i) =>
          existingTx.rewardPools[i] ? mergeBalanceDelta(existingTx.rewardPools[i], rp) : rp
        );
        const mergedRewardPoolTotal = mergeBalanceDelta(
          existingTx.rewardPoolTotal,
          rewardPoolTotal
        );
        const mergedTotal = mergeBalanceDelta(existingTx.total, total);
        const mergedUsd = mergeBalanceDelta(existingTx.usd, usd);

        acc[txHash] = {
          ...existingTx,
          vault: mergedVault,
          rewardPools: mergedRewardPools,
          rewardPoolTotal: mergedRewardPoolTotal,
          total: mergedTotal,
          usd: mergedUsd,
          actions: [...existingTx.actions, interaction.type],
        };
      } else {
        acc[txHash] = {
          type: 'classic',
          datetime: fromUnixTime(interaction.timestamp),
          chain,
          transactionHash: txHash,
          shareToken,
          underlyingToken,
          underlyingBreakdownTokens,
          rewardPoolTokens,
          shareToUnderlying,
          underlyingToUsd,
          underlyingToBreakdown,
          underlyingBreakdownToUsd,
          vault,
          rewardPools,
          rewardPoolTotal,
          total,
          usd,
          actions: [interaction.type],
        };
      }

      return acc;
    },
    {} as Record<string, TimelineClassicInteraction>
  );

  return Object.values(mergedByTxId);
};

const classicPositionToInteractions = (
  chainId: ChainId,
  position: InvestorTimelineClassicPositionFragment,
  interactions: InvestorTimelineClassicPositionInteractionFragment[]
): TimelineClassicInteraction[] => {
  const { id, classic } = position;
  const shareToken = toToken(classic.vaultSharesToken);
  const underlyingToken = toToken(classic.underlyingToken);
  if (!shareToken || !underlyingToken) {
    logger.error(`Missing token for position ${id}`);
    return [];
  }

  const underlyingBreakdownTokens = sortEntitiesByOrderList(
    classic.underlyingBreakdownTokens,
    'address',
    classic.underlyingBreakdownTokensOrder
  )
    .map(toToken)
    .filter(isDefined);
  if (underlyingBreakdownTokens.length < classic.underlyingBreakdownTokensOrder.length) {
    logger.error(`Missing underlying breakdown tokens for position ${id}`);
    return [];
  }

  const rewardPoolTokens = sortEntitiesByOrderList(
    classic.rewardPoolTokens,
    'address',
    classic.rewardPoolTokensOrder
  )
    .map(toToken)
    .filter(isDefined);
  if (rewardPoolTokens.length < classic.rewardPoolTokensOrder.length) {
    logger.error(`Missing reward pool tokens for position ${id}`);
    return [];
  }

  return mergeClassicPositionInteractions(
    chainId,
    shareToken,
    underlyingToken,
    underlyingBreakdownTokens,
    rewardPoolTokens,
    interactions
  );
};

type PositionWithInteraction<T extends 'clm' | 'classic'> = Array<{
  position: InvestorTimelineQuery[`${T}Positions`][number] & { chain: ChainId };
  interactions: Array<
    InvestorTimelineQuery[`${T}PositionInteractions`][number] & { chain: ChainId }
  >;
}>;

function getPositionsWithInteractions(
  res: PaginatedAllSdkResult<'InvestorTimeline'>,
  type: 'clm'
): PositionWithInteraction<'clm'>;
function getPositionsWithInteractions(
  res: PaginatedAllSdkResult<'InvestorTimeline'>,
  type: 'classic'
): PositionWithInteraction<'classic'>;
function getPositionsWithInteractions(
  res: PaginatedAllSdkResult<'InvestorTimeline'>,
  type: 'clm' | 'classic'
): PositionWithInteraction<typeof type> {
  const positionsKey = `${type}Positions` as const;
  const interactionsKey = `${type}PositionInteractions` as const;

  const positionsByChainAndId = keyBy(
    res.results.flatMap(pageRes =>
      pageRes.flatMap(chainRes =>
        chainRes.data[positionsKey].map(position => ({ ...position, chain: chainRes.chain }))
      )
    ),
    position => `${position.chain}-${position.id}`
  );

  const interactionsByChainAndPositionId = groupBy(
    res.results.flatMap(pageRes =>
      pageRes.flatMap(chainRes =>
        chainRes.data[interactionsKey].map(interaction => ({
          ...interaction,
          chain: chainRes.chain,
        }))
      )
    ),
    interaction => `${interaction.chain}-${interaction.investorPosition.id}`
  );

  return Object.entries(positionsByChainAndId).map(([chainAndPositionId, position]) => {
    const interactions = interactionsByChainAndPositionId[chainAndPositionId] || [];
    return { position, interactions };
  });
}

export async function getInvestorTimeline(
  investor_address: Address
): Promise<TimelineAnyInteraction[]> {
  const res = await executeOnAllSdks(sdk =>
    paginate({
      fetchPage: ({ skip, first }) => sdk.InvestorTimeline({ investor_address, first, skip }),
      count: res => [
        res.data.clmPositions.length,
        res.data.clmPositionInteractions.length,
        res.data.classicPositions.length,
        res.data.classicPositionInteractions.length,
      ],
    })
  );

  const clmPositions = getPositionsWithInteractions(res, 'clm');
  const classicPositions = getPositionsWithInteractions(res, 'classic');

  const clmInteractions = clmPositions.flatMap(({ position, interactions }) =>
    clmPositionToInteractions(position.chain, position, interactions)
  );
  const classicInteractions = classicPositions.flatMap(({ position, interactions }) =>
    classicPositionToInteractions(position.chain, position, interactions)
  );

  return [...clmInteractions, ...classicInteractions].sort(
    (a, b) => a.datetime.getTime() - b.datetime.getTime()
  );
}
