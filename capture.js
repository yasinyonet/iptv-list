const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    recordHar: { path: 'stream/output.har' }
  });
  const page = await context.newPage();

  // Sayfayı yüklemeyi dene, 180 saniye timeout
  try {
    await page.goto('https://www.atv.com.tr/canli-yayin', {
      timeout: 180000, // 3 dakika
      waitUntil: 'domcontentloaded' // load yerine daha erken aşamada bekle
    });
  } catch (e) {
    console.log('⚠️ Sayfa tam yüklenemedi ama devam ediyoruz:', e.message);
  }

  // Ekstra bekle (sayfanın biraz daha açılması için)
  await page.waitForTimeout(10000); // 10 saniye

  // HAR'ı kaydetmek için context'i kapat
  await context.close();
  await browser.close();
})();
