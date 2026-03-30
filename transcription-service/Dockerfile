FROM node:20-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

ENV NODE_ENV=production
ENV WHISPER_PORT=3001
ENV WHISPER_MODEL=Xenova/whisper-tiny.en
ENV WHISPER_FALLBACK_MODELS=Xenova/whisper-tiny.en
ENV WHISPER_NUM_BEAMS=1
ENV WHISPER_QUANTIZED=true

EXPOSE 3001

CMD ["npm", "start"]
