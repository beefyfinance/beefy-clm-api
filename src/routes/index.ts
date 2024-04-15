import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import balances from './v1/balances';
import FastifySwagger from '@fastify/swagger';
import FastifySwaggerUI from '@fastify/swagger-ui';
import { API_ENV } from '../config/env';
import etherfi from './v2/etherfi';

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
    .register(balances, { prefix: '/v1/balances' })
    .register(etherfi, { prefix: '/v2/etherfi' });
  done();
}
