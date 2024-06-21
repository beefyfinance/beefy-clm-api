import FastifySwagger from '@fastify/swagger';
import FastifySwaggerUI from '@fastify/swagger-ui';
import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { API_ENV } from '../config/env';
import V1 from './v1';

const versionRegex = new RegExp(/^\/api\/(v[1-9]*[0-9])\//g);

export default async function (
  instance: FastifyInstance,
  _opts: FastifyPluginOptions,
  done: (err?: Error) => void
) {
  instance
    .register(FastifySwagger, {
      openapi: {
        info: {
          title: 'API',
          version: '1.0.0',
        },
      },
      transform: ({ schema, url }) => {
        const match = versionRegex.exec(url);
        const version = match?.[1] || 'v1';
        return {
          schema: {
            ...schema,
            tags: schema.tags ? schema.tags.map(t => `${version}/${t}`) : [version],
          },
          url,
        };
      },
    })
    .register(FastifySwaggerUI, {
      uiConfig: {
        deepLinking: false,
      },
      staticCSP: API_ENV === 'production',
    })
    .get('/openapi.json', { config: { rateLimit: false } }, (_req, reply) => {
      reply.send(instance.swagger());
    })
    .register(V1, { prefix: '/v1' });
  done();
}
