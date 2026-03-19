/**
 * ============================================================
 * TEST DOSYASI - yirmidort.tv (24 TV) Yayın Akışı Kazıyıcı
 * ============================================================
 *
 * Bu dosya, yirmidort.tv.config.js içindeki fonksiyonların
 * doğru çalışıp çalışmadığını doğrulamak için Jest test süitini içerir.
 *
 * Çalıştırmak için:
 *   npx jest yirmidort.tv.test.js
 *
 * Test Kapsamı:
 *   1. url()    - Doğru URL üretimi
 *   2. parser() - Gerçekçi HTML içeriğinden program ayrıştırma
 *   3. parser() - Boş içerik işleme (hata toleransı)
 *   4. parser() - Bozuk/geçersiz HTML işleme
 * ============================================================
 */

const { parser, url } = require('./yirmidort.tv.config.js')
const dayjs = require('dayjs')
const utc = require('dayjs/plugin/utc')
const timezone = require('dayjs/plugin/timezone')
const customParseFormat = require('dayjs/plugin/customParseFormat')

dayjs.extend(customParseFormat)
dayjs.extend(utc)
dayjs.extend(timezone)

/**
 * Test için kullanılan örnek tarih: 22 Ekim 2023, günün başı (UTC)
 * Bu tarih beinsports.com referans dosyasındaki tarihle uyumludur.
 */
const date = dayjs.utc('2023-10-22T00:00:00.000').startOf('d')

/**
 * Test için kullanılan örnek kanal.
 * site_id: 24 TV'nin bu sitedeki tanımlayıcısı
 * xmltv_id: XMLTV formatındaki evrensel kanal kimliği
 */
const channel = { site_id: '24tv', xmltv_id: '24TV.tr' }

// ============================================================
// TEST 1: URL Üretimi
// ============================================================
/**
 * url() fonksiyonunun verilen tarih ve kanal için
 * beklenen URL'yi doğru oluşturup oluşturmadığını test eder.
 *
 * Beklenen: Türkiye tarihi YYYY-MM-DD formatında URL'ye eklenir.
 */
it('geçerli bir URL üretebilmeli', () => {
  const result = url({ date, channel })
  expect(result).toBe(
    'https://www.yirmidort.tv/televizyon/yayin-akisi/?date=2023-10-22'
  )
})

// ============================================================
// TEST 2: Gerçekçi HTML Ayrıştırma
// ============================================================
/**
 * parser() fonksiyonunun yirmidort.tv yayın akışı sayfasına
 * benzer bir HTML içeriğinden program bilgilerini doğru
 * ayrıştırıp ayrıştırmadığını test eder.
 *
 * Örnek HTML yapısı:
 *   <ul>
 *     <li>07:00 <h3>MODERATÖR SABAH</h3> <p>Açıklama</p></li>
 *     <li>09:00 <h3>ANALİZ SENTEZ</h3> <p>Açıklama</p></li>
 *   </ul>
 *
 * Türkiye saati 07:00 = UTC 04:00 olduğundan
 * start beklenen değer: '2023-10-22T04:00:00.000Z'
 * stop  beklenen değer: '2023-10-22T06:00:00.000Z' (09:00 TRT → 06:00 UTC)
 */
it('HTML yanıtını ayrıştırabilmeli', () => {
  // Gerçek sayfaya benzer örnek HTML içeriği
  const content = `
    <html>
      <body>
        <ul>
          <li>
            07:00
            <h3>MODERATÖR SABAH</h3>
            <p>Sabah haberlerinin sunucusu Büşra Mutlu ile güne başlayın.</p>
            <a href="/gundem-programlari/moderator-sabah-busra-mutlu/">Detay</a>
          </li>
          <li>
            09:00
            <h3>ANALİZ SENTEZ</h3>
            <p>Finansal piyasalardaki beklentiler ve ekonomik gelişmeler.</p>
            <a href="/gundem-programlari/analiz-sentez/">Detay</a>
          </li>
          <li>
            18:00
            <h3>AKŞAM HABERLERİ</h3>
            <p>Günün ve gündemin yoğun başlıklarını en sıcak haberlerle Kaan Yakuphan sunuyor.</p>
            <a href="/haber-programlari/aksam-haberleri-kaan-yakuphan/">Detay</a>
          </li>
        </ul>
      </body>
    </html>
  `

  const result = parser({ content, channel, date }).map(p => ({
    ...p,
    start: p.start.toJSON(), // dayjs nesnesini ISO string'e çevir
    stop: p.stop.toJSON()
  }))

  // İlk program: MODERATÖR SABAH (07:00 TRT = 04:00 UTC)
  expect(result[0]).toMatchObject({
    start: '2023-10-22T04:00:00.000Z', // 07:00 TRT → UTC-3 = 04:00 UTC
    stop: '2023-10-22T06:00:00.000Z',  // 09:00 TRT → 06:00 UTC
    title: 'MODERATÖR SABAH',
    description: 'Sabah haberlerinin sunucusu Büşra Mutlu ile güne başlayın.'
  })

  // İkinci program: ANALİZ SENTEZ (09:00 TRT = 06:00 UTC)
  expect(result[1]).toMatchObject({
    start: '2023-10-22T06:00:00.000Z', // 09:00 TRT → 06:00 UTC
    stop: '2023-10-22T15:00:00.000Z',  // 18:00 TRT → 15:00 UTC
    title: 'ANALİZ SENTEZ'
  })
})

// ============================================================
// TEST 3: Gece Yarısını Geçen Programlar
// ============================================================
/**
 * Gece 01:00 gibi gece yarısını geçen programların
 * tarihinin otomatik olarak ertesi güne alındığını doğrular.
 *
 * Örnek: 22 Ekim isteniyor → 01:00'deki program 23 Ekim olarak kaydedilir.
 * 01:00 TRT = 22:00 UTC (22 Ekim → ertesi gün 23 Ekim 01:00 TRT = 22 Ekim 22:00 UTC)
 */
it('gece yarısını geçen programların tarihini doğru işleyebilmeli', () => {
  const content = `
    <html>
      <body>
        <ul>
          <li>
            23:00
            <h3>MODERATÖR GECE</h3>
            <p>Günün gece özeti.</p>
          </li>
          <li>
            01:00
            <h3>GÜNÜN MANŞETİ</h3>
            <p>Sabaha karşı manşet haberleri.</p>
          </li>
        </ul>
      </body>
    </html>
  `

  const result = parser({ content, channel, date }).map(p => ({
    ...p,
    start: p.start.toJSON(),
    stop: p.stop.toJSON()
  }))

  // 23:00 TRT = 20:00 UTC (22 Ekim)
  expect(result[0].start).toBe('2023-10-22T20:00:00.000Z')

  // 01:00 TRT ertesi gün = 22:00 UTC (22 Ekim; çünkü 23 Ekim 01:00 TRT = 22 Ekim 22:00 UTC)
  expect(result[1].start).toBe('2023-10-22T22:00:00.000Z')
  expect(result[1].title).toBe('GÜNÜN MANŞETİ')
})

// ============================================================
// TEST 4: Boş Yayın Akışı
// ============================================================
/**
 * Sayfada hiç program olmadığında (boş liste veya geçersiz HTML)
 * parser() fonksiyonunun boş dizi döndürdüğünü doğrular.
 * Bu test hata toleransını (error handling) kontrol eder.
 */
it('boş yayın akışını işleyebilmeli', () => {
  // Boş liste
  const result1 = parser({ content: '<html><body><ul></ul></body></html>', channel, date })
  expect(result1).toMatchObject([])

  // Boş string
  const result2 = parser({ content: '', channel, date })
  expect(result2).toMatchObject([])
})

// ============================================================
// TEST 5: Bozuk HTML İşleme
// ============================================================
/**
 * Tamamen geçersiz içerik girildiğinde bile parser() fonksiyonunun
 * hata fırlatmadan boş dizi döndürdüğünü doğrular.
 */
it('bozuk içeriği hata fırlatmadan işleyebilmeli', () => {
  const result = parser({ content: null, channel, date })
  expect(result).toMatchObject([])
})
