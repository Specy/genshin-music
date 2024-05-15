[![wakatime](https://wakatime.com/badge/user/f0147aa6-69b8-4142-806c-050d6fee026e/project/68da356a-cd0b-40cb-996c-0799e406179f.svg)](https://wakatime.com/badge/user/f0147aa6-69b8-4142-806c-050d6fee026e/project/68da356a-cd0b-40cb-996c-0799e406179f)
# 欢迎收看原神音乐和光遇音乐之夜

此项目保存原神和光遇两个音乐应用程序的代码, 您可以在上查看已发布的应用程序 [specy.app](https://specy.app)
![Composer](docs/assets/composer.webp)
![Player](docs/assets/player.webp)

# 如何在开发模式下运行
You need node.js installed on your computer, you can get it [here](https://nodejs.org/en/).
Then clone the repo to a folder and install the dependencies with `npm i`, once installed, run the development server with `npm run start`

There are 4 more scripts which might be useful, run as a specific app and build as a specific app.

You can run `npm run dev:光遇` or `npm run dev:genshin`, this will run the webapps for the specific game and swap the assets. 

# How to run desktop app in dev mode
You need to first start the development server, look [here](#how-to-run-in-dev-mode) for how to do that.
Then you can run `npm run start-tauri`
# How to build

You can use the scripts `npm run build:genshin` and `npm run build:光遇` which will build the correct app, or `npm run build:all` to build both

# How to build desktop app

The app uses tauri for the desktop bundle which is a sandboxed webview. You can build it by using `npm run build-tauri:genshin`, `npm run build-tauri:光遇`, `npm run build-tauri:all`. The config is premade to allow for changelog, if you dont have a signing key, the build will fail. If you want to build without changelog, go to `src-tauri/tauri.conf.json` and set `updater` to false


# Documentation
You can find the documentation of the app [here](https://github.com/Specy/genshin-music/wiki)
It is not very detailed but might help to understand how the format works.

# How to contribute
Make a new issue saying what you want to work on and wait for me to assign the issue. This way we can also communicate whether or it would be a valid issue to fix/add
