---
title: Helpful Git Commands
hide:
    - toc
    - path
---

# Helpful Git Commands

## Remove .DS_Store files from git repo

```bash linenums="1"
find . -name .DS_Store -print0 | xargs -0 git rm -f --ignore-unmatch
```