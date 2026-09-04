FROM alpine:3.22 AS harmony-source

RUN apk add --no-cache \
    git \
    patch

WORKDIR /src

ARG HARMONY_COMMIT=094d904c3cbc15392d8042d8e6924e2478e8669d

RUN git clone https://github.com/kellnerd/harmony.git . \
    && git checkout "${HARMONY_COMMIT}"

COPY automation.patch /tmp/automation.patch

RUN git apply --check /tmp/automation.patch \
    && git apply /tmp/automation.patch


FROM denoland/deno:latest

WORKDIR /app

COPY --from=harmony-source /src/ .

RUN deno cache server/main.ts

ENV PORT=8000
ENV HARMONY_DATA_DIR=/data

EXPOSE 8000

CMD ["deno", "task", "server"]
