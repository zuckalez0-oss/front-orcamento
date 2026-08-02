FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

# --reload fica só pro dev local (main.py / uvicorn.run). Em produção rodamos
# uvicorn direto, sem reload nem file-watcher — ver docs/capacidade/RELATORIO_CAPACIDADE_INFRAESTRUTURA.md
# (1 worker é suficiente até ~100 usuários simultâneos; acima disso, trocar
# CMD para gunicorn -k uvicorn.workers.UvicornWorker -w <N_vCPU> main:app).
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
