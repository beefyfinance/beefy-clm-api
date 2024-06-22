import { type Static, Type } from '@sinclair/typebox';
import type { FastifyInstance, FastifyPluginOptions, FastifySchema } from 'fastify';
import { type ChainId, chainIdSchema } from '../../config/chains';
import type { HarvestDataFragment, Token } from '../../queries/codegen/sdk';
import { addressSchema } from '../../schema/address';
import {
  bigDecimalSchema,
  bigintSchema,
  timestampNumberSchema,
  timestampStrSchema,
} from '../../schema/bigint';
import { type Period, getPeriodSeconds, periodSchema } from '../../schema/period';
import { getAsyncCache } from '../../utils/async-lock';
import { interpretAsDecimal } from '../../utils/decimal';
import type { Address, Hex } from '../../utils/scalar-types';
import { getSdksForChain, paginateSdkCalls } from '../../utils/sdk';
import { setOpts } from '../../utils/typebox';

export default async function (
  instance: FastifyInstance,
  _opts: FastifyPluginOptions,
  done: (err?: Error) => void
) {
  const asyncCache = getAsyncCache();

  // latest price
  {
    const urlParamsSchema = Type.Object({
      chain: chainIdSchema,
      vault_address: addressSchema,
    });
    type UrlParams = Static<typeof urlParamsSchema>;

    const schema: FastifySchema = {
      tags: ['vault'],
      params: urlParamsSchema,
      response: {
        200: vaultPriceSchema,
      },
    };

    instance.get<{ Params: UrlParams }>(
      '/:chain/:vault_address/price',
      { schema },
      async (request, reply) => {
        const { chain, vault_address } = request.params;
        const result = await asyncCache.wrap(
          `vault-price:${chain}:${vault_address.toLocaleLowerCase()}`,
          30 * 1000,
          async () => await getVaultPrice(chain, vault_address as Hex)
        );
        if (result === undefined) {
          reply.status(404);
          reply.send({ error: 'Vault not found' });
          return;
        }
        reply.send(result);
      }
    );
  }

  // vault harvests
  {
    const urlParamsSchema = Type.Object({
      chain: setOpts(chainIdSchema, { description: 'The chain the vault is on' }),
      vault_address: setOpts(addressSchema, {
        description: 'The vault contract address',
      }),
    });

    type UrlParams = Static<typeof urlParamsSchema>;

    const schema: FastifySchema = {
      tags: ['vault'],
      params: urlParamsSchema,
      response: {
        200: vaultHarvestsSchema,
      },
    };

    instance.get<{ Params: UrlParams }>(
      '/:chain/:vault_address/harvests',
      { schema },
      async (request, reply) => {
        const { chain, vault_address } = request.params;
        const result = await asyncCache.wrap(
          `vault-harvests:${chain}:${vault_address.toLocaleLowerCase()}`,
          30 * 1000,
          async () => await getVaultHarvests(chain, vault_address as Hex)
        );

        if (result === undefined) {
          reply.status(404);
          reply.send({ error: 'Vault not found' });
          return;
        }
        reply.send(result);
      }
    );
  }

  // historical prices
  {
    const urlParamsSchema = Type.Object({
      chain: setOpts(chainIdSchema, { description: 'The chain the vault is on' }),
      vault_address: setOpts(addressSchema, {
        description: 'The vault contract address',
      }),
      period: setOpts(periodSchema, { description: 'The snapshot period for prices' }),
      since: setOpts(timestampStrSchema, { description: 'The unix timestamp to start from' }),
    });

    type UrlParams = Static<typeof urlParamsSchema>;

    const schema: FastifySchema = {
      tags: ['vault'],
      params: urlParamsSchema,
      response: {
        200: vaultHistoricPricesSchema,
      },
    };

    instance.get<{ Params: UrlParams }>(
      '/:chain/:vault_address/prices/:period/:since',
      { schema },
      async (request, reply) => {
        const { chain, vault_address, period, since } = request.params;
        const roundedSince = BigInt(since) / BigInt(60); // round to the minute
        const result = await asyncCache.wrap(
          `vault-historical-prices:${chain}:${vault_address.toLocaleLowerCase()}:${period}:${roundedSince}`,
          30 * 1000,
          async () => await getVaultHistoricPrices(chain, vault_address as Hex, period, since)
        );

        if (result === undefined) {
          reply.status(404);
          reply.send({ error: 'Vault not found' });
          return;
        }
        reply.send(result);
      }
    );
  }

  // historical data availability
  {
    const urlParamsSchema = Type.Object({
      chain: setOpts(chainIdSchema, { description: 'The chain the vault is on' }),
      vault_address: setOpts(addressSchema, {
        description: 'The vault contract address',
      }),
      period: setOpts(periodSchema, { description: 'The snapshot period for prices' }),
    });

    type UrlParams = Static<typeof urlParamsSchema>;

    const schema: FastifySchema = {
      tags: ['vault'],
      params: urlParamsSchema,
      response: {
        200: Type.Exclude(vaultHistoricPricesRangeSchema, Type.Undefined()),
      },
    };

    instance.get<{ Params: UrlParams }>(
      '/:chain/:vault_address/prices/range/:period',
      { schema },
      async (request, reply) => {
        const { chain, vault_address, period } = request.params;
        const result = await asyncCache.wrap(
          `vault-historical-prices-range:${chain}:${vault_address.toLocaleLowerCase()}:${period}`,
          30 * 1000,
          async () => await getVaultHistoricPricesRange(chain, vault_address as Hex, period)
        );
        if (result === undefined) {
          reply.status(404);
          reply.send({ error: 'Vault not found' });
          return;
        }
        reply.send(result);
      }
    );
  }

  {
    const urlParamsSchema = Type.Object({
      chain: setOpts(chainIdSchema, { description: 'The chain the vault is on' }),
      vault_address: setOpts(addressSchema, {
        description: 'The vault contract address',
      }),
    });

    type UrlParams = Static<typeof urlParamsSchema>;

    const schema: FastifySchema = {
      tags: ['vault'],
      params: urlParamsSchema,
      summary: 'Get all investor positions for a vault',
      description: 'Get all investor positions for a vault',
      response: {
        200: vaultInvestorSchema,
      },
    };

    instance.get<{ Params: UrlParams }>(
      '/:chain/:vault_address/investors',
      { schema },
      async (request, reply) => {
        const { chain, vault_address } = request.params;
        const result = await asyncCache.wrap(
          `vault-investors:${chain}:${vault_address.toLocaleLowerCase()}`,
          30 * 1000,
          async () => await getVaultInvestors(chain, vault_address as Hex)
        );
        reply.send(result);
      }
    );
  }

  done();
}

const vaultPriceSchema = Type.Object({
  min: bigintSchema,
  current: bigintSchema,
  max: bigintSchema,
});
type VaultPrice = Static<typeof vaultPriceSchema>;

const getVaultPrice = async (
  chain: ChainId,
  vault_address: Address
): Promise<VaultPrice | undefined> => {
  const res = await Promise.all(
    getSdksForChain(chain).map(async sdk =>
      sdk.VaultPrice({
        vault_address,
      })
    )
  );

  const vault = res.map(r => r.data.clm).find(v => !!v);
  if (!vault) {
    return undefined;
  }

  return {
    min: vault.priceRangeMin1,
    current: vault.priceOfToken0InToken1,
    max: vault.priceRangeMax1,
  };
};

export const vaultHarvestSchema = Type.Object({
  timestamp: setOpts(timestampStrSchema, { description: 'The timestamp of the harvest' }),
  compoundedAmount0: setOpts(bigDecimalSchema, { description: 'The amount of token0 compounded' }),
  compoundedAmount1: setOpts(bigDecimalSchema, { description: 'The amount of token1 compounded' }),
  token0ToUsd: setOpts(bigDecimalSchema, { description: 'The price of token0 in USD' }),
  token1ToUsd: setOpts(bigDecimalSchema, { description: 'The price of token1 in USD' }),
  totalSupply: setOpts(bigDecimalSchema, { description: 'The total supply of the vault' }),
});
export type VaultHarvest = Static<typeof vaultHarvestSchema>;
const vaultHarvestsSchema = Type.Array(vaultHarvestSchema);
type VaultHarvests = Static<typeof vaultHarvestsSchema>;

const getVaultHarvests = async (chain: ChainId, vault_address: Address): Promise<VaultHarvests> => {
  const res = await Promise.all(
    getSdksForChain(chain).map(async sdk =>
      sdk.VaultHarvests({
        vault_address,
      })
    )
  );

  const vault = res.map(r => r.data.clm).find(v => !!v);
  if (!vault) {
    return [];
  }

  return prepareVaultHarvests(vault);
};

export function prepareVaultHarvests(vault: {
  underlyingToken0: Pick<Token, 'decimals'>;
  underlyingToken1: Pick<Token, 'decimals'>;
  sharesToken: Pick<Token, 'decimals'>;
  harvests: Array<HarvestDataFragment>;
}): VaultHarvest[] {
  return vault.harvests.map(harvest => {
    const token0ToNativePrice = interpretAsDecimal(harvest.token0ToNativePrice, 18);
    const token1ToNativePrice = interpretAsDecimal(harvest.token1ToNativePrice, 18);
    const nativeToUsd = interpretAsDecimal(harvest.nativeToUSDPrice, 18);
    const compoundedAmount0 = interpretAsDecimal(
      harvest.compoundedAmount0,
      vault.underlyingToken0.decimals
    );
    const compoundedAmount1 = interpretAsDecimal(
      harvest.compoundedAmount1,
      vault.underlyingToken1.decimals
    );
    const totalSupply = interpretAsDecimal(harvest.totalSupply, vault.sharesToken.decimals);

    return {
      timestamp: harvest.timestamp,
      compoundedAmount0: compoundedAmount0.toString(),
      compoundedAmount1: compoundedAmount1.toString(),
      token0ToUsd: token0ToNativePrice.mul(nativeToUsd).toString(),
      token1ToUsd: token1ToNativePrice.mul(nativeToUsd).toString(),
      totalSupply: totalSupply.toString(),
    };
  });
}

const vaultHistoricPricesSchema = Type.Array(
  Type.Object({
    t: timestampNumberSchema,
    min: bigDecimalSchema,
    v: bigDecimalSchema,
    max: bigDecimalSchema,
  })
);
type VaultHistoricPrices = Static<typeof vaultHistoricPricesSchema>;

const getVaultHistoricPrices = async (
  chain: ChainId,
  vault_address: Address,
  period: Period,
  since: string
): Promise<VaultHistoricPrices> => {
  const res = await Promise.all(
    getSdksForChain(chain).map(async sdk =>
      sdk.VaultHistoricPrices({
        vault_address,
        period: getPeriodSeconds(period),
        since,
      })
    )
  );

  const vault = res.map(r => r.data.clm).find(v => !!v);
  if (!vault) {
    return [];
  }

  if (!vault.snapshots?.length) {
    return [];
  }

  const token1 = vault.underlyingToken1;

  return vault.snapshots.map(snapshot => ({
    t: Number.parseInt(snapshot.roundedTimestamp),
    min: interpretAsDecimal(snapshot.priceRangeMin1, token1.decimals).toString(),
    v: interpretAsDecimal(snapshot.priceOfToken0InToken1, token1.decimals).toString(),
    max: interpretAsDecimal(snapshot.priceRangeMax1, token1.decimals).toString(),
  }));
};

const vaultHistoricPricesRangeSchema = Type.Union([
  Type.Object({
    min: Type.Number(),
    max: Type.Number(),
  }),
  Type.Undefined(),
]);
type VaultHistoricPricesRange = Static<typeof vaultHistoricPricesRangeSchema>;

const getVaultHistoricPricesRange = async (
  chain: ChainId,
  vault_address: Address,
  period: Period
): Promise<VaultHistoricPricesRange> => {
  const res = await Promise.all(
    getSdksForChain(chain).map(async sdk =>
      sdk.VaultHistoricPricesRange({
        vault_address,
        period: getPeriodSeconds(period),
      })
    )
  );

  const vault = res.map(r => r.data.clm).find(v => !!v);
  if (!vault) {
    return undefined;
  }

  return {
    min: Number.parseInt(vault.minSnapshot?.[0]?.roundedTimestamp || '0'),
    max: Number.parseInt(vault.maxSnapshot?.[0]?.roundedTimestamp || '0'),
  };
};

const vaultInvestorSchema = Type.Object({
  investor_address: addressSchema,
  total_shares_balance: bigDecimalSchema,
  underlying_balance0: bigDecimalSchema,
  underlying_balance1: bigDecimalSchema,
  usd_balance0: bigDecimalSchema,
  usd_balance1: bigDecimalSchema,
  usd_balance: bigDecimalSchema,
});
const vaultInvestorsSchema = Type.Array(vaultInvestorSchema);
type VaultInvestors = Static<typeof vaultInvestorsSchema>;

const getVaultInvestors = async (
  chain: ChainId,
  vault_address: Address
): Promise<VaultInvestors> => {
  const res = await Promise.all(
    getSdksForChain(chain).map(async sdk =>
      paginateSdkCalls(
        sdk,
        (sdk, skip, first) =>
          sdk.VaultInvestors({
            clmAddress: vault_address,
            skip,
            first,
          }),
        res => res.data.clmPositions.length,
        { pageSize: 1000, fetchAtMost: 100_000 }
      )
    )
  );

  const positions = res.flatMap(chainRes =>
    chainRes.flatMap(chainPage => chainPage.data.clmPositions)
  );

  return positions.map(position => {
    const managerToken = position.clm.managerToken;
    const token0 = position.clm.underlyingToken0;
    const token1 = position.clm.underlyingToken1;
    const token0ToNativePrice = interpretAsDecimal(position.clm.token0ToNativePrice, 18);
    const token1ToNativePrice = interpretAsDecimal(position.clm.token1ToNativePrice, 18);
    const nativeToUsd = interpretAsDecimal(position.clm.nativeToUSDPrice, 18);
    const positionShareBalance = interpretAsDecimal(position.totalBalance, managerToken.decimals);
    const vaultBalance0 = interpretAsDecimal(
      position.clm.underlyingAltAmount0,
      token0.decimals
    ).plus(interpretAsDecimal(position.clm.underlyingMainAmount0, token0.decimals));
    const vaultBalance1 = interpretAsDecimal(
      position.clm.underlyingAltAmount1,
      token1.decimals
    ).plus(interpretAsDecimal(position.clm.underlyingMainAmount1, token1.decimals));
    const vaultTotalSupply = interpretAsDecimal(
      position.clm.managerTotalSupply,
      managerToken.decimals
    );

    const positionPercentShare = positionShareBalance.div(vaultTotalSupply);
    const positionBalance0 = vaultBalance0.mul(positionPercentShare);
    const positionBalance1 = vaultBalance1.mul(positionPercentShare);
    const positionBalance0Usd = positionBalance0.mul(token0ToNativePrice).mul(nativeToUsd);
    const positionBalance1Usd = positionBalance1.mul(token1ToNativePrice).mul(nativeToUsd);
    const positionBalanceUsd = positionBalance0Usd.add(positionBalance1Usd);
    return {
      investor_address: position.investor.userAddress,
      total_shares_balance: positionShareBalance.toFixed(10),
      underlying_balance0: positionBalance0.toFixed(10),
      underlying_balance1: positionBalance1.toFixed(10),
      usd_balance0: positionBalance0Usd.toFixed(10),
      usd_balance1: positionBalance1Usd.toFixed(10),
      usd_balance: positionBalanceUsd.toFixed(10),
    };
  });
};
