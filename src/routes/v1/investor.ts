import { FastifyInstance, FastifyPluginOptions, FastifySchema } from 'fastify';
import S from 'fluent-json-schema';
import { addressSchema } from '../../schema/address';
import { getAllSdks } from '../../utils/sdk';
import { interpretAsDecimal } from '../../utils/decimal';
import { getAsyncCache } from '../../utils/async-lock';

export default async function (
  instance: FastifyInstance,
  _opts: FastifyPluginOptions,
  done: (err?: Error) => void
) {
  const asyncCache = getAsyncCache();

  // balances endpoint
  {
    type UrlParams = {
      investor_address: string;
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
          `timeline:${investor_address}`,
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

const getTimeline = async (investor_address: string) => {
  const res = await Promise.all(
    getAllSdks().map(async sdk =>
      sdk.InvestorTimeline({
        investor_address,
      })
    )
  );
  return res.flatMap(chainRes => {
    return chainRes.data.clmPositions.flatMap(position =>
      position.interactions.map(interaction => {
        const managerToken = position.clm.managerToken;
        const token0 = position.clm.underlyingToken0;
        const token1 = position.clm.underlyingToken1;
        const interactionToken0ToNative = interpretAsDecimal(interaction.token0ToNativePrice, 18);
        const interactionToken1ToNative = interpretAsDecimal(interaction.token1ToNativePrice, 18);
        const interactionNativeToUsd = interpretAsDecimal(interaction.nativeToUSDPrice, 18);
        const manager_balance = interpretAsDecimal(
          interaction.managerBalance,
          managerToken.decimals
        );
        const reward_pool_balance = interpretAsDecimal(
          interaction.rewardPoolBalance,
          managerToken.decimals
        );
        const share_balance = manager_balance.add(reward_pool_balance);
        const underlyingBalance0 = interpretAsDecimal(
          interaction.underlyingBalance0,
          token0.decimals
        );
        const underlyingBalance1 = interpretAsDecimal(
          interaction.underlyingBalance1,
          token1.decimals
        );
        const token0_to_usd = interactionToken0ToNative.mul(interactionNativeToUsd);
        const token1_to_usd = interactionToken1ToNative.mul(interactionNativeToUsd);
        const usd_balance = underlyingBalance0
          .mul(token0_to_usd)
          .add(underlyingBalance1.mul(token1_to_usd));

        const manager_diff = interpretAsDecimal(
          interaction.managerBalanceDelta,
          managerToken.decimals
        );
        const reward_pool_diff = interpretAsDecimal(
          interaction.rewardPoolBalanceDelta,
          managerToken.decimals
        );
        const share_diff = manager_diff.add(reward_pool_diff);

        const underlying0_diff = interpretAsDecimal(
          interaction.underlyingBalance0Delta,
          token0.decimals
        );
        const underlying1_diff = interpretAsDecimal(
          interaction.underlyingBalance1Delta,
          token1.decimals
        );
        const usd_diff = underlying0_diff
          .mul(token0_to_usd)
          .add(underlying1_diff.mul(token1_to_usd));
        return {
          datetime: new Date(parseInt(interaction.timestamp, 10) * 1000).toISOString(),
          product_key: `beefy:vault:${chainRes.chain}:${position.clm.address}`,
          display_name: position.clm.managerToken.name,
          interaction_type: interaction.type,
          chain: chainRes.chain,
          is_eol: false,
          is_dashboard_eol: false,
          transaction_hash: interaction.createdWith.hash,
          token0_to_usd: token0_to_usd.toString(),
          token1_to_usd: token1_to_usd.toString(),
          share_balance: share_balance.toString(),
          manager_balance: manager_balance.toString(),
          reward_pool_balance: reward_pool_balance.toString(),
          underlying0_balance: underlyingBalance0.toString(),
          underlying1_balance: underlyingBalance1.toString(),
          usd_balance: usd_balance.toString(),
          share_diff: share_diff.toString(),
          manager_diff: manager_diff.toString(),
          reward_pool_diff: reward_pool_diff.toString(),
          underlying0_diff: underlying0_diff.toString(),
          underlying1_diff: underlying1_diff.toString(),
          usd_diff: usd_diff.toString(),
        };
      })
    );
  });
};
