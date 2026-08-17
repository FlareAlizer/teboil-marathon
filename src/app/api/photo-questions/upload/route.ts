import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { handle, jsonError, jsonOk } from '@/lib/api';
import { requireAdmin } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BYTES = 5 * 1024 * 1024; // 5 МБ

const ALLOWED: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

/** Сигнатуры файлов — не доверяем content-type, который прислал браузер. */
function sniff(bytes: Uint8Array): string | null {
  if (bytes.length < 12) return null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return 'image/png';
  }
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return 'image/gif';
  const riff = String.fromCharCode(...bytes.slice(0, 4));
  const webp = String.fromCharCode(...bytes.slice(8, 12));
  if (riff === 'RIFF' && webp === 'WEBP') return 'image/webp';
  return null;
}

/**
 * POST /api/photo-questions/upload — загрузка картинки для фото-квиза.
 * multipart/form-data, поле `file`. Максимум 5 МБ, только изображения.
 * Ответ: { path: '/uploads/xxx.jpg', bytes, type }
 */
export function POST(request: Request) {
  return handle(async () => {
    await requireAdmin();

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return jsonError('Ожидается multipart/form-data с полем file', 400);
    }

    const file = form.get('file');
    if (!(file instanceof File)) return jsonError('Файл не передан (поле file)', 400);
    if (file.size === 0) return jsonError('Файл пустой', 400);
    if (file.size > MAX_BYTES) return jsonError('Файл больше 5 МБ', 413);

    const bytes = new Uint8Array(await file.arrayBuffer());
    const detected = sniff(bytes);
    if (!detected || !(detected in ALLOWED)) {
      return jsonError('Допустимы только изображения: JPEG, PNG, WebP, GIF', 415);
    }

    const dir = path.join(process.cwd(), 'public', 'uploads');
    await fs.mkdir(dir, { recursive: true });

    const name = `${Date.now()}-${randomUUID().slice(0, 8)}${ALLOWED[detected]}`;
    await fs.writeFile(path.join(dir, name), bytes);

    return jsonOk({ path: `/uploads/${name}`, bytes: file.size, type: detected }, 201);
  });
}
