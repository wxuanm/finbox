import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const args = process.argv.slice(2);
const command = String(args[0] || '').toLowerCase();
const username = String(args[1] || '').trim();
const isLocal = args.includes('--local');
const isRemote = args.includes('--remote');
const flags = args.slice(2);

if (args.includes('--help') || args.includes('-h')) usage(0);
if (!['reissue', 'revoke', 'disable'].includes(command)) usage(1);
if (!/^[A-Za-z0-9._@-]{3,80}$/.test(username)) fail('Username must contain 3-80 letters, numbers, or . _ @ - characters.');
if (flags.some(flag => !['--local', '--remote'].includes(flag))) usage(1);
if (isLocal === isRemote) fail('Choose exactly one target: --local or --remote.');

const user = queryUser(username);
if (!user) fail(`PAM user not found: ${username}`);

if (command === 'reissue') reissueCredential(user);
if (command === 'revoke') revokeCredentials(user);
if (command === 'disable') disableUser(user);

function reissueCredential(user) {
    if (user.status !== 'active') fail(`PAM user is not active: ${username}`);

    const pepper = String(process.env.PAM_KEY_PEPPER || '');
    if (pepper.length < 32) fail('Set PAM_KEY_PEPPER to the same 32+ character secret configured in the target Pages environment.');

    const credentialId = randomUUID();
    const keyId = randomBytes(9).toString('base64url');
    const secret = randomBytes(32).toString('base64url');
    const accessKey = `pam_${keyId}_${secret}`;
    const secretHash = createHmac('sha256', pepper).update(`${keyId}.${secret}`).digest('base64url');
    const now = new Date().toISOString();
    const sql = `UPDATE pam_credentials SET revoked_at = ${quote(now)} WHERE user_id = ${quote(user.id)} AND revoked_at = '';
UPDATE pam_sessions SET revoked_at = ${quote(now)} WHERE user_id = ${quote(user.id)} AND revoked_at = '';
UPDATE pam_users SET auth_version = auth_version + 1, updated_at = ${quote(now)} WHERE id = ${quote(user.id)};
INSERT INTO pam_credentials (id, user_id, key_id, secret_hash, created_at) VALUES (${quote(credentialId)}, ${quote(user.id)}, ${quote(keyId)}, ${quote(secretHash)}, ${quote(now)});`;

    executeSqlFile(sql, 'reissue-credential.sql');
    process.stdout.write(`PAM credential reissued\nUsername: ${user.username}\nExisting credentials: revoked\nExisting sessions: revoked\nAccess key (shown once): ${accessKey}\n`);
}

function revokeCredentials(user) {
    const now = new Date().toISOString();
    const sql = `UPDATE pam_credentials SET revoked_at = ${quote(now)} WHERE user_id = ${quote(user.id)} AND revoked_at = '';
UPDATE pam_sessions SET revoked_at = ${quote(now)} WHERE user_id = ${quote(user.id)} AND revoked_at = '';
UPDATE pam_users SET auth_version = auth_version + 1, updated_at = ${quote(now)} WHERE id = ${quote(user.id)};`;

    executeSqlFile(sql, 'revoke-credentials.sql');
    process.stdout.write(`PAM credentials revoked\nUsername: ${user.username}\nExisting sessions: revoked\n`);
}

function disableUser(user) {
    const now = new Date().toISOString();
    const sql = `UPDATE pam_credentials SET revoked_at = ${quote(now)} WHERE user_id = ${quote(user.id)} AND revoked_at = '';
UPDATE pam_sessions SET revoked_at = ${quote(now)} WHERE user_id = ${quote(user.id)} AND revoked_at = '';
UPDATE pam_users SET status = 'disabled', auth_version = auth_version + 1, updated_at = ${quote(now)} WHERE id = ${quote(user.id)};`;

    executeSqlFile(sql, 'disable-user.sql');
    process.stdout.write(`PAM user disabled\nUsername: ${user.username}\nCredentials: revoked\nExisting sessions: revoked\n`);
}

function queryUser(value) {
    const sql = `SELECT id, username, status, auth_version FROM pam_users WHERE username = ${quote(value)} COLLATE NOCASE LIMIT 1;`;
    const result = executeSqlFile(sql, 'find-user.sql', true);
    let payload;
    try {
        payload = JSON.parse(result.stdout);
    } catch {
        fail('Wrangler returned an unreadable response while looking up the PAM user.');
    }
    return payload?.[0]?.results?.[0] || null;
}

function executeSqlFile(sql, filename, returnResult = false) {
    const tempDirectory = mkdtempSync(join(tmpdir(), 'finbox-pam-user-'));
    const sqlPath = join(tempDirectory, filename);
    writeFileSync(sqlPath, sql, { encoding: 'utf8', mode: 0o600 });
    try {
        const args = ['d1', 'execute', 'PAM_DB', targetFlag(), '--file', sqlPath];
        if (returnResult) args.push('--json');
        return runWrangler(args);
    } finally {
        rmSync(tempDirectory, { recursive: true, force: true });
    }
}

function runWrangler(wranglerArgs) {
    const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
    const result = spawnSync(npx, ['wrangler', ...wranglerArgs], {
        cwd: process.cwd(),
        encoding: 'utf8',
        shell: process.platform === 'win32',
        stdio: ['inherit', 'pipe', 'pipe']
    });
    if (result.status !== 0) {
        if (result.error) process.stderr.write(`${result.error.message}\n`);
        if (result.stdout) process.stderr.write(result.stdout);
        if (result.stderr) process.stderr.write(result.stderr);
        fail('PAM user operation failed.');
    }
    return result;
}

function targetFlag() {
    return isLocal ? '--local' : '--remote';
}

function quote(value) {
    return `'${String(value).replaceAll("'", "''")}'`;
}

function usage(exitCode) {
    const message = `Usage:
  node scripts/manage-pam-user.mjs reissue <username> (--local | --remote)
  node scripts/manage-pam-user.mjs revoke <username> (--local | --remote)
  node scripts/manage-pam-user.mjs disable <username> (--local | --remote)
`;
    (exitCode ? process.stderr : process.stdout).write(message);
    process.exit(exitCode);
}

function fail(message) {
    process.stderr.write(`${message}\n`);
    process.exit(1);
}
