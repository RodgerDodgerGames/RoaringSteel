import { fileURLToPath } from 'node:url'
import { defineConfig, globalIgnores, includeIgnoreFile } from 'eslint/config'
import js from '@eslint/js'
import pluginVue from 'eslint-plugin-vue'
import prettierRecommended from 'eslint-plugin-prettier/recommended'
import globals from 'globals'

// Replaces the `--ignore-path .gitignore` flag the lint script used to pass,
// which ESLint 9 removed. Keeps dist/, coverage/, and friends out of the run.
const gitignorePath = fileURLToPath(new URL('.gitignore', import.meta.url))

export default defineConfig([
  includeIgnoreFile(gitignorePath),
  globalIgnores(['public/**']),

  js.configs.recommended,
  pluginVue.configs['flat/essential'],

  // Application code runs in the browser.
  {
    files: ['src/**/*.{js,vue}'],
    languageOptions: {
      globals: globals.browser
    }
  },

  // Config files and anything else at the repo root run in Node.
  {
    files: ['*.js', 'vite.config.js', 'vitest.config.js'],
    languageOptions: {
      globals: globals.node
    }
  },

  // Vitest runs with `globals: true` (see vitest.config.js), so the test
  // functions are ambient rather than imported. Listed explicitly because the
  // `globals` package has no vitest set.
  {
    files: ['tests/**/*.js'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
        describe: 'readonly',
        it: 'readonly',
        test: 'readonly',
        expect: 'readonly',
        vi: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly'
      }
    }
  },

  // Temporarily a warning, not an error, so `npm run lint` exits 0 and can gate
  // CI from day one. There are 13 of these; three are unreferenced functions in
  // useBuildTrack.js that look like unfinished work rather than cruft, so they
  // need a judgment call rather than a delete. Tracked in #60 -- restore this to
  // 'error' once they are resolved.
  {
    rules: {
      'no-unused-vars': 'warn'
    }
  },

  // Must stay last: turns off stylistic rules that would fight Prettier, and
  // reports formatting drift as an ESLint error. Options come from
  // .prettierrc.json rather than being duplicated here.
  prettierRecommended
])
