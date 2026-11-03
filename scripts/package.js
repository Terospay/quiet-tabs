import { cp, mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = new URL('../', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('manifest.json', root), 'utf8'));
const destination = new URL('dist/quiet-tabs-' + manifest.version + '/', root);
await mkdir(destination, { recursive: true });
const files = ['manifest.json', 'background.js', 'core.js', 'i18n.js', 'engine.js', 'panel.html', 'panel.css', 'panel.js', 'icon.png', 'README.md', 'INSTALL.md'];
for (const file of files) await cp(new URL(file, root), new URL(file, destination));
await cp(new URL('docs/', root), new URL('docs/', destination), { recursive: true });
// Development dependencies, tests and personal browser storage never enter the package.
const archive = 'quiet-tabs-' + manifest.version + '.zip';
const result = spawnSync('zip', ['-q', '-r', archive, 'quiet-tabs-' + manifest.version], {
  cwd: fileURLToPath(new URL('dist/', root)), encoding: 'utf8',
});
if (result.status !== 0) throw new Error(result.stderr || 'The zip utility is required for packaging.');
console.log(fileURLToPath(new URL('dist/' + archive, root)));
