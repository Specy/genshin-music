[![wakatime](https://wakatime.com/badge/user/f0147aa6-69b8-4142-806c-050d6fee026e/project/68da356a-cd0b-40cb-996c-0799e406179f.svg)](https://wakatime.com/badge/user/f0147aa6-69b8-4142-806c-050d6fee026e/project/68da356a-cd0b-40cb-996c-0799e406179f)
# 欢迎来到原神音乐和光遇音乐之夜
此项目保存原神和光遇两个音乐应用程序的代码, 您可以在上查看已发布的应用程序 [specy.app](https://specy.app)
![Composer](docs/assets/composer.webp)
![Player](docs/assets/player.webp)

# 如何在开发模式下运行
你需要在你的计算机上安装node.js，你可以在 [这里](https://nodejs.org/en/)下载.
然后将repo克隆到一个文件夹中，并使用 `npm i` 安装依赖项，安装后，使用 `npm-run start` 运行开发服务器
还有4个脚本可能很有用，可以作为特定的应用程序运行，也可以作为特定应用程序构建。
您可以运行 `npm run dev:sky` 或  `npm run dev:genshin` ，这将运行特定游戏的网络应用程序并交换资源文件。

# 寻找翻译人员
我正在寻找有人帮助我将我的应用程序翻译成其他语言，
如果您感兴趣，请参照翻译[讨论](https://github.com/Specy/genshin-music/discussions/52)

# 如何在开发模式下运行桌面应用程序
您需要首先启动开发服务器, 教程看 [这](#how-to-run-in-dev-mode) .
然后你可以运行 `npm run start-tauri`

# 如何构建
你可以使用脚本 `npm run build:genshin` 和 `npm run build:sky` 它将构建正确的应用程序, 或者使用 `npm run build:all` 构建两个程序。

# 如何构建桌面应用程序
该应用程序使用tauri作为桌面捆绑包，这是一个沙盒网络视图。您可以使用 `npm run build-tauri:genshin` , `npm run build-tauri:sky`, `npm run build-tauri:all`来构建它. 
配置是预先设置的，以允许更改日志，如果您没有签名密钥，则构建将失败。
如果您想在没有变更日志的情况下进行构建, 去 `src-tauri/tauri.conf.json` 文件下将 `updater` 设置为 false

# 资料
你可以在[这里](https://github.com/Specy/genshin-music/wiki)找到应用程序的资料
它不是很详细，但可能有助于理解这种格式是如何工作的。

# 如何参与项目
添加一个新的问题，说明你想做什么，然后等待我分配问题。通过这种方式，我们还可以沟通修复/添加问题是否有效。

# README.MD
<a href="./README.md">English</a> | <a href="./README-ZH.md">简体中文</a> | <a href="./README-JP.md">日本語</a> | <a href="./README-TR.md">Türkçe</a> | <a href="./README-ID.md">Indonesian</a>
