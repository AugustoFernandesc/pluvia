# Vídeo da Parte 3

🎬 **Assista no YouTube:** https://youtu.be/OzFVxttzx_M (9min38s)

O vídeo mostra o Pluvia sendo levantado com Docker Compose e com Kubernetes. Cada integrante apresenta uma parte:

| Integrante | Parte | Início |
|---|---|---|
| Alexandre Bortone | Dockerfile multi-stage, Docker Compose, redes e volumes | 0:00 |
| Augusto Fernandes Carvalho | Kubernetes: Deployments, StatefulSets, Services, ConfigMaps e Secrets | 2:44 |
| Lucas Marcelino Neves | Ingress com Traefik, gateway Kong e autenticação pelo Keycloak | 5:32 |
| Mark Leite Sá | Risco com dois bancos, Análise e escalonamento horizontal | 7:39 |

## O que é demonstrado

| Critério da Parte 3 | No vídeo |
|---|---|
| Dockerfiles e qualidade das imagens | Modelo NestJS em três estágios (667 MB → 339 MB) e Dockerfile da Análise em dois estágios, sem root |
| Compose com volumes e redes | 23 containers `healthy` com um comando; dado que sobrevive à recriação do banco; serviço que não alcança o banco de outro |
| Deployments e Services | 12 Deployments e 11 StatefulSets, probes de readiness e liveness, `requests`/`limits` |
| ConfigMaps e Secrets | Configuração no ConfigMap, senha no Secret gerado pelo Kustomize e `secret.env` fora do Git |
| Ingress e roteamento | Traefik → Kong → BFF, com respostas 200, 401 e 404 e teste com tokens reais do Keycloak (200 e 403) |
| Demonstração de escalabilidade | Análise de 1 para 3 réplicas, carga dividida entre os pods e readiness tirando os pods do Service quando o banco cai |

Para reproduzir o que aparece no vídeo, veja a seção **Parte 3: subir o sistema** no [README](../../README.md).
