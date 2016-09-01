---
layout: page
title: Mostly technical notes
permalink: /notes/
---

# Git

```bash
# enable repo wide commit signing
git config commit.gpgsign true

# set global signing key
git config --global user.signingkey CAFEBABE

# create new branch, take local changes along
git checkout -b new-branch

# remove local branch
git branch -d new-branch
```
