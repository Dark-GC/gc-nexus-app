import {test,expect} from '@playwright/test';

const supabaseFixture=`(()=>{const user={id:'00000000-0000-4000-8000-000000000001',email:'qa-admin@example.test',email_confirmed_at:'2026-11-14T00:00:00.000Z',app_metadata:{gc_admin:true}};const result={data:[],error:null};const query=()=>{const q={select:()=>q,eq:()=>q,order:()=>q,limit:()=>q,delete:()=>q,in:()=>q,update:()=>q,upsert:async()=>result,maybeSingle:async()=>({data:null,error:null}),then:(resolve,reject)=>Promise.resolve(result).then(resolve,reject)};return q};window.supabase={createClient:()=>({auth:{getUser:async()=>({data:{user},error:null}),getSession:async()=>({data:{session:{access_token:'fixture-token'}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),signOut:async()=>({error:null})},from:()=>query(),channel:()=>{const q={on:()=>q,subscribe:()=>q};return q},removeChannel:async()=>null})}})();`;

async function openAdministratorFixture(page){
  await page.route('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.118.0',route=>route.fulfill({contentType:'application/javascript',body:supabaseFixture}));
  await page.goto('/data/app.html',{waitUntil:'domcontentloaded'});
  await expect(page.locator('#addItem')).toBeVisible();
}
function amazonPreview(title='Amazon test cutter',requestedUrl='https://www.amazon.com/dp/B0D9VWCHM8'){
  return {title,store:'amazon.com',asin:'B0D9VWCHM8',productUrl:'https://www.amazon.com/dp/B0D9VWCHM8',requestedUrl,price:null,currency:null,availability:'unknown',checkedAt:'2026-11-14T20:00:00.000Z'};
}

test('Amazon analysis and simulated immediate quotation update the rendered card',async({page})=>{
  await page.route('https://gc-graphics-prices-api.onrender.com/api/product-preview**',route=>route.fulfill({contentType:'application/json',body:JSON.stringify(amazonPreview())}));
  await openAdministratorFixture(page);
  await page.locator('#addItem').click();
  await page.locator('#itemUrl').fill('https://www.amazon.com/dp/B0D9VWCHM8');
  await page.locator('#analyzeProduct').click();
  await expect(page.locator('#urlAnalyzeStatus')).toContainText('Ficha parcial lista');
  await expect(page.locator('#urlPreview')).toContainText('Amazon test cutter');
  await page.evaluate(()=>{window.GCCloud={requestImmediateAmazonQuote:async()=>({checkedAt:'2026-11-13T20:00:00.000Z',price:12.5,currency:'USD',priceStatus:'verified',stockStatus:'in_stock',seller:'Amazon.com'})};});
  await page.locator('#itemName').fill('Amazon test cutter');
  await page.locator('#itemForm button[type="submit"]').click();
  await expect(page.locator('#productGrid')).toContainText('$12.50');
});

test('short Amazon link analysis identifies the ASIN before saving',async({page})=>{
  await page.route('https://gc-graphics-prices-api.onrender.com/api/product-preview**',route=>{
    const requestedUrl=new URL(route.request().url()).searchParams.get('url');
    return route.fulfill({contentType:'application/json',body:JSON.stringify(amazonPreview('Amazon shortened link',requestedUrl))});
  });
  await openAdministratorFixture(page);
  await page.locator('#addItem').click();
  await page.locator('#itemUrl').fill('https://a.co/demo');
  await page.locator('#analyzeProduct').click();
  await expect(page.locator('#urlPreview')).toContainText('B0D9VWCHM8');
});

test('an Amazon analysis failure is explicit and the button stays usable',async({page})=>{
  await page.route('https://gc-graphics-prices-api.onrender.com/api/product-preview**',route=>route.fulfill({status:422,contentType:'application/json',body:JSON.stringify({message:'Amazon requiere una cotización privada después de guardar el artículo.'})}));
  await openAdministratorFixture(page);
  await page.locator('#addItem').click();
  await page.locator('#itemUrl').fill('https://www.amazon.com/dp/B0D9VWCHM8');
  await page.locator('#analyzeProduct').click();
  await expect(page.locator('#urlAnalyzeStatus')).toContainText('Amazon requiere una cotización privada');
  await expect(page.locator('#analyzeProduct')).toBeEnabled();
});
