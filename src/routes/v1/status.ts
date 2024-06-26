import { type Static, Type } from '@sinclair/typebox';
import type { FastifyInstance, FastifyPluginOptions, FastifySchema } from 'fastify';
import { type ChainId, chainIdAsKeySchema } from '../../config/chains';
import { timestampNumberSchema } from '../../schema/bigint';
import { getAsyncCache } from '../../utils/async-lock';
import { executeOnAllSdks, sdkContextSchema } from '../../utils/sdk';

export default async function (
  instance: FastifyInstance,
  _opts: FastifyPluginOptions,
  done: (err?: Error) => void
) {
  const asyncCache = getAsyncCache();

  // status endpoint
  {
    const schema: FastifySchema = {
      tags: ['status'],
      response: {
        200: statusSchema,
      },
    };

    instance.get('', { schema }, async (_, reply) => {
      const res = await asyncCache.wrap('status', 60 * 1000, async () => {
        return await getStatus();
      });
      reply.send(res);
    });
  }

  done();
}

const endpointStatusSchema = Type.Object({
  subgraph: sdkContextSchema.properties.subgraph,
  tag: sdkContextSchema.properties.tag,
  blockNumber: Type.Union([Type.Number(), Type.Null()]),
  timestamp: Type.Union([timestampNumberSchema, Type.Null()]),
  hasErrors: Type.Boolean(),
});
type EndpointStatus = Static<typeof endpointStatusSchema>;

const statusSchema = Type.Record(chainIdAsKeySchema, Type.Array(endpointStatusSchema));
type Status = Static<typeof statusSchema>;

async function getStatus(): Promise<Status> {
  const res = await executeOnAllSdks(sdk => sdk.Status());

  return res.results
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
