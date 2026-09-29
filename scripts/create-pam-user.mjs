import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const args = process.argv.slice(2);
const isAdmin = args.includes('--admin');
const isLocal = args.includes('--local');
const values = args.filter(arg => !['--admin', '--local'].includes(arg));
const username = String(values[0] || '').trim();
const displayName = String(values[1] || username).trim();
const pepper = String(process.env.PAM_KEY_PEPPER || '');

if (!/^[A-Za-z0-9._@-]{3,80}$/.test(username)) {
    fail('Usage: node scripts/create-pam-user.mjs <username> [display-name] [--admin] [--local]');
}
if (!displayName || displayName.length > 80) fail('Display name must contain 1-80 characters.');
if (pepper.length < 32) fail('Set PAM_KEY_PEPPER to the same 32+ character secret configured in Cloudflare Pages.');

const userId = randomUUID();
const credentialId = randomUUID();
const keyId = randomBytes(9).toString('base64url');
const secret = randomBytes(32).toString('base64url');
const accessKey = `pam_${keyId}_${secret}`;
const secretHash = createHmac('sha256', pepper).update(`${keyId}.${secret}`).digest('base64url');
const now = new Date().toISOString();
const role = isAdmin ? 'admin' : 'member';
const sql = `INSERT INTO pam_users (id, username, display_name, role, status, auth_version, created_at, updated_at) VALUES (${quote(userId)}, ${quote(username)}, ${quote(displayName)}, ${quote(role)}, 'active', 1, ${quote(now)}, ${quote(now)}); INSERT INTO pam_credentials (id, user_id, key_id, secret_hash, created_at) VALUES (${quote(credentialId)}, ${quote(userId)}, ${quote(keyId)}, ${quote(secretHash)}, ${quote(now)});`;
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const tempDirectory = mkdtempSync(join(tmpdir(), 'finbox-pam-user-'));
const sqlPath = join(tempDirectory, 'create-user.sql');
writeFileSync(sqlPath, sql, { encoding: 'utf8', mode: 0o600 });
let result;
try {
    result = spawnSync(npx, ['wrangler', 'd1', 'execute', 'PAM_DB', isLocal ? '--local' : '--remote', '--file', sqlPath], {
        cwd: process.cwd(),
        encoding: 'utf8',
        shell: process.platform === 'win32',
        stdio: ['inherit', 'pipe', 'pipe']
    });
} finally {
    rmSync(tempDirectory, { recursive: true, force: true });
}

if (result.status !== 0) {
    if (result.error) process.stderr.write(`${result.error.message}\n`);
    if (result.stdout) process.stderr.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    fail('Failed to create PAM user. No access key was issued.');
}

process.stdout.write(`PAM user created\nUsername: ${username}\nRole: ${role}\nAccess key (shown once): ${accessKey}\n`);

function quote(value) {
    return `'${String(value).replaceAll("'", "''")}'`;
}

function fail(message) {
    process.stderr.write(`${message}\n`);
    process.exit(1);
}
