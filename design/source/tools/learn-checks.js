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

  grp('Learning stats in Diagnostics (learning step 5)');
  {const S=replayState();const a=LC.statsOf(replay(S).rows,{date:'2026-10-10'}),b=LC.statsOf(replay(S).rows,{date:'2026-10-14'});
    eq('Replaying the 10/10 receipt twice: the edit count drops',[a.edits,b.edits,b.edits<a.edits],[11,0,true]);
    eq('First time: 49 items, 42 suggestions shown, 36 used as they were, 6 changed',[a.items,a.shown,a.accepted,a.edited],[49,42,36,6]);
    eq('Second time: all 41 lines matched by item number',[b.byNum,b.byAlias,b.byFuzzy,b.shown],[41,0,0,0]);
    eq('Word repairs are counted',a.ocr,2);
    eq('Trend line for Diagnostics',LC.trend([{edits:27},{edits:9},{edits:3}]),'Edits per receipt 27 → 9 → 3');
    eq('Only the last five receipts are in the trend',LC.trend([1,2,3,4,5,6].map(e=>({edits:e}))),'Edits per receipt 2 → 3 → 4 → 5 → 6');
    eq('Seconds from Read to Add',LC.statsOf([],{readAt:'2026-10-10T15:00:00Z',addAt:'2026-10-10T15:01:35Z'}).secs,95);
    eq('One line per receipt',LC.statsLine(b).startsWith('10/14 · 49 items · 41 by number'),true);}

  grp('Habits, package sizes and usual prices (learning step 6)');
  {const eggs=['2026-10-01','2026-10-07','2026-10-13','2026-10-19'];const h=LC.habit(eggs,'2026-10-20');
    eq('Eggs bought every 6 days, next due Oct 25',[h.n,h.every,h.due,h.dueIn],[4,6,'2026-10-25',5]);
    eq('Bought 3 or more times, about every 3 weeks: suggested to keep stocked',LC.stockIdeas({eggs,flour:['2026-09-01','2026-10-01'],tea:['2026-06-01','2026-08-01','2026-10-01']},'2026-10-20').map(x=>[x.iid,x.every]),[['eggs',6]]);
    eq('Items already stocked are not suggested',LC.stockIdeas({eggs},'2026-10-20',id=>id==='eggs').length,0);}
  {const row=(sz,d)=>({text:'Eggs',iid:'eggs',iid0:'eggs',how:'number',num:'1',num0:'1',size:sz,size0:12,count:1,total:'2.19',total0:'2.19',_d:d});
    let L=LC.fromReceipt(LC.empty(),[row(12)],{date:'2026-10-01'});eq('One package size seen: still asks',LC.sizeSeen(L,'eggs','aldi'),null);
    L=LC.fromReceipt(L,[row(12)],{date:'2026-10-07'});eq('Same size seen twice: stops asking',LC.sizeSeen(L,'eggs','aldi'),'12');
    L=LC.fromReceipt(L,[row(18)],{date:'2026-10-13'});eq('A different size asks again',LC.sizeSeen(L,'eggs','aldi'),null);}
  {const rc=(p,d,x)=>({text:'Eggs',iid:'eggs',iid0:'eggs',how:'number',num:'1',num0:'1',count:1,total:p,total0:p,...(x||{})});let L=LC.empty();
    L=LC.fromReceipt(L,[rc('2.19')],{date:'2026-09-01'});L=LC.fromReceipt(L,[rc('2.29')],{date:'2026-09-08'});eq('Two receipts: no usual price yet',LC.usual(L,'eggs','aldi'),null);
    L=LC.fromReceipt(L,[rc('1.49',0,{sale:true})],{date:'2026-09-15'});eq('Sale prices are left out',LC.usual(L,'eggs','aldi'),null);
    L=LC.fromReceipt(L,[rc('2.09'),rc('2.09')],{date:'2026-09-22'});eq('Three receipts: the median is your price',LC.usual(L,'eggs','aldi'),{price:2.19,n:3,last:'2026-09-22'});
    for(const [p,d] of [['2.49','2026-09-29'],['2.59','2026-10-06'],['2.69','2026-10-13']])L=LC.fromReceipt(L,[rc(p)],{date:d});
    eq('Only the last 5 receipts count',LC.usual(L,'eggs','aldi').price,2.49);
    eq('Each store has its own usual price',LC.usual(L,'eggs','walmart'),null);}
  {const L=LC.migrate(null,{priceHistory:{eggs:[{date:'2026-09-01',store:'aldi',paid:2.19},{date:'2026-09-08',store:'aldi',paid:1.49,sale:true},{date:'2026-09-15',store:'aldi',paid:2.29},{date:'2026-09-22',store:'aldi',paid:2.09}]}},t);
    eq('Earlier receipts in the price history count on the first load',LC.usual(L,'eggs','aldi'),{price:2.19,n:3,last:'2026-09-22'});}
  {const S=replayState();replay(S);replay(S);replay(S);eq('After logging the 10/10 receipt three times, Mild cheddar has a usual price',LC.usual(S.L,'u_383412','aldi').price,1.75);}

  grp('Sizes printed with a hyphen (Prompt 4.3)');
  eq('12-count and 6-pk are read as counts',['Eggs 12-count','Bars 6-pk'].map(t=>(RC.parseSize(t)||{}).label),['12-count','6-count']);

  grp('Sharing with the sheet (step 4)');
  {const S=replayState();replay(S);const recs=LC.toSend(S.L);
    eq('Only words, names, brands, groups and numbers are sent',[...new Set(recs.map(r=>r[0]))].every(k=>LC.SHARE.includes(k))&&recs.length>0,true);
    eq('No prices, sizes, dates or quantities are sent',recs.some(r=>['price','size','flavor'].includes(r[0])||r.length!==4||/\d{4}-\d\d-\d\d/.test(r[1]+r[2])),false);
    eq('Each record is kind, key, value and a count',recs.every(r=>typeof r[1]==='string'&&typeof r[2]==='string'&&r[3]>0),true);
    const L2=LC.markSent(S.L,recs);eq('Nothing is sent twice',LC.toSend(L2).length,0);
    const again=LC.toSend(S.L=LC.fromReceipt(L2,[],{date:'2026-10-17'}));eq('An empty receipt sends nothing new',again.length,0);
    eq('Batches hold up to 50 records',LC.batches(Array(120).fill(['word','a','b',1]),50).map(b=>b.length),[50,50,20]);
    let L3=LC.empty();LC.record(L3,'name','soy sauce','@u_1','user-edit','2026-10-10');LC.record(L3,'name','card 1234','@u_2','user-edit','2026-10-10');
    eq('Text with 4 or more digits in a row stays on the phone',LC.toSend(L3).map(r=>r[1]),['soy sauce']);
    // A second phone reads what the first one sent from the Learned tab.
    const rows=recs.map(([k,key,v,n])=>[k,key,v,n,'2026-10-10']);const B=LC.withCatalog(LC.empty(),rows,'2026-10-17');
    eq('Sheet facts count as source catalog',Object.values(B.recs).every(r=>Object.values(r.vals).every(v=>v.src==='catalog')),true);
    const own=LC.withCatalog(S.L,rows,'2026-10-17');eq("The phone's own facts are not counted twice",JSON.stringify(own.recs),JSON.stringify(S.L.recs));
    const S2={L:B,names:{...S.names}};const r2=replay(S2);eq('A second phone needs fewer edits with the Learned tab',r2.edits<11,true);
    eq('Rows of other kinds from the sheet are ignored',Object.keys(LC.withCatalog(LC.empty(),[['price','eggs','2.19',1,'2026-10-10']],'2026-10-17').recs).length,0);}
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
      count:x.weighed?1:x.qty,wt:x.weighed?String(x.wt):'',total0:x.amount.toFixed(2),total:x.amount.toFixed(2),name0:sg.name,nCat0:sg.cat,nSub:sg.sub,brand0:sg.brand,flavor0:sg.flavor,iid0:m?m.iid:null,iid:m?m.iid:null,how:m?m.how:'none'};
    if(r.num!==good)r.num=good;
    if(m){if(m.iid!=='u_'+good)r.iid='u_'+good;}
    else{if(!same(sg.name,want.name))r.nName=want.name;if(sg.cat!==want.cat)r.nCat=want.cat;r.nv={brand:want.brand,flavor:want.flavor};r.named=true;r.iid='u_'+good;r.how='named';S.names[r.iid]=want.name;}
    edits+=LC.editsOf(r).length;return r;});
  S.L=LC.fromReceipt(S.L,rows,{store:'aldi',date:'2026-10-10',names:S.names});return {edits,rows};}
const same=(a,b)=>window.LearnCore.norm(a)===window.LearnCore.norm(b);
window.LearnReplay={replayState,replay};
})();
