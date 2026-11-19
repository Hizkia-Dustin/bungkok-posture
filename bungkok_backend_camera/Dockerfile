# Gunakan Python 3.11 slim sebagai base image
FROM python:3.11-slim

# Install system dependencies yang dibutuhkan oleh OpenCV & MediaPipe
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy requirements dan install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy seluruh kode aplikasi dan model
COPY . .

# Expose port (default 8000)
EXPOSE 8000

# Jalankan server FastAPI dengan Uvicorn
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
