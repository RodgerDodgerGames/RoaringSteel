module.exports = {
  root: true,
  env: {
    node: true
  },
  extends: [
    'plugin:vue/vue3-essential',
    'eslint:recommended',
    'plugin:prettier/recommended' // Enables eslint-plugin-prettier and eslint-config-prettier
  ],
  parserOptions: {
    parser: '@babel/eslint-parser',
    requireConfigFile: false
  },
  rules: {
    'prettier/prettier': ['error', { singleQuote: true, semi: false }] // Your Prettier options
  }
}
