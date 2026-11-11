import { spawn } from 'node:child_process';
import { networkInterfaces } from 'node:os';
import { checkSandbox } from './check-sandbox.mjs';

try {
  await checkSandbox();
  // DSH rejects wildcard addresses. Docker's published port forwards to eth0.
  const address = Object.values(networkInterfaces()).flat()
    .find((item) => item && item.family === 'IPv4' && !item.internal)?.address;
  if (!address) throw new Error('No concrete container IPv4 address found');
  const child = spawn('dsh', [
    'web', '--host', address, '--port', '3080', '--no-open',
    '--public-url', 'http://localhost:3080/', ...process.argv.slice(2),
  ], { stdio: 'inherit' });
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => child.kill(signal));
  }
  child.on('error', (error) => {
    console.error(error);
    process.exitCode = 1;
  });
  child.on('exit', (code, signal) => {
    process.exitCode = code ?? (signal === 'SIGTERM' ? 143 : 1);
  });
} catch (error) {
  console.error('DSH startup refused:', error);
  process.exitCode = 1;
}
