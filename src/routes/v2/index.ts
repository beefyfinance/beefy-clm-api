import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import balances from './balances';
import blocks from './blocks';

export default async function (
  instance: FastifyInstance,
  _opts: FastifyPluginOptions,
  done: (err?: Error) => void
) {
  instance.register(balances, { prefix: '/balances' });
  instance.register(blocks, { prefix: '/blocks' });
  done();
}
