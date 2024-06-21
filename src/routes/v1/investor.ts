import { type Static, Type } from '@sinclair/typebox';
import type { FastifyInstance, FastifyPluginOptions, FastifySchema } from 'fastify';
import { addressSchemaTypebox } from '../../schema/address';
import { getAsyncCache } from '../../utils/async-lock';
import type { Address, Hex } from '../../utils/scalar-types';
import { getClmTimeline } from '../../utils/timeline';
import type { TimelineClmInteraction } from '../../utils/timeline-types';

export default async function (
  instance: FastifyInstance,
  _opts: FastifyPluginOptions,
  done: (err?: Error) => void
) {
  const asyncCache = getAsyncCache();

  // timeline endpoint
  {
    const urlParamsSchema = Type.Object({
      investor_address: addressSchemaTypebox,
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

const clmInteractionLegacySchema = Type.Object({
  datetime: Type.String(),
  product_key: Type.String(),
  display_name: Type.String(),
  chain: Type.String(),
  is_eol: Type.Boolean(),
  is_dashboard_eol: Type.Boolean(),
  transaction_hash: Type.String(),

  /** called shares for legacy reasons, this is now the total between manager and reward pool */
  share_balance: Type.String(),
  share_diff: Type.String(),

  token0_to_usd: Type.String(),
  underlying0_balance: Type.String(),
  underlying0_diff: Type.String(),

  token1_to_usd: Type.String(),
  underlying1_balance: Type.String(),
  underlying1_diff: Type.String(),

  usd_balance: Type.String(),
  usd_diff: Type.String(),
});

const clmInteractionRewardPoolSchema = Type.Object({
  reward_pool_address: Type.String(),
  reward_pool_balance: Type.String(),
  reward_pool_diff: Type.String(),
});
type ClmInteractionRewardPool = Static<typeof clmInteractionRewardPoolSchema>;

const clmInteractionManagerSchema = Type.Object({
  manager_address: Type.String(),
  manager_balance: Type.String(),
  manager_diff: Type.String(),
  actions: Type.Array(Type.String()),
});

const clmInteractionBaseSchema = Type.Intersect([
  clmInteractionLegacySchema,
  clmInteractionManagerSchema,
]);
const timelineClmInteractionOutputSchema = Type.Union([
  clmInteractionBaseSchema,
  Type.Intersect([clmInteractionBaseSchema, clmInteractionRewardPoolSchema]),
]);
type TimelineClmInteractionOutput = Static<typeof timelineClmInteractionOutputSchema>;

function clmInteractionToOutput(interaction: TimelineClmInteraction): TimelineClmInteractionOutput {
  const { rewardPoolToken, rewardPool } = interaction;
  const hasRewardPool = !!rewardPoolToken && !!rewardPool;
  // ensure we don't include partial reward pool data
  const rewardPoolFields: ClmInteractionRewardPool | undefined = hasRewardPool
    ? {
        reward_pool_address: rewardPoolToken.address,
        reward_pool_balance: rewardPool.balance.toString(),
        reward_pool_diff: rewardPool.delta.toString(),
      }
    : undefined;

  return {
    datetime: interaction.datetime.toISOString(),
    product_key: `beefy:vault:${interaction.chain}:${interaction.managerToken.address}`,
    display_name: interaction.managerToken.name || interaction.managerToken.address,
    chain: interaction.chain,
    is_eol: false,
    is_dashboard_eol: false,
    transaction_hash: interaction.transactionHash,

    token0_to_usd: interaction.token0ToUsd.toString(),
    token1_to_usd: interaction.token1ToUsd.toString(),

    // legacy: share -> total
    share_balance: interaction.total.balance.toString(),
    share_diff: interaction.total.delta.toString(),

    manager_address: interaction.managerToken.address,
    manager_balance: interaction.manager.balance.toString(),
    manager_diff: interaction.manager.delta.toString(),

    ...rewardPoolFields,

    underlying0_balance: interaction.underlying0.balance.toString(),
    underlying0_diff: interaction.underlying0.delta.toString(),

    underlying1_balance: interaction.underlying1.balance.toString(),
    underlying1_diff: interaction.underlying1.delta.toString(),

    usd_balance: interaction.usd.balance.toString(),
    usd_diff: interaction.usd.delta.toString(),

    actions: interaction.actions,
  };
}

async function getTimeline(investor_address: Address) {
  return getClmTimeline(investor_address, clmInteractionToOutput);
}
