const fs = require('fs/promises')
const copyDir = require('recursive-copy')
const skyPath = './src/appData/sky'
const genshinPath = './src/appData/genshin'
const publicPath = './public'
const chosenApp = process.argv[2]
const { execSync } = require('child_process')

if (!['Genshin', 'Sky', "All"].includes(chosenApp)) {
    console.error('Please specify an app name [Sky/Genshin/All]')
    process.exit(1)
}

function deleteAssets() {
    //delete all file in a directory except the assets directory
    return fs.readdir(publicPath)
        .then(files => {
            return Promise.all(files.map(file => {
                if (file !== 'assets') {
                    if (!file.includes('.')) return fs.rmdir(`${publicPath}/${file}`, { recursive: true })
                    return fs.unlink(`${publicPath}/${file}`)
                }
            }))
        })
}

async function execute() {
    let toBuild = chosenApp === "All" ? ['Sky', 'Genshin'] : [chosenApp]
    for (let i = 0; i < toBuild.length; i++) {
        let app = toBuild[i]
        console.log("\x1b[33m", 'Building ' + app + '...')
        await deleteAssets()
        await copyDir(app === "Sky" ? skyPath : genshinPath, publicPath)
        try {
            if (process.platform === 'win32') {
                console.log(" Building on windows")
                execSync(`set REACT_APP_NAME=${app}&& set BUILD_PATH=./build/${pathNames[app]}&& yarn build`)
            } else {
                console.log(" Building on Linux")
                execSync(`REACT_APP_NAME=${app} BUILD_PATH=./build/${pathNames[app]} yarn build`)
            }
            console.log("\x1b[32m", 'Build complete')
        } catch (e) {
            console.error("\x1b[0m", e)
        }
        console.log("\x1b[0m")
    }

}
let pathNames = {
    Sky: "skyMusic",
    Genshin: "genshinMusic"
}
execute()