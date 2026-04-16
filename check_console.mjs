import { chromium } from 'playwright';

async function run(){
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  const failedRequests = [];
  page.on('console', msg => {
    if(msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', err => errors.push(err.toString()));
  page.on('requestfailed', req => { failedRequests.push({url: req.url(), err: req.failure()?.errorText}); });
  page.on('response', res => { if(res.status() >= 400) failedRequests.push({url: res.url(), status: res.status()}); });
  try{
    await page.goto(process.env.DEV_URL || 'http://localhost:5175/', { waitUntil: 'networkidle' });
    // wait a short time for any runtime console errors to appear
    await page.waitForTimeout(3000);
  }catch(e){
    console.error('PAGE_LOAD_ERROR', e.toString());
    await browser.close();
    process.exit(2);
  }
  if(errors.length || failedRequests.length){
    console.log('CONSOLE_ERRORS_START');
    errors.forEach(e=>console.log(e));
    if(failedRequests.length){
      console.log('FAILED_REQUESTS_START');
      failedRequests.forEach(r=>console.log(JSON.stringify(r)));
      console.log('FAILED_REQUESTS_END');
    }
    console.log('CONSOLE_ERRORS_END');
    await browser.close();
    process.exit(1);
  }else{
    console.log('NO_CLIENT_ERRORS');
    await browser.close();
    process.exit(0);
  }
}

run();
