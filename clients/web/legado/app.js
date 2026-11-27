/*
 * Painel web da Pluvia: JavaScript clássico, sem framework e sem build.
 * Este arquivo é executado inteiro pelo harness de teste (scripts/test-clients.test.cjs)
 * e verificado por `node --check`, por isso não usa módulos ES.
 *
 * Seções, na ordem:
 *   1. CONFIGURAÇÃO E ESTADO
 *   2. UTILITÁRIOS DE DOM
 *   3. SESSÃO (Keycloak, Authorization Code com PKCE)
 *   4. API (chamadas ao gateway com renovação do token)
 *   5. ROTEADOR (hash, item ativo, carregamento sob demanda)
 *   6. TELA: VISÃO GERAL
 *   7. TELA: SINALIZAÇÕES
 *   8. TELA: AÇÕES
 *   9. TELA: ASSISTENTE
 *  10. DESENHO (componentes compartilhados entre as telas)
 *  11. INICIALIZAÇÃO
 */

/* ===== 1. CONFIGURAÇÃO E ESTADO ===== */

const API_BASE = 'http://localhost:8000';
const OIDC = 'http://localhost:8000/auth/realms/pluvia/protocol/openid-connect';
const CLIENT_ID = 'pluvia-web';
const REDIRECT_URI = `${window.location.origin}/`;
const URL_PAINEL = '/web/v1/painel?municipio=Lavras';

/* Consulta periódica da SAGA (detalhe da ação) e do modelo de leitura do CQRS (depois de reconhecer). */
const INTERVALO_SAGA_MS = 2000;
const INTERVALO_CQRS_MS = 250;
const PRAZO_CQRS_MS = 10000;

const state = {
  accessToken: null,
  refreshToken: null,
  idToken: null,
  expiresAt: 0,
  roles: [],
  username: '',
  rota: { tela: 'visao-geral', param: null },
  navegacao: 0,
  limpezas: [],
  historico: [],
};

/* ===== 2. UTILITÁRIOS DE DOM ===== */

const $ = (id) => document.getElementById(id);

/** Cria um elemento com classe e texto opcionais. Só usa textContent, nunca innerHTML. */
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function showNotice(message, kind = 'info') {
  const notice = $('notice');
  notice.textContent = message;
  notice.dataset.kind = kind;
  notice.hidden = false;
}

function clearNotice() {
  $('notice').hidden = true;
}

/* ===== 3. SESSÃO ===== */

function decodeJwt(token) {
  const part = token.split('.')[1];
  return JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/')));
}

function base64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function pkceChallenge(verifier) {
  return base64Url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
}

function randomToken(size = 32) {
  return base64Url(crypto.getRandomValues(new Uint8Array(size)));
}

/** Perfis do usuário que o painel reconhece. */
function perfisWeb() {
  return state.roles.filter((role) => ['GESTOR', 'TECNICO'].includes(role));
}

function temPerfil(perfil) {
  return state.roles.includes(perfil);
}

function updateIdentity() {
  const roles = perfisWeb();
  $('identity').textContent = state.accessToken
    ? `${state.username || 'Usuário'} · ${roles.join(', ') || 'sem perfil Web'}`
    : 'Acesso da equipe';
  $('login-button').hidden = Boolean(state.accessToken);
  $('logout-button').hidden = !state.accessToken;
}

async function login() {
  const verifier = randomToken(48);
  const nonce = randomToken();
  const oidcState = randomToken();
  sessionStorage.setItem('pluvia.pkce', verifier);
  sessionStorage.setItem('pluvia.nonce', nonce);
  sessionStorage.setItem('pluvia.state', oidcState);
  const query = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: 'openid profile email',
    code_challenge: await pkceChallenge(verifier),
    code_challenge_method: 'S256',
    state: oidcState,
    nonce,
  });
  window.location.assign(`${OIDC}/auth?${query.toString()}`);
}

async function trocarCodigo(code, receivedState) {
  const expectedState = sessionStorage.getItem('pluvia.state');
  const verifier = sessionStorage.getItem('pluvia.pkce');
  const nonce = sessionStorage.getItem('pluvia.nonce');
  sessionStorage.removeItem('pluvia.state');
  sessionStorage.removeItem('pluvia.pkce');
  sessionStorage.removeItem('pluvia.nonce');
  if (!expectedState || receivedState !== expectedState || !verifier || !nonce) {
    throw new Error('A validação do retorno de autenticação falhou. Tente entrar novamente.');
  }
  const form = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    code,
    code_verifier: verifier,
  });
  const response = await fetch(`${OIDC}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error_description || data.error || 'Não foi possível concluir o login.');
  if (decodeJwt(data.id_token).nonce !== nonce) throw new Error('A validação do login expirou. Entre novamente.');
  acceptTokens(data);
  history.replaceState(null, '', window.location.pathname);
}

function acceptTokens(data) {
  const claims = decodeJwt(data.access_token);
  state.accessToken = data.access_token;
  state.refreshToken = data.refresh_token || null;
  state.idToken = data.id_token || null;
  state.expiresAt = Date.now() + Number(data.expires_in || 300) * 1000;
  state.roles = claims.realm_access?.roles || [];
  state.username = claims.preferred_username || claims.name || 'Usuário';
  updateIdentity();
}

function clearSession(expired = false) {
  state.accessToken = null;
  state.refreshToken = null;
  state.idToken = null;
  state.roles = [];
  state.expiresAt = 0;
  state.historico = [];
  updateIdentity();
  if (expired) showNotice('Sua sessão expirou. Entre novamente para continuar.', 'error');
  navegar();
}

async function refreshSession() {
  if (!state.refreshToken) {
    clearSession(true);
    throw new Error('Sua sessão expirou. Entre novamente.');
  }
  const form = new URLSearchParams({ grant_type: 'refresh_token', client_id: CLIENT_ID, refresh_token: state.refreshToken });
  const response = await fetch(`${OIDC}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form,
  });
  const data = await response.json();
  if (!response.ok) {
    clearSession(true);
    throw new Error('Sua sessão expirou. Entre novamente.');
  }
  acceptTokens(data);
}

function logout() {
  const idToken = state.idToken;
  clearSession();
  if (!idToken) return;
  const query = new URLSearchParams({ id_token_hint: idToken, client_id: CLIENT_ID, post_logout_redirect_uri: REDIRECT_URI });
  window.location.assign(`${OIDC}/logout?${query.toString()}`);
}

/* ===== 4. API ===== */

/** Chama o gateway com o token da sessão e devolve o JSON. Em erro, lança Error com o `detail` do problem+json. */
async function api(path, options = {}, retry = true) {
  if (!state.accessToken) throw new Error('Entre com seu usuário para acessar o painel.');
  if (Date.now() > state.expiresAt - 20000) await refreshSession();
  const headers = new Headers(options.headers || {});
  headers.set('Accept', 'application/json');
  headers.set('Authorization', `Bearer ${state.accessToken}`);
  if (options.body !== undefined) headers.set('Content-Type', 'application/json');
  const response = await fetch(`${API_BASE}${path}`, { ...options, headers, credentials: 'omit' });
  if (response.status === 401 && retry && state.refreshToken) {
    await refreshSession();
    return api(path, options, false);
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    if (response.status === 401) clearSession(true);
    throw new Error(body.detail || body.title || body.message || `A solicitação falhou (HTTP ${response.status}).`);
  }
  return response.status === 204 ? null : response.json();
}

/* ===== 5. ROTEADOR ===== */

/*
 * Cada tela é uma entrada de TELAS. `carregar(ctx)` é chamada sempre que a tela é
 * exibida e só com sessão ativa. O roteador já mostrou "Carregando…" em `ctx.corpo`;
 * a função substitui o conteúdo e, se lançar erro, o roteador mostra a mensagem.
 *
 *   ctx.tela      nome da tela
 *   ctx.param     segmento depois do nome (`#/acoes/{id}`), ou null
 *   ctx.corpo     elemento `#body-<tela>` onde a tela desenha
 *   ctx.ativa()   false depois que o usuário saiu da tela: confira antes de desenhar um resultado atrasado
 *   ctx.aoSair(f) registra f para rodar quando a tela deixar de ser a atual (timers, consultas periódicas)
 */
const TELAS = {
  'visao-geral': { titulo: 'Visão geral', carregar: carregarVisaoGeral },
  sinalizacoes: { titulo: 'Sinalizações', carregar: carregarSinalizacoes },
  acoes: { titulo: 'Ações', carregar: carregarAcoes },
  assistente: { titulo: 'Assistente', carregar: carregarAssistente },
};
const TELA_PADRAO = 'visao-geral';

function rotaDoHash(hash) {
  const partes = String(hash || '').replace(/^#\/?/, '').split('/').filter(Boolean);
  if (!Object.hasOwn(TELAS, partes[0])) return { tela: TELA_PADRAO, param: null };
  let param = null;
  if (partes[1]) {
    try { param = decodeURIComponent(partes[1]); } catch { param = null; }
  }
  return { tela: partes[0], param };
}

function corpoDaTela(tela) {
  return $(`body-${tela}`);
}

function mostrarConvite(corpo) {
  corpo.replaceChildren(el('p', 'muted state-message', 'Entre para ver os dados.'));
}

function mostrarCarregando(corpo) {
  corpo.replaceChildren(el('p', 'muted state-message', 'Carregando…'));
}

function mostrarErro(corpo, erro) {
  const mensagem = el('p', 'state-message state-error', erro?.message || 'Não foi possível carregar os dados.');
  mensagem.setAttribute('role', 'alert');
  corpo.replaceChildren(mensagem);
}

/** Mostra no lugar de um controle o perfil que ele exige. */
function indicacaoDePerfil(perfil) {
  return el('p', 'muted role-hint', `Disponível para o perfil ${perfil}.`);
}

function marcarTelaAtiva(tela) {
  for (const nome of Object.keys(TELAS)) {
    $(`screen-${nome}`).hidden = nome !== tela;
    const item = $(`nav-${nome}`);
    if (nome === tela) item.setAttribute('aria-current', 'page');
    else item.removeAttribute('aria-current');
  }
  document.title = `Pluvia · ${TELAS[tela].titulo}`;
  fecharMenu();
}

function pararTela() {
  const limpezas = state.limpezas;
  state.limpezas = [];
  for (const limpar of limpezas) limpar();
}

async function navegar() {
  pararTela();
  const rota = rotaDoHash(window.location.hash);
  state.rota = rota;
  const ticket = ++state.navegacao;
  marcarTelaAtiva(rota.tela);
  const corpo = corpoDaTela(rota.tela);
  if (!state.accessToken) return mostrarConvite(corpo);
  mostrarCarregando(corpo);
  const ctx = {
    tela: rota.tela,
    param: rota.param,
    corpo,
    ativa: () => ticket === state.navegacao,
    aoSair: (limpar) => (ctx.ativa() ? state.limpezas.push(limpar) : limpar()),
  };
  try {
    await TELAS[rota.tela].carregar(ctx);
  } catch (erro) {
    if (ctx.ativa()) mostrarErro(corpo, erro);
  }
}

function alternarMenu() {
  const aberto = $('sidenav').classList.toggle('is-open');
  $('menu-toggle').setAttribute('aria-expanded', String(aberto));
}

function fecharMenu() {
  $('sidenav').classList.remove('is-open');
  $('menu-toggle').setAttribute('aria-expanded', 'false');
}

/* ===== 6. TELA: VISÃO GERAL ===== */

const SVG_NS = 'http://www.w3.org/2000/svg';
const MAPA_LARGURA = 800;
const MAPA_MARGEM = 24;

/** Anéis (listas de [lon, lat]) de um GeoJSON Polygon ou MultiPolygon. */
function aneisDaGeometria(geometria) {
  if (!geometria || !Array.isArray(geometria.coordinates)) return [];
  if (geometria.type === 'Polygon') return geometria.coordinates;
  if (geometria.type === 'MultiPolygon') return geometria.coordinates.flat();
  return [];
}

function caminhoDoAnel(anel) {
  return `M${anel.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(' L')} Z`;
}

function areaDoAnel(anel) {
  let soma = 0;
  for (let i = 0; i < anel.length; i += 1) {
    const [x1, y1] = anel[i];
    const [x2, y2] = anel[(i + 1) % anel.length];
    soma += x1 * y2 - x2 * y1;
  }
  return soma / 2;
}

/** Centroide do maior anel; se o anel for degenerado, a média dos pontos. */
function centroideDoMaiorAnel(aneis) {
  const anel = aneis.reduce((maior, atual) => (Math.abs(areaDoAnel(atual)) > Math.abs(areaDoAnel(maior)) ? atual : maior));
  const area = areaDoAnel(anel);
  if (Math.abs(area) < 1e-9) {
    return [anel.reduce((s, p) => s + p[0], 0) / anel.length, anel.reduce((s, p) => s + p[1], 0) / anel.length];
  }
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < anel.length; i += 1) {
    const [x1, y1] = anel[i];
    const [x2, y2] = anel[(i + 1) % anel.length];
    const cruzado = x1 * y2 - x2 * y1;
    cx += (x1 + x2) * cruzado;
    cy += (y1 + y2) * cruzado;
  }
  return [cx / (6 * area), cy / (6 * area)];
}

/**
 * Projeção equiretangular das geometrias das regiões para um viewBox de largura fixa.
 * Devolve null quando nenhuma região tem geometria desenhável.
 */
function projetarRegioes(regioes) {
  const desenhaveis = regioes
    .map((regiao) => ({ regiao, aneis: aneisDaGeometria(regiao.geometria).filter((anel) => anel.length >= 3) }))
    .filter((item) => item.aneis.length > 0);
  if (desenhaveis.length === 0) return null;

  let minLon = Infinity;
  let maxLon = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;
  for (const { aneis } of desenhaveis) {
    for (const anel of aneis) {
      for (const [lon, lat] of anel) {
        minLon = Math.min(minLon, lon);
        maxLon = Math.max(maxLon, lon);
        minLat = Math.min(minLat, lat);
        maxLat = Math.max(maxLat, lat);
      }
    }
  }
  const fatorLon = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180);
  const larguraGeo = Math.max((maxLon - minLon) * fatorLon, 1e-9);
  const alturaGeo = Math.max(maxLat - minLat, 1e-9);
  const escala = (MAPA_LARGURA - 2 * MAPA_MARGEM) / larguraGeo;
  const projetar = ([lon, lat]) => [MAPA_MARGEM + (lon - minLon) * fatorLon * escala, MAPA_MARGEM + (maxLat - lat) * escala];

  return {
    largura: MAPA_LARGURA,
    altura: Math.round(alturaGeo * escala + 2 * MAPA_MARGEM),
    itens: desenhaveis.map(({ regiao, aneis }) => {
      const projetados = aneis.map((anel) => anel.map(projetar));
      return { regiao, d: projetados.map(caminhoDoAnel).join(' '), centro: centroideDoMaiorAnel(projetados) };
    }),
  };
}

/** SVG com um polígono por região. `aoSelecionar(regiaoId)` roda no clique e em Enter ou Espaço. */
function desenharMapa(projecao, aoSelecionar) {
  const svg = elSvg('svg', {
    viewBox: `0 0 ${projecao.largura} ${projecao.altura}`,
    role: 'group',
    'aria-label': 'Mapa das regiões por nível de atenção',
    class: 'map-svg',
  });
  const poligonos = new Map();
  for (const { regiao, d, centro } of projecao.itens) {
    const poligono = elSvg('path', {
      d,
      class: 'map-region',
      'fill-rule': 'evenodd',
      tabindex: '0',
      role: 'button',
      'aria-label': `${regiao.nome}, ${rotuloNivel(regiao.nivelAtencao)}`,
      'aria-pressed': 'false',
    });
    poligono.dataset.level = regiao.nivelAtencao || 'DESCONHECIDO';
    poligono.addEventListener('click', () => aoSelecionar(regiao.regiaoId));
    poligono.addEventListener('keydown', (evento) => {
      if (evento.key !== 'Enter' && evento.key !== ' ') return undefined;
      evento.preventDefault();
      return aoSelecionar(regiao.regiaoId);
    });
    const rotulo = elSvg('text', { x: centro[0].toFixed(1), y: centro[1].toFixed(1), class: 'map-label' });
    rotulo.textContent = regiao.nome;
    svg.append(poligono, rotulo);
    poligonos.set(regiao.regiaoId, poligono);
  }
  return { svg, poligonos };
}

function legendaDeNiveis() {
  const legenda = el('ul', 'map-legend');
  for (const nivel of Object.keys(NIVEIS)) {
    const item = el('li');
    const cor = el('span', 'legend-swatch');
    cor.dataset.level = nivel;
    item.append(cor, el('span', null, rotuloNivel(nivel)));
    legenda.append(item);
  }
  return legenda;
}

function cartaoContador(rotulo, valor) {
  const cartao = el('div', 'metric-card');
  cartao.append(el('strong', null, valor == null ? '—' : String(valor)), el('span', null, rotulo));
  if (valor == null) cartao.append(el('small', null, 'Dado indisponível'));
  return cartao;
}

function contadoresDoPainel(painel) {
  const contadores = painel.contadores || {};
  const grade = el('div', 'metric-grid');
  grade.append(cartaoContador('Regiões acompanhadas', (painel.regioes || []).length));
  for (const nivel of Object.keys(NIVEIS)) {
    grade.append(cartaoContador(rotuloNivel(nivel), contadores.porNivel ? contadores.porNivel[nivel] ?? 0 : null));
  }
  grade.append(cartaoContador('Sinalizações abertas', contadores.sinalizacoesAbertas));
  grade.append(cartaoContador('Ações em andamento', contadores.acoesEmAndamento));
  return grade;
}

/** Lista de fatos rótulo/valor; o valor pode ser texto ou um nó. */
function listaDeFatos(pares) {
  const lista = el('dl', 'facts');
  for (const [rotulo, valor] of pares) {
    const dd = el('dd');
    if (typeof valor === 'string') dd.textContent = valor;
    else dd.append(valor);
    lista.append(el('dt', null, rotulo), dd);
  }
  return lista;
}

function secaoDoPainel(titulo, ...conteudo) {
  const secao = el('section', 'region-section');
  secao.append(el('h4', null, titulo), ...conteudo);
  return secao;
}

function conteudoDaRegiao(dados) {
  const regiao = dados.regiao || {};
  const panorama = dados.panorama || {};
  const nivel = panorama.nivelAtencao || regiao.nivelAtencao;
  const cabecalho = el('div', 'card-heading');
  cabecalho.append(el('h3', null, regiao.nome || panorama.regiaoNome || 'Região'), chipNivel(nivel));

  const caracteristicas = regiao.caracteristicas || {};
  const fatosTerritorio = [['Município', [regiao.municipio, regiao.uf].filter(Boolean).join('/') || '—']];
  if (regiao.codigo) fatosTerritorio.push(['Código', regiao.codigo]);
  if (caracteristicas.areaKm2 != null) fatosTerritorio.push(['Área', `${caracteristicas.areaKm2} km²`]);
  if (caracteristicas.tipoOcupacao) fatosTerritorio.push(['Ocupação', rotuloTexto(caracteristicas.tipoOcupacao)]);
  if (caracteristicas.declividadeMediaPct != null) fatosTerritorio.push(['Declividade média', `${caracteristicas.declividadeMediaPct}%`]);
  if (caracteristicas.proximidadeCursoAgua != null) fatosTerritorio.push(['Próxima de curso d’água', caracteristicas.proximidadeCursoAgua ? 'Sim' : 'Não']);

  const fatores = el('ul', 'factor-list');
  for (const fator of panorama.fatores || []) {
    fatores.append(el('li', null, [fator.descricao, fator.fonte && `(${fator.fonte})`].filter(Boolean).join(' ')));
  }
  const fatosRisco = [
    ['Nível de atenção', chipNivel(nivel)],
    ['Sinalizações abertas', String(panorama.sinalizacoesAbertas ?? '—')],
    ['Ações abertas', dados.acoes ? String(dados.acoes.abertas) : '—'],
  ];

  const analise = dados.analise;
  const sintese = el('div', 'synthesis');
  if (analise) {
    sintese.append(el('p', null, analise.sintese), etiquetaOrigem(analise.origem));
    if (analise.origem === 'FALLBACK') sintese.append(el('p', 'muted role-hint', 'Síntese montada por regras, sem o modelo de linguagem.'));
    const fontes = el('ul', 'source-list');
    for (const fonte of analise.fontes || []) fontes.append(el('li', null, [fonte.nome, fonte.referencia].filter(Boolean).join(': ')));
    sintese.append(fontes);
  } else {
    const aviso = (dados.avisos || []).find((texto) => /análise/i.test(texto)) || 'Síntese indisponível no momento.';
    sintese.append(el('p', 'muted', aviso));
  }

  return [
    cabecalho,
    secaoDoPainel('Território', listaDeFatos(fatosTerritorio)),
    secaoDoPainel('Risco', listaDeFatos(fatosRisco), fatores),
    secaoDoPainel('Síntese da Análise', sintese),
  ];
}

async function carregarVisaoGeral(ctx) {
  const painel = await api(URL_PAINEL);
  if (!ctx.ativa()) return;
  const regioes = Array.isArray(painel.regioes) ? painel.regioes : [];
  const marcadores = new Map();
  let selecao = 0;

  const lateral = el('aside', 'panel-card region-panel');
  lateral.id = 'region-panel';
  lateral.setAttribute('aria-live', 'polite');
  lateral.append(el('p', 'muted', 'Selecione uma região no mapa ou na lista para ver os detalhes.'));

  const selecionar = async (regiaoId) => {
    const minha = ++selecao;
    for (const [id, marcador] of marcadores) marcador.setAttribute('aria-pressed', String(id === regiaoId));
    lateral.replaceChildren(el('p', 'muted', 'Carregando a região…'));
    try {
      const dados = await api(`/web/v1/regioes/${encodeURIComponent(regiaoId)}`);
      if (minha === selecao && ctx.ativa()) lateral.replaceChildren(...conteudoDaRegiao(dados));
    } catch (erro) {
      if (minha !== selecao || !ctx.ativa()) return;
      const mensagem = el('p', 'state-message state-error', erro.message);
      mensagem.setAttribute('role', 'alert');
      lateral.replaceChildren(mensagem);
    }
  };

  const projecao = projetarRegioes(regioes);
  const comMapa = new Set(projecao ? projecao.itens.map((item) => item.regiao.regiaoId) : []);
  const mapaCartao = el('div', 'panel-card map-card');
  const tituloDoMapa = el('div', 'card-heading');
  tituloDoMapa.append(el('h3', null, 'Regiões por nível de atenção'));
  mapaCartao.append(tituloDoMapa);
  if (projecao) {
    const { svg, poligonos } = desenharMapa(projecao, selecionar);
    for (const [id, poligono] of poligonos) marcadores.set(id, poligono);
    mapaCartao.append(svg, legendaDeNiveis(), el('p', 'muted role-hint', 'Divisão do recorte piloto, sem escala cartográfica.'));
  }
  const semMapa = regioes.filter((regiao) => !comMapa.has(regiao.regiaoId));
  if (semMapa.length > 0) {
    if (projecao) mapaCartao.append(el('p', 'muted role-hint', 'Regiões sem geometria:'));
    const lista = el('ul', 'region-list');
    for (const regiao of semMapa) {
      const item = el('li');
      const botao = el('button', 'button button-light region-item');
      botao.type = 'button';
      botao.setAttribute('aria-pressed', 'false');
      botao.append(el('span', null, regiao.nome), chipNivel(regiao.nivelAtencao));
      botao.addEventListener('click', () => selecionar(regiao.regiaoId));
      marcadores.set(regiao.regiaoId, botao);
      item.append(botao);
      lista.append(item);
    }
    mapaCartao.append(lista);
  }
  if (regioes.length === 0) mapaCartao.append(el('p', 'muted state-message', 'Nenhuma região acompanhada.'));

  const raiz = el('div', 'overview');
  const avisos = painel.avisos || [];
  if (avisos.length > 0) {
    const caixa = el('div', 'state-message notice-box');
    for (const aviso of avisos) caixa.append(el('p', null, aviso));
    raiz.append(caixa);
  }
  const layout = el('div', 'overview-layout');
  layout.append(mapaCartao, lateral);
  raiz.append(contadoresDoPainel(painel), layout);
  ctx.corpo.replaceChildren(raiz);
}

/* ===== 7. TELA: SINALIZAÇÕES ===== */

const ESTADOS_SINALIZACAO = ['ABERTA', 'RECONHECIDA', 'ENCERRADA'];

function filtroSelect(id, rotuloTodos, opcoes, rotulo) {
  const select = el('select');
  select.id = id;
  const todos = el('option', null, rotuloTodos);
  todos.value = '';
  select.append(todos);
  for (const valor of opcoes) {
    const opcao = el('option', null, rotulo(valor));
    opcao.value = valor;
    select.append(opcao);
  }
  return select;
}

function cartaoDaSinalizacao(sinalizacao, nomes, aoReconhecer, enviando) {
  const item = el('li', 'panel-card signal-item');
  item.dataset.id = sinalizacao.id;
  const cabecalho = el('div', 'card-heading');
  const marcas = el('span', 'chip-row');
  marcas.append(chipNivel(sinalizacao.nivelAtencao), chipEstado(sinalizacao.estado));
  cabecalho.append(el('h3', null, nomes.get(sinalizacao.regiaoId) || 'Região'), marcas);
  const datas = [`Origem: ${rotuloTexto(sinalizacao.origem)}`, `Emitida em ${formatarDataHora(sinalizacao.emitidaEm)}`];
  if (sinalizacao.reconhecidaEm) datas.push(`Reconhecida em ${formatarDataHora(sinalizacao.reconhecidaEm)}`);
  item.append(cabecalho, el('p', null, sinalizacao.motivo), el('p', 'muted signal-meta', datas.join(' · ')));
  if (sinalizacao.estado === 'ABERTA') {
    if (temPerfil('TECNICO')) {
      const botao = el('button', 'button button-primary', 'Reconhecer');
      botao.type = 'button';
      botao.disabled = enviando;
      botao.addEventListener('click', () => aoReconhecer(sinalizacao));
      item.append(botao);
    } else {
      item.append(indicacaoDePerfil('TECNICO'));
    }
  }
  return item;
}

async function carregarSinalizacoes(ctx) {
  const [pagina, regioes] = await Promise.all([api('/web/v1/sinalizacoes?tamanho=100'), regioesDoPainel()]);
  if (!ctx.ativa()) return;
  const nomes = mapaDeNomes(regioes);
  const itens = (pagina.itens || []).slice().sort((a, b) => String(b.emitidaEm).localeCompare(String(a.emitidaEm)));
  const filtros = { estado: '', nivel: '' };
  const mensagens = new Map();
  const timers = new Set();
  const enviando = new Set();
  let saiu = false;
  ctx.aoSair(() => {
    saiu = true;
    for (const timer of timers) clearTimeout(timer);
    timers.clear();
  });

  const painelDeMensagens = el('ul', 'cqrs-messages');
  painelDeMensagens.setAttribute('aria-live', 'polite');
  const lista = el('ul', 'signal-list');

  const desenharMensagens = () => {
    painelDeMensagens.hidden = mensagens.size === 0;
    painelDeMensagens.replaceChildren(
      ...[...mensagens.values()].map(({ tipo, texto }) => {
        const mensagem = el('li', 'cqrs-message', texto);
        mensagem.dataset.kind = tipo;
        if (tipo === 'error') mensagem.setAttribute('role', 'alert');
        return mensagem;
      }),
    );
  };
  const avisar = (sinalizacao, tipo, texto) => {
    if (saiu) return;
    mensagens.set(sinalizacao.id, { tipo, texto: `${nomes.get(sinalizacao.regiaoId) || 'Região'}: ${texto}` });
    desenharMensagens();
  };

  const desenharLista = () => {
    if (saiu) return;
    const visiveis = itens.filter((s) => (!filtros.estado || s.estado === filtros.estado) && (!filtros.nivel || s.nivelAtencao === filtros.nivel));
    if (visiveis.length === 0) {
      const vazio = itens.length === 0 ? 'Nenhuma sinalização registrada.' : 'Nenhuma sinalização com esses filtros.';
      lista.replaceChildren(el('li', 'muted state-message', vazio));
      return;
    }
    lista.replaceChildren(...visiveis.map((s) => cartaoDaSinalizacao(s, nomes, reconhecer, enviando.has(s.id))));
  };

  /** Consulta o modelo de leitura (panorama) até a sinalização aparecer RECONHECIDA ou o prazo acabar. */
  const medirDefasagem = (sinalizacao, t0) => {
    const agendar = () => {
      const timer = setTimeout(async () => {
        timers.delete(timer);
        if (saiu) return;
        let refletiu = false;
        try {
          const panorama = await api(`/web/v1/panoramas/${encodeURIComponent(sinalizacao.regiaoId)}`);
          refletiu = (panorama.sinalizacoes || []).some((s) => s.id === sinalizacao.id && s.estado === 'RECONHECIDA');
        } catch {
          // falha momentânea: a próxima consulta tenta de novo até o prazo
        }
        const decorrido = Date.now() - t0;
        if (refletiu) return avisar(sinalizacao, 'success', `escrita confirmada. Modelo de leitura atualizado em ${decorrido} ms.`);
        if (decorrido >= PRAZO_CQRS_MS) {
          return avisar(sinalizacao, 'warning', `escrita confirmada. O modelo de leitura ainda não refletiu a escrita (${PRAZO_CQRS_MS / 1000} s).`);
        }
        agendar();
      }, INTERVALO_CQRS_MS);
      timers.add(timer);
    };
    agendar();
  };

  async function reconhecer(sinalizacao) {
    if (enviando.has(sinalizacao.id)) return;
    enviando.add(sinalizacao.id);
    desenharLista();
    avisar(sinalizacao, 'info', 'enviando o reconhecimento…');
    try {
      const atualizada = await api(`/web/v1/sinalizacoes/${encodeURIComponent(sinalizacao.id)}/reconhecimento`, { method: 'POST' });
      const t0 = Date.now();
      sinalizacao.estado = atualizada?.estado || 'RECONHECIDA';
      sinalizacao.reconhecidaEm = atualizada?.reconhecidaEm || new Date(t0).toISOString();
      desenharLista();
      avisar(sinalizacao, 'info', 'escrita confirmada. Aguardando o modelo de leitura…');
      medirDefasagem(sinalizacao, t0);
    } catch (erro) {
      avisar(sinalizacao, 'error', erro.message);
    } finally {
      enviando.delete(sinalizacao.id);
      desenharLista();
    }
  }

  const barra = el('div', 'filter-bar');
  const filtroEstado = filtroSelect('filtro-estado', 'Todos os estados', ESTADOS_SINALIZACAO, rotuloTexto);
  const filtroNivel = filtroSelect('filtro-nivel', 'Todos os níveis', Object.keys(NIVEIS), rotuloNivel);
  filtroEstado.addEventListener('change', () => { filtros.estado = filtroEstado.value; desenharLista(); });
  filtroNivel.addEventListener('change', () => { filtros.nivel = filtroNivel.value; desenharLista(); });
  barra.append(campo('Estado', filtroEstado), campo('Nível de atenção', filtroNivel));

  const raiz = el('div', 'signals');
  raiz.append(painelDeMensagens, barra, lista);
  desenharMensagens();
  desenharLista();
  ctx.corpo.replaceChildren(raiz);
}

/* ===== 8. TELA: AÇÕES ===== */

const ORDEM_ESTADOS_ACAO = ['PENDENTE', 'CONFIRMADA', 'EM_EXECUCAO', 'CONCLUIDA', 'REJEITADA', 'CANCELADA'];
const SAGA_TERMINADA = ['CONCLUIDA', 'COMPENSADA'];
const OPCOES_ACAO = {
  tipo: ['VISTORIA', 'LIMPEZA_DRENAGEM', 'DESOBSTRUCAO', 'INSPECAO_PONTO_CRITICO'],
  turno: ['MANHA', 'TARDE', 'NOITE'],
  especialidade: ['DRENAGEM', 'VISTORIA', 'DESOBSTRUCAO', 'GERAL'],
  categoriaRecurso: ['CAMINHAO_HIDROJATO', 'RETROESCAVADEIRA', 'CAMINHONETE', 'BOMBA_SUCCAO', 'KIT_VISTORIA'],
};

/* Tipo de cada passo da SAGA, pelo nome da mensagem. Passo sem nome conhecido é tratado como ida. */
const TIPO_DO_PASSO = {
  ReservarEquipe: 'ida',
  EquipeReservada: 'ida',
  ReservarRecurso: 'ida',
  RecursoReservado: 'ida',
  ReservaEquipeRecusada: 'recusa',
  ReservaRecursoRecusada: 'recusa',
  LiberarEquipe: 'compensacao',
  EquipeLiberada: 'compensacao',
  LiberarRecurso: 'compensacao',
  RecursoLiberado: 'compensacao',
};
const ROTULO_DO_TIPO_DE_PASSO = { ida: 'Ida', recusa: 'Recusa', compensacao: '↩ Compensação', ignorada: 'Ignorada' };
const RAIAS = { operacoes: 'Operações', equipes: 'Equipes', frota: 'Frota' };

/** Resposta descartada pelo orquestrador: RECEBIDA com detalhe "<mensagem> ignorada: ...". */
function tipoDoPasso(passo) {
  if (passo.direcao === 'RECEBIDA' && /^\S+ ignorada\b/.test(passo.detalhe || '')) return 'ignorada';
  return TIPO_DO_PASSO[passo.mensagem] || 'ida';
}

/** Raia do participante do passo; sem participante, Operações. */
function raiaDoParticipante(passo) {
  if (passo.participante === 'EQUIPES') return 'equipes';
  if (passo.participante === 'FROTA') return 'frota';
  return 'operacoes';
}

/** A raia é de quem produziu a mensagem: Operações envia os comandos, o participante envia as respostas. */
function raiaDoPasso(passo) {
  return passo.direcao === 'ENVIADA' ? 'operacoes' : raiaDoParticipante(passo);
}

function passoDaSaga(passo) {
  const tipo = tipoDoPasso(passo);
  const raia = raiaDoPasso(passo);
  const participante = RAIAS[raiaDoParticipante(passo)];
  const item = el('li', 'timeline-step');
  item.dataset.tipo = tipo;
  item.dataset.raia = raia;
  const fluxo = passo.direcao === 'ENVIADA' ? `${RAIAS.operacoes} → ${participante}` : `${participante} → ${RAIAS.operacoes}`;
  const titulo = el('div', 'timeline-head');
  titulo.append(el('strong', null, passo.mensagem), el('span', 'timeline-tipo', ROTULO_DO_TIPO_DE_PASSO[tipo]));
  item.append(titulo, el('p', 'muted timeline-fluxo', fluxo));
  if (passo.detalhe) item.append(el('p', 'timeline-detalhe', passo.detalhe));
  return item;
}

function trilhaDaSaga(passos) {
  const bloco = el('div', 'saga-timeline');
  const raias = el('div', 'saga-lanes');
  for (const nome of Object.values(RAIAS)) raias.append(el('span', null, nome));
  const trilha = el('ol', 'saga-trilha');
  trilha.append(...passos.map(passoDaSaga));
  bloco.append(raias, trilha);
  return bloco;
}

function linhaDeAcao(acao, nomes) {
  const item = el('li');
  const link = el('a', 'acao-item');
  link.setAttribute('href', `#/acoes/${encodeURIComponent(acao.id)}`);
  const principal = el('span', 'acao-item-main');
  principal.append(el('strong', null, rotuloTexto(acao.tipo)), el('span', 'muted', nomes.get(acao.regiaoId) || 'Região'));
  const quando = el('span', 'muted', `${formatarData(acao.data)} · ${rotuloTexto(acao.turno)}`);
  link.append(principal, quando, chipEstado(acao.estado));
  item.append(link);
  return item;
}

function listaDeAcoes(acoes, nomes) {
  const porEstado = new Map();
  for (const acao of acoes) {
    if (!porEstado.has(acao.estado)) porEstado.set(acao.estado, []);
    porEstado.get(acao.estado).push(acao);
  }
  const estados = [...ORDEM_ESTADOS_ACAO.filter((e) => porEstado.has(e)), ...[...porEstado.keys()].filter((e) => !ORDEM_ESTADOS_ACAO.includes(e))];
  const raiz = el('div', 'acao-grupos');
  for (const estado of estados) {
    const grupo = el('section', 'panel-card acao-grupo');
    grupo.dataset.estado = estado;
    const cabecalho = el('div', 'card-heading');
    cabecalho.append(el('h3', null, `${rotuloTexto(estado)} (${porEstado.get(estado).length})`));
    const itens = el('ul', 'acao-lista');
    itens.append(...porEstado.get(estado).map((acao) => linhaDeAcao(acao, nomes)));
    grupo.append(cabecalho, itens);
    raiz.append(grupo);
  }
  return raiz;
}

function selectDeOpcoes(nome, valores) {
  const select = el('select');
  select.name = nome;
  select.required = true;
  for (const valor of valores) {
    const opcao = el('option', null, rotuloTexto(valor));
    opcao.value = valor;
    select.append(opcao);
  }
  return select;
}

function formularioNovaAcao(regioes) {
  const form = el('form', 'panel-card acao-form');
  form.id = 'action-form';
  const cabecalho = el('div', 'card-heading');
  cabecalho.append(el('h3', null, 'Nova ação preventiva'));

  const regiao = el('select');
  regiao.name = 'regiaoId';
  regiao.required = true;
  for (const item of regioes) {
    const opcao = el('option', null, item.nome);
    opcao.value = item.regiaoId;
    regiao.append(opcao);
  }
  const data = el('input');
  data.type = 'date';
  data.name = 'data';
  data.required = true;
  data.value = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
  const descricao = el('textarea');
  descricao.name = 'descricao';
  descricao.rows = 2;
  descricao.maxLength = 500;

  const grade = el('div', 'form-grid');
  grade.append(
    campo('Região', regiao),
    campo('Tipo', selectDeOpcoes('tipo', OPCOES_ACAO.tipo)),
    campo('Data', data),
    campo('Turno', selectDeOpcoes('turno', OPCOES_ACAO.turno)),
    campo('Especialidade', selectDeOpcoes('especialidade', OPCOES_ACAO.especialidade)),
    campo('Categoria do recurso', selectDeOpcoes('categoriaRecurso', OPCOES_ACAO.categoriaRecurso)),
    campo('Descrição (opcional)', descricao, true),
  );
  const erro = el('p', 'state-message state-error form-error');
  erro.hidden = true;
  erro.setAttribute('role', 'alert');
  const enviar = el('button', 'button button-primary', 'Abrir ação');
  enviar.type = 'submit';
  form.append(cabecalho, grade, erro, enviar);

  form.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const dados = new FormData(form);
    const corpo = {};
    for (const nome of ['regiaoId', 'tipo', 'data', 'turno', 'especialidade', 'categoriaRecurso']) corpo[nome] = dados.get(nome);
    const texto = String(dados.get('descricao') || '').trim();
    if (texto) corpo.descricao = texto;
    erro.hidden = true;
    enviar.disabled = true;
    try {
      const acao = await api('/web/v1/acoes', {
        method: 'POST',
        headers: { 'Idempotency-Key': crypto.randomUUID() },
        body: JSON.stringify(corpo),
      });
      window.location.hash = `#/acoes/${encodeURIComponent(acao.id)}`;
    } catch (falha) {
      erro.textContent = falha.message;
      erro.hidden = false;
    } finally {
      enviar.disabled = false;
    }
  });
  return form;
}

async function carregarListaDeAcoes(ctx) {
  const [pagina, regioes] = await Promise.all([api('/web/v1/acoes?tamanho=100'), regioesDoPainel()]);
  if (!ctx.ativa()) return;
  const acoes = pagina.itens || pagina._embedded?.acoes || [];
  const nomes = mapaDeNomes(regioes);
  const raiz = el('div', 'acoes');
  if (temPerfil('GESTOR')) {
    raiz.append(regioes.length > 0 ? formularioNovaAcao(regioes) : el('p', 'muted state-message', 'Não foi possível carregar as regiões para abrir uma ação.'));
  } else {
    raiz.append(indicacaoDePerfil('GESTOR'));
  }
  if (acoes.length === 0) {
    const convite = temPerfil('GESTOR')
      ? 'Nenhuma ação ainda. Use o formulário acima para abrir a primeira ação preventiva.'
      : 'Nenhuma ação ainda. A abertura de ações é do perfil GESTOR.';
    raiz.append(el('p', 'muted state-message', convite));
  } else {
    raiz.append(listaDeAcoes(acoes, nomes));
  }
  ctx.corpo.replaceChildren(raiz);
}

function blocosDoDetalhe(acao, saga, nomes, gestor, falha) {
  const voltar = el('a', 'back-link', '← Todas as ações');
  voltar.setAttribute('href', '#/acoes');

  const dados = el('section', 'panel-card');
  const cabecalho = el('div', 'card-heading');
  cabecalho.append(el('h3', null, rotuloTexto(acao.tipo)), chipEstado(acao.estado));
  const fatos = [
    ['Região', nomes.get(acao.regiaoId) || acao.regiaoId],
    ['Data', `${formatarData(acao.data)} · ${rotuloTexto(acao.turno)}`],
    ['Especialidade', rotuloTexto(acao.especialidade)],
    ['Recurso', rotuloTexto(acao.categoriaRecurso)],
  ];
  if (acao.descricao) fatos.push(['Descrição', acao.descricao]);
  if (acao.motivoRejeicao) fatos.push(['Motivo da rejeição', acao.motivoRejeicao]);
  if (acao.motivoCancelamento) fatos.push(['Motivo do cancelamento', acao.motivoCancelamento]);
  dados.append(cabecalho, listaDeFatos(fatos));

  const trilha = el('section', 'panel-card saga-card');
  const tituloSaga = el('div', 'card-heading');
  tituloSaga.append(el('h3', null, 'Linha do tempo da SAGA'));
  trilha.append(tituloSaga);
  if (!gestor) {
    trilha.append(indicacaoDePerfil('GESTOR'));
  } else if (saga) {
    tituloSaga.append(chipEstado(saga.estado));
    if (saga.motivo) trilha.append(el('p', 'saga-motivo', `Motivo: ${saga.motivo}`));
    if (!SAGA_TERMINADA.includes(saga.estado)) trilha.append(el('p', 'muted role-hint', 'SAGA em andamento: atualizando a cada 2 s.'));
    trilha.append(trilhaDaSaga(saga.passos || []));
  }
  const blocos = [voltar, dados, trilha];
  if (falha) {
    const mensagem = el('p', 'state-message state-error', falha);
    mensagem.setAttribute('role', 'alert');
    blocos.push(mensagem);
  }
  return blocos;
}

async function carregarDetalheDaAcao(ctx) {
  const gestor = temPerfil('GESTOR');
  const id = encodeURIComponent(ctx.param);
  const buscar = async () => {
    const [acao, saga] = await Promise.all([api(`/web/v1/acoes/${id}`), gestor ? api(`/web/v1/acoes/${id}/saga`) : null]);
    return { acao, saga };
  };
  const [inicial, regioes] = await Promise.all([buscar(), regioesDoPainel()]);
  if (!ctx.ativa()) return;
  const nomes = mapaDeNomes(regioes);
  const raiz = el('div', 'acao-detalhe');
  const desenhar = (atual, falha) => raiz.replaceChildren(...blocosDoDetalhe(atual.acao, atual.saga, nomes, gestor, falha));
  let atual = inicial;
  let timer = null;
  ctx.aoSair(() => clearTimeout(timer));

  const agendar = () => {
    if (!gestor || !atual.saga || SAGA_TERMINADA.includes(atual.saga.estado)) return;
    timer = setTimeout(async () => {
      try {
        const novo = await buscar();
        if (!ctx.ativa()) return;
        atual = novo;
        desenhar(atual);
      } catch (erro) {
        if (!ctx.ativa()) return;
        desenhar(atual, erro.message);
      }
      agendar();
    }, INTERVALO_SAGA_MS);
  };

  desenhar(atual);
  ctx.corpo.replaceChildren(raiz);
  agendar();
}

async function carregarAcoes(ctx) {
  return ctx.param ? carregarDetalheDaAcao(ctx) : carregarListaDeAcoes(ctx);
}

/* ===== 9. TELA: ASSISTENTE ===== */

const PERGUNTA_MINIMA = 5;
const PERGUNTAS_DE_EXEMPLO = [
  'Quais cuidados devem ser avaliados antes de uma chuva intensa?',
  'O que fazer quando um ponto da cidade começa a alagar?',
  'Como reconhecer sinais de risco de enxurrada em uma região?',
];

function cartaoDaResposta(entrada) {
  const cartao = el('article', 'panel-card answer-card');
  cartao.append(el('p', 'answer-question', entrada.pergunta), el('p', 'answer-text', entrada.resposta));
  const meta = el('div', 'answer-meta');
  meta.append(etiquetaOrigem(entrada.origem));
  if (entrada.latenciaMs != null) meta.append(el('span', 'muted', `Latência: ${entrada.latenciaMs} ms`));
  if (entrada.modelo) meta.append(el('span', 'muted', `Modelo: ${entrada.modelo}`));
  cartao.append(meta);
  if (entrada.origem === 'FALLBACK') {
    cartao.append(el('p', 'fallback-note', 'Resposta montada sem o modelo de linguagem: o texto vem dos trechos recuperados da base de conhecimento.'));
  }
  const trechos = entrada.trechos || [];
  if (trechos.length > 0) {
    const lista = el('ul', 'snippet-list');
    for (const trecho of trechos) lista.append(el('li', null, trecho.titulo));
    cartao.append(el('h4', null, 'Trechos usados'), lista);
  }
  return cartao;
}

async function carregarAssistente(ctx) {
  const form = el('form', 'panel-card question-form');
  form.id = 'question-form';
  const pergunta = el('textarea');
  pergunta.name = 'pergunta';
  pergunta.rows = 3;
  pergunta.maxLength = 1000;
  const status = el('p', 'muted role-hint');
  const enviar = el('button', 'button button-primary', 'Perguntar');
  enviar.type = 'submit';
  form.append(campo('Pergunta à base de conhecimento', pergunta), status, enviar);

  const exemplos = el('div', 'example-list');
  exemplos.append(el('p', 'muted role-hint', 'Perguntas de exemplo:'));
  const historico = el('div', 'history-list');

  const avisar = (texto, erro = false) => {
    status.textContent = texto;
    status.setAttribute('role', erro ? 'alert' : 'status');
    status.dataset.kind = erro ? 'error' : 'info';
  };
  const desenhar = () => {
    exemplos.hidden = state.historico.length > 0;
    historico.replaceChildren(...state.historico.map(cartaoDaResposta));
  };

  const perguntar = async (texto) => {
    const consulta = String(texto || '').trim();
    if (consulta.length < PERGUNTA_MINIMA) return avisar(`A pergunta precisa ter pelo menos ${PERGUNTA_MINIMA} caracteres.`, true);
    enviar.disabled = true;
    avisar('Consultando a base de conhecimento…');
    try {
      const resposta = await api('/web/v1/consultas', { method: 'POST', body: JSON.stringify({ pergunta: consulta, usarRecuperacao: true }) });
      state.historico.unshift({ pergunta: consulta, ...resposta });
      pergunta.value = '';
      if (ctx.ativa()) {
        avisar('');
        desenhar();
      }
    } catch (erro) {
      if (ctx.ativa()) avisar(erro.message, true);
    } finally {
      enviar.disabled = false;
    }
  };

  for (const exemplo of PERGUNTAS_DE_EXEMPLO) {
    const botao = el('button', 'button button-light', exemplo);
    botao.type = 'button';
    botao.addEventListener('click', () => perguntar(exemplo));
    exemplos.append(botao);
  }
  form.addEventListener('submit', (evento) => {
    evento.preventDefault();
    return perguntar(new FormData(form).get('pergunta'));
  });

  const raiz = el('div', 'assistant');
  raiz.append(form, exemplos, historico);
  desenhar();
  ctx.corpo.replaceChildren(raiz);
}

/* ===== 10. DESENHO ===== */

const NIVEIS = {
  NORMAL: 'Normal',
  OBSERVACAO: 'Observação',
  ATENCAO: 'Atenção',
  ALTA_ATENCAO: 'Alta atenção',
};

function rotuloNivel(nivel) {
  return NIVEIS[nivel] || String(nivel || 'Sem dado').replaceAll('_', ' ');
}

/** Etiqueta colorida do nível de atenção. A cor vem do CSS, por `data-level`. */
function chipNivel(nivel) {
  const chip = el('span', 'level-chip', rotuloNivel(nivel));
  chip.dataset.level = nivel || 'DESCONHECIDO';
  return chip;
}

/* Rótulos em português dos valores que o BFF devolve em MAIÚSCULAS. */
const ROTULOS = {
  PENDENTE: 'Pendente',
  CONFIRMADA: 'Confirmada',
  EM_EXECUCAO: 'Em execução',
  CONCLUIDA: 'Concluída',
  REJEITADA: 'Rejeitada',
  CANCELADA: 'Cancelada',
  AGUARDANDO_EQUIPE: 'Aguardando equipe',
  AGUARDANDO_RECURSO: 'Aguardando recurso',
  COMPENSANDO: 'Compensando',
  COMPENSADA: 'Compensada',
  ABERTA: 'Aberta',
  RECONHECIDA: 'Reconhecida',
  ENCERRADA: 'Encerrada',
  OBSERVADO: 'Observado',
  PREVISTO: 'Previsto',
  VISTORIA: 'Vistoria',
  LIMPEZA_DRENAGEM: 'Limpeza de drenagem',
  DESOBSTRUCAO: 'Desobstrução',
  INSPECAO_PONTO_CRITICO: 'Inspeção de ponto crítico',
  DRENAGEM: 'Drenagem',
  GERAL: 'Geral',
  MANHA: 'Manhã',
  TARDE: 'Tarde',
  NOITE: 'Noite',
  CAMINHAO_HIDROJATO: 'Caminhão hidrojato',
  RETROESCAVADEIRA: 'Retroescavadeira',
  CAMINHONETE: 'Caminhonete',
  BOMBA_SUCCAO: 'Bomba de sucção',
  KIT_VISTORIA: 'Kit de vistoria',
  RESIDENCIAL: 'Residencial',
  COMERCIAL: 'Comercial',
  MISTA: 'Mista',
  INDUSTRIAL: 'Industrial',
  RURAL: 'Rural',
};

function rotuloTexto(valor) {
  if (valor == null || valor === '') return '—';
  return ROTULOS[valor] || String(valor).replaceAll('_', ' ');
}

/** Etiqueta do estado de uma ação, sinalização ou SAGA. A cor vem do CSS, por `data-estado`. */
function chipEstado(estado) {
  const chip = el('span', 'state-chip', rotuloTexto(estado));
  chip.dataset.estado = estado || 'DESCONHECIDO';
  return chip;
}

/** Origem de uma resposta ou síntese: LLM, CACHE ou FALLBACK. */
function etiquetaOrigem(origem) {
  const etiqueta = el('span', 'origin-tag', origem ? `Origem: ${origem}` : 'Origem não informada');
  etiqueta.dataset.origem = origem || 'DESCONHECIDA';
  return etiqueta;
}

/** Cria um elemento SVG; `class` vai por atributo porque `className` é somente leitura em SVG. */
function elSvg(tag, atributos = {}) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [nome, valor] of Object.entries(atributos)) node.setAttribute(nome, valor);
  return node;
}

/** Rótulo e controle de formulário. */
function campo(rotulo, controle, largo = false) {
  const label = el('label', largo ? 'wide-field' : null);
  label.append(el('span', null, rotulo), controle);
  return label;
}

function formatarData(iso) {
  const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  return partes ? `${partes[3]}/${partes[2]}/${partes[1]}` : '—';
}

function formatarDataHora(iso) {
  if (!iso) return '—';
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return String(iso);
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(data);
}

/** Regiões do painel, ou lista vazia se o painel falhar: as telas só precisam delas para mostrar nomes. */
async function regioesDoPainel() {
  try {
    const painel = await api(URL_PAINEL);
    return Array.isArray(painel.regioes) ? painel.regioes : [];
  } catch {
    return [];
  }
}

function mapaDeNomes(regioes) {
  return new Map(regioes.map((regiao) => [regiao.regiaoId, regiao.nome]));
}

/* ===== 11. INICIALIZAÇÃO ===== */

function registrarEventos() {
  $('login-button').addEventListener('click', () => login().catch((error) => showNotice(error.message, 'error')));
  $('logout-button').addEventListener('click', logout);
  $('menu-toggle').addEventListener('click', alternarMenu);
  for (const nome of Object.keys(TELAS)) $(`nav-${nome}`).addEventListener('click', fecharMenu);
  window.addEventListener('hashchange', navegar);
}

async function initialize() {
  registrarEventos();
  const query = new URLSearchParams(window.location.search);
  if (query.has('error')) throw new Error(query.get('error_description') || 'O Keycloak não concluiu o login.');
  if (query.has('code')) await trocarCodigo(query.get('code'), query.get('state'));
  updateIdentity();
  await navegar();
}

initialize().catch((error) => {
  showNotice(error.message, 'error');
  return navegar();
});
