import { app, ipcMain, safeStorage } from 'electron'
import { readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { KeyState, ProviderId } from '../preload'

/*
 * API keys never leave this process. The renderer is told whether one is set and the last
 * few characters, nothing more, and nothing here ever logs key material.
 *
 * Two things shape the storage. safeStorage falls back to a 'basic_text' backend where no
 * keyring is available, which obfuscates rather than encrypts, so we refuse to put that on
 * disk and hold the key for the session instead. And the hint is written alongside the
 * ciphertext, so drawing the settings list never has to decrypt anything.
 */

export const PROVIDERS: readonly ProviderId[] = ['anthropic', 'openai', 'gemini']

const FILE = 'ai-keys.json'
const MAX_LENGTH = 512
const HINT_LENGTH = 4

// Shorter than this and the hint would give away most of the key.
const MIN_HINTED = 12

interface Entry {
  cipher: string
  hint: string
}

type Store = Partial<Record<ProviderId, Entry>>

/** Held only while the app runs, for machines that cannot encrypt. */
const session = new Map<ProviderId, string>()

export function isProvider(value: unknown): value is ProviderId {
  return typeof value === 'string' && PROVIDERS.includes(value as ProviderId)
}

/**
 * False where the only backend on offer does not really encrypt. The weak one is a Linux
 * fallback, and so is the method that reports it: elsewhere it is not even defined.
 */
export function canPersist(): boolean {
  if (!safeStorage.isEncryptionAvailable()) return false
  if (typeof safeStorage.getSelectedStorageBackend !== 'function') return true
  return safeStorage.getSelectedStorageBackend() !== 'basic_text'
}

export async function keyStates(): Promise<KeyState[]> {
  const store = await read()
  const persisted = canPersist()

  return PROVIDERS.map((provider) => {
    const entry = store[provider]
    const held = session.get(provider)

    if (entry) return { provider, configured: true, hint: entry.hint, persisted: true }
    if (held) return { provider, configured: true, hint: hintOf(held), persisted: false }
    return { provider, configured: false, hint: '', persisted }
  })
}

/** Returns what the renderer may know. The key itself stops here. */
export async function saveKey(provider: ProviderId, key: string): Promise<KeyState[]> {
  const trimmed = key.trim()
  if (trimmed.length === 0 || trimmed.length > MAX_LENGTH || /\s/.test(trimmed)) {
    throw new Error('That does not look like an API key.')
  }

  if (!canPersist()) {
    session.set(provider, trimmed)
    return keyStates()
  }

  const cipher = await safeStorage.encryptStringAsync(trimmed)
  const store = await read()
  store[provider] = { cipher: cipher.toString('base64'), hint: hintOf(trimmed) }
  session.delete(provider)
  await write(store)
  return keyStates()
}

export async function clearKey(provider: ProviderId): Promise<KeyState[]> {
  session.delete(provider)
  const store = await read()
  if (store[provider]) {
    delete store[provider]
    await write(store)
  }
  return keyStates()
}

/**
 * The only way to the plaintext, for the moment a request is built. Null covers a key
 * that was never set and one this machine can no longer decrypt, such as a profile copied
 * from another account.
 */
export async function readKey(provider: ProviderId): Promise<string | null> {
  const held = session.get(provider)
  if (held) return held

  const store = await read()
  const entry = store[provider]
  if (!entry) return null

  try {
    const { result, shouldReEncrypt } = await safeStorage.decryptStringAsync(
      Buffer.from(entry.cipher, 'base64')
    )
    // The platform rotated its key, so the file is rewritten under the new one.
    if (shouldReEncrypt) await saveKey(provider, result)
    return result
  } catch {
    return null
  }
}

/** Where a key is issued. Held here so the panel cannot ask for a tab on any URL. */
const KEY_PAGES: Record<ProviderId, string> = {
  anthropic: 'https://console.anthropic.com/settings/keys',
  openai: 'https://platform.openai.com/api-keys',
  gemini: 'https://aistudio.google.com/app/apikey'
}

/** Registered once, and every handler checks the provider it was handed. */
export function registerSecretsIpc(openPage: (url: string) => void): void {
  ipcMain.handle('keys:read', () => keyStates())

  ipcMain.handle('keys:save', (_event, provider: unknown, key: unknown) => {
    if (!isProvider(provider) || typeof key !== 'string') throw new Error('Unknown provider.')
    return saveKey(provider, key)
  })

  ipcMain.handle('keys:clear', (_event, provider: unknown) => {
    if (!isProvider(provider)) throw new Error('Unknown provider.')
    return clearKey(provider)
  })

  ipcMain.on('keys:open-page', (_event, provider: unknown) => {
    if (isProvider(provider)) openPage(KEY_PAGES[provider])
  })
}

function hintOf(key: string): string {
  return key.length >= MIN_HINTED ? key.slice(-HINT_LENGTH) : ''
}

function file(): string {
  return join(app.getPath('userData'), FILE)
}

async function read(): Promise<Store> {
  try {
    const raw = await readFile(file(), 'utf8')
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return {}

    const store: Store = {}
    for (const provider of PROVIDERS) {
      const entry = (parsed as Record<string, unknown>)[provider]
      if (isEntry(entry)) store[provider] = entry
    }
    return store
  } catch {
    // A missing or unreadable file means no keys, never a crash on startup.
    return {}
  }
}

/** Written through a temporary file, so a crash mid write cannot lose what was there. */
async function write(store: Store): Promise<void> {
  const target = file()
  if (Object.keys(store).length === 0) {
    await rm(target, { force: true })
    return
  }

  const temporary = `${target}.tmp`
  await writeFile(temporary, JSON.stringify(store), { encoding: 'utf8', mode: 0o600 })
  await rename(temporary, target)
}

function isEntry(value: unknown): value is Entry {
  if (!value || typeof value !== 'object') return false
  const entry = value as Record<string, unknown>
  return typeof entry.cipher === 'string' && typeof entry.hint === 'string'
}
