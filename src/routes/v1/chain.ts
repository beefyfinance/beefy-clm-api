import { FastifyInstance, FastifyPluginOptions, FastifySchema } from 'fastify';
import S from 'fluent-json-schema';
import { allChainIds } from '../../config/chains';
import { GraphQueryError } from '../../utils/error';
import { sdk } from '../../utils/sdk';
import { chainSchema } from '../../schema/chain';
import { calculateLastApr, prepareAprState } from '../../utils/apr';
import { interpretAsDecimal } from '../../utils/decimal';

export default async function (
  instance: FastifyInstance,
  _opts: FastifyPluginOptions,
  done: (err?: Error) => void
) {
  // APY endpoint
  {
    type QueryParams = {
      chain?: string;
    };

    const queryParamsSchema = S.object().prop(
      'chain',
      chainSchema.description('The chain to filter on. If not provided, all chains are returned')
    );

    const responseSchema = S.array().items(S.object());

    const schema: FastifySchema = {
      tags: ['v1'],
      querystring: queryParamsSchema,
      response: {
        200: responseSchema,
      },
    };

    instance.get<{ Querystring: QueryParams }>('/apy', { schema }, async (request, reply) => {
      const { chain: maybeChain } = request.query;
      const result = await getApy(maybeChain || null);
      reply.send(result);
    });
  }

  done();
}

const getApy = async (chain: string | null) => {
  const res = await Promise.all(
    allChainIds
      .filter(chainId => chain === null || chain === chainId)
      .map(chain =>
        sdk
          // we only need the first 50 entries as we only need the daily APR
          .VaultApy({ first: 50, skip: 0 }, { chainName: chain })
          .catch((e: unknown) => {
            // we have nothing to leak here
            throw new GraphQueryError(e);
          })
          .then(res => ({ chain, ...res }))
      )
  );

  const ONE_DAY = 24 * 60 * 60 * 1000;

  return res.flatMap(chainVaults =>
    chainVaults.beefyCLVaults.map(vaultData => {
      const token0 = vaultData.underlyingToken0;
      const token1 = vaultData.underlyingToken1;

      const aprState = prepareAprState(
        vaultData.collectedFees.map(fee => ({
          collectedAmount: interpretAsDecimal(fee.collectedAmount0, token0.decimals)
            .times(interpretAsDecimal(fee.token0ToNativePrice, 18))
            .plus(
              interpretAsDecimal(fee.collectedAmount1, token1.decimals).times(
                interpretAsDecimal(fee.token1ToNativePrice, 18)
              )
            ),
          collectTimestamp: new Date(fee.timestamp * 1000),
          totalValueLocked: interpretAsDecimal(fee.underlyingMainAmount0, token0.decimals)
            .plus(interpretAsDecimal(fee.underlyingAltAmount0, token0.decimals))
            .times(interpretAsDecimal(fee.token0ToNativePrice, 18))
            .plus(
              interpretAsDecimal(fee.underlyingMainAmount1, token1.decimals)
                .plus(interpretAsDecimal(fee.underlyingAltAmount1, token1.decimals))
                .times(interpretAsDecimal(fee.token1ToNativePrice, 18))
            ),
        }))
      );

      const res = calculateLastApr(aprState, ONE_DAY, new Date());
      return {
        chain: chainVaults.chain,
        vault_address: vaultData.vault_address,
        apr_24h: res.apr.toFixed(6),
        apy_24h: res.apy.toFixed(6),
      };
    })
  );
};
