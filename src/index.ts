import FastifyCors from '@fastify/cors';
import FastifyEtag from '@fastify/etag';
import FastifyHelmet from '@fastify/helmet';
import FastifyRateLimit from '@fastify/rate-limit';
import FastifyUnderPressure from '@fastify/under-pressure';
import Decimal from 'decimal.js';
import Fastify from 'fastify';
import { API_CORS_ORIGIN, API_ENV, API_PORT, API_RATE_LIMIT } from './config/env';
import routes from './routes/index';
import { allowedToBypassRateLimit } from './utils/auth';
import { FriendlyError } from './utils/error';
import { defaultLogger } from './utils/log';

Decimal.set({
  // make sure we have enough precision
  precision: 50,
  // configure the Decimals lib to format without exponents
  toExpNeg: -250,
  toExpPos: 250,
});

const server = Fastify({
  logger: defaultLogger,
  trustProxy: true,
});

server.register(async (instance, _opts, done) => {
  instance
    .register(FastifyUnderPressure)
    .register(FastifyHelmet, { contentSecurityPolicy: API_ENV === 'production' })
    .register(FastifyRateLimit, {
      global: true,
      timeWindow: '1 minute',
      max: API_RATE_LIMIT,
      continueExceeding: true,
      skipOnError: false,
      enableDraftSpec: true,
      allowList: request => allowedToBypassRateLimit(request.headers.authorization),
      errorResponseBuilder: (_request, context) => ({
        statusCode: 429,
        name: 'RateLimitExceededError',
        error: 'Too Many Requests',
        message: `Rate limit exceeded, retry in ${context.after}`,
      }),
    })
    .register(FastifyEtag)
    .register(FastifyCors, {
      methods: ['GET'],
      origin: API_ENV === 'production' ? API_CORS_ORIGIN : true,
    })
    .setReplySerializer(payload =>
      JSON.stringify(payload, (_key, value) =>
        typeof value === 'bigint' ? value.toString() : value
      )
    )
    .addHook('onSend', async (_req, reply) => {
      if (reply.raw.statusCode !== 200) {
        reply.header('cache-control', 'no-cache, no-store, must-revalidate');
      }
    })
    .setErrorHandler((error, _request, reply) => {
      reply.header('cache-control', 'no-cache, no-store, must-revalidate');
      if ('metaMessages' in error) {
        error.metaMessages = undefined;
      }
      if (API_ENV === 'development') {
        reply.send(error);
      } else {
        defaultLogger.error(error);
        reply.status(error.statusCode || 500);
        if (error instanceof FriendlyError) {
          reply.send({ error: `${error.name}: ${error.message}` });
        } else {
          reply.send({ error: error.name });
        }
      }
    })
    .register(routes, { prefix: '/api' });

  done();
});

server.listen({ port: API_PORT, host: '0.0.0.0' }, err => {
  if (err) {
    defaultLogger.error(err);
    process.exit(1);
  }
});
