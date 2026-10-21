const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const server=fs.readFileSync('apps-script/Ma.gs','utf8');
const client=fs.readFileSync('assets/page-views.js','utf8');
function backend(){
 const sheets={};let locked=false;
 function sheet(){return {rows:[],appendRow(r){this.rows.push(r)},setFrozenRows(){},getLastRow(){return this.rows.length},getDataRange(){return {getValues:()=>this.rows.map(r=>r.slice())}},getRange(r,c,h=1,w=1){return {setFontWeight(){},setNumberFormat(){},setValues:values=>{values.forEach((v,i)=>{this.rows[r-1+i]??=[];v.forEach((x,j)=>this.rows[r-1+i][c-1+j]=x)})}}}}}
 const context={SpreadsheetApp:{getActiveSpreadsheet:()=>({getSheetByName:n=>sheets[n],insertSheet:n=>sheets[n]=sheet()}),flush(){}},LockService:{getScriptLock:()=>({waitLock(){assert.equal(locked,false);locked=true},releaseLock(){locked=false}})},Utilities:{formatDate:(d,tz)=>{assert.equal(tz,'Asia/Ho_Chi_Minh');return '2026-10-21'}},ContentService:{MimeType:{JSON:'json'},createTextOutput:s=>({setMimeType:()=>JSON.parse(s)})}};
 vm.createContext(context);vm.runInContext(server,context);return {context,sheets,isLocked:()=>locked};
}
test('Counts both pages, increments existing day, never writes Leads',()=>{
 const b=backend();for(const page of ['/','/gioi-thieu.html','/'])assert.equal(b.context.doPost({postData:{contents:JSON.stringify({action:'page_view',page})}}).result,'success');
 assert.deepEqual(b.sheets['Thống kê truy cập'].rows[1],['2026-10-21',2,1,3]);assert.equal(b.sheets.Leads,undefined);assert.equal(b.isLocked(),false);
});
test('Rejects unknown pages without creating sheets',()=>{const b=backend();assert.equal(b.context.recordPageView({page:'/bad'}).result,'error');assert.deepEqual(Object.keys(b.sheets),[])});
test('Protects an existing sheet with unexpected headers and releases lock',()=>{const b=backend();b.context.recordPageView({page:'/'});b.sheets['Thống kê truy cập'].rows[0][0]='Changed';assert.throws(()=>b.context.recordPageView({page:'/'}));assert.equal(b.isLocked(),false);assert.equal(b.sheets['Thống kê truy cập'].rows[1][3],1)});
async function browser(config,hostname='nguyenquanai.vn',reject=false){const calls=[];vm.runInNewContext(client,{location:{hostname,pathname:'/index.html'},fetch:async(u,o)=>{calls.push({u,o});if(reject)throw Error('network');return {json:async()=>config}}});await new Promise(setImmediate);return calls;}
test('Old backend and failed capability requests never receive POST',async()=>{assert.equal((await browser({reviews:[]})).length,1);assert.equal((await browser(null,'nguyenquanai.vn',true)).length,1)});
test('New backend receives exactly one page view, with no personal fields',async()=>{const c=await browser({pageViewTracking:1});assert.equal(c.length,2);assert.equal(c[1].o.mode,'no-cors');assert.deepEqual(JSON.parse(c[1].o.body),{action:'page_view',page:'/'});});
test('Local development does not count traffic',async()=>assert.equal((await browser({pageViewTracking:1},'localhost')).length,0));
