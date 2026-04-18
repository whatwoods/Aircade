import { randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { env } from '@/lib/env';
import { createWorkInputSchema, type CreateWorkInput } from '../schemas';
import { WorkError } from './errors';

const maxImageBytes = 8 * 1024 * 1024;
const maxScreenshotCount = 6;

const allowedMimeTypeToExt = new Map<string, string>([
  ['image/png', '.png'],
  ['image/jpeg', '.jpg'],
  ['image/webp', '.webp'],
  ['image/gif', '.gif'],
  ['image/avif', '.avif'],
]);

const allowedExtensions = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.gif',
  '.avif',
]);

type StoredUpload = {
  diskPath: string;
  publicUrl: string;
};

function readTextField(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === 'string' ? value : '';
}

function asFile(value: FormDataEntryValue | null) {
  if (!(value instanceof File) || value.size === 0) {
    return null;
  }

  return value;
}

function inferFileExtension(file: File) {
  if (file.type) {
    const mimeExt = allowedMimeTypeToExt.get(file.type);
    if (!mimeExt) {
      throw new WorkError('图片仅支持 PNG、JPG、WEBP、GIF、AVIF');
    }

    return mimeExt;
  }

  const ext = path.extname(file.name).toLowerCase();
  if (!allowedExtensions.has(ext)) {
    throw new WorkError('图片仅支持 PNG、JPG、WEBP、GIF、AVIF');
  }

  return ext === '.jpeg' ? '.jpg' : ext;
}

async function storeImage(file: File, bucket: 'cover' | 'screenshot' | 'qr') {
  if (file.size > maxImageBytes) {
    throw new WorkError('单张图片不能超过 8MB');
  }

  const ext = inferFileExtension(file);
  const now = new Date();
  const year = String(now.getFullYear());
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const fileName = `${bucket}-${randomUUID()}${ext}`;
  const relativeDir = path.join(year, month);
  const targetDir = path.join(env.UPLOAD_DIR, relativeDir);
  const diskPath = path.join(targetDir, fileName);
  const publicBase = env.UPLOAD_PUBLIC_BASE.replace(/\/+$/, '');
  const publicUrl = `${publicBase}/${relativeDir.replaceAll(path.sep, '/')}/${fileName}`;

  await mkdir(targetDir, { recursive: true });
  const bytes = Buffer.from(await file.arrayBuffer());
  await writeFile(diskPath, bytes);

  return {
    diskPath,
    publicUrl,
  } satisfies StoredUpload;
}

export async function parseCreateWorkUploadFormData(
  formData: FormData
): Promise<CreateWorkInput> {
  const coverFile = asFile(formData.get('coverFile'));
  const qrFile = asFile(formData.get('qrFile'));
  const screenshotFiles = formData
    .getAll('screenshots')
    .map((entry) => asFile(entry))
    .filter((file): file is File => file !== null);

  if (!coverFile) {
    throw new WorkError('请上传封面图');
  }

  if (screenshotFiles.length > maxScreenshotCount) {
    throw new WorkError('最多上传 6 张截图');
  }

  const storedFiles: StoredUpload[] = [];

  try {
    const coverUpload = await storeImage(coverFile, 'cover');
    storedFiles.push(coverUpload);

    const screenshotUploads = await Promise.all(
      screenshotFiles.map((file) => storeImage(file, 'screenshot'))
    );
    storedFiles.push(...screenshotUploads);

    const qrUpload = qrFile ? await storeImage(qrFile, 'qr') : null;
    if (qrUpload) {
      storedFiles.push(qrUpload);
    }

    return createWorkInputSchema.parse({
      title: readTextField(formData, 'title'),
      type: formData.get('type'),
      tagline: readTextField(formData, 'tagline'),
      description: readTextField(formData, 'description'),
      coverUrl: coverUpload.publicUrl,
      screenshots: screenshotUploads.map((item) => item.publicUrl),
      webUrl: readTextField(formData, 'webUrl'),
      qrUrl: qrUpload?.publicUrl ?? '',
    });
  } catch (error) {
    await Promise.all(
      storedFiles.map(async (file) => {
        try {
          await unlink(file.diskPath);
        } catch {
          // Ignore cleanup failures and report the original error.
        }
      })
    );

    throw error;
  }
}
