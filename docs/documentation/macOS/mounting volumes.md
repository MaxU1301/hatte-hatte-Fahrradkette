## Auto-Mount Network Shares in macOS Finder with `autofs`

This guide explains how to fix the "The original item can’t be found" error that occurs when you add a network share to your Finder Favorites.

### The Problem 🤔

When you add a mounted network share (e.g., from `/Volumes/MyShare`) to your Finder Favorites, you are creating a shortcut to a temporary mount point. If you reboot your Mac or the share disconnects, that mount point disappears. The next time you click the Favorite, Finder can't find the path and shows an error.

### The Solution: On-Demand Mounting with `autofs` ✅

The solution is to use macOS's built-in automounter, `autofs`. This service creates stable, local folders (e.g., `~/Shares/Main`) that you can add to your Favorites. When you click one of these folders, `autofs` automatically connects to and mounts the corresponding network share in the background.

This process ensures your Finder Favorites always work, as long as the network server is reachable.

-----

### Step-by-Step Guide

#### Step 1: Save Credentials to Keychain

First, you need to connect to your share once through Finder to securely save your password in the macOS Keychain. `autofs` will use these saved credentials to authenticate automatically.

1.  In Finder, go to **Go \> Connect to Server** (or press `⌘K`).
2.  Enter the server address, like `smb://SERVER/SHARE`.
3.  When prompted for your credentials, enter your username and password.
4.  **Crucially, check the box for "Remember this password in my keychain."**
5.  Once connected, you can eject the share. The password is now saved.

#### Step 2: Create Local Mount Point Folders

These are the stable folders that will live on your Mac and act as triggers for `autofs`. You can place them anywhere, but your home directory is a good choice.

In Terminal, run the following command to create a parent directory and two example mount points named `Main` and `Projects`:

```bash
mkdir -p ~/Shares/Main ~/Shares/Projects
```

#### Step 3: Configure `autofs`

This involves editing two system files. You will need administrator privileges to do this.

1.  **Edit the Master Map File**
    Open `/etc/auto_master` with a command-line editor like `nano` using `sudo` for permissions:

    ```bash
    sudo nano /etc/auto_master
    ```

    Add the following line to the very end of the file. This tells `autofs` to look at our custom SMB map file for instructions.

    ```unixconfig title="/etc/auto_master"
    /-    auto_smb    -nosuid,noowners
    ```

    Press `Ctrl+X`, then `Y`, then `Enter` to save and exit `nano`.

2.  **Create the SMB Map File**
    Now, create and edit a new file named `/etc/auto_smb`:

    ```bash
    sudo nano /etc/auto_smb
    ```

    Add one line for each network share you want to auto-mount. The format is:
    `<Local_Mount_Point> <Options> <Remote_Share_Address>`

    Here is an example for the two folders we created earlier. **Be sure to replace `your_user`, `DOMAIN`, `username`, and `SERVER` with your actual information.**

    ```{unixconfig title="/etc/auto_smb" .select}
    # Local Mount Point              # Mount Options                      # Remote Share
    /Users/your_user/Shares/Main     -fstype=smbfs,soft,noowners,nosuid   ://DOMAIN;username@SERVER/Main
    /Users/your_user/Shares/Projects -fstype=smbfs,soft,noowners,nosuid   ://DOMAIN;username@SERVER/Projects
    ```

    **Notes on the configuration:**

      * Replace `/Users/your_user/` with the actual path to your home directory.
      * If your network doesn't use a Windows domain for authentication, omit `DOMAIN;` from the address (e.g., `://username@SERVER/Main`).
      * The options `soft,noowners,nosuid` are standard and recommended for SMB shares on macOS for stability and security.

#### Step 4: Reload `autofs`

Apply your new configuration by running the following command in Terminal. This forces `autofs` to reread its map files.

```bash
sudo automount -vc
```

#### Step 5: Add to Finder Favorites

Finally, drag your new local folders (`~/Shares/Main`, `~/Shares/Projects`, etc.) from your home directory into the **Favorites** section of the Finder sidebar.

That's it\! Now, even after a reboot, clicking these Favorites will instantly mount the network share. If the server can't be reached, you'll get a clear connection error instead of the confusing "original item" message.

-----

### Important Tip

⚠️ **macOS updates can sometimes overwrite system files.** It's a good practice to keep a backup copy of your `/etc/auto_smb` file and the line you added to `/etc/auto_master` in a safe place.