// Captures the receipt screens for the design handoff. Serve the repo root on :8765 (python3 -m http.server 8765),
// then run: node design/handoff/receipt/capture.js  (needs the playwright package; OUT= changes the folder)
const {chromium}=require(process.env.PW||'playwright');const OUT=process.env.OUT||__dirname;
const CONF=[[360,800,'light'],[360,800,'dark'],[412,915,'light'],[412,915,'dark']];
(async()=>{const b=await chromium.launch();const log=[];
for(const [w,h,theme] of CONF){const ctx=await b.newContext({viewport:{width:w,height:h},deviceScaleFactor:2,colorScheme:theme,serviceWorkers:'block'});const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(String(e)));
  const shot=async name=>{await p.waitForTimeout(500);await p.screenshot({path:`${OUT}/${name}-${w}-${theme}.png`});log.push(`${name}-${w}-${theme}`);};
  const scroller=()=>p.evaluate(()=>{const els=[...document.querySelectorAll('div')].filter(e=>e.scrollHeight>e.clientHeight+50&&/auto|scroll/.test(getComputedStyle(e).overflowY));els.sort((a,b)=>b.scrollHeight-a.scrollHeight);window.__sc=els[0];return els[0]?[els[0].scrollHeight,els[0].clientHeight]:null;});
  await p.goto('http://localhost:8765/index.html');await p.waitForFunction(()=>window.__mp&&window.ReceiptCore,null,{timeout:20000});
  await p.evaluate(()=>new Promise(r=>__mp.save({setupDone:true},r)));await p.waitForTimeout(800);
  await p.evaluate(()=>__mp.openReceipt());await p.waitForTimeout(400);
  await p.evaluate(()=>__mp.saveDraft({...__mp.state.receiptDraft,tab:'paste'},true));await shot('add-receipt');
  await p.evaluate(()=>__mp.setState({rcPasteOpen:true}));await p.waitForTimeout(300);
  await p.evaluate(()=>__mp.saveDraft({...__mp.state.receiptDraft,pasteText:ReceiptCore.fixtureText(ReceiptCore.F1010)},true));await shot('paste-text');
  await p.evaluate(()=>__mp.readText63(__mp.state.receiptDraft.pasteText));await p.waitForTimeout(3500);await shot('items-review-top');
  const dims=await scroller();
  if(dims){for(const [name,f] of [['items-review-middle',.45],['items-review-end',1]]){await p.evaluate(f=>{window.__sc.scrollTop=(window.__sc.scrollHeight-window.__sc.clientHeight)*f;},f);await shot(name);}
    await p.evaluate(()=>{window.__sc.scrollTop=0;});}
  // open the first row that needs a name
  try{await p.getByText('Clubhouse crackers').first().click({timeout:3000});await shot('row-name-new');}catch(e){log.push('row-name-new FAILED '+e.message.split('\n')[0]);}
  if(errs.length)log.push(`${w}-${theme} errors: ${errs.slice(0,3).join(' | ')}`);
  await ctx.close();}
console.log(log.join('\n'));await b.close();})();
