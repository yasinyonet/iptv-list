const https = require('https');
const axios = require('axios');
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
const customParseFormat = require('dayjs/plugin/customParseFormat');

// Dayjs eklentilerini yükle
dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(customParseFormat);

module.exports = {
  site: 'turksatkablo.com.tr',
  days: 1, // 2 günlük EPG çek
  url({ date }) {
    // date: dayjs objesi (sistem tarafından sağlanır)
    const dayOfMonth = date.format('D'); // Tek haneli gün (1-31)
    const timestamp = date.valueOf(); // Milisaniye cinsinden timestamp
    return `https://www.turksatkablo.com.tr/userUpload/EPG/${dayOfMonth}.json?_=${timestamp}`;
  },
  request: {
    timeout: 60000,
    // SSL sertifika hatasını geçici olarak çözer
    httpsAgent: new https.Agent({ rejectUnauthorized: false }),
    cache: {
      ttl: 60 * 60 * 1000 // 1 saat
    }
  },
  parser: function ({ content, channel, date }) {
    const programs = [];
    const items = parseItems(content, channel);
    if (!items || items.length === 0) return [];

    // Her program için başlangıç ve bitiş zamanlarını hesapla
    items.forEach(item => {
      // Boş yayınları atla (bazen '-' olarak geliyor)
      if (item.b === '-') return;

      // Başlangıç: verilen tarih + item.c (HH:mm)
      const startStr = `${date.format('YYYY-MM-DD')} ${item.c}`;
      const start = dayjs.tz(startStr, 'YYYY-MM-DD HH:mm', 'Europe/Istanbul').utc();

      // Bitiş: aynı tarih + item.d (HH:mm)
      const stopStr = `${date.format('YYYY-MM-DD')} ${item.d}`;
      let stop = dayjs.tz(stopStr, 'YYYY-MM-DD HH:mm', 'Europe/Istanbul').utc();

      // Eğer bitiş başlangıçtan önceyse (gece yarısını geçen yayın), 1 gün ekle
      if (stop.isBefore(start)) {
        stop = stop.add(1, 'day');
      }

      programs.push({
        title: item.b,
        start: start.toDate(), // Date objesi olarak ver
        stop: stop.toDate()
      });
    });

    return programs;
  },
  async channels() {
    const dayOfMonth = dayjs().format('D'); // Bugünün günü (tek haneli)
    const agent = new https.Agent({ rejectUnauthorized: false });

    try {
      const response = await axios.get(
        `https://www.turksatkablo.com.tr/userUpload/EPG/${dayOfMonth}.json`,
        { httpsAgent: agent }
      );
      const data = response.data;

      if (!data || !Array.isArray(data.k)) {
        console.error('Kanal verisi bulunamadı veya beklenen formatta değil.');
        return [];
      }

      // data.k içindeki her kanal için { lang, site_id, name } döndür
      return data.k.map(item => ({
        lang: 'tr',
        site_id: item.i,
        name: item.n
      }));
    } catch (error) {
      console.error('Kanal listesi alınamadı:', error.message);
      return [];
    }
  }
};

// Yardımcı fonksiyon: Gelen JSON içeriğinden belirli bir kanala ait program listesini döndürür
function parseItems(content, channel) {
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    return [];
  }
  if (!parsed || !parsed.k) return [];

  // site_id (item.i) ile eşleşen kanalı bul (string veya number olabilir)
  const channelData = parsed.k.find(c => String(c.i) === String(channel.site_id));
  return channelData ? channelData.p : [];
}
