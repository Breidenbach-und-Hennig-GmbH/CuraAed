const query=new URLSearchParams(location.search),vid=Number(query.get('versammlung')),id=Number(query.get('brief')),info=document.getElementById('info'),status=document.getElementById('status'),print=document.getElementById('print'),confirm=document.getElementById('confirm');
try{
 if(!Number.isSafeInteger(vid)||vid<1||!Number.isSafeInteger(id)||id<1)throw Error('Ungültige Einladung.');
 const res=await fetch('/api/versammlungen/'+vid+'/einladungen',{credentials:'same-origin'});if(!res.ok)throw Error('Bitte zuerst in CuraAed anmelden.');
 const letter=(await res.json()).einladungen.find(r=>r.id===id);if(!letter||!letter.post)throw Error('Keine Einladung für den Postversand gefunden.');
 const a=document.getElementById('download');a.href=letter.datei_url;a.hidden=false;
 const settings=await(await fetch('/api/m365/firmen',{credentials:'same-origin'})).json(),firma=settings.find(f=>f.firma_id===letter.firma_id);
 info.textContent=letter.empfaenger+' · '+(firma?.drucker?'Im Systemdialog bitte „'+firma.drucker+'“ wählen.':'Bitte Ihren Bürodrucker im Systemdialog wählen.')+' Ein geöffneter Druckdialog gilt nicht als erfolgter Ausdruck.';
 if(firma?.postweg==='epostbox')throw Error('Für diese Verwaltung ist epostbox vorgesehen. Die Einzel-PDF bitte herunterladen und im epostbox-Portal hochladen; der automatische Zugang ist noch nicht eingerichtet.');
 const file=await fetch(letter.datei_url,{credentials:'same-origin'});if(!file.ok)throw Error('PDF konnte nicht geladen werden.');
 const pdfjs=await import('/pdfjs/build/pdf.mjs');pdfjs.GlobalWorkerOptions.workerSrc='/pdfjs/build/pdf.worker.mjs';
 const task=pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer()),cMapUrl:'/pdfjs/cmaps/',cMapPacked:true,standardFontDataUrl:'/pdfjs/standard_fonts/',wasmUrl:'/pdfjs/wasm/',isEvalSupported:false,enableXfa:false}),pdf=await task.promise;
 if(pdf.numPages>80)throw Error('Diese PDF ist sehr umfangreich. Bitte herunterladen und mit dem PDF-Programm drucken.');
 for(let i=1;i<=pdf.numPages;i++){const page=await pdf.getPage(i),view=page.getViewport({scale:1.5}),canvas=document.createElement('canvas');canvas.width=view.width;canvas.height=view.height;await page.render({canvasContext:canvas.getContext('2d'),viewport:view}).promise;document.getElementById('pages').append(canvas);}
 print.disabled=false;print.addEventListener('click',()=>{window.print();confirm.disabled=false;status.textContent='Wenn der Ausdruck tatsächlich erfolgt ist, können Sie ihn bestätigen. Bei Abbruch bitte nicht bestätigen.';});
 confirm.addEventListener('click',async()=>{if(!window.confirm('Ist die Einladung tatsächlich vollständig ausgedruckt worden?'))return;confirm.disabled=true;const response=await fetch('/api/versammlungen/'+vid+'/einladungen/'+id+'/druck-bestaetigen',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({bestaetigt:true})});if(!response.ok){status.textContent=(await response.json()).fehler||'Bestätigung fehlgeschlagen.';confirm.disabled=false;}else status.textContent='Ausdruck bestätigt. Dies ist keine postalische Zustellbestätigung.';});
}catch(e){status.textContent=e.message;}