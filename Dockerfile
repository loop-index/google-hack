# Instantiate Ubuntu 20.04
FROM ubuntu:22.04

# Update Ubuntu Software repository
RUN apt update
RUN apt-get update -qq

# Add the Flask application and install requirements
RUN apt -y install python3-pip
RUN apt -y install ffmpeg
RUN mkdir /app
COPY . /app
WORKDIR /app
RUN pip install --upgrade pip
RUN pip install --no-cache-dir -r requirements.txt

# Open ports, set environment variables, start gunicorn.
EXPOSE 8080 
ENV PORT 8080
ENV FLASK_ENV=production
CMD gunicorn --bind :$PORT -k gevent -w 1 app:app\
# ----------------------------------------------------- 