FROM python:3.13-slim

WORKDIR /opt/mb-automation

RUN pip install --no-cache-dir \
    Flask \
    requests

COPY auto_stage_dashboard.py .

ENV PYTHONUNBUFFERED=1

EXPOSE 8080

CMD ["python3", "auto_stage_dashboard.py"]
