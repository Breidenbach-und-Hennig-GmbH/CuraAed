'use strict';
const {ValidationError}=require('./validation');
const gcd=(a,b)=>b?gcd(b,a%b):a;
function q(n,d=1n){if(d<=0n)throw new ValidationError('Ungültiger MEA-Nenner.');const g=gcd(n<0n?-n:n,d);return{n:n/g,d:d/g};}
function parse(value,intern=false){
 if(typeof value!=='string'||value.length>(intern?1000000:64))throw new ValidationError('MEA bitte als Zahl oder Bruch eingeben.');
 const s=value.trim().replace(',','.');
 let m=s.match(/^(\d+)\/(\d+)$/);if(m){if(BigInt(m[2])===0n)throw new ValidationError('MEA-Nenner darf nicht null sein.');return q(BigInt(m[1]),BigInt(m[2]));}
 m=s.match(/^(\d+)(?:\.(\d+))?$/);if(!m)throw new ValidationError('MEA bitte eindeutig als Zahl oder Bruch eingeben.');
 return q(BigInt(m[1]+(m[2]||'')),10n**BigInt((m[2]||'').length));
}
const add=(a,b)=>q(a.n*b.d+b.n*a.d,a.d*b.d);
const mul=(a,n,d=1n)=>q(a.n*n,a.d*d);
const cmp=(a,b)=>a.n*b.d>b.n*a.d?1:a.n*b.d<b.n*a.d?-1:0;
const str=a=>a.d===1n?String(a.n):a.n+'/'+a.d;
module.exports={q,parse,add,mul,cmp,str};
