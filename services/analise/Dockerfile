# Estágio 1: instala as dependências num virtualenv isolado. pip, setuptools e
# o cache de download ficam aqui e não vão para a imagem final.
FROM python:3.13-slim AS build
RUN python -m venv /opt/venv
ENV PATH=/opt/venv/bin:$PATH
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Estágio 2: só o virtualenv pronto e o código, rodando sem root.
FROM python:3.13-slim AS final
ENV PATH=/opt/venv/bin:$PATH \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1
RUN useradd --system --uid 10001 --no-create-home analise
WORKDIR /app
COPY --from=build /opt/venv /opt/venv
COPY app ./app
USER analise
EXPOSE 8000
CMD ["python", "-m", "app"]
