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
    eq('Old keys move in on load: alias, item number, brand, abbreviation, variant',[LC.best(L,'name','mild cheddar',t).value,LC.best(L,'number','383412',t).value,LC.best(L,'brand','n:mild cheddar',t).value,LC.best(L,'word','abbr:chz',t).value,LC.best(L,'flavor','@u_ch',t).value,LC.best(L,'number','var:383412',t).value],
      ['@u_ch','@u_ch','Tillamook','cheese','Sharp','v1']);
    eq('Not-food aliases are not learned as items',LC.get(L,'name','bag'),null);
    eq('Migration runs once',LC.migrate(L,{brandDict:{a:'B'}},t),L);}

  grp('Learning from a logged receipt (learning step 2)');
  {const S=replayState();const a=replay(S),b=replay(S);
    eq('Logging the 10/10 receipt the first time takes 11 edits (5 numbers, 6 suggestions)',a.edits,11);
    eq('Logging it again needs zero edits',b.edits,0);
    eq('Second time, every line is linked to its item',[b.rows.length,b.rows.every(r=>r.iid==='u_'+r.good)],[41,true]);
    eq('Misread numbers are fixed from what you typed last time',b.rows.filter(r=>r.learnedNum).map(r=>r.good).sort(),['382589','387258','401280','494042','751918']);
    eq('A repaired OCR word you kept is learned',LC.best(S.L,'word','ocr:sov',t).value,'soy');
    eq('A typed brand is learned for the name, with the old value kept',(v=>[v.value,v.src])(LC.best(S.L,'brand','n:mild cheddar',t)),['Tillamook','user-edit']);
    eq('The old suggestion is kept beside your edit',LC.get(S.L,'brand','n:mild cheddar').vals.Tillamook.was,'Happy Farms');
    eq('Used suggestions count as accepted',LC.best(S.L,'group','n:soy sauce',t).src,'suggestion-accepted');
    eq('Groups are also learned by the first two words',LC.best(S.L,'group','w2:harvest vegetables',t).value,'Produce›Vegetables');}
  {const r={text:'Sov Sauce',fixes:[['Sov','soy']],how:'named',iid:'u1',name0:'Soy sauce',nName:'Sov sauce',nCat0:'Pantry',brand0:'Fusia',flavor0:''};
    const L=LC.fromReceipt(LC.empty(),[r],{date:t});eq('Putting the printed word back is learned as "keep as printed"',LC.best(L,'word','ocr:sov',t).value,'sov');}
  {const r={text:'Pasta',num:'399573',num0:'399573',total0:'1.37',total:'1.87',iid:'u2',iid0:'u2',how:'number'};const L=LC.fromReceipt(LC.empty(),[r],{date:t});
    eq('An edited price is learned as a digit pair',[...LC.pairs(L,'price',t)],['3~8']);eq('Edits on a matched row: the price',LC.editsOf(r).map(e=>e[0]),['price']);}

  grp('Using what was learned first (learning step 3)');
  {const S=replayState();replay(S);const lk=LC.lookup(S.L,t);
    const mc=RC.suggest('Mild Cheddar',{lookup:lk});eq('Mild cheddar now suggests your brand, marked as learned',[mc.brand,mc.brandFrom],['Tillamook','learned']);
    eq('A name you typed is suggested for the same printed text',RC.suggest('Glbl Ssnng Blds',{lookup:lk}).name,'Seasoning blend');
    eq('A flavor you typed comes back',RC.suggest('Barista Cold Foams',{lookup:lk}).flavor,'Vanilla');
    eq('The row says which parts came from earlier receipts',RC.suggest('Mild Cheddar',{lookup:lk}).learned,['brand']);
    eq('A suggestion used once weighs the same as the built-in guess and fades below it',LC.best(S.L,'group','n:mild cheddar',t).weight<LC.BUILTIN,true);
    eq('A line with a new item number is linked by its printed text',LC.itemFor(S.L,{num:'999001',text:'Mild Chedclar'},'aldi',t),{iid:'u_383412',how:'learned'});}
  {let L=LC.empty();L=LC.record(L,'word','ocr:sov','sov','user-edit',t);L=LC.record(L,'word','ocr:bnna','banana','user-edit',t);L=LC.record(L,'word','abbr:chz','cheese','user-edit',t);const lk=LC.lookup(L,t);
    eq('A word you put back as printed is not repaired again',RC.ocrFix('Sov Sauce',null,lk).text,'Sov Sauce');
    eq('A learned repair is used before the built-in rules',RC.ocrFix('Bnna Chips',null,lk).text,'Banana Chips');
    eq('A learned abbreviation is expanded',RC.cleanName('Chz Puffs',null,lk),'Cheese puffs');
    eq('Learned words join the repair vocabulary',[...LC.words(L,t)].sort(),['banana','cheese','sov']);}
  {const K=new Map([['123456',[]]]);
    eq('Without a learned pair, 123496 is not taken for 123456',RC.fixNum('123496',K,'').num,'123496');
    eq('With 5 and 9 learned as a misread pair, it is',RC.fixNum('123496',K,'',{pairs:new Set(['5~9'])}).num,'123456');
    eq('A learned price pair settles a total with two possible fixes',[RC.solveTotal([1.27,2],3.77),(RC.solveTotal([1.27,2],3.77,null,new Set(['2~7']))||{}).to],[null,1.77]);}
  {let L=LC.empty();L=LC.record(L,'name','mild cheddar','@a','receipt-confirmed',t);L=LC.record(L,'name','mild chedclar','@a','receipt-confirmed',t);L=LC.record(L,'name','sharp cheddar','@b','receipt-confirmed',t);
    eq('Fuzzy matching gets 0.1 per learned alias of an item',LC.aliasCount(L,t),{a:2,b:1});}
  return out;};

// A person logging the 10/10 receipt: the photo misreads five item numbers and two words, and they fix a few suggestions.
const WANT={383412:{brand:'Tillamook'},343566:{name:'Club crackers'},713656:{name:'Seasoning blend'},760671:{name:'Harvest vegetables',cat:'Produce'},420772:{flavor:'Vanilla'},387258:{name:'Energy drink'}};
function replayState(){return {L:window.LearnCore.empty(),names:{}};}
function replay(S){const LC=window.LearnCore,RC=window.ReceiptCore,F=RC.F1010,now='2026-10-17';
  let txt=RC.fixtureText(F);for(const [bad,good] of F.misreads)txt=txt.replace(new RegExp('^'+good+' ','m'),bad+' ');txt=txt.replace('Mild Cheddar','Mild Chedclar').replace('Soy Sauce','Sov Sauce');
  const known=LC.knownNums(S.L,'aldi',id=>S.names[id]);const pr=RC.parseLines(txt.split('\n'),{known,learn:LC.numLearn(S.L,'aldi',now)});const g=RC.groupItems(pr.items);
  let edits=0;const rows=g.map(x=>{const orig=x.text.replace('Mild Chedclar','Mild Cheddar').replace('Sov Sauce','Soy Sauce');const fr=F.rows.find(f=>f[1]===orig),good=String(fr[0]);const base=RC.suggest(fr[1]);const want={name:base.name,cat:base.cat,brand:base.brand,flavor:base.flavor,...(WANT[good]||{})};
    const sg=RC.suggest(x.text,{lookup:LC.lookup(S.L,now)});const m=LC.itemFor(S.L,{num:x.num,text:x.text,fixedText:sg.fixedText},'aldi',now);
    const r={good,text:x.text,fixedText:sg.fixedText,fixes:sg.changes,num:x.num||'',num0:x.num||'',from:x.from||'',rawNum:x.raw||'',corrected:!!x.corrected,learnedNum:!!x.corrected&&x.num===good,
      total0:x.amount.toFixed(2),total:x.amount.toFixed(2),name0:sg.name,nCat0:sg.cat,nSub:sg.sub,brand0:sg.brand,flavor0:sg.flavor,iid0:m?m.iid:null,iid:m?m.iid:null,how:m?m.how:'none'};
    if(r.num!==good)r.num=good;
    if(m){if(m.iid!=='u_'+good)r.iid='u_'+good;}
    else{if(!same(sg.name,want.name))r.nName=want.name;if(sg.cat!==want.cat)r.nCat=want.cat;r.nv={brand:want.brand,flavor:want.flavor};r.named=true;r.iid='u_'+good;r.how='named';S.names[r.iid]=want.name;}
    edits+=LC.editsOf(r).length;return r;});
  S.L=LC.fromReceipt(S.L,rows,{store:'aldi',date:'2026-10-10',names:S.names});return {edits,rows};}
const same=(a,b)=>window.LearnCore.norm(a)===window.LearnCore.norm(b);
window.LearnReplay={replayState,replay};
})();
