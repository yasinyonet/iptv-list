/**
 * scraper.js - Ana IPTV kanal listesi scraper'ı.
 * Kullanım: node scraper.js
 * Çıktı: output/streams.json + output/tr.m3u
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

const { parseM3u } = require('./modules/parseM3u');
const { parseStream } = require('./modules/parseStream');
const { matchLogo, fetchLogoList } = require('./modules/matchLogo');
const { buildPublicUrl } = require('./modules/proxy');
const { generateM3u } = require('./modules/generateM3u');

// ── Ayarlar ──────────────────────────────────────────────────────────
const M3U_URL = 'https://streams.uzunmuhalefet.com/lists/tr.m3u';
const OUTPUT_DIR = path.join(__dirname, 'output');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'streams.json');
const M3U_FILE    = path.join(OUTPUT_DIR, 'tr.m3u');
const CONCURRENCY = 8;   // Paralel istek sayısı
const BATCH_DELAY = 100; // Batch arası bekleme (ms)
const CHANNEL_TIMEOUT = 8000; // Her kanal için max süre (ms)
// ─────────────────────────────────────────────────────────────────────

/** Bir promise'i CHANNEL_TIMEOUT süresiyle sınırlar */
function withTimeout(promise, ms, fallback) {
  const timer = new Promise((resolve) =>
    setTimeout(() => resolve(fallback), ms)
  );
  return Promise.race([promise, timer]);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  console.log('═══════════════════════════════════════════════');
  console.log('  TR IPTV Kanal Listesi Scraper v1.1');
  console.log('═══════════════════════════════════════════════');

  // 1. M3U indir
  console.log('\n📥 M3U listesi indiriliyor...');
  let m3uContent;
  try {
    const resp = await axios.get(M3U_URL, {
      timeout: 30000,
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    m3uContent = resp.data;
    console.log('  ✓ M3U listesi indirildi.');
  } catch (err) {
    console.error('  ✗ Hata:', err.message);
    process.exit(1);
  }

  // 2. Parse
  console.log('\n📋 M3U parse ediliyor...');
  const channels = parseM3u(m3uContent);
  console.log(`  ✓ ${channels.length} kanal bulundu.`);

  // 3. Logo listesini önceden yükle (sadece 1 kez)
  console.log('\n🖼  GitHub logo listesi yükleniyor...');
  const logos = await fetchLogoList();
  console.log(`  ✓ ${logos.length} logo bulundu.`);

  // 4. Tüm kanalları batch'ler halinde işle
  console.log(`\n📡 Stream'ler çekiliyor (${channels.length} kanal, ${CONCURRENCY} paralel)...`);
  const results = [];
  let processed = 0;

  for (let i = 0; i < channels.length; i += CONCURRENCY) {
    const batch = channels.slice(i, i + CONCURRENCY);

    const batchResults = await Promise.all(
      batch.map(async (channel) => {
        // Her kanal için CHANNEL_TIMEOUT içinde bitmeyi zorla
        const streamData = await withTimeout(
          parseStream(channel.proxyUrl),
          CHANNEL_TIMEOUT,
          { originalUrl: null, streams: [], status: 'error:global_timeout' }
        );

        // Logo eşleştirme (zaten cached, hızlı)
        const logoUrl = await matchLogo(channel.name);
        const publicUrl = buildPublicUrl(
          channel.name,
          streamData.originalUrl || channel.proxyUrl
        );

        return {
          index: channel.index,
          name: channel.name,
          group: channel.group,
          logo: logoUrl || channel.tvgLogo || null,
          tvgId: channel.tvgId,
          website: channel.website,
          originalUrl: streamData.originalUrl || null,
          publicUrl,
          streams: streamData.streams || [],
          status: streamData.status || 'error',
        };
      })
    );

    results.push(...batchResults);
    processed += batch.length;

    const okInBatch = batchResults.filter((r) => r.status === 'ok').length;
    const errInBatch = batchResults.length - okInBatch;
    process.stdout.write(
      `\r  [${processed}/${channels.length}] ✓${okInBatch} ✗${errInBatch}   `
    );

    if (i + CONCURRENCY < channels.length) {
      await sleep(BATCH_DELAY);
    }
  }

  console.log(`\n  ✓ Tüm kanallar işlendi.`);

  // 5. İstatistikler
  const okCount = results.filter((r) => r.status === 'ok').length;
  const errCount = results.length - okCount;
  const withStreams = results.filter((r) => r.streams.length > 0).length;
  const withGhLogo = results.filter(
    (r) => r.logo && r.logo.includes('github.com')
  ).length;

  console.log('\n📊 İstatistikler:');
  console.log(`  • Toplam kanal  : ${results.length}`);
  console.log(`  • Başarılı      : ${okCount}`);
  console.log(`  • Hatalı        : ${errCount}`);
  console.log(`  • Stream'li     : ${withStreams}`);
  console.log(`  • GitHub logo   : ${withGhLogo}`);

  // 6. JSON yaz
  console.log(`\n💾 Sonuç yazılıyor...`);
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(results, null, 2), 'utf8');
  console.log(`  ✓ ${OUTPUT_FILE}`);

  // 6b. M3U yaz
  const generatedM3uContent = await generateM3u(results);
  fs.writeFileSync(M3U_FILE, generatedM3uContent, 'utf8');
  const m3uLines = generatedM3uContent.split('\n').filter((l) => l.startsWith('#EXTINF')).length;
  console.log(`  ✓ ${M3U_FILE}  (${m3uLines} kanal)`);

  // 7. Önizleme
  console.log('\n🔍 İlk 3 kanal:');
  results.slice(0, 3).forEach((ch) => {
    console.log(`\n  [${ch.index}] ${ch.name} (${ch.group})`);
    console.log(`      originalUrl : ${ch.originalUrl || 'N/A'}`);
    console.log(`      publicUrl   : ${ch.publicUrl}`);
    console.log(`      logo        : ${ch.logo || 'N/A'}`);
    console.log(`      streams     : ${ch.streams.length} kalite`);
    ch.streams.forEach((s) => {
      const kbps = s.bandwidth ? Math.round(s.bandwidth / 1000) + 'kbps' : '';
      console.log(`        • ${s.quality} [${s.resolution}] ${kbps}`);
    });
  });

  console.log('\n═══════════════════════════════════════════════');
  console.log('  Tamamlandı! ✓');
  console.log('═══════════════════════════════════════════════\n');
}

main().catch((err) => {
  console.error('\n❌ Kritik hata:', err);
  process.exit(1);
});
