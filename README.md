[![wakatime](https://wakatime.com/badge/user/f0147aa6-69b8-4142-806c-050d6fee026e/project/68da356a-cd0b-40cb-996c-0799e406179f.svg)](https://wakatime.com/badge/user/f0147aa6-69b8-4142-806c-050d6fee026e/project/68da356a-cd0b-40cb-996c-0799e406179f)
# Welcome to Genshin music and Sky music nightly

This repository holds the code of the two music apps for Genshin and Sky Cotl, you can see the published apps at [specy.app](https://specy.app)
![Composer](docs/assets/composer.webp)
![Player](docs/assets/player.webp)

# Looking for help in translation
I'm looking for people who could help me translate the app to other languages, if you are interested, [look at the translation discussion here](https://github.com/Specy/genshin-music/discussions/52)

# How to run in dev mode
You need node.js installed on your computer, you can get it [here](https://nodejs.org/en/).
Then clone the repo to a folder and install the dependencies with `npm i`, once installed, run the development server with `npm run start`

There are 4 more scripts which might be useful, run as a specific app and build as a specific app.

You can run `npm run dev:sky` or `npm run dev:genshin`, this will run the webapps for the specific game and swap the assets. 

# How to run desktop app in dev mode
You need to first start the development server, look [here](#how-to-run-in-dev-mode) for how to do that.
Then you can run `npm run start-tauri`
# How to build

You can use the scripts `npm run build:genshin` and `npm run build:sky` which will build the correct app, or `npm run build:all` to build both

# How to build desktop app
I advise not to use the desktop app as it's not developed much, it was mostly a proof of concept, use the webapp instead.

The app uses tauri for the desktop bundle which is a sandboxed webview. You can build it by using `npm run build-tauri:genshin`, `npm run build-tauri:sky`, `npm run build-tauri:all`. The config is premade to allow for changelog, if you dont have a signing key, the build will fail. If you want to build without changelog, go to `src-tauri/tauri.conf.json` and set `updater` to false


# Documentation
You can find the documentation of the app [here](https://github.com/Specy/genshin-music/wiki)
It is not very detailed but might help to understand how the format works.

# How to contribute
Make a new issue saying what you want to work on and wait for me to assign the issue. This way we can also communicate whether or it would be a valid issue to fix/add

# README.MD
<a href="./README.md">English</a> | <a href="./README-ZH.md">简体中文</a> | <a href="./README-JP.md">日本語</a> | <a href="./README-TR.md">Türkçe</a> | <a href="./README-ID.md">Indonesian</a>

