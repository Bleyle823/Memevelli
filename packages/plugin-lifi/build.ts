#!/usr/bin/env bun
import { existsSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { $ } from 'bun';

async function cleanBuild(outdir = 'dist') {
    if (existsSync(outdir)) {
        await rm(outdir, { recursive: true, force: true });
        console.log(`✓ Cleaned ${outdir} directory`);
    }
}

async function build() {
    const start = performance.now();
    console.log('🚀 Building @elizaos/plugin-lifi...');

    try {
        await cleanBuild('dist');

        const [buildResult, tscResult] = await Promise.all([
            (async () => {
                console.log('📦 Bundling with Bun...');
                const result = await Bun.build({
                    entrypoints: ['./src/index.ts'],
                    outdir: './dist',
                    target: 'node',
                    format: 'esm',
                    sourcemap: true,
                    minify: false,
                    external: ['dotenv', 'node:*', '@elizaos/core', 'zod', 'viem', '@lifi/sdk'],
                    naming: { entry: '[dir]/[name].[ext]' },
                });

                if (!result.success) {
                    console.error('✗ Build failed:', result.logs);
                    return { success: false };
                }

                const totalSize = result.outputs.reduce((sum, o) => sum + o.size, 0);
                console.log(`✓ Built ${result.outputs.length} file(s) — ${(totalSize / 1024).toFixed(1)} KB`);
                return result;
            })(),

            (async () => {
                console.log('📝 Generating TypeScript declarations...');
                try {
                    await $`tsc --emitDeclarationOnly --incremental --project ./tsconfig.build.json`.quiet();
                    console.log('✓ TypeScript declarations generated');
                    return { success: true };
                } catch {
                    console.warn('⚠ Declaration generation failed (non-fatal)');
                    return { success: false };
                }
            })(),
        ]);

        if (!buildResult.success) return false;

        console.log(`✅ Build complete! (${((performance.now() - start) / 1000).toFixed(2)}s)`);
        return true;
    } catch (error) {
        console.error('Build error:', error);
        return false;
    }
}

build().then((ok) => { if (!ok) process.exit(1); }).catch(() => process.exit(1));
