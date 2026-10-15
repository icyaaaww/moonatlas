import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir:'./tests/browser', timeout:30000, fullyParallel:false, workers:1,
  use:{headless:true,viewport:{width:1440,height:1000},screenshot:'only-on-failure'},
  reporter:'list',
  projects:[
    {name:'chromium',use:{browserName:'chromium'}},
    {name:'firefox',use:{browserName:'firefox'}},
    // Windows WebKit cold File.arrayBuffer() reads measured ~3 s per file,
    // then recovered; a 35-file import took ~24 s. Keep the same assertions.
    {name:'webkit',timeout:90000,expect:{timeout:30000},use:{browserName:'webkit'}},
  ],
});
