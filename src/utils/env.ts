export function getNumberEnv(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (value === undefined || value.length === 0) {
    return defaultValue;
  }

  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || !Number.isFinite(parsed)) {
    return defaultValue;
  }

  return parsed;
}

const VALID_LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'];
export function getLogLevelEnv(key: string, defaultValue: string): string {
  const value = process.env[key];
  if (value === undefined || value.length === 0 || !VALID_LOG_LEVELS.includes(value)) {
    return defaultValue;
  }

  return value;
}

export function getRequiredStringEnv(key: string): string {
  const value = process.env[key];
  if (value === undefined || value.length === 0) {
    throw new Error(`Missing required environment variable: ${key}`);
  }

  return value;
}
