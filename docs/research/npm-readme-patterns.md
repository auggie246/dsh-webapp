# npm README patterns

This file records README patterns from primary-source GitHub READMEs of major npm packages.
The target is the DSH Desktop README. DSH Desktop ships through GitHub Releases.
The `dsh` CLI ships separately as the [`@deepseek-ai/dsh`](https://www.npmjs.com/package/@deepseek-ai/dsh) npm package.

Sources were fetched from `raw.githubusercontent.com` on 2026-09-01, from each repo default branch:

| Project | File | Branch |
| --- | --- | --- |
| Electron | [`README.md`](https://github.com/electron/electron/blob/main/README.md), [`docs/tutorial/installation.md`](https://github.com/electron/electron/blob/main/docs/tutorial/installation.md) | `main` |
| Vite | [`README.md`](https://github.com/vitejs/vite/blob/main/README.md) | `main` |
| Prettier | [`README.md`](https://github.com/prettier/prettier/blob/main/README.md) | `main` |
| Express | [`Readme.md`](https://github.com/expressjs/express/blob/master/Readme.md) | `master` |
| node-gyp | [`README.md`](https://github.com/nodejs/node-gyp/blob/main/README.md) | `main` |

Express names its file `Readme.md`. Branches above were current on the fetch date.

## 1. Ordering

The common skeleton is identity, then user content, then contributor content near the end.

- Identity first: logo, badges, and one-paragraph description before any command. Electron puts badges and description at [`README.md:1-12`](https://github.com/electron/electron/blob/main/README.md#L1-L12). Vite centers logo and badges, then a tagline and feature bullets at [`README.md:1-32`](https://github.com/vitejs/vite/blob/main/README.md#L1-L32).
- Installation is the first heading in three of five: Electron [`README.md:22-34`](https://github.com/electron/electron/blob/main/README.md#L22-L34), Express [`Readme.md:50-69`](https://github.com/expressjs/express/blob/master/Readme.md#L50-L69), node-gyp [`README.md:22-31`](https://github.com/nodejs/node-gyp/blob/main/README.md#L22-L31).
- Express alone adds a table of contents, right after the one-line description: [`Readme.md:10-26`](https://github.com/expressjs/express/blob/master/Readme.md#L10-L26).
- User content comes before contributor content. Every Contributing section sits near the end: Electron [`README.md:88-90`](https://github.com/electron/electron/blob/main/README.md#L88-L90), Vite [`README.md:52-54`](https://github.com/vitejs/vite/blob/main/README.md#L52-L54), Prettier [`README.md:102-104`](https://github.com/prettier/prettier/blob/main/README.md#L102-L104), Express [`Readme.md:149-175`](https://github.com/expressjs/express/blob/master/Readme.md#L149-L175).
- Electron, Vite, Express, and node-gyp use License as the final heading. Prettier ends with Contributing. Examples: Electron [`README.md:97-99`](https://github.com/electron/electron/blob/main/README.md#L97-L99), Vite [`README.md:56-58`](https://github.com/vitejs/vite/blob/main/README.md#L56-L58), Express [`Readme.md:267-269`](https://github.com/expressjs/express/blob/master/Readme.md#L267-L269).

## 2. User install commands

- One primary command, in a fenced code block, labeled with a language hint (`sh` or `bash`). Electron calls it the "preferred method": `npm install electron --save-dev` at [`README.md:22-30`](https://github.com/electron/electron/blob/main/README.md#L22-L30). Express uses `npm install express` at [`Readme.md:64-66`](https://github.com/expressjs/express/blob/master/Readme.md#L64-L66).
- Prerequisites come before the command, as plain sentences. Express: "Node.js 18 or higher is required" at [`Readme.md:55-56`](https://github.com/expressjs/express/blob/master/Readme.md#L55-L56).
- Alternate install paths follow the primary command, never precede it. Electron lists prerelease channels (`electron@alpha`, `electron@beta`) and ad-hoc runs (`npx electron .`) in [`installation.md:28-57`](https://github.com/electron/electron/blob/main/docs/tutorial/installation.md#L28-L57).
- Multi-step flows use one fenced block per step, with a sentence before each. Express Quick Start chains four steps at [`Readme.md:89-117`](https://github.com/expressjs/express/blob/master/Readme.md#L89-L117): `npm install -g express-generator@4`, create, `npm install`, `npm start`.
- Desktop users who do not use npm get a direct download path. Electron's troubleshooting section says "download Electron directly from electron/electron/releases" when npm fails: [`installation.md:176-189`](https://github.com/electron/electron/blob/main/docs/tutorial/installation.md#L176-L189).

## 3. Platform and prerequisite tables

- Two shapes exist. Electron and node-gyp use per-OS bullet groups; Vite uses a real markdown table for its package list.
- Electron states platform support as one sentence, then bullets per OS with versions and architectures at [`README.md:36-44`](https://github.com/electron/electron/blob/main/README.md#L36-L44). Format: "macOS (Ventura and up): ... 64-bit Intel and Apple Silicon / ARM binaries".
- node-gyp gives each OS its own `### On Unix` / `### On macOS` / `### On Windows` heading with a prerequisite bullet list at [`README.md:33-67`](https://github.com/nodejs/node-gyp/blob/main/README.md#L33-L67).
- Markdown tables appear where columns carry meaning, not for OS bullets: Vite's package/version table at [`README.md:44-50`](https://github.com/vitejs/vite/blob/main/README.md#L44-L50), node-gyp's command and option reference tables at [`README.md:188-232`](https://github.com/nodejs/node-gyp/blob/main/README.md#L188-L232).
- Node version floors are stated as a bare sentence, not a table. Express: "Node.js 18 or higher is required" at [`Readme.md:56`](https://github.com/expressjs/express/blob/master/Readme.md#L56). Vite shows it as a badge instead, at [`README.md:17`](https://github.com/vitejs/vite/blob/main/README.md#L17).
- Electron's installer doc lists supported `process.arch` values (`x64`, `arm64`) and platform strings (`darwin`, `mas`, `win32`, `linux`) as short bullet lists at [`installation.md:72-91`](https://github.com/electron/electron/blob/main/docs/tutorial/installation.md#L72-L91).

## 4. Warnings

- Electron and node-gyp use GitHub admonition syntax for warnings and tips. node-gyp states a version constraint as `> [!Important]` before install: [`README.md:24-25`](https://github.com/nodejs/node-gyp/blob/main/README.md#L24-L25). Electron marks release tips `> [!TIP]`: [`installation.md:46-47`](https://github.com/electron/electron/blob/main/docs/tutorial/installation.md#L46-L47) and [`installation.md:93-95`](https://github.com/electron/electron/blob/main/docs/tutorial/installation.md#L93-L95).
- Warnings stay short; the detail lives behind a link. Electron's `> [!TIP]` for platform and architecture combinations points at [Electron's GitHub Releases](https://github.com/electron/electron/releases) artifacts: [`installation.md:93-95`](https://github.com/electron/electron/blob/main/docs/tutorial/installation.md#L93-L95).
- Security guidance is its own linked section, not a warning block. Express routes vulnerabilities to a security policy at [`Readme.md:159-161`](https://github.com/expressjs/express/blob/master/Readme.md#L159-L161). Electron puts its code of conduct near the top at [`README.md:17-20`](https://github.com/electron/electron/blob/main/README.md#L17-L20).
- Install-failure warnings name the exact error codes and give the fix. Electron lists `ELIFECYCLE`, `EAI_AGAIN`, `ECONNRESET`, `ETIMEDOUT` and says the cause is network, not the package: [`installation.md:176-206`](https://github.com/electron/electron/blob/main/docs/tutorial/installation.md#L176-L206).
- Express uses bold inline labels, not admonitions, for soft advice: "**PROTIP** Be sure to read the migration guide to v5" at [`Readme.md:87`](https://github.com/expressjs/express/blob/master/Readme.md#L87).

## 5. Links to detailed docs

- Every README stays short and pushes depth to a docs site or in-repo docs. No README duplicates its full documentation.
- Electron links the deep install doc right after the short install block: "For more installation options and troubleshooting tips, see installation (`docs/tutorial/installation.md`)" at [`README.md:32-34`](https://github.com/electron/electron/blob/main/README.md#L32-L34).
- Prettier uses a dedicated docs-link block after the intro: "**[Documentation](https://prettier.io/docs/)**" then "Install · Options · CLI · API" then Playground at [`README.md:83-91`](https://github.com/prettier/prettier/blob/main/README.md#L83-L91).
- Vite ends its prose with one line: "[Read the Docs to Learn More](https://vite.dev)" at [`README.md:42`](https://github.com/vitejs/vite/blob/main/README.md#L42).
- Express keeps a "Docs & Community" section listing website, organization, and discussions at [`Readme.md:81-85`](https://github.com/expressjs/express/blob/master/Readme.md#L81-L85).
- In-repo doc links are relative paths, so they work on GitHub and npm mirrors: Electron links `CONTRIBUTING.md` at [`README.md:90`](https://github.com/electron/electron/blob/main/README.md#L90), Vite at [`README.md:54`](https://github.com/vitejs/vite/blob/main/README.md#L54), Prettier at [`README.md:104`](https://github.com/prettier/prettier/blob/main/README.md#L104).

## 6. Contributor commands

- Contributing sections are one to three sentences and link `CONTRIBUTING.md`. They carry no setup steps. See Electron [`README.md:88-90`](https://github.com/electron/electron/blob/main/README.md#L88-L90), Vite [`README.md:52-54`](https://github.com/vitejs/vite/blob/main/README.md#L52-L54), Prettier [`README.md:102-104`](https://github.com/prettier/prettier/blob/main/README.md#L102-L104).
- Express is the exception: it embeds the test commands directly. Install, then `npm test`, at [`Readme.md:163-175`](https://github.com/expressjs/express/blob/master/Readme.md#L163-L175). It also links a Code of Conduct at [`Readme.md:157`](https://github.com/expressjs/express/blob/master/Readme.md#L157).
- node-gyp documents contributor-facing CLI behavior as reference tables: its `Commands` and `Command Options` tables at [`README.md:188-232`](https://github.com/nodejs/node-gyp/blob/main/README.md#L188-L232).
- No README puts contributor setup above user install. Develop instructions sit last, near Contributing and License.

## Applicability to DSH Desktop

The DSH Desktop README already follows the strongest patterns above. It matches the skeleton: identity, prerelease `> [!NOTE]`, Install, Features, warnings, Support, Develop, at [`README.md:1-74`](https://github.com/auggie246/dsh-webapp/blob/main/README.md#L1-L74). It splits the two audiences the same way Electron does:

- Desktop users read the Install section and the platform table at [`README.md:24-32`](https://github.com/auggie246/dsh-webapp/blob/main/README.md#L24-L32), then get the unsigned-package warning linked to [`docs/release-install.md`](https://github.com/auggie246/dsh-webapp/blob/main/docs/release-install.md) at [`README.md:48-52`](https://github.com/auggie246/dsh-webapp/blob/main/README.md#L48-L52).
- npm users get the one primary command `npm install -g @deepseek-ai/dsh` at [`README.md:16-22`](https://github.com/auggie246/dsh-webapp/blob/main/README.md#L16-L22).
- Contributor commands stay last, in Develop, as the pattern prescribes: [`README.md:60-74`](https://github.com/auggie246/dsh-webapp/blob/main/README.md#L60-L74).

Two optional upgrades come from the sources:

- Electron's platform `> [!TIP]` links the reader to release artifacts: [`installation.md:93-95`](https://github.com/electron/electron/blob/main/docs/tutorial/installation.md#L93-L95). DSH Desktop could do the same for exact DMG, installer, ZIP, AppImage, and `.deb` asset names, instead of generic package names in the table at [`README.md:28-32`](https://github.com/auggie246/dsh-webapp/blob/main/README.md#L28-L32).
- Express states the runtime floor as a sentence: "Node.js 18 or higher is required" at [`Readme.md:56`](https://github.com/expressjs/express/blob/master/Readme.md#L56). DSH Desktop already does this for development ("Node.js 22 and pnpm 11.7.0" at [`README.md:62`](https://github.com/auggie246/dsh-webapp/blob/main/README.md#L62)); the same sentence form could state any `dsh` runtime floor for the npm audience.
