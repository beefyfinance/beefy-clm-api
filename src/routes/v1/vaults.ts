import type { FastifyInstance, FastifyPluginOptions, FastifySchema } from 'fastify';
import S from 'fluent-json-schema';
import { max, sortedUniq } from 'lodash';
import type { ChainId } from '../../config/chains';
import type { VaultsQuery } from '../../queries/codegen/sdk';
import { addressSchema } from '../../schema/address';
import { chainSchema } from '../../schema/chain';
import { type Period, getPeriodSeconds, periodSchema } from '../../schema/period';
import { calculateLastApr, prepareAprState } from '../../utils/apr';
import { getAsyncCache } from '../../utils/async-lock';
import { fromUnixTime, getUnixTime } from '../../utils/date';
import { interpretAsDecimal } from '../../utils/decimal';
import type { Address } from '../../utils/scalar-types';
import { getSdksForChain, paginateSdkCalls } from '../../utils/sdk';
import { type PreparedVaultHarvest, prepareVaultHarvests } from './vault';

export default async function (
  instance: FastifyInstance,
  _opts: FastifyPluginOptions,
  done: (err?: Error) => void
) {
  const asyncCache = getAsyncCache();

  // vaults data for use by main api
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
      tags: ['vaults'],
      params: urlParamsSchema,
      response: {
        200: responseSchema,
      },
    };

    instance.get<{ Params: UrlParams }>('/:chain/:period', { schema }, async (request, reply) => {
      const { chain, period } = request.params;

      const result = await asyncCache.wrap(
        `vaults:${chain}:${period}`,
        30 * 1000,
        async () => await getVaults(chain, period)
      );
      reply.send(result);
    });
  }

  // Vaults harvest data
  {
    type UrlParams = {
      chain: ChainId;
      since: number;
    };

    type QueryParams = {
      vaults?: Address[];
    };

    const urlParamsSchema = S.object()
      .prop(
        'chain',
        chainSchema.required().description('The chain to return vaults harvest data for')
      )
      .prop(
        'since',
        S.number().required().description('The unix timestamp to return harvests since')
      );

    const queryParamsSchema = S.object().prop(
      'vaults',
      S.array()
        .items(addressSchema.description('A vault address'))
        .description('The vault addresses to return harvests for')
    );

    const responseSchema = S.array().items(S.object());

    const schema: FastifySchema = {
      tags: ['vaults'],
      params: urlParamsSchema,
      querystring: queryParamsSchema,
      response: {
        200: responseSchema,
      },
    };

    instance.get<{ Params: UrlParams; Querystring: QueryParams }>(
      '/:chain/harvests/:since',
      { schema },
      async (request, reply) => {
        const { chain, since } = request.params;
        const roundedSince = BigInt(since) / BigInt(60); // round to the minute
        const vaults = request.query.vaults || [];
        const vaultsKey = sortedUniq(vaults.map(a => a.toLowerCase()).sort()).join(',');
        const result = await asyncCache.wrap(
          `vaults-harvests:${chain}:${roundedSince}:${vaultsKey}`,
          30 * 1000,
          async () => await getVaultsHarvests(chain, since, vaults)
        );

        reply.send(result);
      }
    );
  }

  done();
}

const getVaults = async (chain: ChainId, period: Period) => {
  const now = new Date();
  const periodSeconds = getPeriodSeconds(period);
  const since = getUnixTime(now) - periodSeconds;

  const res = await Promise.all(
    getSdksForChain(chain).map(sdk =>
      paginateSdkCalls(
        sdk,
        (sdk, skip, first) =>
          sdk.Vaults({
            since,
            skip,
            first,
          }),
        res => max(res.data.clms.map(vault => vault.collectedFees.length)) || 0,
        { pageSize: 1000, fetchAtMost: 100_000 }
      )
    )
  );

  return res.flatMap(chainRes =>
    chainRes.flatMap(chainPage =>
      chainPage.data.clms.map(vault => {
        const token1 = vault.underlyingToken1;
        return {
          vaultAddress: vault.vaultAddress,
          priceRangeMin1: interpretAsDecimal(vault.priceRangeMin1, token1.decimals),
          priceOfToken0InToken1: interpretAsDecimal(vault.priceOfToken0InToken1, token1.decimals),
          priceRangeMax1: interpretAsDecimal(vault.priceRangeMax1, token1.decimals),
          ...getVaultApy(vault, periodSeconds, now),
        };
      })
    )
  );
};

const getVaultApy = (vault: VaultsQuery['clms'][0], periodSeconds: number, now: Date) => {
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
      collectTimestamp: fromUnixTime(fee.timestamp),
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

type VaultsHarvests = { vaultAddress: string; harvests: PreparedVaultHarvest[] }[];

const getVaultsHarvests = async (
  chain: ChainId,
  since: number,
  vaults: Address[]
): Promise<VaultsHarvests> => {
  const res = await Promise.all(
    getSdksForChain(chain).map(sdk =>
      vaults.length
        ? sdk.VaultsHarvestsFiltered({ since: since.toString(), vaults })
        : sdk.VaultsHarvests({ since: since.toString() })
    )
  );

  const rawVaults = res.flatMap(chainRes => chainRes.data.clms);

  return rawVaults.reduce((acc, vault): VaultsHarvests => {
    if (vault.harvests.length === 0) {
      return acc;
    }

    acc.push({
      vaultAddress: String(vault.vaultAddress),
      harvests: prepareVaultHarvests(vault),
    });

    return acc;
  }, [] as VaultsHarvests);
};
