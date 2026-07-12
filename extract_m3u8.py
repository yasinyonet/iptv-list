import json
import re
import sys

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
        # Hedef: daioncdn.net/atv/ path'inde .m3u8 uzantılı URL'ler
        if url and re.search(r'daioncdn\.net/atv/.*\.m3u8', url, re.IGNORECASE):
            m3u8_urls.append(url)

    # Benzersiz URL'leri koru (aynı URL'den birden fazla varsa)
    unique_urls = list(dict.fromkeys(m3u8_urls))

    # Sonuçları dosyaya yaz
    with open(output_path, 'w', encoding='utf-8') as f:
        if unique_urls:
            f.write(f"# Toplam {len(unique_urls)} adet daioncdn.net/atv/ .m3u8 URL bulundu:\n")
            f.write("# Bu linkler, HAR dosyasından alınan güncel token'ları içerir.\n\n")
            for url in unique_urls:
                f.write(url + '\n')
            print(f"✅ {len(unique_urls)} adet .m3u8 URL bulundu.")
        else:
            f.write("# Hedef kriterlere uygun .m3u8 URL bulunamadı.\n")
            print("⚠️ Hedef kriterlere uygun .m3u8 URL bulunamadı.")

    print(f"✅ Sonuçlar '{output_path}' dosyasına yazıldı.")

if __name__ == "__main__":
    extract_m3u8_urls('stream/output.har', 'stream/m3u8_urls.txt')
