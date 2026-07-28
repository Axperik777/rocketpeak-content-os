import { supabase } from './supabase'

export type MediaAsset = {
  id: string
  postId: string
  storagePath: string
  mimeType: string
  sizeBytes: number
  width: number | null
  height: number | null
  durationSeconds: number | null
  checksumSha256: string
  signedUrl: string
  createdAt: string
}

type MediaRow = {
  id: string
  post_id: string
  storage_path: string
  mime_type: string
  size_bytes: number
  width: number | null
  height: number | null
  duration_seconds: number | null
  checksum_sha256: string
  created_at: string
}

const bucket = 'content-media'
const imageTypes = new Set(['image/jpeg', 'image/png', 'image/webp'])
const videoTypes = new Set(['video/mp4', 'video/quicktime'])
const imageLimit = 10 * 1024 * 1024
const videoLimit = 100 * 1024 * 1024

function requireClient() {
  if (!supabase) throw new Error('Supabase не настроен')
  return supabase
}

function sanitizeName(name: string) {
  const extension = name.includes('.') ? `.${name.split('.').pop()?.toLowerCase()}` : ''
  return `${crypto.randomUUID()}${extension}`
}

async function checksum(file: File) {
  const hash = await crypto.subtle.digest('SHA-256', await file.arrayBuffer())
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function readMetadata(file: File) {
  const url = URL.createObjectURL(file)
  try {
    if (imageTypes.has(file.type)) {
      const image = new Image()
      image.src = url
      await image.decode()
      return { width: image.naturalWidth, height: image.naturalHeight, durationSeconds: null }
    }
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.src = url
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve()
      video.onerror = () => reject(new Error('Видео не удалось прочитать. Проверьте кодек и целостность файла.'))
    })
    return { width: video.videoWidth, height: video.videoHeight, durationSeconds: Number(video.duration.toFixed(3)) }
  } finally {
    URL.revokeObjectURL(url)
  }
}

export function validateMediaFile(file: File) {
  const isImage = imageTypes.has(file.type)
  const isVideo = videoTypes.has(file.type)
  if (!isImage && !isVideo) return 'Допустимы JPG, PNG, WebP, MP4 и MOV.'
  if (isImage && file.size > imageLimit) return 'Изображение должно быть не больше 10 МБ.'
  if (isVideo && file.size > videoLimit) return 'Видео должно быть не больше 100 МБ.'
  if (!file.size) return 'Файл пустой.'
  return ''
}

async function withSignedUrl(row: MediaRow): Promise<MediaAsset> {
  const client = requireClient()
  const signed = await client.storage.from(bucket).createSignedUrl(row.storage_path, 3600)
  if (signed.error) throw signed.error
  return {
    id: row.id,
    postId: row.post_id,
    storagePath: row.storage_path,
    mimeType: row.mime_type,
    sizeBytes: Number(row.size_bytes),
    width: row.width,
    height: row.height,
    durationSeconds: row.duration_seconds === null ? null : Number(row.duration_seconds),
    checksumSha256: row.checksum_sha256,
    signedUrl: signed.data.signedUrl,
    createdAt: row.created_at,
  }
}

export async function loadMediaAssets(ownerId: string) {
  const client = requireClient()
  const result = await client.from('media_assets').select('*').eq('owner_id', ownerId).order('created_at')
  if (result.error) throw result.error
  return Promise.all((result.data as MediaRow[]).map(withSignedUrl))
}

export async function uploadMediaAsset(ownerId: string, postId: string, file: File) {
  const validationError = validateMediaFile(file)
  if (validationError) throw new Error(validationError)
  const client = requireClient()
  const [metadata, checksumSha256] = await Promise.all([readMetadata(file), checksum(file)])
  const storagePath = `${ownerId}/${postId}/${sanitizeName(file.name)}`
  const uploaded = await client.storage.from(bucket).upload(storagePath, file, { contentType: file.type, upsert: false })
  if (uploaded.error) throw uploaded.error
  const inserted = await client.from('media_assets').insert({
    owner_id: ownerId,
    post_id: postId,
    storage_path: storagePath,
    mime_type: file.type,
    size_bytes: file.size,
    width: metadata.width,
    height: metadata.height,
    duration_seconds: metadata.durationSeconds,
    checksum_sha256: checksumSha256,
  }).select('*').single()
  if (inserted.error) {
    await client.storage.from(bucket).remove([storagePath])
    throw inserted.error
  }
  return withSignedUrl(inserted.data as MediaRow)
}

export async function deleteMediaAsset(asset: MediaAsset) {
  const client = requireClient()
  const removedFile = await client.storage.from(bucket).remove([asset.storagePath])
  if (removedFile.error) throw removedFile.error
  const removedRow = await client.from('media_assets').delete().eq('id', asset.id)
  if (removedRow.error) throw removedRow.error
}
