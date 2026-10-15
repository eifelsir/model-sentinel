import { parentPort, workerData } from 'node:worker_threads';
import { evaluateRegexInWorker } from './answer.mjs';
parentPort.postMessage(evaluateRegexInWorker(workerData.text, workerData.test));
