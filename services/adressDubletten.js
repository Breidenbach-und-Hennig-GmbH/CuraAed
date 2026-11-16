'use strict';
const crypto=require('node:crypto'),V=require('../lib/validation');
const substitutions=[['Ä','ae'],['Ö','oe'],['Ü','ue'],['ä','ae'],['ö','oe'],['ü','ue'],['ß','ss'],...Array.from(' .,-_/()\'’&+').map(c=>[c,''])];
function norm(value){let s=String(value||'');for(const [a,b] of substitutions)s=s.split(a).join(b);return s.toLowerCase();}
const literal=s=>"'"+s.replace(/'/g,"''")+"'";
function sql(expr){let s='COALESCE('+expr+",'')";for(const [a,b] of substitutions)s='REPLACE('+s+','+literal(a)+','+literal(b)+')';return 'LOWER('+s+')';}
async function pruefen(db,b){
 const full=b.adresstyp==='firma'?V.str(b.firmenname,200):[V.str(b.vorname,200),V.str(b.nachname,200)].filter(Boolean).join(' '),name=norm(full),email=(V.str(b.email,254)||'').toLowerCase(),clauses=[],params=[];
 if(name.length>=3){clauses.push('('+sql('a.firmenname')+'=? OR '+sql("COALESCE(a.vorname,'')||' '||COALESCE(a.nachname,'')")+'=?)');params.push(name,name);}
 if(email){clauses.push("(LOWER(a.email)=? OR EXISTS(SELECT 1 FROM adress_emails e WHERE e.adresse_id=a.id AND LOWER(e.adresse)=?))");params.push(email,email);}
 if(!clauses.length)return{treffer:[],bestaetigung:null};
 const rows=await db.all('SELECT a.id,a.nummer,a.adresstyp,a.vorname,a.nachname,a.firmenname,a.zusatz,a.strasse,a.plz,a.ort,a.archiviert,a.geaendert_am FROM adressen a WHERE '+clauses.join(' OR ')+' ORDER BY a.id LIMIT 21',params),treffer=rows.slice(0,20).map(a=>({id:a.id,nummer:a.nummer,name:require('./adressen').anzeigename(a),anschrift:[a.strasse,[a.plz,a.ort].filter(Boolean).join(' ')].filter(Boolean).join(', '),archiviert:!!a.archiviert}));
 return{treffer,mehr:rows.length>20,bestaetigung:treffer.length?crypto.createHash('sha256').update(JSON.stringify([name,email,rows])).digest('hex'):null};
}
async function neuanlagePruefen(db,b){const r=await pruefen(db,b);if(r.treffer.length&&b.dubletten_bestaetigung!==r.bestaetigung)throw new V.ValidationError('Mögliche Dublette: '+r.treffer.slice(0,3).map(x=>x.nummer+' · '+x.name).join('; ')+'. Bitte vorhandene Adressen prüfen und eine zusätzliche Neuanlage ausdrücklich bestätigen.',409);}
module.exports={pruefen,neuanlagePruefen,norm};
