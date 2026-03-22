/**
 * matchLogo.js
 * GitHub'daki logo listesini çeker ve kanal ismine göre logo URL'i bulur.
 */

const axios = require('axios');

// GitHub API'den logo listesini cache'lemek için
let logoCacheList = null;

/**
 * GitHub'dan logo listesini çeker ve cache'e alır.
 * @returns {Promise<Array<{name: string, htmlUrl: string}>>}
 */
async function fetchLogoList() {
  if (logoCacheList) return logoCacheList;

  try {
    const response = await axios.get(
      'https://api.github.com/repos/yasinyonet/iptv-list/contents/iptv-logo',
      {
        timeout: 15000,
        headers: {
          'User-Agent': 'tr-iptv-scraper/1.0',
          'Accept': 'application/vnd.github.v3+json',
        },
      }
    );

    logoCacheList = response.data
      .filter(f => f.type === 'file' && f.name.toLowerCase().endsWith('.png'))
      .map(f => ({
        name: f.name,       // örn: TRT_1.png
        htmlUrl: `https://raw.githubusercontent.com/yasinyonet/iptv-list/refs/heads/main/iptv-logo/${encodeURIComponent(f.name)}`
      }));

    return logoCacheList;
  } catch (err) {
    console.error('Logo listesi çekilemedi:', err.message);
    return [];
  }
}

/**
 * Bir kanalın logo URL'ini bulur.
 * @param {string} channelName - Kanal adı (örn: "TRT 1", "ATV", "Kanal D")
 * @returns {Promise<string|null>} - Logo HTML URL'i veya null
 */
async function matchLogo(channelName) {
  const logos = await fetchLogoList();
  if (!logos.length) return null;

  const normalized = normalizeName(channelName);

  // 1. Tam eşleşme dene (normalize edilmiş)
  for (const logo of logos) {
    const logoNorm = normalizeName(logo.name.replace(/\.png$/i, ''));
    if (logoNorm === normalized) {
      return logo.htmlUrl;
    }
  }

  // 2. Logo adı channel adını içeriyor mu?
  for (const logo of logos) {
    const logoNorm = normalizeName(logo.name.replace(/\.png$/i, ''));
    if (logoNorm.includes(normalized) || normalized.includes(logoNorm)) {
      return logo.htmlUrl;
    }
  }

  // 3. Token bazlı eşleşme (en az 2 token eşleşmesi)
  const channelTokens = normalized.split(/[\s_]+/).filter(t => t.length > 1);
  if (channelTokens.length >= 2) {
    for (const logo of logos) {
      const logoNorm = normalizeName(logo.name.replace(/\.png$/i, ''));
      const logoTokens = logoNorm.split(/[\s_]+/).filter(t => t.length > 1);
      const matches = channelTokens.filter(t => logoTokens.includes(t));
      if (matches.length >= 2) {
        return logo.htmlUrl;
      }
    }
  }

  // 4. En azından 1 anlamlı token eşleşmesi
  for (const logo of logos) {
    const logoNorm = normalizeName(logo.name.replace(/\.png$/i, ''));
    const logoTokens = logoNorm.split(/[\s_]+/).filter(t => t.length > 2);
    const firstToken = channelTokens[0];
    if (firstToken && logoTokens.includes(firstToken)) {
      return logo.htmlUrl;
    }
  }

  return null;
}

/**
 * Kanal adını normalize eder:
 * - Küçük harfe çevirir
 * - Türkçe harfleri ASCII'ye dönüştürür
 * - Özel karakterleri underscore'a dönüştürür
 * - Fazladan boşlukları temizler
 * @param {string} name
 * @returns {string}
 */
function normalizeName(name) {
  return name
    .toLowerCase()
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ı/g, 'i')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/â/g, 'a')
    .replace(/î/g, 'i')
    .replace(/û/g, 'u')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');
}

module.exports = { matchLogo, fetchLogoList };
