const { execSync } = require('child_process')
const fs = require('fs').promises
const fse = require('fs-extra')
const publicPath = './public'
const skyPath = './src/appData/sky'
const genshinPath = './src/appData/genshin'
const clc = require("cli-color");
const chosenApp = process.argv[2]

if (!['Genshin', 'Sky'].includes(chosenApp)) {
    console.error('Please specify an app name [Sky/Genshin]')
    process.exit(1)
}


async function execute() {
    await fse.copy(chosenApp === "Sky" ? skyPath : genshinPath, publicPath, { overwrite: true })
    if (process.platform === 'win32') {
        console.log(clc.yellow.bold("Starting on windows"))
        execSync(`set NEXT_PUBLIC_APP_NAME=${chosenApp}&& yarn start`, { stdio: 'inherit' })
    } else {
        console.log(clc.yellow.bold("Starting on linux"))
        execSync(`NEXT_PUBLIC_APP_NAME=${chosenApp} yarn start`, { stdio: 'inherit' })
    }
}

execute()