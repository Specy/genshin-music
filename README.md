# Welcome to Genshin music and Sky music nightly

This repository holds the code relative to the two music apps for Genshin and sky cotl, you can see the published apps at https://specy.github.io/

# How to run
Simply install the npm modules with `npm i`, once installed, run the development server with `npm run start`

There are 4 more scripts which might be useful, run as a specific app and build as a specific app.

You can run `npm run startSky` or `npm run startGenshin`, this will run the webapps for the specific game and swap the assets. 

You can manually do this also by editing the src/appConfig.js and in the first line, change the app name.

# How to build

You can use the scripts `npm run buildGenshin` and `npm run buildSky` which will build the correct app.
