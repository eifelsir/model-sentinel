import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { validateConfig } from './config.mjs';
import { runPrompt } from './api.mjs';
import { evaluateSafely } from './answer.mjs';
import { boundedHistory, recoverHistory } from './store.mjs';
import { normalizeUsage } from './usage.mjs';
import { roundStatus } from './round.mjs';
import { needsModelJudge, modelJudgement, judgeWithModel } from './model-judge.mjs';

export class Engine extends EventEmitter {
  constructor({ config, history = [], request = runPrompt, judge = evaluateSafely, persist = () => {} }) {
    super();
    this.config = validateConfig(config);
    this.knownSecrets = new Set(this.config.connections.map(connection => connection.apiKey).filter(Boolean));
    this.history = boundedHistory(recoverHistory(structuredClone(history)));
    this.request = request; this.judge = judge; this.persist = persist;
    this.active = new Map(); this.queue = []; this.inFlight = 0; this.nextRuns = {};
    this.persistence = Promise.resolve(); this.closed = false; this.timer = null;
    if (this.config.settings.autoRun) queueMicrotask(() => { if (!this.closed && this.config.settings.autoRun) void this.run().catch(() => {}); });
  }
  snapshot() {
    return structuredClone({ config: this.config, history: this.history, activeTargetIds: [...this.active.keys()], nextRuns: this.nextRuns });
  }
  save() {
    const config = structuredClone(this.config), history = structuredClone(this.history);
    const operation = this.persistence.then(() => this.persist(config, history));
    this.persistence = operation.catch(() => { this.emit('persistenceError', new Error('Unable to persist monitoring state')); });
    return operation;
  }
  change() { this.emit('change', this.snapshot()); }
  updateConfig(config) {
    if (this.closed) return;
    this.config = validateConfig(config);
    for (const connection of this.config.connections) if (connection.apiKey) this.knownSecrets.add(connection.apiKey);
    for (const id of Object.keys(this.nextRuns)) {
      if (!this.config.settings.autoRun || !this.config.targets.some(t => t.id === id && t.enabled)) delete this.nextRuns[id];
    }
    if (this.config.settings.autoRun) {
      for (const target of this.config.targets.filter(t => t.enabled && !this.active.has(t.id))) {
        this.nextRuns[target.id] ||= new Date(Date.now() + target.intervalMinutes * 60000).toISOString();
      }
    }
    void this.save().catch(() => {}); this.pump(); this.schedule(); this.change();
  }
  run(targetIds) {
    if (this.closed) return Promise.resolve();
    const selected = targetIds ? new Set(targetIds) : null;
    const contexts = [];
    for (const target of this.config.targets) {
      if ((selected ? !selected.has(target.id) : !target.enabled) || this.active.has(target.id)) continue;
      const connection = this.config.connections.find(c => c.id === target.connectionId);
      const tests = target.promptIds.map(id => this.config.prompts.find(p => p.id === id));
      const round = {
        id: randomUUID(), targetId: target.id, connectionName: connection.name,
        model: target.model, protocol: target.protocol || connection.protocol, status: 'detecting',
        bypassCache: this.config.settings.bypassCache,
        startedAt: new Date().toISOString(), completedAt: null,
        results: tests.map(p => ({ promptId: p.id, promptName: p.name, type: p.type, prompt: p.prompt, expected: p.expected, status: 'detecting', answer: '', reason: '', text: '', html: '', usage: null, elapsedMs: 0 })),
      };
      let resolve, reject;
      const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
      const judgeId = this.config.settings.answerJudgeTargetId;
      const judgeTarget = judgeId === '@current' ? target : this.config.targets.find(t => t.id === judgeId);
      const judgeConnection = judgeTarget && this.config.connections.find(c => c.id === judgeTarget.connectionId);
      const modelJudge = judgeTarget && judgeConnection ? structuredClone({ target: judgeTarget, connection: judgeConnection }) : null;
      const context = { target: structuredClone(target), connection: structuredClone(connection), tests: structuredClone(tests), modelJudge, round, controller: new AbortController(), remaining: tests.length, promise, resolve, reject };
      // Register every target before starting any asynchronous request.
      this.active.set(target.id, context);
      delete this.nextRuns[target.id];
      this.history.unshift(round); contexts.push(context);
      tests.forEach((_test, index) => this.queue.push({ context, index }));
    }
    if (!contexts.length) return Promise.resolve();
    this.history = boundedHistory(this.history);
    // Keep contexts attached to the same objects after bounding historic response sizes.
    for (const context of this.active.values()) context.round = this.history.find(r => r.id === context.round.id) || context.round;
    void this.save().catch(() => {}); this.change(); this.pump(); this.schedule();
    for (const context of contexts.filter(c => c.tests.length === 0)) {
      context.round.results.push({ promptId: '', promptName: '', prompt: '', expected: '', status: 'detecting', answer: '', reason: '', text: '', elapsedMs: 0 });
      context.remaining = 1;
      this.finishJob({ context, index: 0 }, { status: 'insufficient', answer: '', reason: 'No prompts configured', text: '', elapsedMs: 0 });
    }
    return Promise.all(contexts.map(c => c.promise)).then(() => undefined);
  }
  pump() {
    while (!this.closed && this.inFlight < this.config.settings.concurrency && this.queue.length) {
      const textIndex = this.queue.findIndex(job => job.context.tests[job.index].type !== 'html');
      const [job] = this.queue.splice(textIndex < 0 ? 0 : textIndex, 1);
      if (job.context.controller.signal.aborted) { this.finishJob(job, { status: 'insufficient', reason: 'Request cancelled', answer: '', text: '', elapsedMs: 0 }); continue; }
      this.inFlight++;
      void this.execute(job).finally(() => { this.inFlight--; this.pump(); });
    }
  }
  async execute(job) {
    const { context, index } = job;
    const started = Date.now();
    const timeout = AbortSignal.timeout(Math.max(1, Math.round(context.target.timeoutSeconds * 1000)));
    const signal = AbortSignal.any([context.controller.signal, timeout]);
    let result = { status: 'insufficient', answer: '', reason: 'Request failed', text: '', usage: null, elapsedMs: 0 };
    let abortListener;
    try {
      const cancelled = new Promise((_, reject) => {
        abortListener = () => reject(new Error('cancelled'));
        signal.addEventListener('abort', abortListener, { once: true });
        if (signal.aborted) abortListener();
      });
      const response = await Promise.race([this.request(context.connection, context.target, context.tests[index], { signal, bypassCache: context.round.bypassCache }), cancelled]);
      const fullText = typeof response?.text === 'string' ? response.text : '';
      const text = fullText.slice(0, 65536);
      result.text = text;
      result.usage = normalizeUsage(response?.usage, context.round.protocol);
      if (signal.aborted) throw new Error('cancelled');
      let judged = response?.incomplete ? { status: 'insufficient', answer: '', reason: response.reason || 'Response did not complete' } : await Promise.race([this.judge(fullText, context.tests[index]), cancelled]);
      if (!response?.incomplete && context.modelJudge && needsModelJudge(judged, context.tests[index])) {
        result.judgement = modelJudgement({ ...context.modelJudge, localReason: judged.reason });
        const secrets = [...this.knownSecrets].sort((a, b) => b.length - a.length);
        const redact = value => secrets.reduce((safe, key) => safe.split(key).join('[REDACTED]'), value);
        judged = await Promise.race([judgeWithModel({
          ...context.modelJudge, text: redact(fullText), test: { ...context.tests[index], prompt: redact(context.tests[index].prompt) },
          request: this.request, signal, localReason: judged.reason, bypassCache: context.round.bypassCache,
        }), cancelled]);
      }
      if (signal.aborted) throw new Error('cancelled');
      if (!judged || !['normal', 'degraded', 'insufficient', 'generated'].includes(judged.status)) throw new Error('Invalid judge result');
      result = { ...result, status: judged.status, answer: String(judged.answer || '').slice(0, 10000), reason: String(judged.reason || '').slice(0, 2000), text, html: judged.html || '', ...(judged.judgement ? { judgement: judged.judgement } : {}), elapsedMs: 0 };
    } catch {
      result.reason = signal.aborted ? (timeout.aborted && !context.controller.signal.aborted ? 'Request timed out' : 'Request cancelled') : 'Request or answer evaluation failed';
    } finally {
      signal.removeEventListener('abort', abortListener);
      result.elapsedMs = Date.now() - started;
      this.finishJob(job, result);
    }
  }
  finishJob({ context, index }, result) {
    if (context.round.results[index].status !== 'detecting') return;
    context.round.results[index] = { ...context.round.results[index], ...result };
    context.remaining--;
    context.round.status = roundStatus(context.round.results);
    const text = context.round.results.filter(r => r.type !== 'html');
    if (text.length && text.every(r => r.status !== 'detecting')) context.round.textCompletedAt ||= new Date().toISOString();
    if (context.remaining) { void this.save().catch(() => {}); this.change(); return; }
    context.round.completedAt = new Date().toISOString();
    const current = this.config.targets.find(t => t.id === context.target.id && t.enabled);
    if (!this.closed && this.config.settings.autoRun && current) this.nextRuns[current.id] = new Date(Date.now() + current.intervalMinutes * 60000).toISOString();
    this.history = boundedHistory(this.history);
    const completion = this.save();
    this.active.delete(context.target.id); this.schedule(); this.change();
    completion.then(context.resolve, context.reject);
  }
  stop(targetId) {
    if (!targetId) { this.config.settings.autoRun = false; this.nextRuns = {}; clearTimeout(this.timer); }
    this.cancelActive(targetId);
    void this.save().catch(() => {}); this.change();
  }
  cancelActive(targetId) {
    for (const context of this.active.values()) if (!targetId || context.target.id === targetId) context.controller.abort();
    const cancelled = this.queue.filter(job => job.context.controller.signal.aborted);
    this.queue = this.queue.filter(job => !job.context.controller.signal.aborted);
    for (const job of cancelled) this.finishJob(job, { status: 'insufficient', answer: '', reason: 'Request cancelled before execution', text: '', elapsedMs: 0 });
  }
  setAuto(enabled) {
    if (this.closed) return;
    this.config.settings.autoRun = Boolean(enabled);
    if (enabled) void this.run().catch(() => {});
    else { this.nextRuns = {}; clearTimeout(this.timer); }
    void this.save().catch(() => {}); this.change(); this.schedule();
  }
  schedule() {
    clearTimeout(this.timer);
    if (this.closed || !this.config.settings.autoRun) return;
    const times = Object.values(this.nextRuns).map(Date.parse);
    if (!times.length) return;
    this.timer = setTimeout(() => {
      const due = Object.entries(this.nextRuns).filter(([, time]) => Date.parse(time) <= Date.now()).map(([id]) => id);
      void this.run(due).catch(() => {});
      this.schedule();
    }, Math.max(1, Math.min(2147483647, Math.min(...times) - Date.now())));
    this.timer.unref?.();
  }
  async close() {
    if (this.closed) return this.persistence;
    const pending = [...this.active.values()].map(c => c.promise);
    this.closed = true; this.nextRuns = {}; clearTimeout(this.timer);
    this.cancelActive();
    await Promise.allSettled(pending);
    await this.save(); await this.persistence; this.change();
  }
}
