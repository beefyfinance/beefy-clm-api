import { FastifyInstance, FastifyPluginOptions, FastifySchema } from 'fastify';
import S from 'fluent-json-schema';
import { ChainId, getChainsByProvider } from '../../config/chains';
import { chainSchema } from '../../schema/chain';
import { bigintSchema } from '../../schema/bigint';
import { addressSchema } from '../../schema/address';
import { ProviderId } from '../../config/providers';
import { FriendlyError, GraphQueryError } from '../../utils/error';
import { providerSchema } from '../../schema/provider';
import { sdk } from './sdk';

export default async function (
  instance: FastifyInstance,
  _opts: FastifyPluginOptions,
  done: (err?: Error) => void
) {
  // balances endpoint
  {
    type UrlParams = {
      providerId: ProviderId;
      chain: ChainId;
      block: string;
    };

    const urlParamsSchema = S.object()
      .prop('providerId', providerSchema.required().description('LRT provider'))
      .prop('chain', chainSchema.required().description('Chain to query balances for'))
      .prop('block', bigintSchema.required().description('Block number to query balances at'));

    const responseSchema = S.object()
      .prop(
        'result',
        S.array().items(
          S.object()
            .prop('address', addressSchema)
            .prop('effective_balance', bigintSchema)
            .prop('time_weighted_effective_balance_1h', bigintSchema)
            .prop(
              'detail',
              S.array().items(
                S.object()
                  .prop('vault', addressSchema)
                  .prop('balance', bigintSchema)
                  .prop('token', addressSchema)
                  .prop('time_weighted_balance_1h', bigintSchema)
              )
            )
        )
      )
      .prop(
        'meta',
        S.object()
          .prop('chainId', chainSchema)
          .prop('block', S.object().prop('number', bigintSchema).prop('timestamp', bigintSchema))
          .prop(
            'vaults',
            S.array().items(
              S.object()
                .prop('id', S.string())
                .prop('total', bigintSchema)
                .prop('address', addressSchema)
                .prop('underlying_token_address', addressSchema)
            )
          )
      );

    const schema: FastifySchema = {
      tags: ['v2'],
      params: urlParamsSchema,
      response: {
        200: responseSchema,
      },
    };

    instance.get<{ Params: UrlParams }>(
      '/:providerId/:chain/:block',
      { schema },
      async (request, reply) => {
        const { providerId, chain, block } = request.params;
        const validChains = getChainsByProvider(providerId);
        const chainConfig = validChains.find(c => c.id === chain);
        if (!chainConfig) {
          reply.code(404).send({
            error: 'Chain not supported for provider',
            validChains: validChains.map(c => c.id),
          });
          return;
        }
        const symbols = chainConfig.providers[providerId];
        if (!symbols) {
          reply.code(404).send({
            error: 'Chain not supported for provider',
            validChains: validChains.map(c => c.id),
          });
          return;
        }
        const result = await getBalances(chainConfig.id, symbols, BigInt(block));
        reply.send({ ...result, meta: { ...result.meta, provider: providerId } });
      }
    );
  }

  done();
}

const getBalances = async (chain: ChainId, symbols: string[], blockNumber: bigint) => {
  const res = await sdk
    .TokenBreakdownBalancesBySymbol(
      {
        block_number: Number(blockNumber),
        token_symbols: symbols,
      },
      { chainName: chain }
    )
    .catch((e: unknown) => {
      // we have nothing to leak here
      throw new GraphQueryError(e);
    });

  const balances = res.tokens
    .flatMap(token =>
      token.investorPositionBalanceBreakdowns.map(b => ({
        address: String(b.investorPosition.investor.address),
        vault: b.investorPosition.vault,
        effective_balance: BigInt(b.rawBalance),
        time_weighted_effective_balance_1s: BigInt(b.rawTimeWeightedBalance),
        last_update_block: {
          number: BigInt(b.lastUpdateBlock),
          timestamp: BigInt(b.lastUpdateTimestamp),
        },
        token: {
          address: token.address,
          symbol: String(token.symbol ?? 'UNKNOWN'),
          decimals: BigInt(token.decimals),
        },
      }))
    )
    .filter(b => b.effective_balance > 0 || b.time_weighted_effective_balance_1s > 0);
  if (!balances.length) {
    throw new FriendlyError('No balances found');
  }

  const balancesAgg = balances.reduce(
    (acc, b) => {
      if (!acc[b.address]) {
        acc[b.address] = {
          effective_balance: 0n,
          time_weighted_effective_balance_1s: 0n,
          last_update_block: b.last_update_block,
          detail: [],
        };
      }
      acc[b.address].effective_balance += b.effective_balance;
      acc[b.address].time_weighted_effective_balance_1s += b.time_weighted_effective_balance_1s;
      // last update must be the earliest of all balances
      if (b.last_update_block.number < acc[b.address].last_update_block.number) {
        acc[b.address].last_update_block = b.last_update_block;
      }
      acc[b.address].detail.push({
        vault: b.vault.vaultId,
        balance: b.effective_balance,
      });
      return acc;
    },
    {} as Record<
      string,
      {
        effective_balance: bigint;
        time_weighted_effective_balance_1s: bigint;
        last_update_block: { number: bigint; timestamp: bigint };
        detail: { vault: string; balance: bigint }[];
      }
    >
  );
  const result = Object.entries(balancesAgg).map(([address, agg]) => ({
    address,
    effective_balance: agg.effective_balance,
    last_update_block: agg.last_update_block,
    // transform to 1h for renzo
    time_weighted_effective_balance_1h: agg.time_weighted_effective_balance_1s / (60n * 60n),
    detail: agg.detail,
  }));
  const minLastUpdate = balances.reduce(
    (acc, b) => (b.last_update_block.number < acc.number ? b.last_update_block : acc),
    balances[0].last_update_block
  );
  const vaultsByAddress = balances.reduce(
    (acc, b) => {
      if (!acc[b.vault.address]) {
        acc[b.vault.address] = {
          id: b.vault.vaultId,
          total: result.reduce(
            (sum, r) => (r.detail.find(d => d.vault === b.vault.vaultId)?.balance ?? 0n) + sum,
            0n
          ),
          address: b.vault.address,
          underlying_token_address: b.vault.underlyingToken.address,
        };
      }
      return acc;
    },
    {} as Record<
      string,
      {
        id: string;
        total: bigint;
        address: string;
        underlying_token_address: string;
      }
    >
  );

  return {
    result,
    meta: {
      chainId: chain,
      block: minLastUpdate,
      vaults: Object.values(vaultsByAddress),
    },
  };
};
