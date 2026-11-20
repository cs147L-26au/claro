import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const expoCli = fileURLToPath(new URL('../node_modules/expo/bin/cli', import.meta.url));
const apiEntry = fileURLToPath(new URL('../server/index.mjs', import.meta.url));

function port(value, fallback, name) {
  const raw = value?.trim() || String(fallback);
  if (!/^\d+$/.test(raw) || Number(raw) < 1 || Number(raw) > 65535) {
    throw new Error(`${name} must be a port from 1 to 65535.`);
  }
  return Number(raw);
}

function localAddress() {
  const addresses = Object.entries(os.networkInterfaces()).flatMap(([name, entries]) =>
    (entries || []).filter(entry => entry.family === 'IPv4' && !entry.internal)
      .map(entry => ({ name, address: entry.address })));
  const configured = process.env.CLARO_DEV_HOST?.trim();
  if (configured) {
    if (!net.isIPv4(configured) || !addresses.some(entry => entry.address === configured)) {
      throw new Error('CLARO_DEV_HOST must be an IPv4 address assigned to this computer.');
    }
    return configured;
  }
  const physical = addresses.filter(entry => /^(en\d+|eth\d+|wlan\d+|wl\w+|Wi-Fi|Ethernet)/i.test(entry.name));
  const rank = name => name === 'en0' ? 0 : name === 'en1' ? 1 : 2;
  physical.sort((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name));
  const chosen = physical.find(entry => !entry.address.startsWith('169.254.'));
  if (!chosen) throw new Error('No LAN address found. Connect to Wi-Fi, or set CLARO_DEV_HOST to this computer’s local IPv4 address.');
  return chosen.address;
}

async function ensureFree(value, host, label) {
  await new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', error => reject(new Error(error.code === 'EADDRINUSE'
      ? `${label} port ${value} is already in use. Stop the existing Claro API/Expo terminal first, then run npm run dev again.`
      : `Could not open ${label} port ${value} (${error.code || 'network error'}).`)));
    probe.listen({ host, port: value, exclusive: true }, () => probe.close(error => error ? reject(error) : resolve()));
  });
}

const children = new Set();
const detachedChildren = new WeakSet();
let stopping = false;
let killTimer;

function signalChild(child, signal) {
  if (!child.pid) return;
  try {
    // Only the noninteractive API has its own process group.
    if (detachedChildren.has(child)) process.kill(-child.pid, signal);
    else child.kill(signal);
  } catch (error) { if (error.code !== 'ESRCH') console.error(`Could not stop a development process (${error.code || 'unknown error'}).`); }
}

function stop(code) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  for (const child of children) signalChild(child, 'SIGTERM');
  if (children.size) killTimer = setTimeout(() => {
    for (const child of children) signalChild(child, 'SIGKILL');
  }, 3000);
}

function start(label, entry, args, env, interactive = false) {
  // Expo must share the foreground terminal group to read keyboard shortcuts.
  const detached = process.platform !== 'win32' && !interactive;
  const child = spawn(process.execPath, [entry, ...args], {
    cwd: root, env, detached,
    stdio: interactive ? 'inherit' : ['ignore', 'inherit', 'inherit'],
  });
  children.add(child);
  if (detached) detachedChildren.add(child);
  child.once('error', error => {
    console.error(`${label} could not start (${error.code || 'unknown error'}).`);
    stop(1);
  });
  child.once('close', (code, signal) => {
    // Clean up any remaining children in the API's detached process group.
    if (detachedChildren.has(child)) signalChild(child, 'SIGTERM');
    children.delete(child);
    if (!stopping) {
      console.error(`${label} stopped${signal ? ` (${signal})` : ` with exit code ${code}`}. Stopping the other development service.`);
      stop(code || 1);
    }
    if (!children.size && killTimer) clearTimeout(killTimer);
  });
}

process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));

try {
  if (!existsSync(expoCli)) throw new Error('Expo is not installed. Run npm ci first.');
  const host = localAddress();
  const apiPort = port(process.env.API_PORT, 8787, 'API_PORT');
  const expoPort = port(process.env.EXPO_PORT, 8081, 'EXPO_PORT');
  if (apiPort === expoPort) throw new Error('API_PORT and EXPO_PORT must be different.');
  await ensureFree(apiPort, '0.0.0.0', 'API');
  await ensureFree(expoPort, '0.0.0.0', 'Expo');
  if (Object.values(os.networkInterfaces()).flat().some(entry => entry?.family === 'IPv6' && entry.internal)) {
    await ensureFree(expoPort, '::1', 'Expo');
  }
  if (!stopping) {
    const origins = new Set((process.env.ALLOWED_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean));
    for (const address of ['localhost', '127.0.0.1', '[::1]', host]) origins.add(`http://${address}:${expoPort}`);
    const env = { ...process.env, API_HOST: '0.0.0.0', API_PORT: String(apiPort),
      EXPO_PUBLIC_API_URL: `http://${host}:${apiPort}`, REACT_NATIVE_PACKAGER_HOSTNAME: host,
      ALLOWED_ORIGINS: [...origins].join(',') };
    console.log(`Claro API: ${env.EXPO_PUBLIC_API_URL}`);
    console.log(`Browser: http://localhost:${expoPort}. Keep your phone on the same Wi-Fi and scan Expo’s QR code.`);
    console.log('This command starts both services. Ctrl+C stops both. No recommendation is generated until you request one.');
    start('Claro API', apiEntry, [], env);
    start('Expo', expoCli, ['start', '--go', '--lan', '--port', String(expoPort)], env, true);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Could not start Claro.');
  stop(1);
}
