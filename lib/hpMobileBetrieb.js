'use strict';

// Deliberately opt-in. Do not interrupt the remaining migration automatically.
function mobileAktiv() { return process.env.HP_MOBILE_DEAKTIVIERT !== '1'; }
module.exports = { mobileAktiv };
