import { cp, readFile, rm } from 'node:fs/promises';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(appDirectory, 'node_modules');
const target = path.join(appDirectory, 'runtime-dependencies');
const targetNodeModules = path.join(target, 'node_modules');
const requireFromApp = createRequire(path.join(appDirectory, 'package.json'));
const packageManifest = JSON.parse(await readFile(path.join(appDirectory, 'package.json'), 'utf8'));

function packageRoot(packagePath) {
  let current = packagePath;
  while (current !== path.dirname(current)) {
    if (fs.existsSync(path.join(current, 'package.json'))) {
      return current;
    }
    current = path.dirname(current);
  }
  return undefined;
}

function resolvePackageRoot(packageName, fromPath) {
  try {
    const entrypoint = requireFromApp.resolve(packageName, { paths: [fromPath] });
    return packageRoot(entrypoint);
  } catch {
    return undefined;
  }
}

const packagesToStage = new Map();
const pending = Object.keys(packageManifest.dependencies ?? {}).map((name) => ({
  name,
  fromPath: appDirectory,
}));
while (pending.length > 0) {
  const { name: packageName, fromPath } = pending.pop();
  if (packagesToStage.has(packageName)) {
    continue;
  }

  const packagePath = resolvePackageRoot(packageName, fromPath);
  if (!packagePath) {
    console.warn(`Skipping unresolved production dependency: ${packageName}`);
    continue;
  }

  const manifest = JSON.parse(await readFile(path.join(packagePath, 'package.json'), 'utf8'));
  packagesToStage.set(packageName, { packagePath, manifest });
  pending.push(
    ...Object.keys(manifest.dependencies ?? {}).map((name) => ({ name, fromPath: packagePath })),
    ...Object.keys(manifest.optionalDependencies ?? {}).map((name) => ({ name, fromPath: packagePath })),
  );
}

await rm(target, { recursive: true, force: true });
await fs.promises.mkdir(targetNodeModules, { recursive: true });

for (const [packageName, { packagePath }] of packagesToStage) {
  const destination = path.join(targetNodeModules, packageName);
  await fs.promises.mkdir(path.dirname(destination), { recursive: true });
  await cp(packagePath, destination, { recursive: true, dereference: true });
}

console.log(`Staged ${packagesToStage.size} production dependencies in ${path.basename(target)}/`);
