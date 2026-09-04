#!/bin/sh
set -eu

echo "Starting VNC supervisor..."

start_x11vnc() {
    echo "Starting x11vnc..."
    x11vnc \
        -display :99 \
        -forever \
        -shared \
        -noshm \
        -rfbport 5900 \
        -nopw \
        -listen 0.0.0.0
}

supervise_vnc() {
    while true; do
        echo "Waiting for X11 display :99..."

        while [ ! -S /tmp/.X11-unix/X99 ]; do
            sleep 1
        done

        echo "X11 display found."

        start_x11vnc || true

        echo "x11vnc stopped. Waiting for X11 display to return..."
        sleep 1
    done
}

supervise_vnc &
VNC_SUPERVISOR_PID=$!

trap 'kill "$VNC_SUPERVISOR_PID" 2>/dev/null || true' TERM INT EXIT

echo "Starting noVNC..."
exec websockify \
    --web=/usr/share/novnc \
    6080 \
    localhost:5900
