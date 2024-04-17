import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import FastifySwagger from '@fastify/swagger';
import FastifySwaggerUI from '@fastify/swagger-ui';
import { API_ENV } from '../config/env';
import balancesV1 from './v1/balances';
import V2 from './v2';

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
        tags: [
          { name: 'v1', description: 'API v1' },
          { name: 'v2', description: 'API v2' },
        ],
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
    .register(balancesV1, { prefix: '/v1/balances' })
    .register(V2, { prefix: '/v2' });
  done();
}
