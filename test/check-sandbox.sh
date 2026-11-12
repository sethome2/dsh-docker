#!/bin/sh
set -eu

# Keep both directories outside /tmp, which Landlock intentionally allows.
workspace=$(mktemp -d "$PWD/.dsh-sandbox-check.XXXXXX")
outside=$(mktemp -d "$HOME/.dsh-sandbox-outside.XXXXXX")
trap 'rm -rf "$workspace" "$outside"' EXIT
printf unchanged > "$outside/denied"

# Use DSH's provider so these checks exercise its selected sandbox backend.
sandbox() (
    cd /opt/dsh
    node --input-type=module - "$workspace" "$@" <<'JS'
import { Context } from '@deepseek-ai/cordis';
import { LocalSandboxProvider } from '@deepseek-ai/dsh-sandbox-local';
import { spawnSync } from 'node:child_process';

const [workspaceRoot, mode, ...command] = process.argv.slice(2);
const ctx = new Context();
try {
    await ctx.plugin(LocalSandboxProvider, {});
    const wrapped = await ctx.sandbox.confine(command, { mode, workspaceRoot });
    const result = spawnSync(wrapped.argv[0], wrapped.argv.slice(1), {
        cwd: workspaceRoot, stdio: 'inherit', timeout: 15000,
    });
    if (result.error) throw result.error;
    process.exitCode = result.status ?? 1;
} finally {
    await ctx.fiber.dispose();
}
JS
)

sandbox workspace-write sh -ec 'printf allowed > "$1/allowed"; t=$(mktemp); printf tmp > "$t"; rm "$t"' sh "$workspace"
test "$(cat "$workspace/allowed")" = allowed

for command in 'printf denied > "$1"' 'sh -c '\''printf denied > "$1"'\'' sh "$1"'; do
    if sandbox workspace-write sh -c "$command" sh "$outside/denied" 2> "$workspace/denial.log"; then
        echo 'Sandbox allowed an outside write' >&2
        exit 1
    fi
    grep -Eiq 'permission denied|operation not permitted|read-only file system' "$workspace/denial.log"
    test "$(cat "$outside/denied")" = unchanged
done

if sandbox read-only sh -c 'printf denied > "$1/readonly"' sh "$workspace" 2> "$workspace/denial.log"; then
    echo 'Sandbox allowed a write in read-only mode' >&2
    exit 1
fi
grep -Eiq 'permission denied|operation not permitted|read-only file system' "$workspace/denial.log"
test ! -e "$workspace/readonly"
echo 'Sandbox OK: workspace/temp writes, outside/child write denial, read-only mode'
