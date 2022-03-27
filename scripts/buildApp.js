const copyDir = require('recursive-copy')
const fs = require('fs/promises')
const { execSync } = require('child_process')

const skyPath = './src/appData/sky'
const genshinPath = './src/appData/genshin'
const publicPath = './public'
const chosenApp = process.argv[2]

if (!['Genshin', 'Sky', "All"].includes(chosenApp)) {
    console.error('Please specify an app name [Sky/Genshin/All]')
    process.exit(1)
}

async function deleteAssets() {
    const files = await fs.readdir(publicPath)
    await Promise.all(files.map(file => {
        if (file !== 'assets') {
            if (!file.includes('.')) return fs.rm(`${publicPath}/${file}`, { recursive: true })
            return fs.unlink(`${publicPath}/${file}`)
        }
        return new Promise(resolve => resolve()) 
    }))
}

async function execute() {
    const toBuild = chosenApp === "All" ? ['Sky', 'Genshin'] : [chosenApp]
    for (const app of toBuild) {
        console.log("\x1b[33m", 'Building ' + app + '...')
        await deleteAssets()
        await copyDir(app === "Sky" ? skyPath : genshinPath, publicPath)
        let result = ''
        if (process.platform === 'win32') {
            console.log(" Building on windows")
            result = execSync(`set REACT_APP_NAME=${app}&& set BUILD_PATH=./build/${PATH_NAMES[app]}&& yarn build`)
        } else {
            console.log(" Building on Linux")
            result = execSync(`REACT_APP_NAME=${app} BUILD_PATH=./build/${PATH_NAMES[app]} yarn build`)
        }
        console.log("\x1b[32m", 'Build complete')
        console.log("\x1b[0m")
        console.log(result.toString())
    }

}
const PATH_NAMES = {
    Sky: "skyMusic",
    Genshin: "genshinMusic"
}
execute()