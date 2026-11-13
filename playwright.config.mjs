import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'tests/e2e',timeout:30000,use:{baseURL:'http://127.0.0.1:4173',trace:'retain-on-failure',screenshot:'only-on-failure'},projects:[{name:'edge-fallback',use:{browserName:'chromium',launchOptions:{executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'}}}]});
