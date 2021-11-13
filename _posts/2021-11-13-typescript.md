---
layout: note
title:  "TypeScript"
date:   2021-11-13 13:40:02
tags:   note
permalink: /notes/typescript.html
---

# Install on Mac
Use [nvm][nvm] to install and manage node & npm versions.

# ESLint and Prettier

```bash
npx eslint --init
npm i --save-dev prettier eslint-config-prettier eslint-plugin-prettier
```

Next, add `prettier` to `extends` and `plugins` in the eslint config. Also, add a rule that prettier rules are reported as errors:

```json
{
  "extends": [
    "prettier",
  ],
  "plugins": [
    "prettier"
  ],
  "rules": {
    "prettier/prettier": "error"
  }
}
```

Tweak the prettier config to your likings:

```javascript
module.exports = {
  trailingComma: 'es5',
  semi: true,
  tabWidth: 2,
  singleQuote: true,
}
```

If you are using VS Code, create a file `.vscode/settings.json` with this content:

```json
{
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  },
}
```

# Potential eslint rules to disable for use with TypeScript

```json
{
  rules: {
    'react/react-in-jsx-scope': 'off',
    '@typescript-eslint/no-explicit-any': 'off',
  },
}
```

# Benchmarks

* [benchmark.js][gh-benchmarkjs] does [not work with browserify][gh-benchmarkjs-128] at the moment, [Chuhai][gh-chuhai] is a wrapper and contains a workaround.


[gh-benchmarkjs-128]: https://github.com/bestiejs/benchmark.js/issues/128
[gh-chuhai]: https://github.com/Hypercubed/chuhai
[gh-benchmarkjs]: https://github.com/bestiejs/benchmark.js
[nvm]: https://github.com/nvm-sh/nvm
