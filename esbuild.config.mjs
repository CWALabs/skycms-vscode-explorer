import { build, context } from 'esbuild';

const args = process.argv.slice(2);
const isProduction = args.includes('--production');
const isWatch = args.includes('--watch');

/** @type {import('esbuild').BuildOptions} */
const options = {
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: 'dist/extension.js',
  platform: 'node',
  format: 'cjs',
  external: ['vscode'],
  sourcemap: !isProduction,
  minify: isProduction,
  target: 'node18',
};

if (isWatch) {
  const ctx = await context(options);
  await ctx.watch();
  console.log('[esbuild] watching for changes…');
} else {
  await build(options);
}
