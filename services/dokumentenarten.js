'use strict';
const ARTEN={AB:'Abrechnung',BA:'Bankkontoauszüge',BB:'Beschlusssammlung',CL:'Sammelbelege Banking',DX:'Externes Dokument',DY:'Externes Dokument',EX:'Externes Bild',HD:'Externe Heizkosten',HK:'Heizkosten',HN:'Haushaltsnahe Dienstleistung',HW:'Handwerkerauftrag',IA:'Ausgehende interne E-Mail',IE:'Eingehende interne E-Mail',IN:'Infos / Intern',IX:'Index Miete',KV:'Kautionsabrechnung',MA:'Mahnung',RE:'Rechnung'};
async function art(db,key){return (await db.get('SELECT art FROM dokumentenarten WHERE dokument_schluessel=?',[key]))?.art||'DX';}
module.exports={ARTEN,art};
