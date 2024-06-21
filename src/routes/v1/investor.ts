import type { FastifyInstance, FastifyPluginOptions, FastifySchema } from 'fastify';
import S from 'fluent-json-schema';
import { addressSchema } from '../../schema/address';
import { getAsyncCache } from '../../utils/async-lock';

import type { Address } from '../../utils/scalar-types';
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
    type UrlParams = {
      investor_address: Address;
    };

    const urlParamsSchema = S.object().prop(
      'investor_address',
      addressSchema.required().description('The investor address')
    );

    const responseSchema = S.array().items(S.object());

    const schema: FastifySchema = {
      tags: ['investor'],
      params: urlParamsSchema,
      response: {
        200: responseSchema,
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
            return await getTimeline(investor_address);
          }
        );
        reply.send(res);
      }
    );
  }

  done();
}

type ClmInteractionLegacy = {
  datetime: string;
  product_key: string;
  display_name: string;
  chain: string;
  is_eol: false;
  is_dashboard_eol: false;
  transaction_hash: string;

  /** called shares for legacy reasons, this is now the total between manager and reward pool */
  share_balance: string;
  share_diff: string;

  token0_to_usd: string;
  underlying0_balance: string;
  underlying0_diff: string;

  token1_to_usd: string;
  underlying1_balance: string;
  underlying1_diff: string;

  usd_balance: string;
  usd_diff: string;
};

type ClmInteractionRewardPool = {
  reward_pool_address: string;
  reward_pool_balance: string;
  reward_pool_diff: string;
};

type ClmInteractionBase = ClmInteractionLegacy & {
  manager_address: string;
  manager_balance: string;
  manager_diff: string;
  actions: string[];
};

type TimelineClmInteractionOutput =
  | ClmInteractionBase
  | (ClmInteractionBase & ClmInteractionRewardPool);

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
