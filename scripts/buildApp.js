const fs = require('fs/promises')
const copyDir = require('recursive-copy')
const skyPath = './src/appData/sky'
const genshinPath = './src/appData/genshin'
const publicPath = './public'
const chosenApp = process.argv[2]
const {execSync} = require('child_process')

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
    console.log("\x1b[33m",'Building ' + chosenApp + '...')
    try{
        if(process.platform === 'win32') {
            console.log("Building on windows")
            execSync(`set REACT_APP_NAME=${chosenApp}&& yarn build`)
        } else {
            console.log("Building on Linux")
            execSync(`REACT_APP_NAME=${chosenApp} yarn build`)
        }
        console.log("\x1b[32m",'Build complete')  
    }catch(e){
        console.error("\x1b[0m",e)
    }
    console.log("\x1b[0m")
}

execute()