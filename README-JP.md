[![wakatime](https://wakatime.com/badge/user/f0147aa6-69b8-4142-806c-050d6fee026e/project/68da356a-cd0b-40cb-996c-0799e406179f.svg)](https://wakatime.com/badge/user/f0147aa6-69b8-4142-806c-050d6fee026e/project/68da356a-cd0b-40cb-996c-0799e406179f)
# 毎晩の原神音楽とスカイミュージックへようこそ
このプロジェクトでは、Genshin と Sky Cotl の 2 つの音楽アプリのコードを保存し、公開したアプリを表示できます [specy.app](https://specy.app)
![Composer](docs/assets/composer.webp)
![Player](docs/assets/player.webp)

# 開発モードでの実行方法
node.jsコンピュータにインストールする必要があり、 [こちらから](https://nodejs.org/en/)ダウンロードできます.
次に、repoをフォルダーに複製し、`npm i` で依存関係をインストールし、インストール後に「npm-run start」で開発サーバーを実行します。
特定のアプリケーションとして実行したり、特定のアプリケーションとして構築したりできる便利なスクリプトが 4 つあります。
「npm run dev:sky」または「npm run dev:genshin」を実行すると、ゲーム固有のWebアプリが実行され、リソースファイルが交換されます。

#翻訳のヘルプを探しています。
アプリを他の言語に翻訳するのを手伝ってくれる人を探しています、興味があれば、[翻訳の議論を見てください](https://github.com/Specy/genshin-music/discussions/52)

# デスクトップアプリケーションを開発モードで実行する方法
最初に開発サーバーを起動する必要があります、チュートリアルについてはここを[参照](#how-to-run-in-dev-mode) してください 。
その後、実行できます `npm run start-tauri`

# ビルド方法
スクリプトを使用できます `npm run build:genshin` と `npm run build:sky` 正しいアプリケーションが構築されます, または使用します `npm run build:all` 2 つのプログラムを構築する。

# デスクトップアプリケーションを構築する方法
このアプリケーションは、サンドボックス化されたネットワーク ビューである「tauri」をデスクトップ バンドルとして使用します。
`npm run build-tauri:genshin` , `npm run build-tauri:sky`, `npm run build-tauri:all`を使用してビルドできます。 
配置是预先设置的，以允许更改日志，如果您没有签名密钥，则构建将失败。
如果您想在没有变更日志的情况下进行构建, 去 `src-tauri/tauri.conf.json` 文件下将 `updater` 设置为 false

# 资料
你可以在[这里](https://github.com/Specy/genshin-music/wiki)找到应用程序的资料
它不是很详细，但可能有助于理解这种格式是如何工作的。

# 如何参与项目
添加一个新的问题，说明你想做什么，然后等待我分配问题。通过这种方式，我们还可以沟通修复/添加问题是否有效。

# README.md
<a href="./README-ZH.md">简体中文</a>|<a href="./README.md">English</a>|
