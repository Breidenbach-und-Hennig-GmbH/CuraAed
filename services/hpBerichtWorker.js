'use strict';
const fs=require('node:fs/promises');
(async()=>{
 const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs');
 const loading=pdfjs.getDocument({data:new Uint8Array(await fs.readFile(process.argv[2])),isEvalSupported:false,useSystemFonts:true});
 try{const pdf=await loading.promise;if(pdf.numPages>30)throw new Error('Der Bericht darf höchstens 30 Seiten enthalten.');const seiten=[];
 for(let n=1;n<=pdf.numPages;n++){const p=await pdf.getPage(n),v=p.getViewport({scale:1}),t=await p.getTextContent();seiten.push({breite:v.width,items:t.items.filter(i=>i.str.trim()).map(i=>({text:i.str.trim(),x:i.transform[4],rechts:i.transform[4]+i.width,y:i.transform[5]}))});p.cleanup();}process.send({seiten});
 }finally{await loading.destroy();}
})().catch(()=>process.send?.({error:'Der HP-Bericht konnte nicht gelesen werden. Bitte eine originale PDF mit lesbarem Text verwenden.'}));
