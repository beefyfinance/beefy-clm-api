import type { FastifyInstance, FastifyPluginOptions, FastifySchema } from 'fastify';
import { S } from 'fluent-json-schema';
import { addressSchema } from '../schema/address.js';
import { type ChainId, getChainOrUndefined } from '../config/chains.js';
import { bigintSchema } from '../schema/bigint.js';
import { getRpcClient } from '../utils/rpc.js';
import { providerSchema } from '../schema/provider.js';
import { chainSchema } from '../schema/chain.js';
import { type ProviderId } from '../config/providers.js';
import { getVaults } from '../utils/vaults.js';
import { processProvider } from '../providers/index.js';

export type BalanceQueryString = {
  users?: string[];
};

const balanceQueryString = S.object().prop(
  'users',
  S.array().items(addressSchema).description('User addresses to query, leave blank for all users')
);

type BalanceParams = {
  provider: ProviderId;
  chain: ChainId;
  block: string;
};

const balanceParams = S.object()
  .prop('provider', providerSchema.required().description('LRT provider'))
  .prop('chain', chainSchema.required().description('Chain to query balances for'))
  .prop('block', bigintSchema.required().description('Block number to query balances at'));

const balanceSuccessResponse = S.object()
  .examples([
    {
      result: [
        {
          address: '0x161D61e30284A33Ab1ed227beDcac6014877B3DE',
          effective_balance: '3676225266450398',
        },
        {
          address: '0x562bfF166FC684b94e3386caC1368Ae8a491ad35',
          effective_balance: '45770150040225350',
        },
        {
          address: '0xA582566B600a56Ed7326F9A871592A5809E286d2',
          effective_balance: '133536869968326626681',
        },
      ],
      meta: {
        providerId: 'etherfi',
        chainId: 'ethereum',
        block: { number: '19533016', timestamp: '1711633859' },
        token: '0xCd5fE23C85820F7B72D0926FC9b05b43E359b7ee',
        vaults: ['aura-weeth-ezeth-rseth', 'aura-weeth-reth'],
      },
    },
  ])
  .prop(
    'result',
    S.array().items(
      S.object().prop('address', addressSchema).prop('effective_balance', bigintSchema)
    )
  )
  .prop(
    'meta',
    S.object()
      .prop('chainId', chainSchema)
      .prop('providerId', providerSchema)
      .prop('block', S.object().prop('number', bigintSchema).prop('timestamp', bigintSchema))
      .prop('token', addressSchema)
      .prop('vaults', S.array().items(S.string()))
  );

export const balanceSchema: FastifySchema = {
  querystring: balanceQueryString,
  params: balanceParams,
  response: {
    200: balanceSuccessResponse,
  },
};

type BalanceRoute = { Querystring: BalanceQueryString; Params: BalanceParams };

export default async function (
  instance: FastifyInstance,
  _opts: FastifyPluginOptions,
  done: (err?: Error) => void
) {
  instance.get<BalanceRoute>(
    '/:provider/:chain/:block',
    { schema: balanceSchema },
    async (request, reply) => {
      const chain = getChainOrUndefined(request.params.chain);
      if (!chain) {
        reply.status(404);
        return { error: 'Chain not found' };
      }

      const provider = chain.providers[request.params.provider];
      if (!provider) {
        reply.status(404);
        return { error: 'Provider not found' };
      }

      const publicClient = getRpcClient(chain.id);
      const block = await publicClient.getBlock({
        blockNumber: BigInt(request.params.block),
        includeTransactions: false,
      });

      const vaults = await getVaults(chain.id);
      const balances = await processProvider(
        request.params.provider,
        chain.id,
        publicClient,
        block,
        vaults,
        request.query.users || []
      );

      reply.header('cache-control', 'public, max-age=86400, s-maxage=86400');

      return balances;
    }
  );

  done();
}
