import { build } from 'esbuild';

await build({
  entryPoints: ['scripts/firebase-sdk.mjs'],
  outfile: 'dist/firebase-sdk.bundle.mjs',
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: ['es2022'],
  minify: true,
  legalComments: 'eof',
  logLevel: 'info',
});
