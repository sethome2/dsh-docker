import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Context } from '@deepseek-ai/cordis';
import { LocalSandboxProvider } from '@deepseek-ai/dsh-sandbox-local';

export async function checkSandbox() {
  const ctx = new Context();
  const dirs = [];
  try {
    await ctx.plugin(LocalSandboxProvider, {});
    // Keep both roots outside /tmp: Landlock intentionally permits all /tmp.
    const workspace = mkdtempSync(join(process.cwd(), '.dsh-sandbox-check-'));
    dirs.push(workspace);
    const outside = mkdtempSync(join(homedir(), '.dsh-sandbox-outside-'));
    dirs.push(outside);
    const target = join(outside, 'denied');
    writeFileSync(target, 'unchanged'); // Proves ordinary Unix permissions allow writes.

    async function run(command, mode = 'workspace-write') {
      const wrapped = await ctx.sandbox.confine(['bash', '-c', command, '--', workspace, target], {
        mode, workspaceRoot: workspace,
      });
      const result = spawnSync(wrapped.argv[0], wrapped.argv.slice(1), {
        cwd: workspace, encoding: 'utf8', timeout: 15_000,
      });
      if (result.error || result.signal) throw result.error ?? new Error(`Sandbox timed out: ${result.signal}`);
      return { ...result, wrapped };
    }

    const allowed = await run('printf allowed > "$1/allowed"; test "$(cat "$1/allowed")" = allowed && t=$(mktemp /tmp/dsh-check.XXXXXX) && printf tmp > "$t" && rm "$t"');
    assert.equal(allowed.status, 0, `Workspace/temp write failed: ${allowed.stderr}`);
    assert.equal(readFileSync(join(workspace, 'allowed'), 'utf8'), 'allowed');
    for (const command of [
      'printf denied > "$2"',
      'bash -c \'printf denied > "$1"\' -- "$2"',
    ]) {
      const denied = await run(command);
      assert.notEqual(denied.status, 0, 'Sandbox allowed an outside write');
      assert.equal(readFileSync(target, 'utf8'), 'unchanged');
      assert.ok(denied.wrapped.denialSignatures.some((text) => denied.stderr.toLowerCase().includes(text.toLowerCase())),
        `Expected policy denial, got: ${denied.stderr}`);
    }
    const readonly = await run('printf denied > "$1/readonly"', 'read-only');
    assert.notEqual(readonly.status, 0);
    assert.equal(existsSync(join(workspace, 'readonly')), false);
    console.log(`Sandbox OK: ${allowed.wrapped.argv[0]}; enforcement=${allowed.wrapped.enforcement}`);
  } catch (error) {
    throw new Error('Sandbox check failed. Check workspace ownership, bubblewrap/user namespaces, Landlock support, Docker seccomp and AppArmor. No unconfined fallback is enabled.', { cause: error });
  } finally {
    for (const dir of dirs.reverse()) rmSync(dir, { recursive: true, force: true });
    await ctx.fiber.dispose();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await checkSandbox();
}
