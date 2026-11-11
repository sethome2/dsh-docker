// Runs on the Actions host; exercises the same Compose settings users deploy.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { setTimeout } from 'node:timers/promises';

const compose = (...args) => execFileSync('docker', ['compose', ...args], {
  encoding: 'utf8', timeout: 30_000,
});

async function waitForPage() {
  for (let attempt = 0; attempt < 90; attempt++) {
    const logs = compose('logs', '--no-color', 'dsh').replace(/\x1b\[[0-9;]*m/g, '');
    const links = logs.match(/http:\/\/localhost:3080\/[^\s<>"']*/g) ?? [];
    for (const link of links) {
      const url = new URL(link);
      if (!url.search) continue; // Wait for the credential-bearing launch URL.
      for (const value of url.searchParams.values()) {
        console.log(`::add-mask::${value}`);
      }
      try {
        let response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(5000) });
        const cookies = response.headers.getSetCookie().map((cookie) => cookie.split(';')[0]).join('; ');
        assert.ok(cookies, 'Launch token did not establish a session cookie');
        if (response.status >= 300 && response.status < 400) {
          response = await fetch(new URL(response.headers.get('location'), url), {
            headers: { cookie: cookies }, signal: AbortSignal.timeout(5000),
          });
        }
        assert.equal(response.status, 200);
        assert.match(await response.text(), /<html|<!doctype html/i);
        const unauthorized = await fetch('http://localhost:3080/', {
          signal: AbortSignal.timeout(5000),
        });
        assert.equal(unauthorized.status, 401, 'Index must require authentication');
        console.log('Authenticated Web UI reachable through published port');
        return;
      } catch {
        // The URL may be printed just before the HTTP listener is ready.
      }
    }
    await setTimeout(1000);
  }
  throw new Error('Web UI failed to establish an authenticated session within 90 seconds');
}

compose('up', '-d');
await waitForPage();
const profile = compose('exec', '-T', 'dsh', 'bash', '-c', 'cat "$DSH_HOME/profiles/web/package.json"');
compose('exec', '-T', 'dsh', 'bash', '-c', 'printf persisted > "$DSH_HOME/.container-smoke"');
compose('restart', 'dsh');
await waitForPage();
assert.equal(compose('exec', '-T', 'dsh', 'bash', '-c', 'cat "$DSH_HOME/.container-smoke"'), 'persisted');
compose('up', '-d', '--force-recreate');
await waitForPage();
assert.equal(compose('exec', '-T', 'dsh', 'bash', '-c', 'cat "$DSH_HOME/.container-smoke"'), 'persisted');
assert.equal(compose('exec', '-T', 'dsh', 'bash', '-c', 'cat "$DSH_HOME/profiles/web/package.json"'), profile);
compose('exec', '-T', 'dsh', 'bash', '-c', 'rm "$DSH_HOME/.container-smoke"');
console.log('State and initialized Web profile survive restart and recreation');
