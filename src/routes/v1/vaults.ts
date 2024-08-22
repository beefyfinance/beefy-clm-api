import { type Static, Type } from '@sinclair/typebox';
import type { FastifyInstance, FastifyPluginOptions, FastifySchema } from 'fastify';
import { max, sortedUniq } from 'lodash';
import { type ChainId, chainIdSchema } from '../../config/chains';
import type { VaultsQuery } from '../../queries/codegen/sdk';
import { addressSchema } from '../../schema/address';
import { bigDecimalSchema, timestampNumberSchema } from '../../schema/bigint';
import { type Period, getPeriodSeconds, periodSchema } from '../../schema/period';
import { calculateLastApr, prepareAprState } from '../../utils/apr';
import { getAsyncCache } from '../../utils/async-lock';
import { fromUnixTime, getUnixTime } from '../../utils/date';
import { interpretAsDecimal } from '../../utils/decimal';
import type { Address, Hex } from '../../utils/scalar-types';
import { getSdksForChain, paginate } from '../../utils/sdk';
import { setOpts } from '../../utils/typebox';
import {
  prepareClmHarvests,
  clmHarvestSchema,
  classicHarvestSchema,
  prepareClassicHarvests,
} from './vault';

export default async function (
  instance: FastifyInstance,
  _opts: FastifyPluginOptions,
  done: (err?: Error) => void
) {
  const asyncCache = getAsyncCache();

  // vaults data for use by main api
  {
    const urlParamsSchema = Type.Object({
      chain: setOpts(chainIdSchema, { description: 'The chain the vault is on' }),
      period: setOpts(periodSchema, { description: 'The period to return APR for' }),
    });
    type UrlParams = Static<typeof urlParamsSchema>;

    const schema: FastifySchema = {
      tags: ['vaults'],
      params: urlParamsSchema,
      response: {
        200: vaultsSchema,
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
    const urlParamsSchema = Type.Object({
      chain: setOpts(chainIdSchema, {
        description: 'The chain to return vaults harvest data for',
      }),
      since: setOpts(timestampNumberSchema, {
        description: 'The unix timestamp to return harvests since',
      }),
    });
    type UrlParams = Static<typeof urlParamsSchema>;

    const queryParamsSchema = Type.Object({
      vaults: Type.Optional(
        Type.Array(addressSchema, {
          description: 'The vault addresses to return harvests for',
        })
      ),
    });
    type QueryParams = Static<typeof queryParamsSchema>;

    const schema: FastifySchema = {
      tags: ['vaults'],
      params: urlParamsSchema,
      querystring: queryParamsSchema,
      response: {
        200: manyVaultHarvestSchema,
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
          async () => await getManyVaultsHarvests(chain, since, vaults as Hex[])
        );

        reply.send(result);
      }
    );
  }

  done();
}

const vaultApySchema = Type.Object({
  apr: bigDecimalSchema,
  apy: bigDecimalSchema,
});
type VaultApy = Static<typeof vaultApySchema>;

const getVaultApy = (vault: VaultsQuery['clms'][0], periodSeconds: number, now: Date): VaultApy => {
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

  const apr = calculateLastApr(aprState, periodSeconds * 1000, now);
  return {
    apr: apr.apr.toString(),
    apy: apr.apy.toString(),
  };
};

const vaultSchema = Type.Intersect([
  Type.Object({
    vaultAddress: addressSchema,
    priceRangeMin1: bigDecimalSchema,
    priceOfToken0InToken1: bigDecimalSchema,
    priceRangeMax1: bigDecimalSchema,
  }),
  vaultApySchema,
]);
const vaultsSchema = Type.Array(vaultSchema);
type Vaults = Static<typeof vaultsSchema>;

const getVaults = async (chain: ChainId, period: Period): Promise<Vaults> => {
  const now = new Date();
  const periodSeconds = getPeriodSeconds(period);
  const since = getUnixTime(now) - periodSeconds;

  const res = await Promise.all(
    getSdksForChain(chain).map(sdk =>
      paginate({
        fetchPage: ({ skip, first }) =>
          sdk.Vaults({
            since,
            skip,
            first,
          }),
        count: res => max(res.data.clms.map(vault => vault.collectedFees.length)) || 0,
      })
    )
  );

  return res.flatMap(chainRes =>
    chainRes.flatMap(chainPage =>
      chainPage.data.clms.map(vault => {
        const token1 = vault.underlyingToken1;
        return {
          vaultAddress: vault.vaultAddress,
          priceRangeMin1: interpretAsDecimal(vault.priceRangeMin1, token1.decimals).toString(),
          priceOfToken0InToken1: interpretAsDecimal(
            vault.priceOfToken0InToken1,
            token1.decimals
          ).toString(),
          priceRangeMax1: interpretAsDecimal(vault.priceRangeMax1, token1.decimals).toString(),
          ...getVaultApy(vault, periodSeconds, now),
        };
      })
    )
  );
};

const manyVaultHarvestSchema = Type.Array(
  Type.Union([
    Type.Object({
      vaultAddress: addressSchema,
      type: Type.Literal('clm'),
      harvests: Type.Array(clmHarvestSchema),
    }),
    Type.Object({
      vaultAddress: addressSchema,
      type: Type.Literal('classic'),
      harvests: Type.Array(classicHarvestSchema),
    }),
  ])
);
type ManyVaultsHarvests = Static<typeof manyVaultHarvestSchema>;

const getManyVaultsHarvests = async (
  chain: ChainId,
  since: number,
  vaults: Address[]
): Promise<ManyVaultsHarvests> => {
  const res = await Promise.all(
    getSdksForChain(chain).map(sdk =>
      vaults.length
        ? sdk.VaultsHarvestsFiltered({ since: since.toString(), vaults })
        : sdk.VaultsHarvests({ since: since.toString() })
    )
  );

  const rawClms = res.flatMap(chainRes => chainRes.data.clms);
  const rawClassics = res.flatMap(chainRes => chainRes.data.classics);
  const vaultsWithHarvests: ManyVaultsHarvests = [];

  rawClms.forEach(vault => {
    if (vault.harvests.length === 0) {
      return;
    }

    vaultsWithHarvests.push({
      vaultAddress: String(vault.vaultAddress),
      type: 'clm',
      harvests: prepareClmHarvests(vault),
    });
  });

  rawClassics.forEach(vault => {
    if (vault.harvests.length === 0) {
      return;
    }

    vaultsWithHarvests.push({
      vaultAddress: String(vault.vaultAddress),
      type: 'classic',
      harvests: prepareClassicHarvests(vault),
    });
  });

  return vaultsWithHarvests;
};
