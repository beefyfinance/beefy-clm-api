import { FastifyInstance, FastifyPluginOptions, FastifySchema } from 'fastify';
import S from 'fluent-json-schema';
import { ChainId, getChainIdsByProvider } from '../../config/chains';
import { chainSchema } from '../../schema/chain';
import { bigintSchema } from '../../schema/bigint';
import { addressSchema } from '../../schema/address';
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
              S.array().items(S.object().prop('vault', addressSchema).prop('balance', bigintSchema))
            )
        )
      )
      .prop(
        'meta',
        S.object()
          .prop('chainId', chainSchema)
          .prop('block', S.object().prop('number', bigintSchema).prop('timestamp', bigintSchema))
          .prop('token', addressSchema)
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

      const validChainIds = getChainIdsByProvider('etherfi');
      const chainId = validChainIds.find(c => c === chain);
      if (!chainId) {
        reply.code(404).send({
          error: 'Chain not supported for provider',
          validChains: validChainIds,
        });
        return;
      }

      const result = await getBalances(chainId, BigInt(block));
      reply.send(result);
    });
  }

  done();
}

const sdk = getBuiltGraphSDK();
const getBalances = async (chain: ChainId, blockNumber: bigint) => {
  const res = await sdk.TokenBreakdownBalancesBySymbol(
    {
      block_number: Number(blockNumber),
      token_symbol: 'weETH',
    },
    { chain }
  );

  if (!res._meta) {
    throw new Error('No meta found');
  }
  if (BigInt(res._meta.block.number) < blockNumber) {
    throw new Error('Block not indexed yet. latest indexed block: ' + res._meta.block.number);
  }

  if (!res.tokens.length) {
    throw new Error('No tokens found');
  } else if (res.tokens.length > 1) {
    throw new Error('Multiple tokens found');
  }

  const token = res.tokens[0];
  const balances = token.investorPositionBalanceBreakdowns
    .map(b => ({
      address: b.investorPosition.investor.investor_address,
      vault_address: b.investorPosition.vault.vault_address,
      effective_balance: BigInt(b.effective_balance),
      updated_at_block: b.lastUpdateBlock,
      updated_at_timestamp: b.lastUpdateTimestamp,
    }))
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
        vault: b.vault_address,
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
    (acc, b) => (b.updated_at_block < acc ? b.updated_at_block : acc),
    { number: balances[0].updated_at_block, timestamp: balances[0].updated_at_timestamp }
  );

  return {
    result,
    meta: {
      providerId: 'etherfi',
      chainId: chain,
      block: minBlock,
      token: token.token_address,
    },
  };
};
