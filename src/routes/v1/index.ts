import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import investor from './investor';
import vault from './vault';

export default async function (
  instance: FastifyInstance,
  _opts: FastifyPluginOptions,
  done: (err?: Error) => void
) {
  instance.register(investor, { prefix: '/investor' });
  instance.register(vault, { prefix: '/vault' });
  done();
}
