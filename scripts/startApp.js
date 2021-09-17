const {execSync} = require('child_process')
const fs = require('fs/promises')
const publicPath = './public'
const skyPath = './src/appData/sky'
const genshinPath = './src/appData/genshin'
const copyDir = require('recursive-copy')
const chosenApp = process.argv[2]
if(!['Genshin','Sky'].includes(chosenApp)){
    console.error('Please specify an app name [Sky/Genshin]')
    process.exit(1)
}

function deleteAssets(){
    //delete all file in a directory except the assets directory
    return fs.readdir(publicPath)
    .then(files => {
        return Promise.all(files.map(file => {
            if(file !== 'assets'){
                if(!file.includes('.')) return fs.rmdir(`${publicPath}/${file}`,{recursive:true})
                return fs.unlink(`${publicPath}/${file}`)
            }
        }))
    })
}
async function execute(){
    await deleteAssets()
    await copyDir(chosenApp === "Sky" ? skyPath : genshinPath,publicPath)
    if(process.platform === 'win32') {
        console.log("Starting on windows")
        execSync(`set REACT_APP_NAME=${chosenApp}&&npm run start`)
    } else {
        console.log("Starting on Linux")
        execSync(`REACT_APP_NAME=${chosenApp} npm run start`)
    }
}

execute()