import json
import re
import sys
from urllib.parse import urlparse, parse_qs

def extract_m3u8_urls(har_path, output_path):
    try:
        with open(har_path, 'r', encoding='utf-8') as f:
            har = json.load(f)
    except FileNotFoundError:
        print(f"❌ HAR dosyası bulunamadı: {har_path}")
        sys.exit(1)
    except json.JSONDecodeError as e:
        print(f"❌ HAR dosyası geçerli JSON değil: {e}")
        sys.exit(1)

    m3u8_urls = []
    entries = har.get('log', {}).get('entries', [])
    
    if not entries:
        print("⚠️ HAR içinde 'entries' bulunamadı.")
        sys.exit(1)

    print(f"📊 Toplam {len(entries)} ağ isteği bulundu.")

    for entry in entries:
        url = entry.get('request', {}).get('url', '')
        if url and re.search(r'\.m3u8', url, re.IGNORECASE):
            m3u8_urls.append(url)

    # Benzersiz yap
    unique_urls = list(dict.fromkeys(m3u8_urls))

    # URL'leri analiz et ve kategorilere ayır
    categorized = {
        'all': unique_urls,
        '1080p': [],
        '720p': [],
        '480p': [],
        '360p': [],
        'standard': []  # atv.m3u8 gibi kalite belirtmeyenler
    }

    for url in unique_urls:
        url_lower = url.lower()
        if '_1080p.m3u8' in url_lower or '1080p' in url_lower:
            categorized['1080p'].append(url)
        elif '_720p.m3u8' in url_lower or '720p' in url_lower:
            categorized['720p'].append(url)
        elif '_480p.m3u8' in url_lower or '480p' in url_lower:
            categorized['480p'].append(url)
        elif '_360p.m3u8' in url_lower or '360p' in url_lower:
            categorized['360p'].append(url)
        else:
            categorized['standard'].append(url)

    # Ana dosyaya yaz (tüm URL'ler)
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(f"# Toplam {len(unique_urls)} adet .m3u8 URL bulundu\n")
        f.write("# Tüm URL'ler:\n")
        for url in unique_urls:
            f.write(url + '\n')
        
        # Kategorilere göre de yaz
        f.write("\n\n# === KATEGORİLERE GÖRE ===\n")
        
        for category, urls in categorized.items():
            if category == 'all':
                continue
            if urls:
                f.write(f"\n# {category.upper()} kalite ({len(urls)} adet):\n")
                for url in urls:
                    f.write(url + '\n')

    print(f"✅ {len(unique_urls)} adet .m3u8 URL bulundu.")
    print(f"   📊 1080p: {len(categorized['1080p'])}")
    print(f"   📊 720p:  {len(categorized['720p'])}")
    print(f"   📊 480p:  {len(categorized['480p'])}")
    print(f"   📊 360p:  {len(categorized['360p'])}")
    print(f"   📊 Standart: {len(categorized['standard'])}")
    print(f"✅ Sonuçlar '{output_path}' dosyasına yazıldı.")

if __name__ == "__main__":
    extract_m3u8_urls('stream/output.har', 'stream/m3u8_urls.txt')
