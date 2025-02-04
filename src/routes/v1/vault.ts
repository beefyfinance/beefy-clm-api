import { type Static, Type } from '@sinclair/typebox';
import type { FastifyInstance, FastifyPluginOptions, FastifySchema } from 'fastify';
import { omit } from 'lodash';
import { type ChainId, chainIdSchema } from '../../config/chains';
import type {
  ClassicHarvestDataFragment,
  ClmHarvestDataFragment,
  Token,
} from '../../queries/codegen/sdk';
import { addressSchema } from '../../schema/address';
import { bigDecimalSchema, timestampStrSchema } from '../../schema/bigint';
import { type Period, getPeriodSeconds, periodSchema } from '../../schema/period';
import { isDefined } from '../../utils/array';
import { getAsyncCache } from '../../utils/async-lock';
import { interpretAsDecimal } from '../../utils/decimal';
import { sortEntitiesByOrderList } from '../../utils/entity-order';
import { FriendlyError } from '../../utils/error';
import { getLoggerFor } from '../../utils/log';
import {
  classicHistoricPricesSchema,
  clmHistoricPricesSchema,
  handleClassicPrice,
  handleClmPrice,
} from '../../utils/prices';
import type { Address, Hex } from '../../utils/scalar-types';
import { getSdksForChain, paginate } from '../../utils/sdk';
import { toToken } from '../../utils/tokens';
import { setOpts } from '../../utils/typebox';

const logger = getLoggerFor('vault');

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
      summary: 'Get all move ticks for a vault',
      description: 'Get all move ticks for a vault, excluding deposits and withdrawals',
      response: {
        200: moveTicksSchema,
      },
    };

    instance.get<{ Params: UrlParams }>(
      '/:chain/:vault_address/move-ticks',
      { schema },
      async (request, reply) => {
        const { chain, vault_address } = request.params;
        const result = await asyncCache.wrap(
          `vault-move-ticks:${chain}:${vault_address.toLocaleLowerCase()}`,
          30 * 1000,
          async () => await getVaultMoveTicks(chain, vault_address as Hex)
        );
        reply.send(result);
      }
    );
  }

  done();
}

const vaultPriceSchema = Type.Union([clmHistoricPricesSchema, classicHistoricPricesSchema]);
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

  const timestamp =
    res
      .map(r => r.data._meta)
      .find(v => !!v)
      ?.block.timestamp?.toString() || '0';

  const clm = res.map(r => r.data.clm).find(v => !!v);
  if (clm) {
    return handleClmPrice(clm.sharesToken, clm.underlyingToken0, clm.underlyingToken1, {
      ...omit(clm, ['sharesToken', 'underlyingToken0', 'underlyingToken1', '__typename']),
      roundedTimestamp: timestamp,
    });
  }

  const classic = res.map(r => r.data.classic).find(v => !!v);
  if (classic) {
    const { sharesToken, underlyingToken } = classic;
    const underlyingBreakdownTokens = sortEntitiesByOrderList(
      classic.underlyingBreakdownTokens,
      'address',
      classic.underlyingBreakdownTokensOrder
    )
      .map(toToken)
      .filter(isDefined);
    if (underlyingBreakdownTokens.length < classic.underlyingBreakdownTokensOrder.length) {
      throw new FriendlyError(
        `Missing underlying breakdown tokens for classic ${sharesToken.address}`
      );
    }

    return handleClassicPrice(sharesToken, underlyingToken, underlyingBreakdownTokens, {
      ...omit(classic, [
        'sharesToken',
        'underlyingToken',
        'underlyingBreakdownTokens',
        '__typename',
      ]),
      roundedTimestamp: timestamp,
    });
  }

  return undefined;
};

export const clmHarvestSchema = Type.Object({
  id: Type.String({ description: 'Id of the harvest event' }),
  type: Type.Literal('clm'),
  timestamp: setOpts(timestampStrSchema, { description: 'The timestamp of the harvest' }),
  compoundedAmount0: setOpts(bigDecimalSchema, { description: 'The amount of token0 compounded' }),
  compoundedAmount1: setOpts(bigDecimalSchema, { description: 'The amount of token1 compounded' }),
  token0ToUsd: setOpts(bigDecimalSchema, { description: 'The price of token0 in USD' }),
  token1ToUsd: setOpts(bigDecimalSchema, { description: 'The price of token1 in USD' }),
  totalAmount0: setOpts(bigDecimalSchema, { description: 'The amount of token0 in the vault' }),
  totalAmount1: setOpts(bigDecimalSchema, { description: 'The amount of token1 in the vault' }),
  totalSupply: setOpts(bigDecimalSchema, { description: 'The total supply of the vault' }),
});
export const classicHarvestSchema = Type.Object({
  id: Type.String({ description: 'Id of the harvest event' }),
  type: Type.Literal('classic'),
  timestamp: setOpts(timestampStrSchema, { description: 'The timestamp of the harvest' }),
  compoundedAmount: setOpts(bigDecimalSchema, {
    description: 'The amount of underlying compounded',
  }),
  underlyingToUsd: setOpts(bigDecimalSchema, { description: 'The price of underlying in USD' }),
  totalUnderlying: setOpts(bigDecimalSchema, {
    description: 'The total underlying deposited in the vault',
  }),
  totalSupply: setOpts(bigDecimalSchema, { description: 'The total supply of the vault' }),
});
export type ClmHarvest = Static<typeof clmHarvestSchema>;
export type ClassicHarvest = Static<typeof classicHarvestSchema>;
const vaultHarvestsSchema = Type.Array(Type.Union([clmHarvestSchema, classicHarvestSchema]));
type VaultHarvests = Static<typeof vaultHarvestsSchema>;

const getVaultHarvests = async (chain: ChainId, vault_address: Address): Promise<VaultHarvests> => {
  const res = await Promise.all(
    getSdksForChain(chain).map(async sdk =>
      sdk.VaultHarvests({
        vault_address,
      })
    )
  );

  const clm = res.map(r => r.data.clm).find(v => !!v);
  if (clm) {
    return prepareClmHarvests(clm);
  }

  const vault = res.map(r => r.data.classic).find(v => !!v);
  if (vault) {
    return prepareClassicHarvests(vault);
  }

  return [];
};

export function prepareClassicHarvests(vault: {
  underlyingToken: Pick<Token, 'decimals'>;
  sharesToken: Pick<Token, 'decimals'>;
  harvests: Array<ClassicHarvestDataFragment>;
}): ClassicHarvest[] {
  return vault.harvests.map(harvest => {
    const underlyingToNativePrice = interpretAsDecimal(harvest.underlyingToNativePrice, 18);
    const nativeToUsd = interpretAsDecimal(harvest.nativeToUSDPrice, 18);
    const compoundedAmount = interpretAsDecimal(
      harvest.compoundedAmount,
      vault.underlyingToken.decimals
    );
    const totalUnderlying = interpretAsDecimal(
      harvest.underlyingAmount,
      vault.underlyingToken.decimals
    );
    const totalSupply = interpretAsDecimal(harvest.totalSupply, vault.sharesToken.decimals);

    return {
      id: harvest.id,
      type: 'classic',
      timestamp: harvest.timestamp,
      compoundedAmount: compoundedAmount.toString(),
      underlyingToUsd: underlyingToNativePrice.mul(nativeToUsd).toString(),
      totalUnderlying: totalUnderlying.toString(),
      totalSupply: totalSupply.toString(),
    };
  });
}

export function prepareClmHarvests(vault: {
  underlyingToken0: Pick<Token, 'decimals'>;
  underlyingToken1: Pick<Token, 'decimals'>;
  sharesToken: Pick<Token, 'decimals'>;
  harvests: Array<ClmHarvestDataFragment>;
}): ClmHarvest[] {
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
    const totalAmount0 = interpretAsDecimal(
      harvest.underlyingAmount0,
      vault.underlyingToken0.decimals
    );
    const totalAmount1 = interpretAsDecimal(
      harvest.underlyingAmount1,
      vault.underlyingToken1.decimals
    );
    const totalSupply = interpretAsDecimal(harvest.totalSupply, vault.sharesToken.decimals);

    return {
      id: harvest.id,
      type: 'clm',
      timestamp: harvest.timestamp,
      compoundedAmount0: compoundedAmount0.toString(),
      compoundedAmount1: compoundedAmount1.toString(),
      token0ToUsd: token0ToNativePrice.mul(nativeToUsd).toString(),
      token1ToUsd: token1ToNativePrice.mul(nativeToUsd).toString(),
      totalAmount0: totalAmount0.toString(),
      totalAmount1: totalAmount1.toString(),
      totalSupply: totalSupply.toString(),
    };
  });
}

const vaultHistoricPricesSchema = Type.Array(
  Type.Union([clmHistoricPricesSchema, classicHistoricPricesSchema])
);
type VaultHistoricPrices = Static<typeof vaultHistoricPricesSchema>;

const getVaultHistoricPrices = async (
  chain: ChainId,
  vault_address: Address,
  period: Period,
  since: string
): Promise<VaultHistoricPrices | undefined> => {
  const res = await Promise.all(
    getSdksForChain(chain).map(async sdk =>
      sdk.VaultHistoricPrices({
        vault_address,
        period: getPeriodSeconds(period),
        since,
      })
    )
  );

  const clm = res.map(r => r.data.clm).find(v => !!v);
  if (clm) {
    if (!clm.snapshots?.length) {
      return [];
    }

    const { underlyingToken0, underlyingToken1, sharesToken } = clm;

    return clm.snapshots.map(snapshot =>
      handleClmPrice(sharesToken, underlyingToken0, underlyingToken1, snapshot)
    );
  }

  const classic = res.map(r => r.data.classic).find(v => !!v);
  if (classic) {
    if (!classic.snapshots?.length) {
      return [];
    }

    const { sharesToken, underlyingToken } = classic;
    const underlyingBreakdownTokens = sortEntitiesByOrderList(
      classic.underlyingBreakdownTokens,
      'address',
      classic.underlyingBreakdownTokensOrder
    )
      .map(toToken)
      .filter(isDefined);
    if (underlyingBreakdownTokens.length < classic.underlyingBreakdownTokensOrder.length) {
      logger.error(`Missing underlying breakdown tokens for classic ${sharesToken.address}`);
      return [];
    }

    return classic.snapshots.map(snapshot =>
      handleClassicPrice(sharesToken, underlyingToken, underlyingBreakdownTokens, snapshot)
    );
  }

  return undefined;
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

  const vault = res.map(r => r.data.clm ?? r.data.classic).find(v => !!v);
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
      paginate({
        fetchPage: ({ skip, first }) =>
          sdk.VaultInvestors({
            clmAddress: vault_address,
            skip,
            first,
          }),
        count: res => res.data.clmPositions.length,
      })
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
      total_shares_balance: positionShareBalance.toFixed(30),
      underlying_balance0: positionBalance0.toFixed(10),
      underlying_balance1: positionBalance1.toFixed(10),
      usd_balance0: positionBalance0Usd.toFixed(10),
      usd_balance1: positionBalance1Usd.toFixed(10),
      usd_balance: positionBalanceUsd.toFixed(10),
    };
  });
};

const vaultMoveTicksSchema = Type.Object({
  id: Type.String(),
  blockNumber: Type.Number(),
  timestamp: setOpts(timestampStrSchema, { description: 'The timestamp of the move tick' }),
  amount0: setOpts(bigDecimalSchema, { description: 'The amount of token0 moved' }),
  amount1: setOpts(bigDecimalSchema, { description: 'The amount of token1 moved' }),
});
const moveTicksSchema = Type.Array(vaultMoveTicksSchema);
type MoveTicks = Static<typeof moveTicksSchema>;

const getVaultMoveTicks = async (chain: ChainId, vault_address: Address): Promise<MoveTicks> => {
  const res = await Promise.all(
    getSdksForChain(chain).map(async sdk =>
      paginate({
        fetchPage: ({ skip, first }) =>
          sdk.VaultMoveTicks({
            vault_address: vault_address,
            skip,
            first,
          }),
        count: res =>
          Math.max(
            res.data.clm?.deposits.length ?? 0,
            res.data.clm?.withdrawals.length ?? 0,
            res.data.clm?.tvlEvents.length ?? 0
          ),
      })
    )
  );

  const excludeTxHashs = new Set<string>();
  for (const chainRes of res) {
    for (const chainPage of chainRes) {
      for (const deposit of chainPage.data.clm?.deposits ?? []) {
        excludeTxHashs.add(deposit.createdWith.id);
      }
      for (const withdraw of chainPage.data.clm?.withdrawals ?? []) {
        excludeTxHashs.add(withdraw.createdWith.id);
      }
    }
  }

  return res.flatMap(chainRes =>
    chainRes.flatMap(chainPage =>
      (chainPage.data.clm?.tvlEvents ?? [])
        .filter(tvlEvent => !excludeTxHashs.has(tvlEvent.createdWith.id))
        .map(tvlEvent => ({
          id: tvlEvent.id,
          blockNumber: Number.parseInt(tvlEvent.createdWith.blockNumber),
          timestamp: tvlEvent.timestamp,
          amount0: tvlEvent.underlyingAmount0,
          amount1: tvlEvent.underlyingAmount1,
        }))
    )
  );
};
