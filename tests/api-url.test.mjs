import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveApiUrl } from '../src/lib/api-url.ts';

const native = { development: true, platform: 'ios', expoHostUri: '10.37.166.171:8081' };

test('a phone follows the current Expo LAN host after the computer changes networks', () => {
  for (const configuredUrl of ['http://10.36.183.57:8787', 'http://localhost:8787', 'http://127.0.0.1:8787']) {
    assert.equal(resolveApiUrl({ ...native, configuredUrl }), 'http://10.37.166.171:8787');
  }
  assert.equal(resolveApiUrl({ ...native, platform: 'android', configuredUrl: 'http://localhost:8787' }), 'http://10.37.166.171:8787');
});

test('local host replacement preserves the API protocol, port, and base path', () => {
  assert.equal(resolveApiUrl({ ...native, configuredUrl: 'https://192.168.1.12:9443/claro/api/' }), 'https://10.37.166.171:9443/claro/api');
  assert.equal(resolveApiUrl({ ...native, configuredUrl: 'http://172.20.3.4:8788/proxy', expoHostUri: 'exp://192.168.2.5:8082' }), 'http://192.168.2.5:8788/proxy');
});

test('web follows its browser hostname rather than Expo metadata', () => {
  const web = { ...native, platform: 'web', configuredUrl: 'http://10.36.183.57:8787' };
  assert.equal(resolveApiUrl({ ...web, browserHostname: 'localhost' }), 'http://localhost:8787');
  assert.equal(resolveApiUrl({ ...web, browserHostname: '192.168.4.12' }), 'http://192.168.4.12:8787');
  assert.equal(resolveApiUrl({ ...web, browserHostname: 'laptop.local' }), 'http://laptop.local:8787');
  assert.equal(resolveApiUrl(web), web.configuredUrl);
});

test('explicit remote APIs and all production-build URLs remain unchanged', () => {
  for (const configuredUrl of ['https://api.claro.example/v1', 'https://203.0.113.42:9443/api']) {
    assert.equal(resolveApiUrl({ ...native, configuredUrl }), configuredUrl);
  }
  assert.equal(resolveApiUrl({ ...native, development: false, configuredUrl: 'http://10.36.183.57:8787' }), 'http://10.36.183.57:8787');
  assert.throws(() => resolveApiUrl({ ...native, development: false }), /not connected/);
});

test('Expo tunnels and public browser hosts cannot redirect the separate local API', () => {
  const configuredUrl = 'http://192.168.5.2:8787';
  for (const expoHostUri of ['abc-8081.exp.direct', 'exp://abc-8081.exp.direct', 'https://example.ngrok.app', '203.0.113.12:8081']) {
    assert.equal(resolveApiUrl({ ...native, configuredUrl, expoHostUri }), configuredUrl);
  }
  assert.equal(resolveApiUrl({ ...native, configuredUrl, platform: 'web', browserHostname: 'claro.example' }), configuredUrl);
  assert.equal(resolveApiUrl({ ...native, expoHostUri: 'abc-8081.exp.direct' }), 'http://localhost:8787');
});

test('IPv6 hosts are parsed intact and retain brackets in API URLs', () => {
  assert.equal(resolveApiUrl({ ...native, configuredUrl: 'http://[::1]:8787', expoHostUri: '[fd12:3456::7]:8081' }), 'http://[fd12:3456::7]:8787');
  assert.equal(resolveApiUrl({ ...native, configuredUrl: 'http://[fd12::8]:8787/base', expoHostUri: 'exp://[fe80::2]:8081' }), 'http://[fe80::2]:8787/base');
  assert.equal(resolveApiUrl({ ...native, configuredUrl: 'http://[::ffff:192.168.1.2]:8787' }), 'http://10.37.166.171:8787');
  assert.equal(resolveApiUrl({ ...native, configuredUrl: 'http://[2001:db8::5]:8787' }), 'http://[2001:db8::5]:8787');
  assert.equal(resolveApiUrl({ ...native, platform: 'web', browserHostname: '::1' }), 'http://[::1]:8787');
});

test('private address detection does not rewrite nearby public ranges', () => {
  for (const host of ['172.15.1.2', '172.32.1.2', '192.169.1.2', '169.255.1.2']) {
    const configuredUrl = `http://${host}:8787`;
    assert.equal(resolveApiUrl({ ...native, configuredUrl }), configuredUrl);
  }
  for (const host of ['172.16.1.2', '172.31.1.2', '192.168.1.2', '169.254.1.2', '0.0.0.0']) {
    assert.equal(resolveApiUrl({ ...native, configuredUrl: `http://${host}:8787` }), 'http://10.37.166.171:8787');
  }
});

test('missing or malformed Expo metadata uses the platform fallback without throwing', () => {
  assert.equal(resolveApiUrl({ development: true, platform: 'ios' }), 'http://localhost:8787');
  assert.equal(resolveApiUrl({ development: true, platform: 'android' }), 'http://10.0.2.2:8787');
  assert.equal(resolveApiUrl({ ...native }), 'http://10.37.166.171:8787');
  assert.equal(resolveApiUrl({ ...native, configuredUrl: 'http://localhost:8787', expoHostUri: 'not a host' }), 'http://localhost:8787');
});
