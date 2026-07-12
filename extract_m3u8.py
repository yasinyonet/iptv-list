import json
import re
import sys
from urllib.parse import urlparse
from collections import defaultdict

def analyze_har(har_path, output_path):
    try:
        with open(har_path, 'r', encoding='utf-8') as f:
            har = json.load(f)
    except FileNotFoundError:
        print(f"❌ HAR dosyası bulunamadı: {har_path}")
        sys.exit(1)
    except json.JSONDecodeError as e:
        print(f"❌ HAR dosyası geçerli JSON değil: {e}")
        sys.exit(1)

    entries = har.get('log', {}).get('entries', [])
    if not entries:
        print("⚠️ HAR içinde 'entries' bulunamadı.")
        sys.exit(1)

    print(f"📊 Toplam {len(entries)} ağ isteği bulundu.")

    # Tüm .m3u8 URL'lerini topla ve domain'lerine göre grupla
    m3u8_by_domain = defaultdict(list)
    all_m3u8_urls = []

    for entry in entries:
        url = entry.get('request', {}).get('url', '')
        if url and re.search(r'\.m3u8', url, re.IGNORECASE):
            all_m3u8_urls.append(url)
            parsed = urlparse(url)
            domain = parsed.netloc
            # Domain'i daha okunabilir hale getir (www'siz)
            domain_clean = domain.replace('www.', '')
            m3u8_by_domain[domain_clean].append(url)

    # Benzersiz URL'leri koru (her domain için)
    unique_by_domain = {}
    for domain, urls in m3u8_by_domain.items():
        unique_by_domain[domain] = list(dict.fromkeys(urls))

    # Tüm benzersiz URL'ler
    unique_all = list(dict.fromkeys(all_m3u8_urls))

    # Sonuçları dosyaya yaz
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write("# ===== HAR DOSYASINDAKİ TÜM .m3u8 URL'LERİ =====\n\n")
        
        if not unique_all:
            f.write("⚠️ Hiç .m3u8 URL bulunamadı.\n")
            print("⚠️ HAR dosyasında hiç .m3u8 URL bulunamadı.")
            return

        # Tüm URL'leri listele
        f.write(f"## TOPLAM {len(unique_all)} ADET .m3u8 URL BULUNDU\n\n")
        for url in unique_all:
            f.write(url + '\n')

        # Domain'lere göre gruplandır
        f.write("\n\n# ===== DOMAIN'LERE GÖRE GRUPLANDIRMA =====\n\n")
        for domain, urls in sorted(unique_by_domain.items()):
            f.write(f"## {domain} ({len(urls)} adet):\n")
            for url in urls:
                f.write(f"  {url}\n")
            f.write("\n")

    # Konsola özet yaz
    print(f"\n✅ Toplam {len(unique_all)} adet .m3u8 URL bulundu.")
    print("📊 Domain'lere göre dağılım:")
    for domain, urls in sorted(unique_by_domain.items()):
        print(f"   - {domain}: {len(urls)} adet")
    print(f"\n📄 Detaylı sonuçlar '{output_path}' dosyasına yazıldı.")

if __name__ == "__main__":
    analyze_har('stream/output.har', 'stream/m3u8_urls.txt')
