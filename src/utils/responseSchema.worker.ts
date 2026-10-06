import { validateResponseSchema } from './responseSchema';

self.onmessage = (event: MessageEvent<{ schema: string; body: string }>) => {
  self.postMessage({ type: 'result', result: validateResponseSchema(event.data.schema, event.data.body) });
};
self.postMessage({ type: 'ready' });
