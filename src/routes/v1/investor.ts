import { type Static, Type } from '@sinclair/typebox';
import type { FastifyInstance, FastifyPluginOptions, FastifySchema } from 'fastify';
import { chainIdSchema } from '../../config/chains';
import { addressSchema, transactionHashSchema } from '../../schema/address';
import { bigDecimalSchema } from '../../schema/bigint';
import { getAsyncCache } from '../../utils/async-lock';
import type { Address, Hex } from '../../utils/scalar-types';
import {
  classicActionsEnumSchema,
  clmActionsEnumSchema,
  getInvestorTimeline,
  TimelineClassicInteraction,
  TimelineClmInteraction,
} from '../../utils/timeline';

export default async function (
  instance: FastifyInstance,
  _opts: FastifyPluginOptions,
  done: (err?: Error) => void
) {
  const asyncCache = getAsyncCache();

  // timeline endpoint
  {
    const urlParamsSchema = Type.Object({
      investor_address: addressSchema,
    });
    type UrlParams = Static<typeof urlParamsSchema>;

    const schema: FastifySchema = {
      tags: ['investor'],
      params: urlParamsSchema,
      response: {
        200: Type.Array(timelineClmInteractionOutputSchema),
      },
    };

    instance.get<{ Params: UrlParams }>(
      '/:investor_address/timeline',
      { schema },
      async (request, reply) => {
        const { investor_address } = request.params;
        const res = await asyncCache.wrap(
          `timeline:${investor_address.toLowerCase()}`,
          2 * 60 * 1000,
          async () => {
            return await getTimeline(investor_address as Hex);
          }
        );
        reply.send(res);
      }
    );
  }

  done();
}

const timelineClmInteractionOutputSchema = Type.Object({
  type: Type.Literal('clm'),
  datetime: Type.String(),
  product_key: Type.String(),
  display_name: Type.String(),
  chain: chainIdSchema,
  is_eol: Type.Boolean(),
  is_dashboard_eol: Type.Boolean(),
  transaction_hash: transactionHashSchema,
  actions: Type.Array(clmActionsEnumSchema),

  /** called shares for legacy reasons, this is now the total between manager and reward pool */
  share_balance: bigDecimalSchema,
  share_diff: bigDecimalSchema,

  token0_to_usd: bigDecimalSchema,
  underlying0_balance: bigDecimalSchema,
  underlying0_diff: bigDecimalSchema,

  token1_to_usd: bigDecimalSchema,
  underlying1_balance: bigDecimalSchema,
  underlying1_diff: bigDecimalSchema,

  usd_balance: bigDecimalSchema,
  usd_diff: bigDecimalSchema,

  // manager fields
  manager_address: addressSchema,
  manager_balance: bigDecimalSchema,
  manager_diff: bigDecimalSchema,

  // reward pool fields
  reward_pool_total: Type.Object({
    reward_pool_balance: bigDecimalSchema,
    reward_pool_diff: bigDecimalSchema,
  }),
  reward_pool_details: Type.Array(
    Type.Object({
      reward_pool_address: addressSchema,
      reward_pool_balance: bigDecimalSchema,
      reward_pool_diff: bigDecimalSchema,
    })
  ),
});
const timelineClassicInteractionOutputSchema = Type.Object({
  type: Type.Literal('classic'),
  datetime: Type.String(),
  product_key: Type.String(),
  display_name: Type.String(),
  chain: chainIdSchema,
  is_eol: Type.Boolean(),
  is_dashboard_eol: Type.Boolean(),
  transaction_hash: transactionHashSchema,
  actions: Type.Array(classicActionsEnumSchema),

  /** called shares for legacy reasons, this is now the total between vault/reward pools */
  share_balance: bigDecimalSchema,
  share_diff: bigDecimalSchema,
  share_to_underlying: bigDecimalSchema,

  underlying_address: addressSchema,
  underlying_to_usd: bigDecimalSchema,

  underlying_breakdown: Type.Array(
    Type.Object({
      token: addressSchema,
      underlying_to_token: bigDecimalSchema,
      token_to_usd: bigDecimalSchema,
    })
  ),

  usd_balance: bigDecimalSchema,
  usd_diff: bigDecimalSchema,

  // vault fields
  vault_address: addressSchema,
  vault_balance: bigDecimalSchema,
  vault_diff: bigDecimalSchema,

  // reward pool fields
  reward_pool_total: Type.Object({
    reward_pool_balance: bigDecimalSchema,
    reward_pool_diff: bigDecimalSchema,
  }),
  reward_pool_details: Type.Array(
    Type.Object({
      reward_pool_address: addressSchema,
      reward_pool_balance: bigDecimalSchema,
      reward_pool_diff: bigDecimalSchema,
    })
  ),
});

type TimelineClmInteractionOutput = Static<typeof timelineClmInteractionOutputSchema>;
type TimelineClassicInteractionOutput = Static<typeof timelineClassicInteractionOutputSchema>;
type TimelineAnyInteractionOutput = TimelineClmInteractionOutput | TimelineClassicInteractionOutput;

function clmInteractionToOutput(interaction: TimelineClmInteraction): TimelineClmInteractionOutput {
  const { rewardPoolTokens, rewardPoolTotal, rewardPools } = interaction;

  return {
    type: 'clm',
    datetime: interaction.datetime.toISOString(),
    product_key: `beefy:vault:${interaction.chain}:${interaction.managerToken.address}`,
    display_name: interaction.managerToken.name || interaction.managerToken.address,
    chain: interaction.chain,
    is_eol: false,
    is_dashboard_eol: false,
    transaction_hash: interaction.transactionHash,
    actions: interaction.actions,

    // legacy: share -> total
    share_balance: interaction.total.balance.toString(),
    share_diff: interaction.total.delta.toString(),

    token0_to_usd: interaction.token0ToUsd.toString(),
    underlying0_balance: interaction.underlying0.balance.toString(),
    underlying0_diff: interaction.underlying0.delta.toString(),

    token1_to_usd: interaction.token1ToUsd.toString(),
    underlying1_balance: interaction.underlying1.balance.toString(),
    underlying1_diff: interaction.underlying1.delta.toString(),

    usd_balance: interaction.usd.balance.toString(),
    usd_diff: interaction.usd.delta.toString(),

    manager_address: interaction.managerToken.address,
    manager_balance: interaction.manager.balance.toString(),
    manager_diff: interaction.manager.delta.toString(),

    reward_pool_total: {
      reward_pool_balance: rewardPoolTotal.balance.toString(),
      reward_pool_diff: rewardPoolTotal.delta.toString(),
    },
    reward_pool_details: rewardPools.map((rewardPool, i) => ({
      reward_pool_address: rewardPoolTokens[i].address,
      reward_pool_balance: rewardPool.balance.toString(),
      reward_pool_diff: rewardPool.delta.toString(),
    })),
  };
}

function classicInteractionToOutput(
  interaction: TimelineClassicInteraction
): TimelineClassicInteractionOutput {
  const { rewardPoolTokens, rewardPoolTotal, rewardPools } = interaction;

  return {
    type: 'classic',
    datetime: interaction.datetime.toISOString(),
    product_key: `beefy:vault:${interaction.chain}:${interaction.shareToken.address}`,
    display_name: interaction.shareToken.name || interaction.shareToken.address,
    chain: interaction.chain,
    is_eol: false,
    is_dashboard_eol: false,
    transaction_hash: interaction.transactionHash,
    actions: interaction.actions,

    // legacy: share -> total
    share_balance: interaction.total.balance.toString(),
    share_diff: interaction.total.delta.toString(),
    share_to_underlying: interaction.shareToUnderlying.toString(),

    underlying_address: interaction.underlyingToken.address,
    underlying_to_usd: interaction.underlyingToUsd.toString(),

    underlying_breakdown: interaction.underlyingBreakdownTokens.map((token, i) => ({
      token: token.address,
      underlying_to_token: interaction.underlyingToBreakdown[i].toString(),
      token_to_usd: interaction.underlyingBreakdownToUsd[i].toString(),
    })),

    usd_balance: interaction.usd.balance.toString(),
    usd_diff: interaction.usd.delta.toString(),

    vault_address: interaction.shareToken.address,
    vault_balance: interaction.vault.balance.toString(),
    vault_diff: interaction.vault.delta.toString(),

    reward_pool_total: {
      reward_pool_balance: rewardPoolTotal.balance.toString(),
      reward_pool_diff: rewardPoolTotal.delta.toString(),
    },
    reward_pool_details: rewardPools.map((rewardPool, i) => ({
      reward_pool_address: rewardPoolTokens[i].address,
      reward_pool_balance: rewardPool.balance.toString(),
      reward_pool_diff: rewardPool.delta.toString(),
    })),
  };
}

async function getTimeline(investor_address: Address): Promise<TimelineAnyInteractionOutput[]> {
  const timeline = await getInvestorTimeline(investor_address);

  return timeline.map((interaction): TimelineAnyInteractionOutput => {
    if (interaction.type === 'clm') {
      return clmInteractionToOutput(interaction);
    } else if (interaction.type === 'classic') {
      return classicInteractionToOutput(interaction);
    }
    throw new Error(`Unknown interaction type`);
  });
}
