import { FastifyInstance, FastifyPluginOptions, FastifySchema } from 'fastify';
import S from 'fluent-json-schema';
import { allChainIds } from '../../config/chains';
import { addressSchema } from '../../schema/address';
import { GraphQueryError } from '../../utils/error';
import { sdk } from '../../utils/sdk';

export default async function (
  instance: FastifyInstance,
  _opts: FastifyPluginOptions,
  done: (err?: Error) => void
) {
  // balances endpoint
  {
    type UrlParams = {
      vault_address: string;
    };

    const urlParamsSchema = S.object().prop(
      'vault_address',
      addressSchema.required().description('The vault contract address')
    );

    const responseSchema = S.array().items(S.object());

    const schema: FastifySchema = {
      tags: ['v1'],
      params: urlParamsSchema,
      response: {
        200: responseSchema,
      },
    };

    instance.get<{ Params: UrlParams }>(
      '/:vault_address/prices',
      { schema },
      async (request, reply) => {
        const { vault_address } = request.params;
        const result = await getVaultPrices(vault_address);
        reply.send(result);
      }
    );
  }

  done();
}

const getVaultPrices = async (vault_address: string) => {
  const res = await Promise.all(
    allChainIds.map(chain =>
      sdk
        .VaultPrices(
          {
            vault_address,
          },
          { chainName: chain }
        )
        .catch((e: unknown) => {
          // we have nothing to leak here
          throw new GraphQueryError(e);
        })
        .then(res => ({ chain, ...res }))
    )
  );

  return res;
};
