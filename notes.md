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
```

## (Spac)emacs

### Splitting windows

* `C-x 2`: split into two windows, one above the other
* `C-x 3`: split into two windows, side by side
* `C-x o`: switch to other buffer in window split

### Required package `request-0.1.0` is unavailable

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

### Kill current line

```elisp
(global-set-key (kbd "C-c f") 'kill-whole-line)
```

## Webserver configuration

* [Nginx + Let's Encrypt][do-nginx-letsencrypt]

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

[ghc-spacemacs-4642]: https://github.com/syl20bnr/spacemacs/issues/4642
[do-nginx-letsencrypt]: https://www.digitalocean.com/community/tutorials/how-to-secure-nginx-with-let-s-encrypt-on-ubuntu-16-04
