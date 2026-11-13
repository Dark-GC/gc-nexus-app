import {test,expect} from '@playwright/test';

test('Amazon analysis and simulated immediate quotation update the rendered card',async({page})=>{
  await page.route('https://gc-graphics-prices-api.onrender.com/api/product-preview**',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({title:'Amazon test cutter',store:'amazon.com',asin:'B0D9VWCHM8',productUrl:'https://www.amazon.com/dp/B0D9VWCHM8',requestedUrl:'https://www.amazon.com/dp/B0D9VWCHM8',price:null,currency:null,availability:'unknown',checkedAt:new Date().toISOString()})}));
  await page.goto('/data/app.html');
  await page.locator('#cloudOverlay').evaluate(el=>el.classList.add('hidden'));
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

test('an Amazon analysis failure is explicit and the button stays usable',async({page})=>{
  await page.route('https://gc-graphics-prices-api.onrender.com/api/product-preview**',route=>route.fulfill({status:422,contentType:'application/json',body:JSON.stringify({message:'Amazon requiere una cotización privada después de guardar el artículo.'})}));
  await page.goto('/data/app.html');
  await page.locator('#cloudOverlay').evaluate(el=>el.classList.add('hidden'));
  await page.locator('#addItem').click();
  await page.locator('#itemUrl').fill('https://www.amazon.com/dp/B0D9VWCHM8');
  await page.locator('#analyzeProduct').click();
  await expect(page.locator('#urlAnalyzeStatus')).toContainText('Amazon requiere una cotización privada');
  await expect(page.locator('#analyzeProduct')).toBeEnabled();
});
