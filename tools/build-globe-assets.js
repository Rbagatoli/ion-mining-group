/* Keep the operator globe's surface identical to the marketing globe.
 * Copies are local so /app/ and the repository preview resolve the same imports.
 * node tools/build-globe-assets.js [--check]
 */
const fs=require('fs'),path=require('path');
const ROOT=path.join(__dirname,'..');
const FILES=[
    'globe-surface.js','hosting-world-data.js',
    'vendor/three-0.185.1/three.module.min.js',
    'vendor/three-0.185.1/three.core.min.js',
    'vendor/three-0.185.1/RoomEnvironment.js',
    'vendor/three-0.185.1/LICENSE'
];
function build(check=false) {
    let changed=0;
    for(const name of FILES){
        const source=fs.readFileSync(path.join(ROOT,'site',name));
        const target=path.join(ROOT,'globe-assets',name);
        const previous=fs.existsSync(target)?fs.readFileSync(target):null;
        if(previous&&previous.toString().replace(/\r\n/g,'\n')===source.toString().replace(/\r\n/g,'\n'))continue;
        if(check)throw new Error('Stale shared globe asset: '+name);
        fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,source);changed++;
    }
    return changed;
}
if(require.main===module){
    const changed=build(process.argv.includes('--check'));
    console.log('Shared globe surface: '+FILES.length+' assets, '+changed+' updated.');
}
module.exports={FILES,build};
