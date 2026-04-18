import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { constants } from 'node:fs';
import { NextResponse } from 'next/server';
import { env } from '@/lib/env';

const mimeTypeByExtension: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.avif': 'image/avif',
};

function resolveAssetPath(assetPath: string[]) {
  const relativePath = assetPath.join(path.sep);
  const rootPath = path.resolve(env.UPLOAD_DIR);
  const absolutePath = path.resolve(rootPath, relativePath);

  if (
    !absolutePath.startsWith(`${rootPath}${path.sep}`) &&
    absolutePath !== rootPath
  ) {
    return null;
  }

  return absolutePath;
}

export async function GET(
  _request: Request,
  context: { params: { assetPath: string[] } }
) {
  const resolvedPath = resolveAssetPath(context.params.assetPath);

  if (!resolvedPath) {
    return new NextResponse('Not Found', { status: 404 });
  }

  try {
    await access(resolvedPath, constants.R_OK);
    const buffer = await readFile(resolvedPath);
    const extension = path.extname(resolvedPath).toLowerCase();
    const contentType =
      mimeTypeByExtension[extension] ?? 'application/octet-stream';

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch {
    return new NextResponse('Not Found', { status: 404 });
  }
}
