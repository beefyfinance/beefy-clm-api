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
      investor_address: string;
    };

    const urlParamsSchema = S.object().prop(
      'investor_address',
      addressSchema.required().description('The investor address')
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
      '/:investor_address/timeline',
      { schema },
      async (request, reply) => {
        const { investor_address } = request.params;
        const result = await getTimeline(investor_address);
        reply.send(result);
      }
    );
  }

  done();
}

const getTimeline = async (investor_address: string) => {
  const res = await Promise.all(
    allChainIds.map(chain =>
      sdk
        .InvestorTimeline(
          {
            investor_address,
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

  /*
{
        "datetime": "2023-11-01T12:38:13.000Z",
        "product_key": "beefy:boost:optimism:0xfa6b418801dfc7a33c30686d2673302141c2cbed",
        "display_name": "moo_velodrome-v2-weth-moobifi-beefy",
        "chain": "optimism",
        "is_eol": false,
        "is_dashboard_eol": false,
        "transaction_hash": "0x4097f1b40237efdb78a6e8309b80b8ac0e8081b5cc768dc0629e98c4345856cb",
        "share_to_underlying_price": 1.0081501761190834,
        "underlying_to_usd_price": 1561.1360324756242,
        "share_balance": 4.716812425243712,
        "underlying_balance": 4.755255277230129,
        "usd_balance": 7423.600356903818,
        "share_diff": 4.716812425243712,
        "underlying_diff": 4.755255277230129,
        "usd_diff": 7423.600356903818
    }
*/

  return res;
};
