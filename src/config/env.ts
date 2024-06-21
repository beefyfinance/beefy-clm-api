import { getLogLevelEnv, getNumberEnv } from '../utils/env';

export const API_ENV: string = process.env.API_ENV || 'production';
export const API_PORT: number = getNumberEnv('PORT', 4000);
export const API_CORS_ORIGIN: RegExp = new RegExp(
  process.env.API_CORS_ORIGIN ||
    '^(https:\\/\\/app\\.beefy\\.(com|finance)|http:\\/\\/localhost(:[0-9]+)?|http:\\/\\/127.0.0.1(:[0-9]+)?)$'
);
export const API_RATE_LIMIT = getNumberEnv('API_RATE_LIMIT', 60); // per minute
export const LOG_LEVEL = getLogLevelEnv('LOG_LEVEL', 'info');
