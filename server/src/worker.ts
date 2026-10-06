import { createApp } from './app';
import type { Env } from './env';

const app = createApp((c) => (c.env ?? {}) as Env);
export default { fetch: app.fetch };
