'use strict';
let ticketHwaOeffnet=false;
async function ticketHandwerkerauftrag(id){
 if(ticketHwaOeffnet||document.querySelector('.cu-hwa-form'))return;ticketHwaOeffnet=true;const lauf=S.lauf;
 try{const s=await API.get('/tickets/'+id+'/handwerkerauftrag');if(lauf!==S.lauf)return;await handwerkerErfassung(s.auftrag,{ticketQuelle:s.ticket,onCancel:()=>ticketsMaske(id)});}
 catch(e){if(lauf===S.lauf)fehler(e);}finally{ticketHwaOeffnet=false;}
}
