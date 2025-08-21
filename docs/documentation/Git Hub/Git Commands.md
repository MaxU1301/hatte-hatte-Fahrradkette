---
title: Helpful Git Commands
hide:
---

#  Helpful Git Commands

A curated list of common and useful CLI commands for managing Git repositories.

!!! tip
    Replace placeholders like `<branch-name>`, `<commit-hash>`, `<remote-name>`, `<tag-name>`, and `<file-path>`.

!!! warning
    Commands that rewrite history (`rebase`, `reset --hard`, `commit --amend`) can be dangerous, especially in shared repositories. Always ensure you understand a command's function before using it. When in doubt, make a backup of your repository.

---

## ⚙️ Configuration & Setup {#configuration}

Set your Git identity and configure basic settings, typically once per machine.

```bash linenums="1"
git config --global user.name "Your Name"         # Set your name and email globally
git config --global user.email "you@example.com"
git config --global init.defaultBranch main       # Set the default branch name for new repos
git config --global core.editor "vim"             # Set your default editor for commit messages
git config --global --list                        # List all global configuration settings
```

---

## 🌱 Creating & Cloning Repositories {\#creating-cloning}

Initialize a new repository or copy an existing one.

```bash linenums="1"
git init                                          # Initialize a new repository in the current directory
git clone <repo-url>                              # Clone an existing repository
git clone <repo-url> <directory-name>             # Clone a repository into a specific directory
```

-----

## 🔄 Daily Workflow — Staging & Committing {\#daily-workflow}

The core commands for tracking and saving changes.

```bash linenums="1"
git status                                        # Check the status of your working directory
git add <file-path>                               # Stage a specific file
git add .                                         # Stage all new and modified files
git add -p                                        # Interactively stage parts of files
git diff                                          # View unstaged changes
git diff --staged                                 # View staged changes
git commit -m "Your commit message"               # Commit staged changes with a short message
git commit                                        # Commit staged changes, opening your editor for a detailed message
```

-----

## 🌿 Branching & Merging {\#branching-merging}

Manage parallel lines of development.

```bash linenums="1"
git branch                                        # List all local branches
git branch -a                                     # List all local and remote branches
git branch <new-branch-name>                      # Create a new branch
git switch <branch-name>                          # Switch to a different branch (modern)
git switch -c <new-branch-name>                   # Create and switch to a new branch
git merge <branch-name-to-merge>                  # Merge a branch into your current branch
git branch -d <branch-name>                       # Delete a merged local branch
git branch -D <branch-name>                       # DANGER: Force-delete a local branch
```

-----

## 📜 Viewing History & Logs {\#viewing-history}

Inspect the project's history.

```bash linenums="1"
git log                                           # View commit history
git log --oneline --graph --decorate --all        # View history as a compact graph
git log --stat                                    # View history with file change stats
git show <commit-hash>                            # Show the full changes for a specific commit
git log -p <file-path>                            # Show the change history for a specific file
```

-----

## 📡 Working with Remotes {\#remotes}

Collaborate and sync with a remote server.

```bash linenums="1"
git remote -v                                     # List configured remotes
git remote add <remote-name> <repo-url>           # Add a new remote
git fetch <remote-name>                           # Fetch changes from a remote
git pull <remote-name> <branch-name>              # Fetch and merge changes from a remote
git push <remote-name> <branch-name>              # Push changes to a remote
git push -u <remote-name> <branch-name>           # Push and set upstream tracking branch
```

-----

## ↩️ Undoing Changes & Fixing Mistakes {\#undoing-changes}

Correct mistakes, from unstaging a file to reverting a commit.

```bash linenums="1"
git commit --amend --no-edit                      # Add staged changes to the previous commit
git restore --staged <file-path>                  # Unstage a file
git restore <file-path>                           # Discard changes to an unstaged file
git revert <commit-hash>                          # Create a new commit that undoes a prior commit (safe)
git reset --soft HEAD~1                           # Un-commit, keep changes staged
git reset --mixed HEAD~1                          # Un-commit, keep changes in working directory (default)
git reset --hard HEAD~1                           # DANGER: Discard last commit and all changes
```

-----

## 📦 Stashing Changes {\#stashing}

Temporarily save uncommitted changes to switch contexts.

```bash linenums="1"
git stash                                         # Temporarily save uncommitted changes
git stash list                                    # List all stashes
git stash pop                                     # Apply and drop the most recent stash
git stash apply                                   # Apply the most recent stash but keep it
git stash drop                                    # Drop the most recent stash
```

-----

## 🗑️ File Management & Cleanup {\#file-management}

Remove unwanted files and perform repository maintenance.

```bash linenums="1"
git rm <file-path>                                # Remove a file from the repository
find . -name .DS_Store -print0 | xargs -0 git rm -f --ignore-unmatch # Find and remove all .DS_Store files
git clean -f                                      # DANGER: Remove all untracked files
git clean -fd                                     # DANGER: Remove untracked files AND directories
git gc                                            # Run garbage collection to optimize the repo
```