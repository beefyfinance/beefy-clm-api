import { FastifyInstance, FastifyPluginOptions, FastifySchema } from 'fastify';
import S from 'fluent-json-schema';
import { ChainId } from '../../config/chains';
import { addressSchema } from '../../schema/address';
import { GraphQueryError } from '../../utils/error';
import { sdk } from '../../utils/sdk';
import { getPeriodSeconds, Period, periodSchema } from '../../schema/period';
import { chainSchema } from '../../schema/chain';
import { bigintSchema } from '../../schema/bigint';
import { interpretAsDecimal } from '../../utils/decimal';
import { BeefyCLVaultHarvestEvent, Token } from '../../../.graphclient';

export default async function (
  instance: FastifyInstance,
  _opts: FastifyPluginOptions,
  done: (err?: Error) => void
) {
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
      tags: ['v1'],
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
        const result = await getVaultPrice(chain, vault_address);
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
      tags: ['v1'],
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
        const result = await getVaultHarvests(chain, vault_address);
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
      tags: ['v1'],
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
        const result = await getVaultHistoricPrices(chain, vault_address, period, since);
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
      tags: ['v1'],
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
        const result = await getVaultHistoricPricesRange(chain, vault_address, period);
        if (result === undefined) {
          reply.status(404);
          reply.send({ error: 'Vault not found' });
          return;
        }
        reply.send(result);
      }
    );
  }

  done();
}

const getVaultPrice = async (chain: ChainId, vault_address: string) => {
  const res = await sdk
    .VaultPrice(
      {
        vault_address,
      },
      { chainName: chain }
    )
    .catch((e: unknown) => {
      // we have nothing to leak here
      throw new GraphQueryError(e);
    });

  const vault = res.clm || res.beefyCLVault;
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
  const res = await sdk
    .VaultHarvests(
      {
        vault_address,
      },
      { chainName: chain }
    )
    .catch((e: unknown) => {
      // we have nothing to leak here
      throw new GraphQueryError(e);
    });

  const vault = res.clm || res.beefyCLVault;
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
  harvests: Array<
    Pick<
      BeefyCLVaultHarvestEvent,
      | 'timestamp'
      | 'compoundedAmount0'
      | 'compoundedAmount1'
      | 'token0ToNativePrice'
      | 'token1ToNativePrice'
      | 'nativeToUSDPrice'
      | 'totalSupply'
    >
  >;
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
  const res = await sdk
    .VaultHistoricPrices(
      {
        vault_address,
        period: getPeriodSeconds(period),
        since,
      },
      { chainName: chain }
    )
    .catch((e: unknown) => {
      // we have nothing to leak here
      throw new GraphQueryError(e);
    });

  const vault = res.clm || res.beefyCLVault;
  if (!vault) {
    return undefined;
  }

  if (!vault.snapshots?.length) {
    return [];
  }

  return vault.snapshots.map(snapshot => ({
    t: parseInt(snapshot.roundedTimestamp),
    min: snapshot.priceRangeMin1,
    v: snapshot.priceOfToken0InToken1,
    max: snapshot.priceRangeMax1,
  }));
};

const getVaultHistoricPricesRange = async (
  chain: ChainId,
  vault_address: string,
  period: Period
) => {
  const res = await sdk
    .VaultHistoricPricesRange(
      {
        vault_address,
        period: getPeriodSeconds(period),
      },
      { chainName: chain }
    )
    .catch((e: unknown) => {
      // we have nothing to leak here
      throw new GraphQueryError(e);
    });

  const vault = res.clm || res.beefyCLVault;
  if (!vault) {
    return undefined;
  }

  return {
    min: parseInt(vault.minSnapshot?.[0]?.roundedTimestamp || 0),
    max: parseInt(vault.maxSnapshot?.[0]?.roundedTimestamp || 0),
  };
};
