/**
 * ============================================================
 * YAYIN AKIŞI KAZIYICI - yirmidort.tv (24 TV)
 * ============================================================
 *
 * Bu dosya, 24 TV'nin (yirmidort.tv) yayın akışı sayfasından
 * program bilgilerini çekmek için kullanılan yapılandırma modülüdür.
 *
 * Site: https://www.yirmidort.tv/televizyon/yayin-akisi/
 *
 * Yöntem:
 *   - Site doğrudan bir HTML sayfası sunmaktadır.
 *   - Program listesi, sayfanın HTML içeriğinden cheerio
 *     kütüphanesi aracılığıyla ayrıştırılır (HTML scraping).
 *   - Saatin ve tarihin sitenin yerel saat dilimine (Europe/Istanbul)
 *     göre işlenmesi gerekir.
 *
 * Gereksinimler:
 *   - axios       : HTTP istekleri için
 *   - dayjs       : Tarih/saat işlemleri için
 *   - cheerio     : HTML ayrıştırma (DOM parsing) için
 * ============================================================
 */

const axios = require('axios')
const dayjs = require('dayjs')
const utc = require('dayjs/plugin/utc')
const timezone = require('dayjs/plugin/timezone')
const customParseFormat = require('dayjs/plugin/customParseFormat')
const cheerio = require('cheerio')

// dayjs eklentilerini etkinleştir
dayjs.extend(utc)
dayjs.extend(timezone)
dayjs.extend(customParseFormat)

/**
 * Sitenin kullandığı zaman dilimi.
 * 24 TV Türkiye merkezli yayın yapan bir kanal olduğundan
 * tüm saat bilgileri Türkiye saatiyle (UTC+3) yayınlanır.
 */
const TIMEZONE = 'Europe/Istanbul'

module.exports = {
  /**
   * site: Kaynak sitenin alan adı.
   * Bu alan EPG (Elektronik Program Rehberi) sistemlerinde
   * kanalı tanımlamak için kullanılır.
   */
  site: 'yirmidort.tv',

  /**
   * days: Kaç günlük yayın akışının çekileceğini belirtir.
   * Örneğin 2 yazılırsa; bugün ve yarının verisi çekilir.
   */
  days: 2,

  /**
   * request: Tüm HTTP isteklerinde kullanılacak varsayılan başlıklar.
   * User-Agent belirtilerek sitenin bot engelini aşmak amaçlanır.
   */
  request: {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Safari/537.36'
    }
  },

  /**
   * url: Her gün için çekilecek sayfanın adresini oluşturur.
   *
   * @param {object} params
   * @param {dayjs.Dayjs} params.date    - Yayın akışı istenen tarih (UTC)
   * @param {object}      params.channel - Kanal bilgisi ({ site_id, xmltv_id, ... })
   * @returns {string} Tam URL adresi
   *
   * Örnek çıktı:
   *   https://www.yirmidort.tv/televizyon/yayin-akisi/?date=2024-03-16
   *
   * NOT: Site tarih parametresini YYYY-MM-DD formatında kabul etmektedir.
   *      Kanal ID'si site_id alanından alınır; bu site tek kanal (24 TV)
   *      yayın akışı sunduğundan site_id zorunlu değildir fakat
   *      tutarlılık açısından yapıya dahil edilmiştir.
   */
  url: function ({ date, channel }) {
    // Tarihi Türkiye saatiyle formatla; sitenin beklediği formatta gönder
    const formattedDate = date.tz(TIMEZONE).format('YYYY-MM-DD')
    return `https://www.yirmidort.tv/televizyon/yayin-akisi/?date=${formattedDate}`
  },

  /**
   * parser: Sayfadan gelen HTML içeriğini işleyerek program listesini döndürür.
   *
   * @param {object} params
   * @param {string|Buffer} params.content - Sayfanın ham HTML içeriği
   * @param {object}        params.channel - Kanal bilgisi
   * @param {dayjs.Dayjs}   params.date    - İstenen tarih
   * @returns {Array<{title, description, start, stop}>} Program listesi
   *
   * Dönen nesne formatı:
   *   {
   *     title:       string   - Programın adı (örn: "AKŞAM HABERLERİ")
   *     description: string   - Programın açıklaması (varsa)
   *     start:       dayjs    - Başlangıç zamanı (UTC'ye çevrilmiş)
   *     stop:        dayjs    - Bitiş zamanı (UTC'ye çevrilmiş)
   *   }
   *
   * Ayrıştırma Mantığı:
   *   - HTML'deki her program satırı bir <li> elemanıdır.
   *   - Saat bilgisi <li> içindeki ilk metin düğümünden alınır (örn: "18:00").
   *   - Başlık <h3> etiketinden okunur.
   *   - Açıklama varsa <p> etiketinden alınır.
   *   - Bitiş saati; bir sonraki programın başlangıç saatidir.
   *     Son program için varsayılan bitiş = başlangıç + 1 saat olarak atanır.
   */
  parser: function ({ content, date }) {
    const programs = []
    const items = parseItems(content, date)

    if (!items || items.length === 0) return programs

    items.forEach((item, index) => {
      // Başlangıç saatini Türkiye saatine göre oluştur, ardından UTC'ye çevir
      const start = dayjs.tz(
        `${item.date} ${item.time}`,
        'YYYY-MM-DD HH:mm',
        TIMEZONE
      ).utc()

      // Bitiş saati: bir sonraki programın başlangıcı;
      // son program için başlangıçtan 1 saat sonrası kullanılır.
      let stop
      if (index < items.length - 1) {
        const nextItem = items[index + 1]
        stop = dayjs.tz(
          `${nextItem.date} ${nextItem.time}`,
          'YYYY-MM-DD HH:mm',
          TIMEZONE
        ).utc()
      } else {
        stop = start.add(1, 'hour')
      }

      programs.push({
        title: item.title,
        description: item.description || '',
        start,
        stop
      })
    })

    return programs
  },

  /**
   * channels: 24 TV'nin yayın yaptığı kanalları döndürür.
   *
   * @param {object} params
   * @param {string} params.lang   - Dil kodu (örn: 'tr')
   * @param {string} params.region - Bölge kodu (örn: 'TR')
   * @returns {Promise<Array<{lang, site_id, name}>>}
   *
   * NOT: yirmidort.tv yalnızca tek bir kanal (24 TV) yayın akışı
   *      sunduğundan bu liste statik olarak tanımlanmıştır.
   *      Gelecekte çok kanallı bir yapıya geçilirse bu metot
   *      dinamik bir API isteğiyle güncellenebilir.
   */
  async channels({ lang = 'tr', region = 'TR' } = {}) {
    return [
      {
        lang,
        site_id: '24tv', // Sitedeki kanal tanımlayıcısı
        name: '24 TV'    // Kanalın görünen adı
      }
    ]
  }
}

/**
 * parseItems: HTML içeriğini cheerio ile ayrıştırarak program nesnelerini döndürür.
 *
 * @param {string|Buffer} content - Sayfadan gelen ham HTML
 * @param {dayjs.Dayjs}   date    - İstenen tarih (UTC)
 * @returns {Array<{date, time, title, description}>}
 *
 * HTML Yapısı (yirmidort.tv yayin-akisi sayfası):
 *   <ul>
 *     <li>
 *       07:00
 *       <h3>MODERATÖR SABAH</h3>
 *       <p>Açıklama metni...</p>
 *       <a href="...">Detay</a>
 *       <img .../>
 *     </li>
 *     ...
 *   </ul>
 *
 * Gece yarısını geçen programlar (örn: 01:00, 02:00) için
 * tarih otomatik olarak bir gün ileri alınır; çünkü bu programlar
 * teknik olarak ertesi günün yayın akışına aittir.
 */
function parseItems(content, date) {
  let $
  try {
    $ = cheerio.load(content)
  } catch {
    // HTML yüklenemezse boş dizi döndür
    return []
  }

  const items = []

  // Yayın akışı listesindeki her <li> öğesini işle
  $('ul li').each((_, el) => {
    const $el = $(el)

    // Saat bilgisini al: <li> elemanının doğrudan metin çocuklarından ilki
    // Örnek: "07:00", "20:45"
    const timeText = $el
      .contents()
      .filter((_, node) => node.type === 'text')
      .first()
      .text()
      .trim()

    // Geçerli saat formatı değilse (HH:mm) bu satırı atla
    if (!/^\d{2}:\d{2}$/.test(timeText)) return

    // Program başlığını <h3> etiketinden al
    const title = $el.find('h3').text().trim()
    if (!title) return // Başlık yoksa bu satırı atla

    // Program açıklamasını <p> etiketinden al (opsiyonel)
    const description = $el.find('p').text().trim() || ''

    // Tarihi belirle:
    // Gece yarısından sonraki saatler (00:00 - 05:59) ertesi güne aittir.
    const [hour] = timeText.split(':').map(Number)
    const programDate =
      hour < 6
        ? date.tz(TIMEZONE).add(1, 'day').format('YYYY-MM-DD')
        : date.tz(TIMEZONE).format('YYYY-MM-DD')

    items.push({
      date: programDate,
      time: timeText,
      title,
      description
    })
  })

  return items
}
