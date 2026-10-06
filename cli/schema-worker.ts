import { parentPort, workerData } from 'node:worker_threads';
import { validateResponseSchema } from '../src/utils/responseSchema';

const { schema, body } = workerData as { schema: string; body: string };
parentPort!.postMessage({ ready: true });
parentPort!.postMessage({ result: validateResponseSchema(schema, body) });
