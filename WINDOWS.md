# Ancients on Windows

This guide gets Ancients running on Windows 10 or 11. The game is the same everywhere; only the setup steps differ from the macOS and Linux notes in `README.md`.

## What you need

- **Node.js 20 or newer.** Check with `node --version`. If it's missing or older, install it (next section).
- **npm.** It ships with Node, so installing Node covers both.
- **A WebGL2 browser.** Current Chrome or Edge both work and both come with WebGL2 on. Edge is already on every Windows install.
- **A terminal.** PowerShell or Windows Terminal. Both come with Windows. The commands below are the same in either one.

## Install Node

Pick one of these.

**winget (built into Windows 11 and recent Windows 10):**

```powershell
winget install OpenJS.NodeJS.LTS
```

**Installer:** download the LTS `.msi` from [nodejs.org](https://nodejs.org/), run it, and accept the defaults. The defaults add Node and npm to your PATH.

Close and reopen your terminal after installing, then confirm both are on PATH:

```powershell
node --version
npm --version
```

## Get the code

If you have Git for Windows:

```powershell
git clone <repo-url>
cd ancients
```

No Git? Download the project as a ZIP, extract it, then `cd` into the folder.

## Set up and run

```powershell
npm install
npm run dev
```

Vite prints a local URL like `http://localhost:5173/`. Open it in Chrome or Edge, click **New Game**, and pick a starter hero. Controls and the rest of the walkthrough live in `README.md`.

To stop the dev server, press `Ctrl+C` in the terminal.

## Useful commands

These run the same way as on other systems:

```powershell
npm test          # run the vitest suite
npm run build     # typecheck and build the Vite app
npm run typecheck # run TypeScript without emitting
npm run assets:check  # build the asset manifest and check size budgets
```

## Windows snags and fixes

**`npm` won't run: "running scripts is disabled on this system."** PowerShell blocks scripts by default, and that catches the `npm.ps1` wrapper. Allow local scripts for your user:

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

Answer `Y`, reopen the terminal, and try again. If you'd rather not change the policy, run the commands from `cmd.exe` instead, where this restriction doesn't apply.

**`node` or `npm` is "not recognized."** PATH didn't pick up the install. Close every terminal window and open a fresh one. If it still fails, reinstall Node with the `.msi` and leave the "Add to PATH" option checked.

**`npm install` fails while building `sharp`.** `sharp` powers the asset pipeline and ships prebuilt binaries for Windows, so this is rare. If it does fail, update npm with `npm install -g npm@latest` and run `npm install` again.

**A long path error during install (`ENAMETOOLONG` or a path over 260 characters).** Clone the project closer to the drive root, such as `C:\dev\ancients`, so the nested `node_modules` paths stay short. You can also turn on long paths once as an administrator:

```powershell
git config --global core.longpaths true
```

**Line endings look noisy in Git.** Set Git to keep line endings consistent so editor saves don't show up as whole-file changes:

```powershell
git config --global core.autocrlf true
```

**The page is black or WebGL is disabled.** Update your graphics driver and confirm hardware acceleration is on in your browser settings. Visit `chrome://gpu` (or `edge://gpu`) and look for "WebGL2: Hardware accelerated."

## Performance note

The game leans on the GPU. A laptop with switchable graphics may default to the integrated chip and run slowly. In the NVIDIA Control Panel or your laptop's graphics settings, set your browser to use the high-performance GPU, then reload the tab.
