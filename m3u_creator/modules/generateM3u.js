/**
 * generateM3u.js
 * streams.json verisinden M3U playlist dosyası üretir.
 * Kanal adlarını turksatkablo.com.tr epg XML'indeki adlarla eşleştirir.
 */

const https = require('https');

let epgNames = [];

/**
 * EPG XML dosyasını indirip kanal adlarını listeler
 */
function fetchEpgNames() {
  return new Promise((resolve, reject) => {
    https.get('https://raw.githubusercontent.com/yasinyonet/iptv-list/refs/heads/main/epg/sites/turksatkablo.com.tr/turksatkablo.com.tr.channels.xml', res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const regex = /<channel[^>]*>(.*?)<\/channel>/g;
        let match;
        const set = new Set();
        while ((match = regex.exec(data)) !== null) {
          set.add(match[1]);
        }
        epgNames = Array.from(set);
        resolve(epgNames);
      });
      res.on('error', reject);
    }).on('error', reject);
  });
}

function normalizeForMatch(str) {
  return str.toLocaleLowerCase('tr-TR')
    .replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ş/g, 's').replace(/ü/g, 'u')
    .replace(/[^a-z0-9]/g, '');
}

function matchEpgName(channelName) {
  if (!epgNames.length) return channelName;
  
  const normOriginal = normalizeForMatch(channelName);
  
  // 1. Birebir eşleşme (örn: TRT 1)
  const exact = epgNames.find(n => normalizeForMatch(n) === normOriginal);
  if (exact) return exact;
  
  // 2. "TV", "HD" kelimelerini atıp eşleşme (örn: Show TV -> Show)
  const cleanStr = (s) => normalizeForMatch(s).replace(/tv|hd|kanali/g, '');
  const cleanOriginal = cleanStr(channelName);
  
  if (cleanOriginal) {
    // EPG listesindeki temiz isimle tam eşleşme veya startsWith
    const cleanMatch = epgNames.find(n => {
      const cn = cleanStr(n);
      return cn && (cn === cleanOriginal || cleanOriginal === cn);
    });
    if (cleanMatch) return cleanMatch;
  }
  
  // Eşleşmezse orijinal ismi kullan
  return channelName;
}

/**
 * Kanal dizisinden M3U içeriği üretir.
 * @param {Array} channels - streams.json içeriği
 * @returns {Promise<string>} - M3U dosya içeriği
 */
async function generateM3u(channels) {
  if (epgNames.length === 0) {
    try {
      await fetchEpgNames();
    } catch (err) {
      console.error('EPG isimleri XML\'i alinamadi:', err.message);
    }
  }

  const lines = ['#EXTM3U url-tvg="https://raw.githubusercontent.com/yasinyonet/iptv-list/refs/heads/main/tr_epg.xml"'];

  for (const ch of channels) {
    let streamUrl = ch.originalUrl;
    if (!streamUrl && ch.streams && ch.streams.length > 0) {
      const best = ch.streams
        .filter((s) => s.url)
        .sort((a, b) => (b.bandwidth || 0) - (a.bandwidth || 0))[0];
      streamUrl = best ? best.url : null;
    }
    if (!streamUrl) continue;

    const tvgId    = ch.tvgId    || '';
    const logo     = ch.logo     || '';
    const website  = ch.website  || '';
    const group    = ch.group    || 'Diğer';
    
    // EPG sitesinden eşleşen temiz ismi bul
    const name     = matchEpgName(ch.name || 'Bilinmeyen Kanal');

    lines.push(
      `#EXTINF:-1 tvg-id="${tvgId}" tvg-logo="${logo}" tvg-url="${website}" group-title="${group}",${name}`
    );
    lines.push(streamUrl);
  }

  return lines.join('\n') + '\n';
}

module.exports = { generateM3u };
