[![wakatime](https://wakatime.com/badge/user/f0147aa6-69b8-4142-806c-050d6fee026e/project/68da356a-cd0b-40cb-996c-0799e406179f.svg)](https://wakatime.com/badge/user/f0147aa6-69b8-4142-806c-050d6fee026e/project/68da356a-cd0b-40cb-996c-0799e406179f)

# Welcome to Genshin music and Sky music nightly

This repository holds the code of the two music apps for Genshin and Sky Cotl, you can see the published apps at [specy.app](https://specy.app)
![Composer](docs/assets/composer.webp)
![Player](docs/assets/player.webp)

# Looking for help in translation

I'm looking for people who could help me translate the app to other languages, if you are interested, [look at the translation discussion here](https://github.com/Specy/genshin-music/discussions/52)

# How to run in dev mode

You need Node.js >= 20.19 installed on your computer, you can get it [here](https://nodejs.org/en/).
Then clone the repo to a folder and install the dependencies with `npm i`.

You always run a specific game, this will run the webapp for that game and swap the assets in:

You can run `npm run dev:sky` or `npm run dev:genshin`.

Note: there is also a plain `npm run dev`, but it skips the per-game asset setup step, so it is not a supported way to run the app - always use one of the two commands above.

# How to build

You can use the scripts `npm run build:genshin` and `npm run build:sky` which will build the correct app, or `npm run build:all` to build both. These build for hosting each app at the root of its own domain.

If instead you want to host both apps on the same domain under a subpath (e.g. `example.com/genshinMusic`, `example.com/skyMusic`), use `npm run build:genshin-no-root`, `npm run build:sky-no-root` or `npm run build:all-no-root`.

Once you have a build, you can serve it locally with `npm run preview:genshin` or `npm run preview:sky`.

# Tech stack

The app is built with SvelteKit 2 and Svelte 5 (using runes) in TypeScript, bundled with Vite and exported as a fully static site through `@sveltejs/adapter-static` - there is no runtime server. The Composer, VSRG Composer and VSRG Player pages render their canvases with raw pixi.js 8. Translations run on i18next, save data lives in the browser via ZangoDB (IndexedDB), and offline support/update checks are handled by a serwist service worker.

# Repo layout

- `src/routes` the SvelteKit pages
- `src/lib/core` game-agnostic engine and model code
- `src/lib/games` the per-game data, see "Multi-game architecture" below
- `src/lib/stores` the app's Svelte stores
- `src/lib/components` UI components
- `src/lib/i18n` translations
- `static/` static assets copied as-is into every build
- `scripts/` the dev/build entry points that pick a game and produce the two apps

# Multi-game architecture

Genshin music and Sky music are derived from the same codebase.

You can edit and add a new game by creating a new folder under `src/lib/games/` and registering it in `scripts/buildApp.js`. You can reuse the current keyboard layouts or create your own custom ones by editing the

Each game's data lives in its own folder under `src/lib/games/<id>/`, and a build or dev run picks one of them at build time through the `$game` import alias, which points at that folder depending on the `PUBLIC_GAME` environment variable. Adding a new game means creating its `src/lib/games/<id>/` folder and registering it in `scripts/buildApp.js`.

# Documentation

You can find the documentation of the app [here](https://github.com/Specy/genshin-music/wiki)
It is not very detailed but might help to understand how the format works.

# How to contribute

Make a new issue saying what you want to work on and wait for me to assign the issue. This way we can also communicate whether or it would be a valid issue to fix/add

# Checks to run

Before opening a PR, make sure the following all pass: `npm test`, `npm run check`, `npm run check:sky`, `npm run lint`, `npm run build:all`.

# README.MD

<a href="./README.md">English</a> | <a href="./README-ZH.md">简体中文</a> | <a href="./README-JP.md">日本語</a> | <a href="./README-TR.md">Türkçe</a> | <a href="./README-ID.md">Indonesian</a>
