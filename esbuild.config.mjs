import path from 'path';
import { build, context } from 'esbuild';

const args = process.argv.slice(2);
const isProduction = args.includes('--production');
const isWatch = args.includes('--watch');
const isWebOnly = args.includes('--web');

/** @type {import('esbuild').BuildOptions} */
const nodeOptions = {
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

/** @type {import('esbuild').BuildOptions} */
const webOptions = {
  entryPoints: ['src/extension.web.ts'],
  bundle: true,
  outfile: 'dist/web/extension.js',
  platform: 'browser',
  format: 'esm',
  external: ['vscode'],
  sourcemap: !isProduction,
  minify: isProduction,
  target: 'es2020',
  plugins: [
    {
      name: 'skycms-web-http-alias',
      setup(buildApi) {
        buildApi.onResolve({ filter: /^\.\/http$/ }, (args) => {
          const normalizedImporter = args.importer.replace(/\\/g, '/');
          if (!normalizedImporter.includes('/src/apiClient/')) {
            return null;
          }

          return {
            path: path.join(path.dirname(args.importer), 'http.browser.ts'),
          };
        });
      },
    },
  ],
};

const buildTargets = isWebOnly ? [webOptions] : [nodeOptions, webOptions];

if (isWatch) {
  const contexts = await Promise.all(buildTargets.map((opts) => context(opts)));
  await Promise.all(contexts.map((ctx) => ctx.watch()));
  console.log('[esbuild] watching for changes…');
} else {
  await Promise.all(buildTargets.map((opts) => build(opts)));
}
