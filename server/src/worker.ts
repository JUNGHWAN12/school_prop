import { createApp } from './app';
import type { Env } from './env';

// Durable Object 클래스는 Worker 모듈에서 export 해야 바인딩된다
export { Limiter } from './quota';

const app = createApp((c) => (c.env ?? {}) as Env);
export default { fetch: app.fetch };
