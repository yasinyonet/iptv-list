/**
 * parseM3u.js
 * M3U dosyasını parse eder ve kanal listesini döndürür.
 */

/**
 * M3U içeriğini parse eder
 * @param {string} content - M3U dosyasının içeriği
 * @returns {Array} - Kanal nesneleri dizisi
 */
function parseM3u(content) {
  const channels = [];
  const lines = content.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  let index = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (!line.startsWith('#EXTINF')) continue;

    // #EXTINF satırını parse et
    const extinf = line;

    // tvg-id
    const tvgIdMatch = extinf.match(/tvg-id="([^"]*)"/);
    const tvgId = tvgIdMatch ? tvgIdMatch[1] : '';

    // tvg-logo
    const tvgLogoMatch = extinf.match(/tvg-logo="([^"]*)"/);
    const tvgLogo = tvgLogoMatch ? tvgLogoMatch[1] : '';

    // tvg-url (website)
    const tvgUrlMatch = extinf.match(/tvg-url="([^"]*)"/);
    const website = tvgUrlMatch ? tvgUrlMatch[1] : '';

    // group-title
    const groupMatch = extinf.match(/group-title="([^"]*)"/);
    const group = groupMatch ? groupMatch[1] : '';

    // Kanal adı (virgülden sonraki kısım)
    const commaIdx = extinf.lastIndexOf(',');
    const name = commaIdx >= 0 ? extinf.slice(commaIdx + 1).trim() : '';

    // Sonraki satır URL olmalı (# ile başlamayan)
    let proxyUrl = '';
    if (i + 1 < lines.length && !lines[i + 1].startsWith('#')) {
      proxyUrl = lines[i + 1].trim();
      i++; // URL satırını atla
    }

    if (!proxyUrl || !name) continue;

    channels.push({
      index,
      name,
      group,
      tvgLogo,    // uzunmuhalefet logo URL'i (kaynak)
      tvgId,
      website,
      proxyUrl,   // streams.uzunmuhalefet.com/stream/UUID.m3u8
    });

    index++;
  }

  return channels;
}

module.exports = { parseM3u };
