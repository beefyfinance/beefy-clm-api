import type { Static } from '@sinclair/typebox';
import Decimal from 'decimal.js';
import { groupBy, keyBy } from 'lodash';
import type { ChainId } from '../config/chains';
import {
  ClmPositionInteractionType,
  type InvestorTimelineClmPositionFragment,
  type InvestorTimelineClmPositionInteractionFragment,
  type TokenFragment,
} from '../queries/codegen/sdk';
import { ZERO_ADDRESS } from './address';
import { fromUnixTime } from './date';
import { interpretAsDecimal } from './decimal';
import { sortEntitiesByOrderList } from './entity-order';
import { getLoggerFor } from './log';
import type { Address } from './scalar-types';
import { executeOnAllSdks, paginate } from './sdk';
import { StringEnum } from './typebox';

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

export const actionsEnumSchema = StringEnum(Object.values(ClmPositionInteractionType));
type ActionsEnum = Static<typeof actionsEnumSchema>;

type TimelineClmInteraction = {
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
  actions: ActionsEnum[];
};

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

function toToken(from: TokenFragment | undefined): Token | undefined {
  return from?.address && from.address !== ZERO_ADDRESS
    ? {
        address: from.address,
        decimals: Number(from.decimals),
        name: from.name || undefined,
      }
    : undefined;
}

const clmPositionToInteractions = (
  chainId: ChainId,
  position: InvestorTimelineClmPositionFragment,
  interactions: InvestorTimelineClmPositionInteractionFragment[]
): TimelineClmInteraction[] => {
  const managerToken = toToken(position.managerToken);
  const orderedRewardPoolTokenAddresses = sortEntitiesByOrderList(
    position.rewardPoolTokens,
    'address',
    position.rewardPoolTokensOrder
  );
  const rewardPoolTokens = orderedRewardPoolTokenAddresses.map(toToken).filter(Boolean) as Token[];
  const token0 = toToken(position.underlyingToken0);
  const token1 = toToken(position.underlyingToken1);
  if (!managerToken || !token0 || !token1) {
    logger.error(`Missing token for position ${position.address}`);
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

export async function getClmTimeline(investor_address: Address): Promise<TimelineClmInteraction[]> {
  const res = await executeOnAllSdks(sdk =>
    paginate({
      fetchPage: ({ skip, first }) => sdk.InvestorTimeline({ investor_address, first, skip }),
      count: res => [res.data.clmPositions.length, res.data.clmPositionInteractions.length],
    })
  );

  const positionsByChainAndId = keyBy(
    res.results.flatMap(pageRes =>
      pageRes.flatMap(chainRes =>
        chainRes.data.clmPositions.map(position => ({ ...position, chain: chainRes.chain }))
      )
    ),
    position => `${position.chain}-${position.id}`
  );

  const interactionsByChainAndPositionId = groupBy(
    res.results.flatMap(pageRes =>
      pageRes.flatMap(chainRes =>
        chainRes.data.clmPositionInteractions.map(interaction => ({
          ...interaction,
          chain: chainRes.chain,
        }))
      )
    ),
    interaction => `${interaction.chain}-${interaction.investorPosition.id}`
  );

  return Object.entries(positionsByChainAndId).flatMap(([chainAndPositionId, position]) => {
    const interactions = interactionsByChainAndPositionId[chainAndPositionId] || [];
    return clmPositionToInteractions(position.chain, position.clm, interactions);
  });
}
