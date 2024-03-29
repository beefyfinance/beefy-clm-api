import type { FastifyInstance, FastifyPluginOptions, FastifyReply, FastifySchema } from 'fastify';
import { S } from 'fluent-json-schema';
import { addressSchema } from '../schema/address.js';
import { type ChainId, getChainOrUndefined } from '../config/chains.js';
import { bigintSchema } from '../schema/bigint.js';
import { getRpcClient } from '../utils/rpc.js';
import { providerSchema } from '../schema/provider.js';
import { chainSchema } from '../schema/chain.js';
import { type ProviderId } from '../config/providers.js';
import { getVaults, type Vault } from '../utils/vaults.js';
import { processProvider } from '../providers/index.js';

export type BalancesQueryString = {
  users?: string[];
};

const balancesQueryString = S.object().prop(
  'users',
  S.array().items(addressSchema).description('User addresses to query, leave blank for all users')
);

type AllBalancesParams = {
  provider: ProviderId;
  chain: ChainId;
  block: string;
};

const allBalancesParams = S.object()
  .prop('provider', providerSchema.required().description('LRT provider'))
  .prop('chain', chainSchema.required().description('Chain to query balances for'))
  .prop('block', bigintSchema.required().description('Block number to query balances at'));

const balancesSuccessResponse = S.object()
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

const allBalancesSchema: FastifySchema = {
  querystring: balancesQueryString,
  params: allBalancesParams,
  response: {
    200: balancesSuccessResponse,
  },
};

type AllBalancesRoute = { Querystring: BalancesQueryString; Params: AllBalancesParams };

type SingleBalancesParams = AllBalancesParams & {
  vault: string;
};

const singleBalancesParams = allBalancesParams.prop(
  'vault',
  S.string().required().description('Vault id to query balances for')
);

const singleBalancesSchema: FastifySchema = {
  querystring: balancesQueryString,
  params: singleBalancesParams,
  response: {
    200: balancesSuccessResponse,
  },
};

type SingleBalancesRoute = { Querystring: BalancesQueryString; Params: SingleBalancesParams };

async function handleBalances(
  reply: FastifyReply,
  chainId: ChainId,
  providerId: ProviderId,
  blockNo: string,
  users: string[],
  vaultsFilter?: ((v: Vault) => boolean) | undefined
) {
  const chain = getChainOrUndefined(chainId);
  if (!chain) {
    reply.status(404);
    return { error: 'Chain not found' };
  }

  const provider = chain.providers[providerId];
  if (!provider) {
    reply.status(404);
    return { error: 'Provider not found' };
  }

  const publicClient = getRpcClient(chain.id);
  const block = await publicClient.getBlock({
    blockNumber: BigInt(blockNo),
    includeTransactions: false,
  });

  let vaults = await getVaults(chain.id);
  if (vaultsFilter) {
    vaults = vaults.filter(vaultsFilter);
  }

  if (vaults.length === 0) {
    reply.status(404);
    return { error: 'Vault not found' };
  }

  const balances = await processProvider(providerId, chain.id, publicClient, block, vaults, users);

  reply.header('cache-control', 'public, max-age=86400, s-maxage=86400');

  return balances;
}

export default async function (
  instance: FastifyInstance,
  _opts: FastifyPluginOptions,
  done: (err?: Error) => void
) {
  instance.get<AllBalancesRoute>(
    '/:provider/:chain/:block',
    { schema: allBalancesSchema },
    async (request, reply) => {
      return handleBalances(
        reply,
        request.params.chain,
        request.params.provider,
        request.params.block,
        request.query.users || []
      );
    }
  );

  instance.get<SingleBalancesRoute>(
    '/:provider/:chain/:block/:vault',
    { schema: singleBalancesSchema },
    async (request, reply) => {
      return handleBalances(
        reply,
        request.params.chain,
        request.params.provider,
        request.params.block,
        request.query.users || [],
        v => v.id === request.params.vault
      );
    }
  );

  done();
}
