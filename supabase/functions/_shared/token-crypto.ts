const encoder = new TextEncoder()

function bytesToPostgresHex(bytes: Uint8Array) {
  return `\\x${[...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')}`
}

function postgresHexToBytes(value: string) {
  const hex = value.startsWith('\\x') ? value.slice(2) : value
  return Uint8Array.from(hex.match(/.{2}/g) ?? [], (pair) => Number.parseInt(pair, 16))
}

async function encryptionKey() {
  const encoded = Deno.env.get('TOKEN_ENCRYPTION_KEY')
  if (!encoded) throw new Error('token_encryption_key_missing')
  const binary = atob(encoded)
  const raw = Uint8Array.from(binary, (character) => character.charCodeAt(0))
  if (raw.byteLength !== 32) throw new Error('token_encryption_key_invalid')
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt'])
}

export async function encryptToken(value: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await encryptionKey(), encoder.encode(value))
  return { ciphertext: bytesToPostgresHex(new Uint8Array(ciphertext)), iv: bytesToPostgresHex(iv) }
}

export async function decryptToken(ciphertext: string, iv: string) {
  const clear = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: postgresHexToBytes(iv) },
    await encryptionKey(),
    postgresHexToBytes(ciphertext),
  )
  return new TextDecoder().decode(clear)
}

export async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}
