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

export default async function (
  instance: FastifyInstance,
  _opts: FastifyPluginOptions,
  done: (err?: Error) => void
) {
  // blocks/latest endpoint
  {
    type UrlParams = {
      providerId: ProviderId;
      chain: ChainId;
    };

    const urlParamsSchema = S.object()
      .prop('providerId', providerSchema.required().description('LRT provider'))
      .prop('chain', chainSchema.required().description('Chain to query'));

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
            'latest_block',
            S.object().prop('number', bigintSchema).prop('timestamp', bigintSchema)
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
      '/:providerId/:chain',
      { schema },
      async (request, reply) => {
        const { providerId, chain } = request.params;
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
        const result = await getLatestUpdates(chainConfig.id, symbols);
        reply.send({ result });
      }
    );
  }

  done();
}

export const getLatestUpdates = async (chain: ChainId, symbols: string[]) => {
  const res = await sdk
    .LatestVaultBreakdownsBySymbol(
      {
        token_symbols: symbols,
      },
      { chainName: chain }
    )
    .catch((e: unknown) => {
      // we have nothing to leak here
      throw new GraphQueryError(e);
    });

  return res.tokens.flatMap(token =>
    token.vaultBalanceBreakdowns.map(b => ({
      id: b.vault.id,
      address: b.vault.address,
      token: {
        address: token.address,
        symbol: token.symbol || '',
        decimals: BigInt(token.decimals),
      },
      latest_block: {
        number: BigInt(b.lastUpdateBlock),
        timestamp: BigInt(b.lastUpdateTimestamp),
      },
    }))
  );
};
