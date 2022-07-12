const fs = require('fs/promises')
const [_1, _2, app, version, changelog] = process.argv
const clc = require("cli-color");
const { execSync } = require('child_process');
const githubEndpoint = 'https://github.com/Specy/genshin-music/releases/download/{version}/{zip-name}'
const releaseFolder = {
    bundle:  './src-tauri/target/release/bundle/',
    windows: './src-tauri/target/release/bundle/msi/'
}
if (!['genshin', 'sky', "all"].includes(app?.toLowerCase())) {
    console.error('Please specify an app name [Sky / Genshin / All]')
    process.exit(1)
}
if(version === undefined){
    console.error('Please specify a version')
    process.exit(1)
}
if(version.startsWith("v")){
    console.error("Please don't use the v in the version number")
    process.exit(1)
}
if(changelog === undefined){
    console.error('Please specify a changelog')
    process.exit(1)
}
const apps = app === "all" ? ["sky", "genshin"] : [app]
async function run(){
    await fs.rm(releaseFolder.bundle, { recursive: true }).catch(() => console.warn("[Warning]: Could not delete bundle folder"))
    for(const app of apps){
        const appUpdate = await fs.readFile(`./src-tauri/tauri-${app}.update.json`, 'utf8').then(JSON.parse)
        const appConfig = await fs.readFile(`./src-tauri/tauri-${app}.conf.json`, 'utf8').then(JSON.parse)
        appConfig.package.version = version
        await fs.writeFile(`./src-tauri/tauri-${app}.conf.json`, JSON.stringify(appConfig, null, 2))
        console.log(`[Log]: Building react and tauri of ${app}...`)
        execSync(`yarn build-tauri:${app}`)
        console.log(clc.green(`[Status]: Build of ${app} complete \n`))
        const buildFiles = await fs.readdir(releaseFolder.windows)
        for(const file of buildFiles){
            const newName = file.replaceAll(" ","_")
            await fs.rename(`${releaseFolder.windows}${file}`, `${releaseFolder.windows}${newName}`)
        }
        const renamedFiles = (await fs.readdir(releaseFolder.windows)).filter(f => f.toLowerCase().includes(app))
        const buildZip = renamedFiles.find(e => e.endsWith('msi.zip'))
        if(!buildZip){
            console.error(clc.red(`[Error]: No MSI zip found for ${app}`))
            process.exit(1)
        }
        const buildSignatureFile = renamedFiles.find(e => e.endsWith('msi.zip.sig'))
        const buildSignature = await fs.readFile(`${releaseFolder.windows}${buildSignatureFile}`, 'utf8')
        appUpdate.version = `v${version}`
        appUpdate.notes = changelog
        appUpdate.platforms["windows-x86_64"].url = githubEndpoint
            .replace("{version}", 'v'+version)
            .replace("{zip-name}", buildZip)
        appUpdate.platforms["windows-x86_64"].signature = buildSignature

        await fs.writeFile(`./src-tauri/tauri-${app}.update.json`, JSON.stringify(appUpdate, null, 2))
    }
    console.log(clc.green("[Log]: Build complete!"))
}

run()