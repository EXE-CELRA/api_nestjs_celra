import { SetMetadata } from '@nestjs/common';

export interface RateLimitOptions {
  limit: number;
  ttlMs: number;
}

export const RATE_LIMIT_KEY = 'celra_rate_limit_options';
export const SKIP_RATE_LIMIT_KEY = 'celra_skip_rate_limit';

export const RateLimit = (options: RateLimitOptions) =>
  SetMetadata(RATE_LIMIT_KEY, options);

export const SkipRateLimit = () => SetMetadata(SKIP_RATE_LIMIT_KEY, true);
