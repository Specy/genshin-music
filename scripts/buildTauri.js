const copyDir = require('recursive-copy')
const fs = require('fs/promises')
const clc = require("cli-color");
const { execSync } = require('child_process')
const chosenApp = process.argv[2]
const chosenVersion = process.argv[3]
const PATH_NAMES = {
    Sky: "skyMusic",
    Genshin: "genshinMusic"
}

if (!['Genshin', 'Sky'].includes(chosenApp)) {
    console.error('Please specify an app name [Sky / Genshin]')
    process.exit(1)
}
if(!chosenVersion) {
    console.error('Please specify a version')
    process.exit(1)
}

async function deleteFolderContent(path){
    const files = await fs.readdir(path)
    await Promise.all(files.map(file => {
        if (!file.includes('.')) return fs.rm(`${path}/${file}`, { recursive: true })
        return fs.unlink(`${path}/${file}`)
    }))
}


async function execute() {
    const tauriConfig = JSON.parse(await fs.readFile('./src-tauri/tauri.conf.json').then(e => e.toString()))
    console.log(clc.bold.yellow(`Building tauri ${chosenApp}...`))
    await deleteFolderContent(`./src-tauri/icons`)
    await copyDir(`./src-tauri/assets/${chosenApp}`, `./src-tauri/icons`)
    tauriConfig.build.beforeBuildCommand = `yarn build:${chosenApp.toLowerCase()}`
    tauriConfig.build.distDir = `../build/${PATH_NAMES[chosenApp]}/`
    tauriConfig.package.productName = `${chosenApp} Music Nightly`
    tauriConfig.package.version = chosenVersion
    tauriConfig.tauri.windows[0].title = `${chosenApp} Music Nightly`
    tauriConfig.tauri.bundle.identifier = `dev.specy.${chosenApp.toLowerCase()}`
    await fs.writeFile('./src-tauri/tauri.conf.json', JSON.stringify(tauriConfig, null, 2))
    try{
        execSync('yarn tauri build')
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