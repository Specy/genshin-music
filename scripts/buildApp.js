const copyDir = require('recursive-copy')
const fs = require('fs/promises')
const clc = require("cli-color");
const { execSync } = require('child_process')
const skyPath = './src/appData/sky'
const genshinPath = './src/appData/genshin'
const publicPath = './public'
const chosenApp = process.argv[2]
const date = new Date()
const SW_VERSION = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}-${date.getHours()}-${date.getMinutes()}-${date.getSeconds()}`
const PATH_NAMES = {
    Sky: "skyMusic",
    Genshin: "genshinMusic"
}
if (!['Genshin', 'Sky', "All"].includes(chosenApp)) {
    console.error('Please specify an app name [Sky / Genshin / All]')
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
    try{
        for (const app of toBuild) {
            console.log(clc.bold.yellow(`Building ${app}...`))
            await deleteAssets()
            await copyDir(app === "Sky" ? skyPath : genshinPath, publicPath)
            if (process.platform === 'win32') {
                console.log(clc.italic("Building on windows"))
                execSync(
                    `set REACT_APP_NAME=${app}&& set REACT_APP_SW_VERSION=${SW_VERSION}&& set BUILD_PATH=./build/${PATH_NAMES[app]}&& yarn build`,
                    { stdio: 'inherit' }
                )
            } else {
                console.log(clc.italic("Building on Linux"))
                execSync(
                    `REACT_APP_NAME=${app} BUILD_PATH=./build/${PATH_NAMES[app]} REACT_APP_SW_VERSION=${SW_VERSION} yarn build`,
                    { stdio: 'inherit' }
                )
            }
            console.log(clc.green(`${app} build complete \n`))
        }
        console.log(clc.bold.green("Build complete \n"))
        process.exit(0)
    }catch(e){
        console.log("ERROR:")
        process.stdout.write(e.toString())
        const stderr = e.stderr
        if (stderr){
            console.log("STD ERR:")
            process.stdout.write(stderr.toString())
        }
        const stdout = e.stdout
        if(stdout){
            console.log("STD OUT:")
            process.stdout.write(stdout.toString())
        }
        process.exit(1)
    }
}

execute()