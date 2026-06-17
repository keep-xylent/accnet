<h1 align="center">accnet. | Account Value Checker</h1>

<div align="center">

![Repo Size](https://img.shields.io/github/repo-size/keep-xylent/accnet?style=for-the-badge&color=ff007f)
[![Live Preview](https://img.shields.io/badge/Live_Preview-007bff?style=for-the-badge&logo=chainlink&logoColor=white)](https://xylent-accnet.hf.space/)

*Platform analitik networth akun Roblox yang akurat, cepat, dan aman.*

</div>

---

## <img src="https://api.iconify.design/lucide:info.svg?color=%2300d8ff" width="24" height="24" align="absmiddle"> Deskripsi

**accnet.** adalah alat pemeriksa nilai akun Roblox yang didesain secara khusus untuk menghitung aset *Limited* dengan tingkat presisi tinggi. Melalui integrasi data pasar secara *real-time*, platform ini menyajikan wawasan lengkap mulai dari estimasi konversi nilai aset hingga grafik analisis riwayat akun.

---

## <img src="https://api.iconify.design/lucide:layout-list.svg?color=%23ff007f" width="24" height="24" align="absmiddle"> Fitur Utama

- **<img src="https://api.iconify.design/lucide:target.svg?color=%23ff3366" width="20" height="20" align="absmiddle"> Limited-Only Audit**
  Fokus sepenuhnya pada perhitungan item *Limited* untuk menghasilkan estimasi *Networth* yang terjamin akurasinya.

- **<img src="https://api.iconify.design/lucide:trending-up.svg?color=%2300ffcc" width="20" height="20" align="absmiddle"> Market Intelligence**
  Menarik data *real-time* langsung dari Rolimons untuk menampilkan indikasi *Demand* (seperti *Amazing*, *High*, dll) pada setiap item.

- **<img src="https://api.iconify.design/lucide:coins.svg?color=%23ffcc00" width="20" height="20" align="absmiddle"> Multi-Currency Node**
  Sistem konversi nilai aset yang dinamis dan instan ke dalam berbagai mata uang utama: `Robux (R$)`, `USD ($)`, dan `IDR (Rp)`.

- **<img src="https://api.iconify.design/lucide:line-chart.svg?color=%239933ff" width="20" height="20" align="absmiddle"> RAP Analysis History**
  Menyediakan grafik tren historis *Networth* selama 7 hari terakhir yang konsisten dan deterministik untuk setiap profil pengguna.

- **<img src="https://api.iconify.design/lucide:monitor-smartphone.svg?color=%230099ff" width="20" height="20" align="absmiddle"> Fully Responsive**
  Antarmuka premium yang dirancang secara optimal agar tetap nyaman digunakan dan terlihat rapi, baik saat diakses melalui Desktop maupun perangkat *Mobile*.

- **<img src="https://api.iconify.design/lucide:zap.svg?color=%23ffea00" width="20" height="20" align="absmiddle"> High Performance**
  Memanfaatkan sistem *batch API* untuk memastikan sinkronisasi data yang cepat, memuat keseluruhan inventaris dalam waktu kurang dari 2 detik.

## 🛠️ Teknologi

- **Backend**: Python, Flask
- **Frontend**: Vanilla JS, CSS3 (Glassmorphism), HTML5
- **Charts**: ApexCharts
- **APIs**: Roblox Web APIs, Rolimons Item API

## 📦 Instalasi Lokal

Jika Anda ingin menjalankan project ini di komputer Anda sendiri:

1. **Clone Repository**

   ```bash
   git clone https://github.com/keep-xylent/accnet..git
   cd accnet.
   ```

2. **Instal Dependensi**

   ```bash
   pip install -r requirements.txt
   ```

3. **Jalankan Aplikasi**

   ```bash
   python app.py
   ```

   Aplikasi akan berjalan di `http://localhost:5000`.

## 🛡️ Keamanan & Privasi

- Aplikasi ini **tidak** memerlukan cookie atau password akun Roblox Anda.
- Hanya menggunakan API publik untuk mengambil data inventory publik.

---
