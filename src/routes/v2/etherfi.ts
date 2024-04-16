import { FastifyInstance, FastifyPluginOptions, FastifySchema } from 'fastify';
import S from 'fluent-json-schema';
import { ChainId, getChainsByProvider } from '../../config/chains';
import { chainSchema } from '../../schema/chain';
import { bigintSchema } from '../../schema/bigint';
import { addressSchema } from '../../schema/address';
import { ProviderId } from '../../config/providers';
import { getBuiltGraphSDK } from '../../../.graphclient';

export default async function (
  instance: FastifyInstance,
  _opts: FastifyPluginOptions,
  done: (err?: Error) => void
) {
  // balance endpoint
  {
    type UrlParams = {
      chain: ChainId;
      block: string;
    };

    const urlParamsSchema = S.object()
      .prop('chain', chainSchema.required().description('Chain to query balances for'))
      .prop('block', bigintSchema.required().description('Block number to query balances at'));

    const responseSchema = S.object()
      .prop(
        'result',
        S.array().items(
          S.object()
            .prop('address', addressSchema)
            .prop('effective_balance', bigintSchema)
            .prop(
              'detail',
              S.array().items(
                S.object()
                  .prop('vault', addressSchema)
                  .prop('balance', bigintSchema)
                  .prop('token', addressSchema)
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
            S.array().items(S.object().prop('id', S.string()).prop('total', bigintSchema))
          )
      );

    const schema: FastifySchema = {
      params: urlParamsSchema,
      response: {
        200: responseSchema,
      },
    };

    instance.get<{ Params: UrlParams }>('/:chain/:block', { schema }, async (request, reply) => {
      const { chain, block } = request.params;

      const providerId: ProviderId = 'etherfi';
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
    });
  }

  done();
}

const sdk = getBuiltGraphSDK();
const getBalances = async (chain: ChainId, symbols: string[], blockNumber: bigint) => {
  const res = await sdk.TokenBreakdownBalancesBySymbol(
    {
      block_number: Number(blockNumber),
      token_symbols: symbols,
    },
    { chain }
  );

  const balances = res.tokens
    .flatMap(token =>
      token.investorPositionBalanceBreakdowns.map(b => ({
        address: b.investorPosition.investor.investor_address,
        vault_id: b.investorPosition.vault.vaultId,
        effective_balance: BigInt(b.effective_balance),
        updated_at_block: BigInt(b.lastUpdateBlock),
        updated_at_timestamp: BigInt(b.lastUpdateTimestamp),
      }))
    )
    .filter(b => b.effective_balance > 0);
  if (!balances.length) {
    throw new Error('No balances found');
  }

  const balancesAgg = balances.reduce(
    (acc, b) => {
      if (!acc[b.address]) {
        acc[b.address] = { effective_balance: 0n, detail: [] };
      }
      acc[b.address].effective_balance += b.effective_balance;
      acc[b.address].detail.push({
        vault: b.vault_id,
        balance: b.effective_balance,
      });
      return acc;
    },
    {} as Record<
      string,
      { effective_balance: bigint; detail: { vault: string; balance: bigint }[] }
    >
  );
  const result = Object.entries(balancesAgg).map(([address, agg]) => ({ address, ...agg }));
  const minBlock = balances.reduce(
    (acc, b) =>
      b.updated_at_block < acc.number
        ? { number: b.updated_at_block, timestamp: b.updated_at_timestamp }
        : acc,
    { number: balances[0].updated_at_block, timestamp: balances[0].updated_at_timestamp }
  );

  return {
    result,
    meta: {
      chainId: chain,
      block: minBlock,
    },
  };
};
