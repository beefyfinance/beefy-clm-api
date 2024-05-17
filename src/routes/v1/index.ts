import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import investor from './investor';
import vault from './vault';
import chain from './chain';
import vaults from './vaults';

export default async function (
  instance: FastifyInstance,
  _opts: FastifyPluginOptions,
  done: (err?: Error) => void
) {
  instance.register(investor, { prefix: '/investor' });
  instance.register(vault, { prefix: '/vault' });
  instance.register(chain, { prefix: '/chain' });
  instance.register(vaults, { prefix: '/vaults' });
  done();
}
