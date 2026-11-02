-- Roda uma única vez, quando o volume do banco está vazio
-- (/docker-entrypoint-initdb.d da imagem do PostgreSQL).
-- Habilita o pgvector, usado para guardar os embeddings da base de conhecimento.
CREATE EXTENSION IF NOT EXISTS vector;
