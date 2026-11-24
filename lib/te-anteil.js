'use strict';
const Q = require('./stimmbruch'), { ValidationError } = require('./validation');
// WEG schedules commonly use decimal numerators and German thousands grouping:
// 913,87/10.000 -> 91387/1000000. Never round through a JS Number.
module.exports = value => {
  if (typeof value !== 'string' || value.length > 64) throw new ValidationError('MEA bitte als eindeutige Zahl oder Bruch eingeben.');
  const parts = value.trim().split('/');
  if (parts.length === 1) return Q.str(Q.parse(value));
  if (parts.length !== 2) throw new ValidationError('MEA-Bruch nicht eindeutig.');
  function decimal(s) {
    s = s.trim();
    if (/^\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(s)) s = s.replace(/\./g, '');
    return Q.parse(s);
  }
  const n = decimal(parts[0]), d = decimal(parts[1]);
  if (d.n <= 0n) throw new ValidationError('MEA-Nenner muss positiv sein.');
  return Q.str(Q.q(n.n * d.d, n.d * d.n));
};
