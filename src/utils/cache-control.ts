declare module 'fastify' {
  interface FastifyContextConfig {
    /** Cache-Control value for successful GET responses (applied in onSend). */
    cacheControl?: string;
  }
}

/** Build a public Cache-Control header for Cloudflare/browser caching. */
export function publicCacheControl(ttlSeconds: number): string {
  return `public, max-age=${ttlSeconds}, s-maxage=${ttlSeconds}`;
}
