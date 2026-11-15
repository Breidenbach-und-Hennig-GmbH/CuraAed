'use strict';
const crypto=require('node:crypto'),fs=require('node:fs'),path=require('node:path'),{ValidationError}=require('./validation');
const keys=new WeakMap();
module.exports=function(db,options={}){
 if(options.tokenKey){const key=Buffer.from(options.tokenKey);if(key.length!==32)throw new ValidationError('Microsoft-365-Schlüssel ungültig.',503);return key;}
 if(keys.has(db))return keys.get(db);
 let key;
 if(process.env.M365_TOKEN_KEY)key=Buffer.from(process.env.M365_TOKEN_KEY,'base64');
 else if(db.db.filename===':memory:')key=crypto.randomBytes(32);
 else{
  const file=path.join(path.dirname(path.resolve(db.db.filename)),'.m365-token-key');
  try{fs.writeFileSync(file,crypto.randomBytes(32),{flag:'wx',mode:0o600});}catch(e){if(e.code!=='EEXIST')throw e;}
  key=fs.readFileSync(file);
 }
 if(key.length!==32)throw new ValidationError('Microsoft-365-Schlüssel ungültig.',503);
 keys.set(db,key);return key;
};
