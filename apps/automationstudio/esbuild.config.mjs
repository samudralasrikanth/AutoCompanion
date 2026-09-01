import * as esbuild from 'esbuild';

const isWatch = process.argv.includes('--watch');

const buildOptions = {
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: 'dist/extension.js',
  external: ['vscode', 'playwright-core', 'fsevents', 'chromium-bidi/*', 'uiohook-napi', 'screenshot-desktop', 'tesseract.js'],
  format: 'cjs',
  platform: 'node',
  target: 'node22',
  sourcemap: true,
  minify: false,
  treeShaking: true,
  metafile: true,
  logLevel: 'info',
};

if (isWatch) {
  const ctx = await esbuild.context(buildOptions);
  await ctx.watch();
  console.log('Watching for changes...');
} else {
  const result = await esbuild.build(buildOptions);
  if (result.metafile) {
    const analysis = await esbuild.analyzeMetafile(result.metafile);
    console.log(analysis);
  }
}
