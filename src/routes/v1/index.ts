import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import investor from './investor';
import status from './status';
import vault from './vault';
import vaults from './vaults';

export default async function (
  instance: FastifyInstance,
  _opts: FastifyPluginOptions,
  done: (err?: Error) => void
) {
  instance.register(status, { prefix: '/status' });
  instance.register(investor, { prefix: '/investor' });
  instance.register(vault, { prefix: '/vault' });
  instance.register(vaults, { prefix: '/vaults' });
  done();
}
