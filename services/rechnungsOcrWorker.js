'use strict';
const fs=require('node:fs/promises'),path=require('node:path');
(async()=>{
 const file=process.argv[2],bytes=await fs.readFile(file),canvas=require('@napi-rs/canvas');let worker;
 async function ocr(image){if(!worker){const {createWorker}=require('tesseract.js'),model=require('@tesseract.js-data/deu');worker=await createWorker('deu',1,{langPath:model.langPath,cacheMethod:'none',errorHandler:()=>{}});}
  const r=await worker.recognize(image);return{text:r.data.text,konfidenz:r.data.confidence};}
 let text='',methode='PDF-Text',seiten=1,hinweise=[],conf=[];
 try{
  if(bytes.subarray(0,5).toString()==='%PDF-'){
   const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs'),base=path.dirname(require.resolve('pdfjs-dist/package.json'));
   const loading=pdfjs.getDocument({data:new Uint8Array(bytes),isEvalSupported:false,useSystemFonts:true,cMapUrl:path.join(base,'cmaps').replaceAll('\\','/')+'/',cMapPacked:true,standardFontDataUrl:path.join(base,'standard_fonts').replaceAll('\\','/')+'/',wasmUrl:path.join(base,'wasm').replaceAll('\\','/')+'/'});const pdf=await loading.promise;
   try{const indices=[...new Set([1,2,3,pdf.numPages])].filter(n=>n<=pdf.numPages);seiten=indices.length;if(pdf.numPages>indices.length)hinweise.push('Nur die ersten drei Seiten und die letzte Seite wurden erkannt. Weitere Seiten bitte prüfen.');
    for(const n of indices){const page=await pdf.getPage(n),content=await page.getTextContent(),groups=new Map();for(const item of content.items){if(!item.str)continue;const y=Math.round(item.transform[5]/3)*3;if(!groups.has(y))groups.set(y,[]);groups.get(y).push(item);}
     let s=[...groups].sort((a,b)=>b[0]-a[0]).map(([,items])=>items.sort((a,b)=>a.transform[4]-b.transform[4]).map(i=>i.str).join(' ')).join('\n');
     if(s.replace(/\s/g,'').length<200||!/[0-9]+[,.][0-9]{2}/.test(s)){const raw=page.getViewport({scale:2.2}),scale=Math.min(2.2,2.2*Math.sqrt(3500000/(raw.width*raw.height))),view=page.getViewport({scale}),c=canvas.createCanvas(Math.ceil(view.width),Math.ceil(view.height));await page.render({canvasContext:c.getContext('2d'),viewport:view}).promise;const r=await ocr(c.toBuffer('image/png'));s=r.text;conf.push(r.konfidenz);methode='PDF-Text / lokale OCR';}
     text+='\n'+s;page.cleanup();if(text.length>150000){text=text.slice(0,150000);hinweise.push('Sehr umfangreicher Text wurde begrenzt.');break;}
    }
   }finally{await loading.destroy();}
  }else{
   const img=await canvas.loadImage(bytes),scale=Math.min(1,Math.sqrt(3500000/(img.width*img.height))),c=canvas.createCanvas(Math.max(1,Math.round(img.width*scale)),Math.max(1,Math.round(img.height*scale)));c.getContext('2d').drawImage(img,0,0,c.width,c.height);const r=await ocr(c.toBuffer('image/png'));text=r.text;conf.push(r.konfidenz);methode='Lokale OCR';
  }
  if(!text.trim())throw new Error('Kein lesbarer Text');
  process.send({text:text.slice(0,150000),methode,seiten,hinweise,konfidenz:conf.length?Math.min(...conf):undefined});
 }finally{if(worker)await worker.terminate();}
})().catch(()=>{process.send?.({error:'Der Beleg konnte nicht gelesen werden. Bitte eine lesbare PDF- oder Bilddatei verwenden oder die Angaben manuell erfassen.'});});
