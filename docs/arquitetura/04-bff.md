# 4.4 Backend for Frontend

A Pluvia tem dois clientes com usuários, contextos e restrições muito diferentes. Um único backend genérico obrigaria um dos dois a receber dados que não usa, ou a fazer várias chamadas para montar uma tela. Por isso, cada cliente tem o seu BFF.

---

## Por que as necessidades diferem

| | Painel web | App mobile |
|---|---|---|
| **Quem usa** | Equipe técnica e gestão pública, no escritório | Agentes em campo e comunidade, na rua |
| **Pergunta principal** | "Quais regiões merecem atenção, e onde aloco minha equipe?" | "Como está a minha região?" e "O que eu tenho que fazer hoje?" |
| **Escopo** | Todas as regiões, comparadas entre si | Uma região, ou as ações de uma equipe |
| **Rede** | Estável | Instável, às vezes móvel e lenta |
| **Tela** | Grande, com tabelas, gráficos e mapa | Pequena, com cartões e texto curto |
| **Nível técnico** | Lê percentis, acumulados e fontes | Precisa de frase clara, sem jargão |
| **Autenticação** | Sempre autenticado | Autenticado (agente) ou anônimo (comunidade) |

Essas diferenças não são cosméticas. Elas mudam **quais dados** vão na resposta, **quantas chamadas** o cliente faz, e **em que formato** a informação chega.

---

## BFF Web

**Prefixo:** `/web/v1` · **Contrato:** [bff-web.yaml](../api/bff-web.yaml)

| Endpoint | Compõe dados de |
|---|---|
| `GET /painel` | Risco (panoramas), Operações (ações abertas por região) |
| `GET /regioes/{id}` | Risco (panorama e cenário previsto), Território (região, vulnerabilidade, ocorrências), Operações (ações), Análise (síntese) |
| `GET /sinalizacoes` e `POST /sinalizacoes/{id}/reconhecimento` | Risco |
| `GET /ocorrencias` e `POST /ocorrencias/{id}/validacao` | Território |
| `GET /planejamento/disponibilidade` | Equipes e Frota, em paralelo |
| `GET, POST /acoes`, `GET /acoes/{id}`, transições | Operações |

**Perfis aceitos:** `GESTOR`, `TECNICO`.

## BFF Mobile

**Prefixo:** `/mobile/v1` · **Contrato:** [bff-mobile.yaml](../api/bff-mobile.yaml)

| Endpoint | Compõe dados de | Autenticação |
|---|---|---|
| `GET /publico/regioes/localizar?lat=&lng=` | Território | Não |
| `GET /publico/regioes/{id}/resumo` | Risco | Não |
| `GET /minhas-acoes` | Operações, Território (nome da região) | Agente |
| `GET /acoes/{id}`, `POST /acoes/{id}/inicio`, `POST /acoes/{id}/conclusao` | Operações | Agente |
| `POST /ocorrencias` | Território | Agente |
| `GET /notificacoes`, `POST /notificacoes/{id}/leitura` | Notificações | Agente |

**Perfis aceitos:** `AGENTE` nas rotas autenticadas; anônimo nas rotas `/publico`.

## Respostas de autenticação

Todas as operações do BFF Web e as sete operações autenticadas do BFF Mobile documentam `401`, usando o componente reutilizável `NaoAutenticado` de cada contrato. Essa resposta é emitida pelo gateway quando o JWT está ausente, inválido ou expirado, antes de a requisição chegar ao BFF. O corpo usa o JSON nativo do plugin `jwt` do Kong, com mensagem ou detalhes do claim inválido. As duas operações `/publico` do Mobile mantêm `security: []` e dispensam JWT.

Quando o token é válido, mas o perfil ou o vínculo com a equipe não permite a operação, a resposta de autorização é `403`.

---

## Demonstração: a mesma região nos dois clientes

Região Centro, no mesmo instante. Os dados de origem são os mesmos; a resposta muda conforme quem pergunta.

### Painel web: `GET /web/v1/regioes/{id}`

```json
{
  "regiao": {
    "id": "2b9d8f40-51c3-4e0a-8a7b-9c0d1e2f3a45",
    "nome": "Centro",
    "municipio": "Lavras",
    "uf": "MG",
    "geometria": { "type": "Polygon", "coordinates": [[[-45.0, -21.24], [-44.99, -21.24], [-44.99, -21.25], [-45.0, -21.25], [-45.0, -21.24]]] }
  },
  "panorama": {
    "nivelAtencao": "ATENCAO",
    "chuva": { "acumulado24hMm": 38.2, "acumulado72hMm": 71.5, "percentilLocal72h": 92 },
    "fatores": [
      { "tipo": "CHUVA_ACIMA_PADRAO", "descricao": "Acumulado de 72 h no percentil 92 da série local", "fonte": "CEMADEN", "referencia": "2026-10-19T14:00:00Z" },
      { "tipo": "HISTORICO_RECORRENTE", "descricao": "4 ocorrências validadas no período chuvoso", "fonte": "S2ID", "referencia": "1991 a 2025" },
      { "tipo": "VULNERABILIDADE", "descricao": "Ocupação vulnerável próxima a curso d'água", "fonte": "IBGE Censo 2022", "referencia": "2022" }
    ],
    "atualizadoEm": "2026-10-19T14:02:11Z"
  },
  "cenarioPrevisto": {
    "acumuladoPrevistoMm": 80,
    "periodoInicio": "2026-10-20T00:00:00Z",
    "periodoFim": "2026-10-21T00:00:00Z",
    "comparacaoLocal": "Acima do padrão diário do período chuvoso",
    "boletimEmitidoEm": "2026-10-19T12:00:00Z",
    "fonte": "INMET"
  },
  "vulnerabilidade": { "populacao": 18430, "indice": 0.64, "possuiAglomeradoSubnormal": true },
  "ocorrenciasRecentes": [
    { "id": "e1a2...", "tipo": "ALAGAMENTO", "ocorridaEm": "2025-01-14", "origem": "S2ID", "situacao": "VALIDADA" }
  ],
  "acoes": {
    "abertas": 1,
    "itens": [ { "id": "7c1e...", "tipo": "LIMPEZA_DRENAGEM", "estado": "CONFIRMADA", "data": "2026-10-20", "turno": "MANHA" } ]
  },
  "analise": {
    "sintese": "O volume previsto é superior ao padrão local e ocorre sobre solo já saturado, em região com histórico de ocorrências. Recomenda-se verificar pontos críticos e estruturas de drenagem antes do período previsto.",
    "origem": "LLM",
    "geradaEm": "2026-10-19T14:03:40Z"
  }
}
```

### App mobile, comunidade: `GET /mobile/v1/publico/regioes/{id}/resumo`

```json
{
  "regiao": "Centro",
  "nivel": "ATENCAO",
  "rotulo": "Atenção",
  "cor": "#F59E0B",
  "mensagem": "Chuva acima do normal nos últimos dias e mais chuva prevista para amanhã. A prefeitura está acompanhando a região.",
  "proximosDias": [
    { "dia": "2026-10-20", "chuvaPrevista": "forte" },
    { "dia": "2026-10-21", "chuvaPrevista": "moderada" }
  ],
  "atualizadoEm": "2026-10-19T14:02:11Z"
}
```

### Diferenças, uma a uma

| Aspecto | Web | Mobile |
|---|---|---|
| **Volume** | Região completa com geometria, fatores, histórico, ações e análise | Sete campos |
| **Chamadas internas** | Quatro serviços, em paralelo | Um serviço |
| **Números técnicos** | Acumulados em mm, percentil, índice de vulnerabilidade | Nenhum. "Forte", "moderada" |
| **Fontes** | Cada fator com fonte e data | Omitidas; a comunidade não precisa auditar |
| **Apresentação** | O cliente decide como exibir | O BFF já entrega rótulo, cor e mensagem prontos, para o app não precisar de lógica de apresentação |
| **Geometria** | Incluída, para desenhar no mapa | Omitida |
| **Análise da IA** | Síntese técnica completa | Substituída por mensagem simplificada |
| **Ações da prefeitura** | Detalhadas | Apenas "a prefeitura está acompanhando", sem expor equipes ou veículos |

A última linha é também uma decisão de privacidade: o público não precisa saber qual equipe ou veículo foi alocado.

### Mesma ação, dois BFFs

**Web:** `GET /web/v1/acoes/{id}` devolve a ação completa, com todos os links HATEOAS do serviço de Operações reescritos para `/web/v1`.

**Mobile, agente:** `GET /mobile/v1/acoes/{id}`

```json
{
  "id": "7c1e2a9e-3b0f-4a52-9d61-0f5a8b2e6c11",
  "titulo": "Limpeza de drenagem · Centro",
  "quando": "20/10, manhã",
  "estado": "CONFIRMADA",
  "_links": {
    "self":    { "href": "/mobile/v1/acoes/7c1e2a9e-3b0f-4a52-9d61-0f5a8b2e6c11" },
    "iniciar": { "href": "/mobile/v1/acoes/7c1e2a9e-3b0f-4a52-9d61-0f5a8b2e6c11/inicio", "method": "POST" }
  }
}
```

O BFF Mobile repassa apenas os links que o agente pode executar em campo. O link `cancelar`, presente na resposta de Operações, é removido: cancelar é decisão de gestão, não do agente.

---

## Falhas parciais

Um BFF que compõe várias fontes precisa decidir o que fazer quando uma delas não responde.

| Situação | BFF Web | BFF Mobile |
|---|---|---|
| Análise indisponível ou lenta | Devolve a região sem o bloco `analise`, com `"analise": null` e um aviso | Não afetado |
| Operações indisponível | Devolve panorama sem o bloco `acoes` | `GET /minhas-acoes` responde `503` |
| Risco indisponível | `GET /painel` responde `503`, porque sem panorama não há painel | Resumo público responde `503` |

Cada chamada interna tem timeout próprio (2 s para dados, 8 s para Análise). O painel nunca espera a IA para exibir os dados.

---

## Responsabilidades dos BFFs

- Compor respostas a partir de vários serviços, em paralelo quando possível.
- Adaptar formato, volume e linguagem ao cliente.
- Aplicar autorização por perfil (`GESTOR`, `TECNICO`, `AGENTE`), a partir dos papéis do JWT já validado pelo gateway.
- Reescrever links HATEOAS para o espaço de URLs do próprio BFF, filtrando os que o perfil não pode executar.
- Não conter regra de negócio. Um BFF nunca decide se uma ação pode ser cancelada; só repassa ou omite o link que o serviço já decidiu.
