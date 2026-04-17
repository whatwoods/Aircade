export type RequestMetadata = {
  ip: string | null;
  userAgent: string | null;
};

function normalizeIp(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const first = value.split(',')[0]?.trim();
  if (!first) {
    return null;
  }

  const unwrapped = first.replace(/^\[(.*)\]$/, '$1');

  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(unwrapped)) {
    return unwrapped;
  }

  if (/^[0-9a-f:]+$/i.test(unwrapped)) {
    return unwrapped;
  }

  return null;
}

export function getRequestMetadata(headers: Headers): RequestMetadata {
  const forwardedFor =
    headers.get('x-forwarded-for') ?? headers.get('x-real-ip');
  const userAgent = headers.get('user-agent');

  return {
    ip: normalizeIp(forwardedFor),
    userAgent: userAgent ? userAgent.slice(0, 512) : null,
  };
}
