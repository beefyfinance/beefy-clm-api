import { type Static, Type } from '@sinclair/typebox';
import type { FastifyInstance, FastifyPluginOptions, FastifySchema } from 'fastify';
import { chainIdSchema } from '../../config/chains';
import { addressSchema, transactionHashSchema } from '../../schema/address';
import { bigDecimalSchema } from '../../schema/bigint';
import { getAsyncCache } from '../../utils/async-lock';
import type { Address, Hex } from '../../utils/scalar-types';
import { actionsEnumSchema, getClmTimeline } from '../../utils/timeline';

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
  datetime: Type.String(),
  product_key: Type.String(),
  display_name: Type.String(),
  chain: chainIdSchema,
  is_eol: Type.Boolean(),
  is_dashboard_eol: Type.Boolean(),
  transaction_hash: transactionHashSchema,

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
  actions: Type.Array(actionsEnumSchema),

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
  reward_pool_claim_details: Type.Array(
    Type.Object({
      claimed_amount: bigDecimalSchema,
      reward_to_usd: bigDecimalSchema,
      reward_address: addressSchema,
    })
  ),
  claimed_reward_pool: Type.Any([addressSchema, Type.Undefined()]),
});
type TimelineClmInteractionOutput = Static<typeof timelineClmInteractionOutputSchema>;

async function getTimeline(investor_address: Address): Promise<TimelineClmInteractionOutput[]> {
  const timeline = await getClmTimeline(investor_address);

  return timeline.map((interaction): TimelineClmInteractionOutput => {
    const { rewardPoolTokens, rewardPoolTotal, rewardPools } = interaction;

    return {
      datetime: interaction.datetime.toISOString(),
      product_key: `beefy:vault:${interaction.chain}:${interaction.managerToken.address}`,
      display_name: interaction.managerToken.name || interaction.managerToken.address,
      chain: interaction.chain,
      is_eol: false,
      is_dashboard_eol: false,
      transaction_hash: interaction.transactionHash,

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
      actions: interaction.actions,

      reward_pool_total: {
        reward_pool_balance: rewardPoolTotal.balance.toString(),
        reward_pool_diff: rewardPoolTotal.delta.toString(),
      },
      reward_pool_details: rewardPools.map((rewardPool, i) => ({
        reward_pool_address: rewardPoolTokens[i].address,
        reward_pool_balance: rewardPool.balance.toString(),
        reward_pool_diff: rewardPool.delta.toString(),
      })),
      reward_pool_claim_details: interaction.rewardBalancesDelta.map((rewardBalanceDelta, i) => ({
        claimed_amount: rewardBalanceDelta.toString(),
        reward_to_usd: interaction.rewardsToUsd[i].toString(),
        reward_address: interaction.clm.rewardTokens[i],
      })),
      claimed_reward_pool: interaction.claimedRewardPool?.toString(),
    };
  });
}
