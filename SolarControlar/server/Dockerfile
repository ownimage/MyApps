FROM docker.io/python:3.11-bookworm

ENV TZ=Europe/London

SHELL ["/bin/bash", "-c"]

COPY SolarControlar/server /app
COPY SolarControlar/index.html SolarControlar/manifest.json SolarControlar/icon.svg SolarControlar/icon-192.png SolarControlar/icon-512.png /web/SolarControlar/
COPY SolarControlar/js /web/SolarControlar/js
COPY shared /web/shared
ENV SOLARCONTROLAR_WEB_ROOT=/web
WORKDIR /app

RUN apt update \
    && apt --no-install-recommends install -y cron sudo \
    && apt clean \
    && python -m venv venv \
    && ./venv/bin/pip install --upgrade pip \
    && ./venv/bin/pip install -r requirements.txt \
    && crontab crontab_file




