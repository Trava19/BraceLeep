FROM python:3.11-slim

WORKDIR /app

COPY . .

RUN pip install --no-cache-dir \
    flask \
    mysql-connector-python \
    bcrypt \
    flask-cors

CMD ["python", "main.py"]