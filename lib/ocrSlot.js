'use strict';
const {ValidationError}=require('./validation');
let occupied=false;
module.exports=()=>{
 if(occupied)throw new ValidationError('Die lokale Texterkennung bearbeitet gerade ein anderes Dokument. Bitte nach dessen Abschluss erneut versuchen.',503);
 occupied=true;let released=false;
 return()=>{if(!released){released=true;occupied=false;}};
};
