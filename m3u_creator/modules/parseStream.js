/**
 * parseStream.js
 * Proxy URL'yi fetch eder, gerçek stream URL'lerini ve kalite bilgilerini çıkarır.
 */

const https = require('https');
const http = require('http');

const FETCH_TIMEOUT_MS = 5000;

// Standart çözünürlük haritası — resolution null olan stream'ler için kullanılır
const RESOLUTION_MAP = {
  '240p':  '426x240',
  '360p':  '640x360',
  '480p':  '854x480',
  '540p':  '960x540',
  '720p':  '1280x720',
  '1080p': '1920x1080',
  '1440p': '2560x1440',
  '2160p': '3840x2160',
  '4320p': '7680x4320',
};

/** Native Node.js ile URL fetch eder (redirect takibi dahil) */
function fetchUrl(url, redirectCount) {
  if (redirectCount === undefined) redirectCount = 0;
  return new Promise(function (resolve, reject) {
    if (redirectCount > 8) return reject(new Error('too_many_redirects'));
    var parsed;
    try { parsed = new URL(url); } catch (e) { return reject(new Error('invalid_url')); }

    var lib = parsed.protocol === 'https:' ? https : http;
    var req = lib.request({
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: 'GET',
      headers: { 'User-Agent': 'Mozilla/5.0 IPTV-Scraper/1.0' },
      timeout: FETCH_TIMEOUT_MS,
    }, function (res) {
      // Redirect takibi
      if ([301, 302, 303, 307, 308].indexOf(res.statusCode) !== -1 && res.headers.location) {
        req.destroy();
        var next = res.headers.location.startsWith('http')
          ? res.headers.location
          : parsed.protocol + '//' + parsed.host + res.headers.location;
        return fetchUrl(next, redirectCount + 1).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        req.destroy();
        return reject(new Error('http_' + res.statusCode));
      }
      var chunks = [];
      res.on('data', function (c) { chunks.push(c); });
      res.on('end', function () {
        resolve({ body: Buffer.concat(chunks).toString('utf8'), finalUrl: url });
      });
      res.on('error', reject);
    });
    req.on('timeout', function () { req.destroy(); reject(new Error('timeout')); });
    req.on('error', function (e) { reject(new Error(e.code || e.message)); });
    req.end();
  });
}

/**
 * Temiz quality etiketi çıkar.
 * Örnekler: "tv360_1080p.m3u8" → "1080p"
 *           "https://.../atv_720p.m3u8?sid=..." → "720p"
 *           "master_480p" → "480p"
 * NOT: \b word boundary _1080p içinde çalışmaz çünkü _ de \w dir.
 */
function extractQuality(streamPath, resolution) {
  // 1. "_1080p" veya "/1080p" kalıbı — sonrasında .m3u8, ? veya sona gelir
  var m = streamPath.match(/[_\/](\d{3,4})p(?:\.m3u8|\?|$)/i);
  if (m) return m[1] + 'p';

  // 2. Herhangi bir "1080p.m3u8" kalıbı
  m = streamPath.match(/(\d{3,4})p\.m3u8/i);
  if (m) return m[1] + 'p';

  // 3. EXT-X-STREAM-INF RESOLUTION'dan: "1920x1080" → "1080p"
  if (resolution) {
    var r = resolution.match(/\d+x(\d+)/);
    if (r) return r[1] + 'p';
  }

  // 4. Son çare: herhangi bir yerde geçen çözünürlük sayısı
  m = streamPath.match(/(\d{3,4})p/i);
  if (m) return m[1] + 'p';

  return 'unknown';
}

/**
 * Resolution null ise quality'den tahmin et
 */
function inferResolution(quality, resolution) {
  if (resolution) return resolution;
  return RESOLUTION_MAP[quality] || null;
}

/**
 * Proxy M3U8 URL'sini parse eder.
 * @param {string} proxyUrl
 * @returns {{ originalUrl: string|null, streams: Array, status: string }}
 */
async function parseStream(proxyUrl) {
  try {
    var result = await fetchUrl(proxyUrl);
    var content = result.body;
    var finalUrl = result.finalUrl;

    var lines = content.split('\n').map(function (l) { return l.trim(); }).filter(function (l) { return l.length > 0; });
    var baseUrl = getBaseUrl(finalUrl);
    var streams = [];

    // originalUrl = proxy'nin redirect ettiği gerçek master URL
    var originalUrl = finalUrl !== proxyUrl ? finalUrl : null;

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (!line.startsWith('#EXT-X-STREAM-INF')) continue;

      var bwMatch  = line.match(/BANDWIDTH=(\d+)/);
      var resMatch = line.match(/RESOLUTION=(\d+x\d+)/);
      var fpsMatch = line.match(/FRAME-RATE=([\d.]+)/);
      var codMatch = line.match(/CODECS="([^"]+)"/);

      var bandwidth  = bwMatch  ? parseInt(bwMatch[1])    : null;
      var resolution = resMatch ? resMatch[1]              : null;
      var frameRate  = fpsMatch ? parseFloat(fpsMatch[1]) : null;
      var codecs     = codMatch ? codMatch[1]              : '';

      if (i + 1 >= lines.length) continue;
      var streamPath = lines[++i].trim();

      // Tam stream URL'si
      var streamUrl = streamPath.startsWith('http')
        ? streamPath
        : baseUrl + '/' + streamPath.replace(/^\/+/, '');

      // quality ve resolution
      var quality    = extractQuality(streamPath, resolution);
      var resolvedRes = inferResolution(quality, resolution);

      // originalUrl yoksa ilk stream URL'inden master tahmin et
      if (!originalUrl) {
        // stream URL'inden quality suffix kaldır: atv_1080p.m3u8 → atv.m3u8
        originalUrl = streamUrl.replace(/_\d+p(\.m3u8).*$/, '$1');
      }

      streams.push({
        quality:    quality,
        resolution: resolvedRes,
        bandwidth:  bandwidth,
        frameRate:  frameRate,
        codecs:     codecs,
        url:        streamUrl,
      });
    }

    // Multi-bitrate yoksa tek stream kontrol et
    if (streams.length === 0) {
      var urlLine = lines.find(function (l) {
        return !l.startsWith('#') && /\.m3u8|\.ts$/i.test(l);
      });
      if (urlLine) {
        originalUrl = urlLine.startsWith('http')
          ? urlLine
          : baseUrl + '/' + urlLine.replace(/^\/+/, '');
      } else if (!originalUrl) {
        originalUrl = null;
      }
    }

    return { originalUrl: originalUrl, streams: streams, status: 'ok' };

  } catch (err) {
    return { originalUrl: null, streams: [], status: 'error:' + err.message };
  }
}

/** URL'den base URL çıkarır */
function getBaseUrl(url) {
  try {
    var p = new URL(url);
    var parts = p.pathname.split('/');
    parts.pop();
    return p.protocol + '//' + p.host + parts.join('/');
  } catch (e) {
    var idx = url.lastIndexOf('/');
    return idx > 8 ? url.slice(0, idx) : url;
  }
}

module.exports = { parseStream };
