/**
 * proxy.js
 * Orijinal stream URL'lerini GitHub URL'leriyle gizler.
 * JSON'da publicUrl gösterilir, originalUrl gizli kalır.
 */

const GITHUB_BASE = 'https://github.com/yasinyonet/iptv-list/tree/main/kanallar';

/**
 * Kanal adından güvenli bir dosya adı üretir
 * @param {string} channelName 
 * @returns {string}
 */
function toSafeFilename(channelName) {
  return channelName
    .trim()
    .replace(/ğ/g, 'g').replace(/Ğ/g, 'G')
    .replace(/ü/g, 'u').replace(/Ü/g, 'U')
    .replace(/ş/g, 's').replace(/Ş/g, 'S')
    .replace(/ı/g, 'i').replace(/İ/g, 'I')
    .replace(/ö/g, 'o').replace(/Ö/g, 'O')
    .replace(/ç/g, 'c').replace(/Ç/g, 'C')
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_\-\.]/g, '')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

/**
 * Kanal için gizlenmiş GitHub public URL üretir
 * @param {string} channelName - Kanal adı
 * @param {string} originalUrl - Gerçek stream URL
 * @returns {string} - Gösterilecek public URL
 */
function buildPublicUrl(channelName, originalUrl) {
  const filename = toSafeFilename(channelName);
  // Dosya adını master URL'den çıkarmaya çalış
  const masterMatch = originalUrl && originalUrl.match(/\/([^/]+)\.m3u8$/);
  const masterFile = masterMatch ? masterMatch[1] : 'master';
  return `${GITHUB_BASE}/${filename}_${masterFile}.m3u8`;
}

module.exports = { buildPublicUrl, toSafeFilename };
