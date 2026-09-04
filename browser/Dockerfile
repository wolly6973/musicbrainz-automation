FROM mcr.microsoft.com/playwright:v1.55.0-noble

WORKDIR /app

COPY package.json package-lock.json ./

RUN npm ci

COPY browser-controller.js upload-cover-art.js start-browser.sh ./

RUN chmod +x /app/start-browser.sh

CMD ["/app/start-browser.sh"]
