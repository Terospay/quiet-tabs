import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const root = new URL('../', import.meta.url);
const readJSON = async name => JSON.parse(await readFile(new URL(name, root), 'utf8'));
const manifest = await readJSON('manifest.json');
const pkg = await readJSON('package.json');
assert.equal(manifest.version, pkg.version);
assert.equal(manifest.manifest_version, 3);
assert.equal(manifest.background.type, 'module');
assert.equal(manifest.incognito, 'not_allowed');
assert.equal(manifest.host_permissions, undefined);
assert.equal(manifest.content_scripts, undefined);
assert.match(manifest.content_security_policy.extension_pages, /connect-src 'none'/);
for (const name of [manifest.background.service_worker, manifest.side_panel.default_path, manifest.icons['128'], 'core.js', 'i18n.js', 'engine.js', 'panel.js', 'panel.css']) {
  await access(new URL(name, root));
}
for (const name of ['core.js', 'i18n.js', 'engine.js', 'background.js', 'panel.js']) {
  const result = spawnSync(process.execPath, ['--check', new URL(name, root).pathname], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
}
console.log('Manifest, permissions, runtime files and JavaScript syntax: OK');
