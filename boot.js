const fs = require('fs');
const fsp = fs.promises
const path = require('path');
const cp = require('child_process');

async function copy(source,target){
    const resolvedTarget = (await fsp.lstat(target)).isDirectory() ?
        path.join(target,path.basename(source)) : target;
    const file = await fsp.readFile(source);
    await fsp.writeFile(resolvedTarget,file);
    console.log('*',source);
}

async function copyDir(source,target){
    if(!(await fs.existsSync(target)))
        await fsp.mkdir(target);
    if((await fsp.lstat(source)).isDirectory()){
        const files = await fsp.readdir(source);
        for(const file of files){
            const filePath = path.join(source,file);
            if((await fsp.lstat(filePath)).isDirectory())
                await copyDir(filePath,path.join(target,path.basename(filePath)));
            else await copy(filePath,target);
        }
    } else throw Error('given source is\'nt a directory');
}

async function installDependencies(){
    const include = (await fs.existsSync(path.join(__dirname,'../package.json'))) ?
        '' : 'npm init -y &&';
    const event = cp.exec(`cd ${path.resolve(__dirname,'..')} && ${include} npm install`);
    return new Promise((resolve,reject) => {
        event.stdout.on('data', data => {
            const log = data.toString().trim();
            if(log.length > 0) console.log(log);
        });
        event.once('error', reject);
        event.once('exit', resolve);
    })
}

(async ()=>{
    console.group('File copying...');
    try{
        await copyDir(
            path.resolve(__dirname,'./project_files/'),
            path.resolve(__dirname,'../')
        );
        console.groupEnd()
        console.log('File copying successful');
    }catch(e){
        console.groupEnd()
        console.error('File copying failed');
        throw e
    }
    console.group('Dependencies installation...','(this operation can last 1 or 2 minutes)');
    try{
        await installDependencies()
        console.groupEnd()
        console.log('Dependencies installation successful');
    }catch(e){
        console.groupEnd()
        console.error('Dependencies installation failed');
        throw e
    }
    console.warn(
        '\n---\nGo to',
        'https://github.com/play-curious/booyah/blob/master/README.md#production',
        'for the rest of the guide.\n---'
    );
})();