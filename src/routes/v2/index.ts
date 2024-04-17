import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import balances from './balances';
import blocksLatest from './blocks-latest';
import blocksRecent from './blocks-recent';

export default async function (
  instance: FastifyInstance,
  _opts: FastifyPluginOptions,
  done: (err?: Error) => void
) {
  instance.register(balances, { prefix: '/balances' });
  instance.register(blocksLatest, { prefix: '/blocks/latest' });
  instance.register(blocksRecent, { prefix: '/blocks/recent' });
  done();
}
