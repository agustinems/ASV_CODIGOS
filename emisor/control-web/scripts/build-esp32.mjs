import { spawnSync } from 'node:child_process';
import { readdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const project = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = join(project, 'dist-esp32');
const vite = join(project, 'node_modules', '.bin', 'vite');

const build = spawnSync(vite, ['build', '--config', 'vite.spa.config.ts'], {
  cwd: project,
  env: { ...process.env, VITE_ASV_EMBEDDED: '1' },
  stdio: 'inherit',
});
if (build.status !== 0) process.exit(build.status || 1);

// Imagen social usada sólo al compartir la URL pública: libera 844 kB en flash.
rmSync(join(output, 'og.png'), { force: true });

function totalBytes(directory) {
  return readdirSync(directory).reduce((sum, name) => {
    const path = join(directory, name);
    const stat = statSync(path);
    return sum + (stat.isDirectory() ? totalBytes(path) : stat.size);
  }, 0);
}

const bytes = totalBytes(output);
console.log(`Página para ESP32: ${(bytes / 1024).toFixed(0)} KiB`);
if (bytes > 1_700_000) {
  console.error('La página supera el espacio seguro de la partición LittleFS.');
  process.exit(1);
}
