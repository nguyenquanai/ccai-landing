const {chromium} = require('playwright-core');
const assert = require('node:assert/strict');
(async () => {
 const browser = await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage'],timeout:20000});
 try {
  const page = await browser.newPage({viewport:{width:1440,height:1000}});
  let state = {version:1,active:true,title:'Đọc miễn phí bộ 3 tập',startDate:'2026-11-01',endDate:'2026-11-30',endsAt:Date.now()+3600000,serverNow:Date.now()};
  let posted=[];
  let outcome = 'success';
  let throwPost = false;
  await page.route('**/*', async route => {
   const req=route.request();
   if(req.url().startsWith('http://127.0.0.1:8000/')) return route.continue();
   if(req.url().startsWith('https://script.google.com/macros/')) {
    let body;
    if(req.url().includes('action=free_campaign')) body=state;
    else if(req.method()==='POST') {
     const data=JSON.parse(req.postData());
     if(data.action==='register_free_campaign') {
      posted.push(data);
      if(throwPost) return route.abort();
      body={result:outcome,message:outcome==='success'?'Đã gửi email thử (mô phỏng).':'Chương trình đã đóng (mô phỏng).'};
     } else body={result:'error'};
    } else body={reviews:[],promos:{},faq:[]};
    return route.fulfill({status:200,headers:{'access-control-allow-origin':'*','content-type':'application/json'},body:JSON.stringify(body)});
   }
   return route.abort();
  });
  async function load(){await page.goto('http://127.0.0.1:8000/',{waitUntil:'networkidle'});}
  async function fill(){
   await page.locator('#free-fullname').fill('Người đọc thử');
   await page.locator('#free-email').fill('reader@example.com');
   await page.locator('#free-consent').check();
  }
  await load();
  assert.equal(await page.locator('#free-reading').isVisible(),true);
  assert.match(await page.locator('#free-reading-dates').textContent(),/30\/11\/2026/);
  assert.equal(await page.locator('a[data-pkg="combo"]').first().isVisible(),true);
  await page.locator('#free-reading').scrollIntoViewIfNeeded();
  await page.screenshot({path:require('node:path').join(require('node:os').tmpdir(),'free-reading-desktop.png')});
  await fill(); await page.locator('#free-reading-submit').click();
  await page.waitForFunction(()=>document.getElementById('free-reading-status').dataset.state==='success');
  assert.equal(posted.length,1); assert.equal(posted[0].consent,true);
  assert.equal(posted[0].action,'register_free_campaign');
  assert.equal(await page.locator('#free-email').inputValue(),'');
  console.log('PASS browser: active campaign, separate form, explicit confirmation, purchase CTA retained');
  // Legacy backend: no offer or POST.
  state={reviews:[],promos:{}}; posted=[]; await load();
  assert.equal(await page.locator('#free-reading').isVisible(),false);
  assert.equal(await page.locator('#free-reading-cta').isVisible(),false);
  assert.equal(posted.length,0);
  console.log('PASS browser: old backend hides offer');
  // No dates: open until turned off.
  state={version:1,active:true,title:'Miễn phí',startDate:'',endDate:'',endsAt:0,serverNow:Date.now()};
  await page.setViewportSize({width:390,height:844}); await load();
  assert.match(await page.locator('#free-reading-dates').textContent(),/chưa ấn định/);
  await page.locator('#free-reading').scrollIntoViewIfNeeded();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.screenshot({path:require('node:path').join(require('node:os').tmpdir(),'free-reading-mobile.png')});
  await fill(); throwPost=true; await page.locator('#free-reading-submit').click();
  await page.waitForFunction(()=>document.getElementById('free-reading-status').dataset.state==='error');
  assert.match(await page.locator('#free-reading-status').textContent(),/Chưa xác nhận/);
  assert.equal(posted.length,1);
  console.log('PASS browser: unlimited campaign, mobile layout, ambiguous failure never claims success or auto-retries');
  // Campaign closes between opening the form and submitting.
  throwPost=false; posted=[]; await load(); await fill(); state.active=false;
  await page.locator('#free-reading-submit').click();
  await page.waitForFunction(()=>document.getElementById('free-reading-status').dataset.state==='error');
  assert.equal(posted.length,0);
  assert.equal(await page.locator('#free-reading-cta').isVisible(),false);
  console.log('PASS browser: server config rechecked before submit');
 } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1});
