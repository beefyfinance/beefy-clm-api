export const withTimeout = async <T>(prom: Promise<T>, time: number): Promise<T> => {
  const res = await Promise.race([prom, new Promise((_, reject) => setTimeout(reject, time))]);
  return res as T;
};
