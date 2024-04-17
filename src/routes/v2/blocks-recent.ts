import { FastifyInstance, FastifyPluginOptions, FastifySchema } from 'fastify';
import S from 'fluent-json-schema';
import { ChainId, getChainsByProvider } from '../../config/chains';
import { chainSchema } from '../../schema/chain';
import { bigintSchema } from '../../schema/bigint';
import { addressSchema } from '../../schema/address';
import { ProviderId } from '../../config/providers';
import { GraphQueryError } from '../../utils/error';
import { providerSchema } from '../../schema/provider';
import { sdk } from './sdk';
import { getLatestUpdates } from './blocks-latest';
import { omit } from 'lodash';

export default async function (
  instance: FastifyInstance,
  _opts: FastifyPluginOptions,
  done: (err?: Error) => void
) {
  // blocks/recent endpoint
  {
    type UrlParams = {
      providerId: ProviderId;
      chain: ChainId;
      block: string;
    };

    const urlParamsSchema = S.object()
      .prop('providerId', providerSchema.required().description('LRT provider'))
      .prop('chain', chainSchema.required().description('Chain to query'))
      .prop(
        'block',
        bigintSchema.required().description('Query 10 most recent updates up to this block number')
      );

    const responseSchema = S.object().prop(
      'result',
      S.array().items(
        S.object()
          .prop('id', S.string())
          .prop('address', addressSchema)
          .prop(
            'token',
            S.object()
              .prop('address', addressSchema)
              .prop('symbol', S.string())
              .prop('decimals', bigintSchema)
          )
          .prop(
            'blocks',
            S.array().items(S.object().prop('number', bigintSchema).prop('timestamp', bigintSchema))
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

        const result = await getRecentUpdates(chainConfig.id, symbols, BigInt(block));

        reply.send({ result });
      }
    );
  }

  done();
}

export const getRecentUpdates = async (chain: ChainId, symbols: string[], blockNumber: bigint) => {
  const vaults = await getLatestUpdates(chain, symbols);

  const res = await sdk
    .RecentVaultBreakdownsByVault(
      {
        vault_addresses: vaults.map(v => v.address),
        block_number: blockNumber.toString(),
      },
      { chainName: chain }
    )
    .catch((e: unknown) => {
      // we have nothing to leak here
      throw new GraphQueryError(e);
    });

  return vaults.map(vault => ({
    ...omit(vault, 'latest_block'),
    blocks: res.beefyVaults
      .filter(v => v.address === vault.address)
      .flatMap(v =>
        v.underlyingTokenBalanceBreakdownUpdateEvents.map(b => ({
          number: BigInt(b.blockNumber),
          timestamp: BigInt(b.blockTimestamp),
        }))
      ),
  }));
};
