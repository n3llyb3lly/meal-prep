// Checks for tools/learn-core.js. The self-test page and `node --test` both run this list.
// Each check is [group, name, got, want]; a check passes when got and want have the same JSON.
(function(){
window.LearnChecks=function(){const LC=window.LearnCore,RC=window.ReceiptCore;const out=[];let g='';const grp=n=>{g=n;};const eq=(name,got,want)=>out.push([g,name,got,want]);
  const t='2026-10-17',ago=n=>new Date(Date.parse(t)-n*864e5).toISOString().slice(0,10);

  grp('Learning: one store for what the app learns (learning step 1)');
  {let L=LC.empty();
    eq('With nothing learned, Mild cheddar gets the built-in Happy Farms',LC.prefer(L,'brand','mild cheddar','Happy Farms',t).value,'Happy Farms');
    L=LC.record(LC.clone(L),'brand','mild cheddar','Tillamook','user-edit',ago(14));L=LC.record(LC.clone(L),'brand','mild cheddar','Tillamook','user-edit',ago(7));
    const p=LC.prefer(L,'brand','mild cheddar','Happy Farms',t);
    eq('A brand typed twice for Mild cheddar beats the built-in Happy Farms',[p.value,p.from],['Tillamook','learned']);
    const r=LC.get(L,'brand','mild cheddar');
    eq('Each record keeps a count, first and last date, and last value',[r.n,r.first,r.last,r.lastValue],[2,ago(14),ago(7),'Tillamook']);}
  {let L=LC.empty();L=LC.record(L,'brand','x','Old','user-edit',ago(200));L=LC.record(L,'brand','x','New','user-edit',ago(7));
    eq('An edit from 200 days ago loses to one from last week',LC.best(L,'brand','x',t).value,'New');}
  {let L=LC.empty();L=LC.record(L,'group','x','A','user-edit',t);L=LC.record(L,'group','x','B','catalog',t);L=LC.record(L,'group','x','C','suggestion-accepted',t);
    eq('Weights: your edit 3, catalog 2, accepted suggestion 1',LC.values(L,'group','x',t).map(v=>[v.value,v.weight]),[['A',3],['B',2],['C',1]]);}
  eq('A weight halves in 120 days',LC.decay(3,'2026-01-01','2026-05-01'),1.5);
  {const L=LC.record(LC.empty(),'brand','x','Kraft','user-edit',ago(200));
    eq('A 200-day-old edit no longer beats a built-in guess',LC.prefer(L,'brand','x','Happy Farms',t).value,'Happy Farms');}
  eq('Unknown kinds and sources are ignored',Object.keys(LC.record(LC.record(LC.empty(),'colour','x','red','user-edit',t),'brand','x','A','guess',t).recs).length,0);
  {const s={aliases:[{text:'MILD CHEDDAR',item:'u_ch',store:'aldi'},{text:'BAG',item:'__ignore'}],numLinks:{'383412':'u_ch'},brandDict:{'mild cheddar':'Tillamook'},nameDict:{chz:'cheese'},
      variants:{u_ch:[{vid:'v1',brand:'Tillamook',flavor:'Sharp',nums:{aldi:['383412']},last:{date:'2026-10-10'}}]},numVar:{'383412':'v1'}};
    const L=LC.migrate(null,s,t);
    eq('Old keys move in on load: alias, item number, brand, abbreviation, variant',[LC.best(L,'name','mild cheddar',t).value,LC.best(L,'number','383412',t).value,LC.best(L,'brand','mild cheddar',t).value,LC.best(L,'word','abbr:chz',t).value,LC.best(L,'flavor','@u_ch',t).value,LC.best(L,'number','var:383412',t).value],
      ['@u_ch','@u_ch','Tillamook','cheese','Sharp','v1']);
    eq('Not-food aliases are not learned as items',LC.get(L,'name','bag'),null);
    eq('Migration runs once',LC.migrate(L,{brandDict:{a:'B'}},t),L);}
  return out;};
})();
