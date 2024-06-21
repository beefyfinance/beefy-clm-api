import type { FastifyInstance, FastifyPluginOptions, FastifySchema } from 'fastify';
import S from 'fluent-json-schema';
import type { ChainId } from '../../config/chains';
import { getAsyncCache } from '../../utils/async-lock';
import { type SdkContext, getAllSdks } from '../../utils/sdk';

export default async function (
  instance: FastifyInstance,
  _opts: FastifyPluginOptions,
  done: (err?: Error) => void
) {
  const asyncCache = getAsyncCache();

  // status endpoint
  {
    const responseSchema = S.object();

    const schema: FastifySchema = {
      tags: ['status'],
      response: {
        200: responseSchema,
      },
    };

    instance.get('/', { schema }, async (_, reply) => {
      const res = await asyncCache.wrap('status', 60 * 1000, async () => {
        return await getStatus();
      });
      reply.send(res);
    });
  }

  done();
}

type EndpointStatus = {
  subgraph: SdkContext['subgraph'];
  tag: SdkContext['tag'];
  blockNumber: number | null;
  timestamp: number | null;
  hasErrors: boolean;
};

type Status = Partial<Record<ChainId, EndpointStatus[]>>;

async function getStatus(): Promise<Status> {
  const sdks = getAllSdks();
  const results = await Promise.all(
    sdks.map(async sdk => {
      return await sdk.Status();
    })
  );

  return results
    .map((res): EndpointStatus & { chain: ChainId } => ({
      chain: res.chain,
      subgraph: res.subgraph,
      tag: res.tag,
      blockNumber: res.data._meta?.block.number || null,
      timestamp: res.data._meta?.block.timestamp || null,
      hasErrors: res.data._meta?.hasIndexingErrors || false,
    }))
    .reduce((acc, { chain, ...rest }) => {
      acc[chain] = [...(acc[chain] || []), rest];
      return acc;
    }, {} as Status);
}
