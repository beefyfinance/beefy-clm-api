import { pino, type Logger, type LoggerOptions } from 'pino';
import { API_ENV, LOG_LEVEL } from '../config/env';

const loggers: Record<string, Logger> = {};

export function getLoggerOptionsFor(name: string, extraOptions: LoggerOptions = {}) {
  const options: LoggerOptions = {
    name,
    level: LOG_LEVEL,
    ...extraOptions,
  };

  if (API_ENV === 'development') {
    options.transport = {
      target: 'pino-pretty',
    };
  }

  return options;
}

export function getLoggerFor(name: string, extraOptions: LoggerOptions = {}) {
  if (!loggers[name]) {
    loggers[name] = pino(getLoggerOptionsFor(name, extraOptions));
  }

  return loggers[name]!;
}

export const defaultLogger = getLoggerFor('api');
