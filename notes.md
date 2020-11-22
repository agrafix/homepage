---
layout: page
title: Mostly technical notes
permalink: /notes/
---

## Git

```bash
# enable repo wide commit signing
git config commit.gpgsign true

# set global signing key
git config --global user.signingkey CAFEBABE

# create new branch, take local changes along
git checkout -b new-branch

# remove local branch
git branch -d new-branch

# add single hunk from a file
git add --patch

# push the current branch
git push origin HEAD

# create alias "git new" to init with empty commit
git config --global alias.new '!git init && git commit --allow-empty -m "initial commit"'

# update all submodules
git submodule foreach git pull origin master
```

## Emacs

### Splitting windows

* `C-x 2`: split into two windows, one above the other
* `C-x 3`: split into two windows, side by side
* `C-x o`: switch to other buffer in window split

### (Spacemacs only) Required package `request-0.1.0` is unavailable

see [issue #4642][ghc-spacemacs-4642]

1. `M-x list-packages`
2. search and install `request`
3. restart emacs `M-m f e R` (for 'evil': `SPC f e R`)

### Duplicate current line

```elisp
(defun duplicate-line()
  (interactive)
  (move-beginning-of-line 1)
  (kill-line)
  (yank)
  (open-line 1)
  (next-line 1)
  (yank)
  )

(global-set-key (kbd "C-c d") 'duplicate-line)
```

### Delete entire current line

```elisp
(global-set-key (kbd "C-c f") 'kill-whole-line)
```

### Mac command key work as expected again (Mac)

```elisp
(setq mac-option-modifier 'nil)
(setq mac-right-option-modifier 'nil)
(mac-auto-operator-composition-mode)
```

## Webserver configuration

* [Nginx + Let's Encrypt][do-nginx-letsencrypt]

### Enable autorun on boot (Ubuntu)

```bash
sudo update-rc.d supervisor defaults
```

## Objective C

### Blocks

```objc
// define:
typedef retTy (^BlockName)(int foo, NSString *bar);

// use:
BlockName block = ^retTy(int foo, NSString *bar) {
    // do stuff
};

// as property:
@property (nonatomic, copy) BlockName myBlock;
```

## JavaScript / TypeScript

### Install on Mac
Use [nvm][nvm] to install and manage node & npm versions.

### ESLint and Prettier

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

### Potential eslint rules to disable for use with TypeScript

```json
{
  rules: {
    'react/react-in-jsx-scope': 'off',
    '@typescript-eslint/no-explicit-any': 'off',
  },
}
```

### Benchmarks

* [benchmark.js][gh-benchmarkjs] does [not work with browserify][gh-benchmarkjs-128] at the moment, [Chuhai][gh-chuhai] is a wrapper and contains a workaround.

## Docker

### Configure daemon to listen on TCP
```bash
sudo emacs /lib/systemd/system/docker.service # remove -H option
sudo emacs /etc/docker/daemon.json # update to the following:
# { "hosts": [ "tcp://127.0.0.1:2375", "fd://" ] }
sudo systemctl daemon-reload
sudo systemctl restart docker.service
```

## Homebrew

### Run on new Apple M1 ARM chip
```bash
# install via
arch -x86_64 /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/master/install.sh)"

# usage example
arch -x86_64 brew install rocksdb
```

## Bash

### Sane shell script

```bash
#!/bin/bash -eo pipefail
```

## Tools

### Clipboard syntax highlighting (MacOS)

```bash
#!/bin/bash -eo pipefail

pbpaste | pygmentize -l $1 -f rtf | pbcopy -Prefer rtf
```

Usage: `syntax.sh python`

## AWS

* [EC2 Linux Troubleshooting][aws-ssh-trouble]

[gh-benchmarkjs-128]: https://github.com/bestiejs/benchmark.js/issues/128
[gh-chuhai]: https://github.com/Hypercubed/chuhai
[gh-benchmarkjs]: https://github.com/bestiejs/benchmark.js
[aws-ssh-trouble]: https://aws.amazon.com/de/premiumsupport/knowledge-center/ec2-linux-ssh-troubleshooting/
[ghc-spacemacs-4642]: https://github.com/syl20bnr/spacemacs/issues/4642
[do-nginx-letsencrypt]: https://www.digitalocean.com/community/tutorials/how-to-secure-nginx-with-let-s-encrypt-on-ubuntu-16-04
[nvm]: https://github.com/nvm-sh/nvm
