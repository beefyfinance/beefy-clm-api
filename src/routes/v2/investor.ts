import { FastifyInstance, FastifyPluginOptions, FastifySchema } from 'fastify';
import S from 'fluent-json-schema';
import { allChainIds } from '../../config/chains';
import { addressSchema } from '../../schema/address';
import { GraphQueryError } from '../../utils/error';
import { sdk } from '../../utils/sdk';
import { interpretAsDecimal } from '../../utils/decimal';
import { sortBy } from 'lodash';

export default async function (
  instance: FastifyInstance,
  _opts: FastifyPluginOptions,
  done: (err?: Error) => void
) {
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
      tags: ['v2'],
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
        const result = await getTimeline(investor_address);
        reply.send(result);
      }
    );
  }

  done();
}

const getTimeline = async (investor_address: string) => {
  const res = await Promise.all(
    allChainIds
      // TODO: remove
      .filter(chain => chain === 'optimism')
      .map(chain =>
        sdk
          .InvestorTimelineV2(
            {
              investor_address,
            },
            { chainName: chain }
          )
          .catch((e: unknown) => {
            // we have nothing to leak here
            throw new GraphQueryError(e);
          })
          .then(res => ({ chain, ...res }))
      )
  );

  return res.flatMap(chainRes => {
    const clmTimeline = chainRes.clmPositions.flatMap(position =>
      position.interactions.map(interaction => {
        const managerToken = position.clm.managerToken;
        const token0 = position.clm.underlyingToken0;
        const token1 = position.clm.underlyingToken1;
        const rewardPoolToken = position.clm.rewardPoolToken;

        const interactionToken0ToNative = interpretAsDecimal(interaction.token0ToNativePrice, 18);
        const interactionToken1ToNative = interpretAsDecimal(interaction.token1ToNativePrice, 18);
        const interactionNativeToUsd = interpretAsDecimal(interaction.nativeToUSDPrice, 18);
        const managerBalance = interpretAsDecimal(
          interaction.managerBalance,
          managerToken.decimals
        );
        const rewardPoolBalance = interpretAsDecimal(
          interaction.rewardPoolBalance,
          rewardPoolToken.decimals
        );
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
        const rewardPoolDiff = interpretAsDecimal(
          interaction.rewardPoolBalanceDelta,
          rewardPoolToken.decimals
        );
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
          product_key: `beefy:clm:${chainRes.chain}:${position.clm.address}`,
          display_name: position.clm.managerToken.name,
          chain: chainRes.chain,
          is_eol: false,
          is_dashboard_eol: false,
          transaction_hash: interaction.createdWith.hash,
          token0_to_usd: token0_to_usd.toString(),
          token1_to_usd: token1_to_usd.toString(),
          manager_balance: managerBalance.toString(),
          reward_pool_balance: rewardPoolBalance.toString(),
          underlying0_balance: underlyingBalance0.toString(),
          underlying1_balance: underlyingBalance1.toString(),
          usd_balance: usd_balance.toString(),
          manager_diff: manager_diff.toString(),
          reward_pool_diff: rewardPoolDiff.toString(),
          underlying0_diff: underlying0_diff.toString(),
          underlying1_diff: underlying1_diff.toString(),
          usd_diff: usd_diff.toString(),
        };
      })
    );

    const classicTimeline = chainRes.classicPositions.flatMap(position =>
      position.interactions.map(interaction => {
        const vaultSharesToken = position.classic.vaultSharesToken;
        //const underlyingToken = position.classic.underlyingToken;

        const vaultBalance = interpretAsDecimal(
          interaction.vaultBalance,
          vaultSharesToken.decimals
        );
        //const boostBalance = interaction.boostBalance;
        const vaultBalanceDelta = interpretAsDecimal(
          interaction.vaultBalanceDelta,
          vaultSharesToken.decimals
        );

        return {
          datetime: new Date(parseInt(interaction.timestamp, 10) * 1000).toISOString(),
          product_key: `beefy:vault:${chainRes.chain}:${position.classic.address}`,
          display_name: vaultSharesToken.name,
          chain: chainRes.chain,
          is_eol: false,
          is_dashboard_eol: false,
          transaction_hash: interaction.createdWith.hash,
          //token0_to_usd: token0_to_usd.toString(),
          //token1_to_usd: token1_to_usd.toString(),
          vault_balance: vaultBalance.toString(),
          //reward_pool_balance: rewardPoolBalance.toString(),
          //underlying0_balance: underlyingBalance0.toString(),
          //underlying1_balance: underlyingBalance1.toString(),
          //usd_balance: usd_balance.toString(),
          vault_balance_diff: vaultBalanceDelta.toString(),
          //reward_pool_diff: rewardPoolDiff.toString(),
          //underlying0_diff: underlying0_diff.toString(),
          //underlying1_diff: underlying1_diff.toString(),
          //usd_diff: usd_diff.toString(),
        };
      })
    );

    // sort by datetime in ascending order
    return sortBy(clmTimeline.concat(classicTimeline as any), interaction =>
      new Date(interaction.datetime).getTime()
    );
  });
};
