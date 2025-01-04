[![wakatime](https://wakatime.com/badge/user/f0147aa6-69b8-4142-806c-050d6fee026e/project/68da356a-cd0b-40cb-996c-0799e406179f.svg)](https://wakatime.com/badge/user/f0147aa6-69b8-4142-806c-050d6fee026e/project/68da356a-cd0b-40cb-996c-0799e406179f)
# 毎晩の原神音楽とスカイミュージックへようこそ
このプロジェクトでは、Genshin と Sky Cotl の 2 つの音楽アプリのコードを保存し、公開したアプリを表示できます [specy.app](https://specy.app)
![Composer](docs/assets/composer.webp)
![Player](docs/assets/player.webp)

# 開発モードでの実行方法
node.jsコンピュータにインストールする必要があり、 [こちらから](https://nodejs.org/en/)ダウンロードできます.
次に、repoをフォルダーに複製し、`npm i` で依存関係をインストールし、
インストール後に`npm-run start`で開発サーバーを実行します。
特定のアプリケーションとして実行したり、特定のアプリケーションとして構築したりできる便利なスクリプトが 4 つあります。
`npm run dev:sky`または`npm run dev:genshin`を実行すると、
ゲーム固有のWebアプリが実行され、リソースファイルが交換されます。

# 翻訳者募集のお知らせ
アプリを他の言語に翻訳するのを手伝ってくれる人を探しています、興味があれば、[翻訳の議論を見てください](https://github.com/Specy/genshin-music/discussions/52)

# デスクトップアプリケーションを開発モードで実行する方法
最初に開発サーバーを起動する必要があります、チュートリアルについてはここを[参照](#how-to-run-in-dev-mode) してください 。
その後、実行できます `npm run start-tauri`

# ビルド方法
スクリプトを使用できます `npm run build:genshin` と `npm run build:sky` 正しいアプリケーションが構築されます, または使用します `npm run build:all` 2 つのプログラムを構築する。

# デスクトップアプリケーションを構築する方法
このアプリケーションは、サンドボックス化されたネットワーク ビューである`tauri`をデスクトップ バンドルとして使用します。
`npm run build-tauri:genshin` , `npm run build-tauri:sky`, `npm run build-tauri:all`を使用してビルドできます。 
構成は変更ログを許可するように事前に設定されており、署名キーがない場合、ビルドは失敗します。
変更ログなしでビルドしたい場合は、`src-tauri/tauri.conf.json`ファイルに移動し、`updater`を`false`に設定します。

# 材料
ここでアプリケーションプロファイルを[参照](https://github.com/Specy/genshin-music/wiki)できます
あまり詳しくはありませんが、この形式がどのように機能するかを理解するのに役立つかもしれません。

# プロジェクトへの参加方法
やりたいことを記載した新しい質問を追加し、私が質問を割り当てるまで待ちます。このようにして、問題の修正/追加が効果的かどうかを伝えることもできます。

# README.MD
<a href="./README.md">English</a> | <a href="./README-ZH.md">简体中文</a> | <a href="./README-JP.md">日本語</a> | <a href="./README-TR.md">Türkçe</a> | <a href="./README-ID.md">Indonesian</a>
