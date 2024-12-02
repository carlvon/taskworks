import resolve from '@rollup/plugin-node-resolve'
import commonjs from '@rollup/plugin-commonjs'
import typescript from '@rollup/plugin-typescript'
import dts from 'rollup-plugin-dts'

const config = [
  {
    input: './src/index.ts',
    output: [
      {
        file: 'dist/bundle.cjs.js',
        format: 'cjs',
        sourcemap: true,
        exports: 'auto',
      },
      {
        file: 'dist/bundle.esm.js',
        format: 'esm',
        sourcemap: true,
      },
      {
        file: 'dist/bundle.umd.js',
        format: 'umd',
        name: 'MessageWorks',
        sourcemap: true,
        exports: 'auto',
        globals: {
          uuid: 'uuid',
        },
      },
    ],
    plugins: [resolve(), commonjs(), typescript({ tsconfig: './tsconfig.json' })],
    external: ['uuid', 'worker_threads', 'message_works'],
  },

  {
    input: 'src/index.ts',
    output: {
      file: 'dist/types/index.d.ts',
      format: 'esm',
    },
    plugins: [dts()],
  },

  {
    input: 'src/workers/workflow-worker.ts',
    output: [
      {
        file: 'dist/workers/workflow-worker.js',
        format: 'iife',
        name: 'workflowWorker',
        sourcemap: true,
      },
    ],
    plugins: [
      resolve(),
      commonjs(),
      typescript({ tsconfig: './tsconfig.json' }),
    ],
    external: [],
  },

  {
    input: 'src/workers/step-worker.ts',
    output: [
      {
        file: 'dist/workers/step-worker.js',
        format: 'iife',
        name: 'stepWorker',
        sourcemap: true,
      },
    ],
    plugins: [resolve(), commonjs(), typescript({ tsconfig: './tsconfig.json' })],
    external: [],
  },

  {
    input: 'src/workers/step-input-worker.ts',
    output: [
      {
        file: 'dist/workers/step-input-worker.js',
        format: 'iife',
        name: 'stepInputWorker',
        sourcemap: true,
      },
    ],
    plugins: [resolve(), commonjs(), typescript({ tsconfig: './tsconfig.json' })],
    external: [],
  },
]

export default config
