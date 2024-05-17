import { FastifyInstance, FastifyPluginOptions, FastifySchema } from 'fastify';
import S from 'fluent-json-schema';
import { ChainId } from '../../config/chains';
import { GraphQueryError } from '../../utils/error';
import { sdk } from '../../utils/sdk';
import { chainSchema } from '../../schema/chain';
import { getPeriodSeconds, Period, periodSchema } from '../../schema/period';
import { pick } from 'lodash';
import { VaultsQuery } from '../../../.graphclient/index';
import { calculateLastApr, prepareAprState } from '../../utils/apr';
import { interpretAsDecimal } from '../../utils/decimal';

export default async function (
  instance: FastifyInstance,
  _opts: FastifyPluginOptions,
  done: (err?: Error) => void
) {
  {
    type UrlParams = {
      chain: ChainId;
      period: Period;
    };

    const urlParamsSchema = S.object()
      .prop('chain', chainSchema.required().description('The chain to return vaults for'))
      .prop('period', periodSchema.required().description('The period to return APR for'));

    const responseSchema = S.array().items(S.object());

    const schema: FastifySchema = {
      tags: ['v1'],
      params: urlParamsSchema,
      response: {
        200: responseSchema,
      },
    };

    instance.get<{ Params: UrlParams }>('/:chain/:period', { schema }, async (request, reply) => {
      const { chain, period } = request.params;

      const result = await getVaults(chain, period);
      reply.send(result);
    });
  }

  done();
}

const getVaults = async (chain: ChainId, period: Period) => {
  const now = new Date();
  const periodSeconds = getPeriodSeconds(period);
  const since = BigInt(Math.floor(now.getTime() / 1000) - periodSeconds);
  const rawVaults = await sdk
    .Vaults({ since: since.toString() }, { chainName: chain })
    .catch((e: unknown) => {
      throw new GraphQueryError(e);
    });

  return rawVaults.beefyCLVaults.map(vault => ({
    ...pick(vault, ['vaultAddress', 'priceOfToken0InToken1', 'priceRangeMin1', 'priceRangeMax1']),
    ...getVaultApy(vault, periodSeconds, now),
  }));
};

const getVaultApy = (vault: VaultsQuery['beefyCLVaults'][0], periodSeconds: number, now: Date) => {
  const token0 = vault.underlyingToken0;
  const token1 = vault.underlyingToken1;

  const aprState = prepareAprState(
    vault.collectedFees.map(fee => ({
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

  return calculateLastApr(aprState, periodSeconds * 1000, now);
};
