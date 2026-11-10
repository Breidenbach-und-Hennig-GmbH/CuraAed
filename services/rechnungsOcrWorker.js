'use strict';
const fs=require('node:fs/promises'),path=require('node:path');
(async()=>{
 const file=process.argv[2],bytes=await fs.readFile(file),canvas=require('@napi-rs/canvas'),{parseZugferd}=require('./zugferd');let worker;
 if(/\.xml$/i.test(file)||bytes.subarray(0,200).toString('utf8').trimStart().startsWith('<?xml')){const result=parseZugferd(bytes);process.send({zugferd:result,methode:'XML-Rechnung (CII)',seiten:0,hinweise:[]});return;}
 async function ocr(image){if(!worker){const {createWorker}=require('tesseract.js'),model=require('@tesseract.js-data/deu');worker=await createWorker('deu',1,{langPath:model.langPath,cacheMethod:'none',errorHandler:()=>{}});}
  const r=await worker.recognize(image);return{text:r.data.text,konfidenz:r.data.confidence};}
 let text='',methode='PDF-Text',seiten=1,hinweise=[],conf=[];
 try{
  if(bytes.subarray(0,5).toString()==='%PDF-'){
   const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs'),base=path.dirname(require.resolve('pdfjs-dist/package.json'));
   const loading=pdfjs.getDocument({data:new Uint8Array(bytes),isEvalSupported:false,useSystemFonts:true,cMapUrl:path.join(base,'cmaps').replaceAll('\\','/')+'/',cMapPacked:true,standardFontDataUrl:path.join(base,'standard_fonts').replaceAll('\\','/')+'/',wasmUrl:path.join(base,'wasm').replaceAll('\\','/')+'/'});const pdf=await loading.promise;
   try{
    const attached=await pdf.getAttachments(),attachments=attached?[...attached.entries()].map(([id,data])=>({id,...data})):[];if(attachments.length>20){const e=new Error('Zu viele eingebettete Anlagen. Rechnungsdaten bitte manuell prüfen.');e.code='ZUGFERD_XML';throw e;}
    const candidates=[];for(const attachment of attachments){
     const name=String(attachment.filename||'').replaceAll('\\','/').split('/').at(-1),known=/^(factur-x|zugferd-invoice|xrechnung)\.xml$/i.test(name);
     if(!known&&!/\.xml$/i.test(name))continue;
     try{const result=parseZugferd(await pdf.getAttachmentContent(attachment.id));result.struktur.dateiname=name;if(!known)result.hinweise.push('Abweichender Name der eingebetteten Rechnungs-XML.');candidates.push(result);}
     catch(e){if(known)throw e;}
    }
    if(candidates.length>1){const e=new Error('Mehrere eingebettete Rechnungs-XMLs gefunden. Es wird keine automatisch ausgewählt.');e.code='ZUGFERD_XML';throw e;}
    if(candidates.length===1){process.send({zugferd:candidates[0],methode:candidates[0].methode,seiten:pdf.numPages,hinweise:[]});return;}
    const indices=[...new Set([1,2,3,pdf.numPages])].filter(n=>n<=pdf.numPages);seiten=indices.length;if(pdf.numPages>indices.length)hinweise.push('Nur die ersten drei Seiten und die letzte Seite wurden erkannt. Weitere Seiten bitte prüfen.');
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
})().catch(e=>{process.send?.({error:e.code==='ZUGFERD_XML'?e.message:'Der Beleg konnte nicht gelesen werden. Bitte eine lesbare PDF- oder Bilddatei verwenden oder die Angaben manuell erfassen.'});});
