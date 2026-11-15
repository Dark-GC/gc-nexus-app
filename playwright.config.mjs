import {defineConfig} from '@playwright/test';

const edgeFallback=process.env.PLAYWRIGHT_EDGE==='1'?[{name:'edge-fallback',use:{browserName:'chromium',launchOptions:{executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--headless=new','--disable-gpu']}}}]:[];
export default defineConfig({
  testDir:'tests/e2e',timeout:30000,fullyParallel:false,forbidOnly:!!process.env.CI,retries:process.env.CI?1:0,
  use:{baseURL:'http://127.0.0.1:4173',trace:'retain-on-failure',screenshot:'on'},
  webServer:{command:'node scripts/e2e-static-server.mjs',url:'http://127.0.0.1:4173/data/app.html',reuseExistingServer:!process.env.CI,timeout:30000},
  projects:[{name:'chromium',use:{browserName:'chromium'}},...edgeFallback]
});
