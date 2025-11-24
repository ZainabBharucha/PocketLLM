# Use a slim Python image to keep size down (Constraint: Limited RAM/CPU)
FROM python:3.10-slim

WORKDIR /app

# Install system dependencies for MySQL client
RUN apt-get update && apt-get install -y \
    pkg-config \
    default-libmysqlclient-dev \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first to leverage Docker cache
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the application code
COPY . .

# Expose the port
EXPOSE 8000

# Command is handled by docker-compose, but this is a good default
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]