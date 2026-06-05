import { readFile, writeFile, mkdir, chmod } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { GmailAccount } from "./types.js";

const STORE_DIR = join(homedir(), ".multimail");
const STORE_PATH = join(STORE_DIR, "accounts.json");

interface StoreData {
  accounts: Record<string, GmailAccount>;
}

async function ensureStoreDir(): Promise<void> {
  if (!existsSync(STORE_DIR)) {
    await mkdir(STORE_DIR, { recursive: true, mode: 0o700 });
  }
}

async function readStore(): Promise<StoreData> {
  try {
    await ensureStoreDir();
    const data = await readFile(STORE_PATH, "utf-8");
    return JSON.parse(data) as StoreData;
  } catch {
    return { accounts: {} };
  }
}

async function writeStore(data: StoreData): Promise<void> {
  await ensureStoreDir();
  await writeFile(STORE_PATH, JSON.stringify(data, null, 2), "utf-8");
  await chmod(STORE_PATH, 0o600).catch(() => {});
}

export async function getAccounts(): Promise<Record<string, GmailAccount>> {
  const store = await readStore();
  return store.accounts;
}

export async function getAccount(email: string): Promise<GmailAccount | undefined> {
  const store = await readStore();
  return store.accounts[email];
}

export async function saveAccount(account: GmailAccount): Promise<void> {
  const store = await readStore();
  store.accounts[account.email] = account;
  await writeStore(store);
}

export async function removeAccount(email: string): Promise<boolean> {
  const store = await readStore();
  if (!store.accounts[email]) return false;
  delete store.accounts[email];
  await writeStore(store);
  return true;
}

export async function updateTokens(
  email: string,
  accessToken: string,
  refreshToken: string,
  expiryDate: number
): Promise<void> {
  const store = await readStore();
  const account = store.accounts[email];
  if (!account) throw new Error(`Account not found: ${email}`);
  account.accessToken = accessToken;
  account.refreshToken = refreshToken ?? account.refreshToken;
  account.expiryDate = expiryDate;
  await writeStore(store);
}
