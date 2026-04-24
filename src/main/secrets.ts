import { app, safeStorage } from 'electron';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import type { AccountMetadata } from '@shared/types';

const SECRETS_FILE = 'secrets.enc';
const ACCOUNTS_FILE = 'accounts.json';

interface SecretsStore {
  [key: string]: string;
}

function storePath(filename: string): string {
  return join(app.getPath('userData'), filename);
}

async function readJson<T>(path: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(path, 'utf8');
    return JSON.parse(raw) as T;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return fallback;
    throw err;
  }
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await fs.writeFile(path, JSON.stringify(value, null, 2), 'utf8');
}

async function readSecrets(): Promise<SecretsStore> {
  const path = storePath(SECRETS_FILE);
  try {
    const buffer = await fs.readFile(path);
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('safeStorage is not available on this platform');
    }
    const decrypted = safeStorage.decryptString(buffer);
    return JSON.parse(decrypted) as SecretsStore;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw err;
  }
}

async function writeSecrets(store: SecretsStore): Promise<void> {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('safeStorage is not available on this platform');
  }
  const buffer = safeStorage.encryptString(JSON.stringify(store));
  await fs.writeFile(storePath(SECRETS_FILE), buffer);
}

export async function getSecret(key: string): Promise<string | null> {
  const store = await readSecrets();
  return store[key] ?? null;
}

export async function setSecret(key: string, value: string): Promise<void> {
  const store = await readSecrets();
  store[key] = value;
  await writeSecrets(store);
}

export async function deleteSecret(key: string): Promise<void> {
  const store = await readSecrets();
  delete store[key];
  await writeSecrets(store);
}

export async function listAccounts(): Promise<AccountMetadata[]> {
  return readJson<AccountMetadata[]>(storePath(ACCOUNTS_FILE), []);
}

export async function upsertAccount(account: AccountMetadata): Promise<AccountMetadata[]> {
  const accounts = await listAccounts();
  const idx = accounts.findIndex((a) => a.id === account.id);
  if (idx >= 0) accounts[idx] = account;
  else accounts.push(account);
  await writeJson(storePath(ACCOUNTS_FILE), accounts);
  return accounts;
}

export async function deleteAccount(id: string): Promise<AccountMetadata[]> {
  const accounts = (await listAccounts()).filter((a) => a.id !== id);
  await writeJson(storePath(ACCOUNTS_FILE), accounts);
  await deleteSecret(`access-token:${id}`);
  await deleteSecret(`pickle-key:${id}`);
  return accounts;
}
