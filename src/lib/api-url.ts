type ApiUrlOptions = {
  configuredUrl?: string;
  development: boolean;
  platform: string;
  browserHostname?: string;
  expoHostUri?: string | null;
};

function runtimeHostname(value?: string | null): string | undefined {
  if (!value?.trim()) return;
  const input = value.trim();
  try {
    if (/^[a-z][a-z\d+.-]*:\/\//i.test(input)) return new URL(input).hostname;
    // A bare IPv6 host needs brackets; Expo host:port values already use them.
    const authority = !input.startsWith('[') && (input.match(/:/g)?.length || 0) > 1 ? `[${input}]` : input;
    return new URL(`http://${authority}`).hostname;
  } catch { return; }
}

function isLocalHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return true;
  if (host === '::' || host === '::1' || /^(fc|fd)[a-f\d]{2}:/.test(host) || /^fe[89ab][a-f\d]:/.test(host)) return true;
  // URL normalizes IPv4-mapped IPv6 addresses into their hexadecimal form.
  const mapped = /^::ffff:([a-f\d]{1,4}):([a-f\d]{1,4})$/.exec(host);
  if (mapped) {
    const high = parseInt(mapped[1], 16), low = parseInt(mapped[2], 16);
    return isLocalHost(`${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`);
  }
  const octets = host.split('.').map(Number);
  if (octets.length !== 4 || octets.some(value => !Number.isInteger(value) || value < 0 || value > 255)) return false;
  const [first, second] = octets;
  return host === '0.0.0.0' || first === 10 || first === 127 ||
    (first === 172 && second >= 16 && second <= 31) || (first === 192 && second === 168) ||
    (first === 169 && second === 254);
}

/** Keep local development requests on the same computer as the running app. */
export function resolveApiUrl({ configuredUrl, development, platform, browserHostname, expoHostUri }: ApiUrlOptions): string {
  const configured = configuredUrl?.trim().replace(/\/$/, '');
  if (!development) {
    if (configured) return configured;
    throw new Error('Recommendations are not connected. Please try again later.');
  }

  const runtime = runtimeHostname(platform === 'web' ? browserHostname : expoHostUri);
  // An Expo tunnel forwards Metro, not the separate recommendation server.
  const localRuntime = runtime && isLocalHost(runtime) ? runtime : undefined;
  if (configured) {
    const url = new URL(configured);
    if (!localRuntime || !isLocalHost(url.hostname) || !['http:', 'https:'].includes(url.protocol)) return configured;
    url.hostname = localRuntime;
    return url.toString().replace(/\/$/, '');
  }
  const fallback = platform === 'android' ? '10.0.2.2' : 'localhost';
  return `http://${localRuntime || fallback}:8787`;
}
