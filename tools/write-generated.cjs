/* Windows file watchers can briefly deny a generated HTML rewrite. Retry the
 * same bytes for bounded sharing errors; never suppress a persistent failure. */
'use strict';
module.exports=function writeGenerated(file,data,options={}){
 const fs=options.fs||require('node:fs'),platform=options.platform||process.platform;
 const wait=options.wait||(ms=>Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,ms));
 for(let attempt=0;attempt<8;attempt++){
  try{return fs.writeFileSync(file,data);}catch(error){
   if(platform!=='win32'||!['UNKNOWN','EPERM','EBUSY'].includes(error.code)||attempt===7)throw error;
   wait(50*(attempt+1));
  }
 }
};
