export function fromUnixTime(unixTime: number | string): Date {
  const seconds: number = typeof unixTime === 'string' ? Number.parseInt(unixTime, 10) : unixTime;
  return new Date(seconds * 1000);
}

export function getUnixTime(date: Date): number {
  return Math.trunc(date.getTime() / 1000);
}
