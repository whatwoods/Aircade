import { randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { env } from '@/lib/env';
import { createWorkInputSchema, type CreateWorkInput } from '../schemas';
import { WorkError } from './errors';

const maxImageBytes = 8 * 1024 * 1024;
const maxScreenshotCount = 6;
const maxInputPixels = 40_000_000;

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

type ImageBucket = 'cover' | 'screenshot' | 'qr';

type UploadTransformConfig = {
  maxWidth: number;
  maxHeight: number;
  targetBytes?: number;
  qualitySteps?: number[];
  lossless?: boolean;
};

const transformConfigByBucket: Record<ImageBucket, UploadTransformConfig> = {
  cover: {
    maxWidth: 1600,
    maxHeight: 1600,
    targetBytes: 500 * 1024,
    qualitySteps: [82, 76, 70, 64, 58, 52],
  },
  screenshot: {
    maxWidth: 1920,
    maxHeight: 1920,
    targetBytes: 800 * 1024,
    qualitySteps: [84, 78, 72, 66, 60, 54],
  },
  qr: {
    maxWidth: 1200,
    maxHeight: 1200,
    lossless: true,
  },
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

function ensureAllowedImageInput(file: File) {
  if (file.type) {
    const mimeExt = allowedMimeTypeToExt.get(file.type);
    if (!mimeExt) {
      throw new WorkError('图片仅支持 PNG、JPG、WEBP、GIF、AVIF');
    }

    return;
  }

  const ext = path.extname(file.name).toLowerCase();
  if (!allowedExtensions.has(ext)) {
    throw new WorkError('图片仅支持 PNG、JPG、WEBP、GIF、AVIF');
  }
}

function createSharpPipeline(buffer: Buffer, bucket: ImageBucket) {
  const config = transformConfigByBucket[bucket];

  return sharp(buffer, {
    animated: bucket !== 'qr',
    limitInputPixels: maxInputPixels,
    failOn: 'error',
  })
    .rotate()
    .resize({
      width: config.maxWidth,
      height: config.maxHeight,
      fit: 'inside',
      withoutEnlargement: true,
      kernel: bucket === 'qr' ? sharp.kernel.nearest : sharp.kernel.lanczos3,
    });
}

async function encodeImageToWebp(buffer: Buffer, bucket: ImageBucket) {
  const config = transformConfigByBucket[bucket];

  try {
    const metadata = await sharp(buffer, {
      animated: bucket !== 'qr',
      limitInputPixels: maxInputPixels,
      failOn: 'error',
    }).metadata();

    if ((metadata.pages ?? 1) > 1) {
      throw new WorkError('暂不支持上传动图，请改传静态图片');
    }
  } catch (error) {
    if (error instanceof WorkError) {
      throw error;
    }

    throw new WorkError('图片文件已损坏或格式不支持');
  }

  if (config.lossless) {
    return await createSharpPipeline(buffer, bucket)
      .webp({
        lossless: true,
        effort: 6,
      })
      .toBuffer();
  }

  let fallbackBuffer: Buffer | null = null;

  for (const quality of config.qualitySteps ?? [80]) {
    const encoded = await createSharpPipeline(buffer, bucket)
      .webp({
        quality,
        effort: 6,
        smartSubsample: true,
      })
      .toBuffer();

    fallbackBuffer = encoded;

    if (!config.targetBytes || encoded.byteLength <= config.targetBytes) {
      return encoded;
    }
  }

  if (!fallbackBuffer) {
    throw new WorkError('图片处理失败，请稍后再试');
  }

  return fallbackBuffer;
}

async function storeImage(file: File, bucket: ImageBucket) {
  if (file.size > maxImageBytes) {
    throw new WorkError('单张图片不能超过 8MB');
  }

  ensureAllowedImageInput(file);

  const inputBuffer = Buffer.from(await file.arrayBuffer());
  const outputBuffer = await encodeImageToWebp(inputBuffer, bucket);
  const now = new Date();
  const year = String(now.getFullYear());
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const fileName = `${bucket}-${randomUUID()}.webp`;
  const relativeDir = path.join(year, month);
  const targetDir = path.join(env.UPLOAD_DIR, relativeDir);
  const diskPath = path.join(targetDir, fileName);
  const publicBase = env.UPLOAD_PUBLIC_BASE.replace(/\/+$/, '');
  const publicUrl = `${publicBase}/${relativeDir.replaceAll(path.sep, '/')}/${fileName}`;

  await mkdir(targetDir, { recursive: true });
  await writeFile(diskPath, outputBuffer);

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
