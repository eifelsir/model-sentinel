import { mkdir, readFile, open, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { defaultConfig, validateConfig } from './config.mjs';
import { HTML_LIMIT } from './html.mjs';
export function recoverHistory(history) {
  if (!Array.isArray(history)) throw new Error('Invalid stored history');
  return history.map(round => round.status !== 'detecting' ? round : {
    ...round, status: 'insufficient', completedAt: new Date().toISOString(),
    results: (round.results || []).map(result => result.status === 'detecting' ? { ...result, status: 'insufficient', answer: '', reason: 'Interrupted by application restart' } : result),
  });
}
export function boundedHistory(history) {
  const running = history.filter(round => round.status === 'detecting');
  const completed = history.filter(round => round.status !== 'detecting').slice(0, 1000);
  return [...running, ...completed].map(round => round.status === 'detecting' ? round : ({
    ...round, results: (round.results || []).map(result => ({
      ...result, text: String(result.text || '').slice(0, 65536), answer: String(result.answer || '').slice(0, 10000), reason: String(result.reason || '').slice(0, 2000),
      ...(typeof result.html === 'string' ? { html: result.html.length <= HTML_LIMIT ? result.html : '' } : {}),
    })),
  }));
}
export class Store {
  constructor(directory, { encrypt, decrypt } = {}) {
    this.directory = directory; this.path = join(directory, 'state.json');
    this.backupPath = join(directory, 'state.backup.json');
    this.encrypt = encrypt; this.decrypt = decrypt; this.pending = Promise.resolve(); this.corrupt = false;
  }
  async read() {
    let raw;
    try { raw = await readFile(this.path, 'utf8'); }
    catch (error) {
      if (error.code !== 'ENOENT') throw new Error('Unable to read local storage');
      try { raw = await readFile(this.backupPath, 'utf8'); }
      catch (backupError) { if (backupError.code === 'ENOENT') return null; throw new Error('Unable to read local storage backup'); }
    }
    try {
      const value = JSON.parse(raw);
      if (value.version !== 1 || !value.config || !Array.isArray(value.history)) throw new Error();
      const check = structuredClone(value.config);
      if (!Array.isArray(check.connections)) throw new Error();
      for (const connection of check.connections) {
        if (connection.apiKey || (connection.encryptedApiKey != null && typeof connection.encryptedApiKey !== 'string')) throw new Error();
        connection.apiKey = '';
      }
      validateConfig(check);
      return value;
    } catch { this.corrupt = true; throw new Error('Local storage is corrupt; original file was preserved'); }
  }
  async load() {
    await this.pending;
    const data = await this.read();
    if (!data) return { config: defaultConfig(), history: [] };
    try {
      const config = structuredClone(data.config);
      for (const connection of config.connections) {
        if (connection.apiKey) throw new Error();
        connection.apiKey = connection.encryptedApiKey ? this.decryptKey(connection.encryptedApiKey) : '';
        delete connection.encryptedApiKey;
      }
      return { config: validateConfig(config), history: recoverHistory(data.history) };
    } catch { this.corrupt = true; throw new Error('Unable to decrypt or validate local storage; original file was preserved'); }
  }
  decryptKey(value) {
    if (typeof this.decrypt !== 'function') throw new Error('Key decryption is unavailable');
    const result = this.decrypt(value);
    if (typeof result !== 'string') throw new Error('Invalid decrypted key');
    return result;
  }
  save(config, history) {
    const snapshot = { config: structuredClone(config), history: structuredClone(history) };
    const write = async () => {
      if (this.corrupt) throw new Error('Storage write blocked to preserve corrupt data');
      // Also check disk when save is called before the first load.
      await this.read();
      const safe = validateConfig(snapshot.config);
      for (const connection of safe.connections) {
        if (connection.apiKey) {
          if (typeof this.encrypt !== 'function') throw new Error('Key encryption is unavailable');
          let encrypted;
          try { encrypted = this.encrypt(connection.apiKey); }
          catch { throw new Error('Key encryption failed'); }
          if (typeof encrypted !== 'string' || !encrypted || encrypted === connection.apiKey) throw new Error('Key encryption failed');
          connection.encryptedApiKey = encrypted;
        }
        delete connection.apiKey;
      }
      const serialized = JSON.stringify({ version: 1, config: safe, history: boundedHistory(snapshot.history) });
      await mkdir(this.directory, { recursive: true });
      await this.writeAtomically(this.path, serialized);
      await this.writeAtomically(this.backupPath, serialized);
    };
    const job = this.pending.then(write);
    this.pending = job.catch(() => {});
    return job;
  }
  async writeAtomically(destination, serialized) {
    const temporary = join(this.directory, `state.${randomUUID()}.tmp`);
    try {
      const file = await open(temporary, 'wx', 0o600);
      try { await file.writeFile(serialized, 'utf8'); await file.sync(); }
      finally { await file.close(); }
      await rename(temporary, destination);
    } catch { await unlink(temporary).catch(() => {}); throw new Error('Unable to write local storage atomically'); }
  }
}
