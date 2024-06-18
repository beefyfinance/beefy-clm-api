import { FastifyInstance, FastifyPluginOptions, FastifySchema } from 'fastify';
import S from 'fluent-json-schema';
import { ChainId } from '../../config/chains';
import { addressSchema } from '../../schema/address';
import { getSdksForChain, paginateSdkCalls } from '../../utils/sdk';
import { getPeriodSeconds, Period, periodSchema } from '../../schema/period';
import { chainSchema } from '../../schema/chain';
import { bigintSchema } from '../../schema/bigint';
import { interpretAsDecimal } from '../../utils/decimal';
import { getAsyncCache } from '../../utils/async-lock';
import { HarvestDataFragment, Token } from '../../queries/codegen/sdk';

export default async function (
  instance: FastifyInstance,
  _opts: FastifyPluginOptions,
  done: (err?: Error) => void
) {
  const asyncCache = getAsyncCache();

  // latest price
  {
    type UrlParams = {
      chain: ChainId;
      vault_address: string;
    };

    const urlParamsSchema = S.object()
      .prop('chain', chainSchema.required().description('The chain the vault is on'))
      .prop('vault_address', addressSchema.required().description('The vault contract address'));

    const responseSchema = S.array().items(S.object());

    const schema: FastifySchema = {
      tags: ['vault'],
      params: urlParamsSchema,
      response: {
        200: responseSchema,
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
          async () => await getVaultPrice(chain, vault_address)
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
    type UrlParams = {
      chain: ChainId;
      vault_address: string;
    };

    const urlParamsSchema = S.object()
      .prop('chain', chainSchema.required().description('The chain the vault is on'))
      .prop('vault_address', addressSchema.required().description('The vault contract address'));

    const responseSchema = S.array().items(S.object());

    const schema: FastifySchema = {
      tags: ['vault'],
      params: urlParamsSchema,
      response: {
        200: responseSchema,
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
          async () => await getVaultHarvests(chain, vault_address)
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
    type UrlParams = {
      chain: ChainId;
      vault_address: string;
      period: Period;
      since: string;
    };

    const urlParamsSchema = S.object()
      .prop('chain', chainSchema.required().description('The chain the vault is on'))
      .prop('vault_address', addressSchema.required().description('The vault contract address'))
      .prop('period', periodSchema.required().description('The snapshot period for prices'))
      .prop('since', bigintSchema.required().description('The unix timestamp to start from'));

    const responseSchema = S.array().items(S.object());

    const schema: FastifySchema = {
      tags: ['vault'],
      params: urlParamsSchema,
      response: {
        200: responseSchema,
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
          async () => await getVaultHistoricPrices(chain, vault_address, period, since)
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
    type UrlParams = {
      chain: ChainId;
      vault_address: string;
      period: Period;
    };

    const urlParamsSchema = S.object()
      .prop('chain', chainSchema.required().description('The chain the vault is on'))
      .prop('vault_address', addressSchema.required().description('The vault contract address'))
      .prop('period', periodSchema.required().description('The snapshot period for prices'));

    const responseSchema = S.array().items(S.object());

    const schema: FastifySchema = {
      tags: ['vault'],
      params: urlParamsSchema,
      response: {
        200: responseSchema,
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
          async () => await getVaultHistoricPricesRange(chain, vault_address, period)
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
    type UrlParams = {
      chain: ChainId;
      vault_address: string;
    };

    const urlParamsSchema = S.object()
      .prop('chain', chainSchema.required().description('The chain the vault is on'))
      .prop('vault_address', addressSchema.required().description('The vault contract address'));

    const responseSchema = S.array().items(
      S.object()
        .prop('investor_address', addressSchema.required().description('The investor address'))
        .prop('total_shares_balance', S.string().required().description('The total shares balance'))
        .prop('underlying_balance0', S.string().required().description('The underlying balance 0'))
        .prop('underlying_balance1', S.string().required().description('The underlying balance 1'))
        .prop('usd_balance0', S.string().required().description('The USD balance 0'))
        .prop('usd_balance1', S.string().required().description('The USD balance 1'))
        .prop('usd_balance', S.string().required().description('The USD balance'))
    );

    const schema: FastifySchema = {
      tags: ['vault'],
      params: urlParamsSchema,
      summary: 'Get all investor positions for a vault',
      description: 'Get all investor positions for a vault',
      response: {
        200: responseSchema,
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
          async () => await getVaultInvestors(chain, vault_address)
        );
        reply.send(result);
      }
    );
  }

  done();
}

const getVaultPrice = async (chain: ChainId, vault_address: string) => {
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

const getVaultHarvests = async (chain: ChainId, vault_address: string) => {
  const res = await Promise.all(
    getSdksForChain(chain).map(async sdk =>
      sdk.VaultHarvests({
        vault_address,
      })
    )
  );

  const vault = res.map(r => r.data.clm).find(v => !!v);
  if (!vault) {
    return undefined;
  }

  return prepareVaultHarvests(vault);
};

export type PreparedVaultHarvest = {
  timestamp: string;
  compoundedAmount0: string;
  compoundedAmount1: string;
  token0ToUsd: string;
  token1ToUsd: string;
  totalSupply: string;
};
export function prepareVaultHarvests(vault: {
  underlyingToken0: Pick<Token, 'decimals'>;
  underlyingToken1: Pick<Token, 'decimals'>;
  sharesToken: Pick<Token, 'decimals'>;
  harvests: Array<HarvestDataFragment>;
}): PreparedVaultHarvest[] {
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

const getVaultHistoricPrices = async (
  chain: ChainId,
  vault_address: string,
  period: Period,
  since: string
) => {
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
    return undefined;
  }

  if (!vault.snapshots?.length) {
    return [];
  }

  const token1 = vault.underlyingToken1;

  return vault.snapshots.map(snapshot => ({
    t: parseInt(snapshot.roundedTimestamp),
    min: interpretAsDecimal(snapshot.priceRangeMin1, token1.decimals),
    v: interpretAsDecimal(snapshot.priceOfToken0InToken1, token1.decimals),
    max: interpretAsDecimal(snapshot.priceRangeMax1, token1.decimals),
  }));
};

const getVaultHistoricPricesRange = async (
  chain: ChainId,
  vault_address: string,
  period: Period
) => {
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
    min: parseInt(vault.minSnapshot?.[0]?.roundedTimestamp || 0),
    max: parseInt(vault.maxSnapshot?.[0]?.roundedTimestamp || 0),
  };
};

const getVaultInvestors = async (chain: ChainId, vault_address: string) => {
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
