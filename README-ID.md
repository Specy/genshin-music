[![wakatime](https://wakatime.com/badge/user/f0147aa6-69b8-4142-806c-050d6fee026e/project/68da356a-cd0b-40cb-996c-0799e406179f.svg)](https://wakatime.com/badge/user/f0147aa6-69b8-4142-806c-050d6fee026e/project/68da356a-cd0b-40cb-996c-0799e406179f)
# Selamat datang di Genshin music dan Sky music nightly

Repositori ini menyimpan kode dari dua aplikasi musik untuk Genshin dan Sky Cotl, Anda dapat melihat aplikasi yang telah dipublikasikan di [specy.app](https://specy.app)
![Composer](docs/assets/composer.webp)
![Player](docs/assets/player.webp)

# Mencari bantuan dalam penerjemahan
Saya sedang mencari orang yang dapat membantu saya menerjemahkan aplikasi ini ke bahasa lain, jika Anda tertarik, [silakan lihat diskusi terjemahan di sini](https://github.com/Specy/genshin-music/discussions/52)

# Cara menjalankan dalam mode dev
Anda memerlukan node.js terinstal di komputer Anda, Anda bisa mendapatkannya [disini](https://nodejs.org/en/).
kemudian kloning repo ke sebuah folder dan instal dependensi dengan `npm i`, setelah terinstal, jalankan server developernya dengan `npm run start`

Ada 4 script lain yang mungkin berguna, dijalankan sebagai aplikasi tertentu dan dibangun sebagai aplikasi tertentu.

Anda dapat menjalankan `npm run dev:sky` atau `npm run dev:genshin`, ini akan menjalankan aplikasi web untuk game tertentu dan menukar aset.

# Cara menjalankan aplikasi desktop dalam mode dev
Anda harus terlebih dahulu memulai server developer, lihat [disini](#how-to-run-in-dev-mode) untuk mengetahui cara melakukannya.
Kemudian Anda dapat menjalankan `npm run start-tauri`
# Cara membuild

Anda dapat menggunakan skrip `npm run build:genshin` dan `npm run build:sky` yang akan membuild aplikasi yang benar, atau `npm run build:all` untuk membuild keduanya

# Cara membuild aplikasi desktop
Saya menyarankan untuk tidak menggunakan aplikasi desktop karena aplikasi ini belum banyak dikembangkan, sebagian besar hanya sebagai bukti konsep, gunakanlah aplikasi web sebagai gantinya.

Aplikasi ini menggunakan tauri untuk bundel desktop yang merupakan tampilan web sandbox. Anda dapat membuildnya dengan menggunakan `npm run build-tauri:genshin`, `npm run build-tauri:sky`, `npm run build-tauri:all`. Konfigurasi ini sudah dibuat sebelumnya untuk memungkinkan adanya changelog, jika Anda tidak memiliki signing key, maka build akan gagal. Jika Anda ingin membuild tanpa changelog, buka `src-tauri/tauri.conf.json` dan atur `updater` menjadi false

# Dokumentasi
Anda dapat menemukan dokumentasi aplikasi ini [disini](https://github.com/Specy/genshin-music/wiki)
Ini mungkin tidak terlalu rinci, tetapi dapat membantu untuk memahami cara kerja formatnya.

# Cara berkontribusi
Buatlah isu baru dengan menyebutkan apa yang ingin Anda kerjakan dan tunggu saya untuk menugaskan isu tersebut. Dengan cara ini kita juga dapat mengomunikasikan apakah isu tersebut valid untuk diperbaiki/ditambahkan

# README.MD
<a href="./README.md">English</a> | <a href="./README-ZH.md">简体中文</a> | <a href="./README-JP.md">日本語</a> | <a href="./README-TR.md">Türkçe</a> | <a href="./README-ID.md">Indonesian</a>
