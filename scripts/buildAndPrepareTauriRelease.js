require('dotenv').config()
const fs = require('fs/promises')
const [_1, _2, useEnv, app] = process.argv
const version = process.env.VERSION
const changelog = process.env.CHANGELOG
const clc = require("cli-color");
const { execSync } = require('child_process');
const githubEndpoint = 'https://github.com/Specy/genshin-music/releases/download/{version}/{zip-name}'
const releaseFolder = {
    bundle: './src-tauri/target/release/bundle/',
    windows: './src-tauri/target/release/bundle/msi/',
    macos: './src-tauri/target/release/bundle/macos/',
    linux: './src-tauri/target/release/bundle/appimage/',
}
if (!['genshin', 'sky', "all"].includes(app?.toLowerCase())) {
    console.error('Please specify an app name [Sky / Genshin / All]')
    process.exit(1)
}
if (version === undefined) {
    console.error('Please specify a version')
    process.exit(1)
}
if (version.startsWith("v")) {
    console.error("Please don't use the v in the version number")
    process.exit(1)
}
if (changelog === undefined) {
    console.error('Please specify a changelog')
    process.exit(1)
}
const platformKey = {
    "win32": "windows-x86_64",
    "darwin": "macos-x86_64",
    "linux": "linux-x86_64"
}
const apps = app === "all" ? ["sky", "genshin"] : [app]
async function run() {
    await fs.rm(releaseFolder.bundle, { recursive: true }).catch(() => console.warn("[Warning]: Could not delete bundle folder"))
    let currentReleaseFolder = releaseFolder.windows
    if (process.platform === "darwin") currentReleaseFolder = releaseFolder.macos
    if (process.platform === "linux") currentReleaseFolder = releaseFolder.linux
    try {
        for (const app of apps) {
            const appUpdate = await fs.readFile(`./src-tauri/tauri-${app}.update.json`, 'utf8').then(JSON.parse)
            const appConfig = await fs.readFile(`./src-tauri/tauri-${app}.conf.json`, 'utf8').then(JSON.parse)
            appConfig.package.version = version
            await fs.writeFile(`./src-tauri/tauri-${app}.conf.json`, JSON.stringify(appConfig, null, 2))
            console.log(`[Log]: Building react and tauri of ${app}...`)
            execSync(`yarn build-tauri:${app}${useEnv === 'false' ? "-no-env" : ""}`)
            console.log(clc.green(`[Status]: Build of ${app} complete \n`))
            const buildFiles = await fs.readdir(currentReleaseFolder)
            for (const file of buildFiles) {
                const newName = file.replaceAll(" ", "_")
                await fs.rename(`${currentReleaseFolder}${file}`, `${currentReleaseFolder}${newName}`)
            }
            const renamedFiles = (await fs.readdir(currentReleaseFolder)).filter(f => f.toLowerCase().includes(app))
            const buildZip = renamedFiles.find(e => e.endsWith('msi.zip') || e.endsWith('.tar.gz'))
            if (!buildZip) {
                console.error(clc.red(`[Error]: No Zip/Tar found for ${app}`))
                process.exit(1)
            }
            const buildSignatureFile = renamedFiles.find(e => e.endsWith('.sig'))
            const buildSignature = await fs.readFile(`${currentReleaseFolder}${buildSignatureFile}`, 'utf8')
            appUpdate.version = `v${version}`
            appUpdate.notes = changelog
            appUpdate.platforms[platformKey[process.platform]] = {
                url: githubEndpoint
                    .replace("{version}", 'v' + version)
                    .replace("{zip-name}", buildZip),
                signature: buildSignature
            }
            await fs.writeFile(`./src-tauri/tauri-${app}.update.json`, JSON.stringify(appUpdate, null, 2))
            await fs.writeFile(`${currentReleaseFolder}tauri-${app}.update.json`, JSON.stringify(appUpdate, null, 2))
        }
        console.log(clc.green("[Log]: Build complete!"))
    } catch (e) {
        console.log("ERROR:")
        process.stdout.write(e.toString())
        const stderr = e.stderr
        if (stderr) {
            console.log("STD ERR:")
            process.stdout.write(stderr.toString())
        }
        const stdout = e.stdout
        if (stdout) {
            console.log("STD OUT:")
            process.stdout.write(stdout.toString())
        }
        process.exit(1)
    }


}

run()