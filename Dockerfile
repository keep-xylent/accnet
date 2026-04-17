# Gunakan image Python resmi
FROM python:3.10-slim

# Set working directory di dalam container
WORKDIR /app

# Copy requirements dan install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy semua file proyek ke dalam container
COPY . .

# Hugging Face menggunakan port 7860 secara default
ENV PORT=7860
EXPOSE 7860

# Jalankan aplikasi menggunakan gunicorn
CMD ["gunicorn", "--bind", "0.0.0.0:7860", "app:app"]
