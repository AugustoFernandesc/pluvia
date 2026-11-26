const assert = require('node:assert/strict');
const { createHash, webcrypto } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');

class ElementStub {
  constructor(id) {
    this.id = id;
    this.dataset = {};
    this.listeners = new Map();
    this.children = [];
    this.hidden = false;
    this.disabled = false;
    this.value = '';
    this.textContent = '';
    this.attributes = {};
    this.values = {};
    this.className = '';
    this.classes = new Set();
    this.elements = id === 'action-form' ? { data: { value: '' } } : {};
    const classes = this.classes;
    this.classList = {
      add: (...names) => names.forEach((name) => classes.add(name)),
      remove: (...names) => names.forEach((name) => classes.delete(name)),
      contains: (name) => classes.has(name),
      toggle: (name, force) => {
        const add = force === undefined ? !classes.has(name) : Boolean(force);
        if (add) classes.add(name); else classes.delete(name);
        return add;
      },
    };
  }

  addEventListener(name, listener) {
    this.listeners.set(name, listener);
  }

  append(...children) {
    this.children.push(...children);
  }

  replaceChildren(...children) {
    this.children = [...children];
    this.textContent = '';
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

  getAttribute(name) {
    return this.attributes[name] ?? null;
  }

  removeAttribute(name) {
    delete this.attributes[name];
  }

  querySelector(selector) {
    if (!this.descendants) this.descendants = new Map();
    if (!this.descendants.has(selector)) {
      this.descendants.set(selector, new ElementStub(`${this.id}:${selector}`));
    }
    return this.descendants.get(selector);
  }
}

class DocumentStub {
  constructor() {
    this.elements = new Map();
  }

  getElementById(id) {
    if (!this.elements.has(id)) this.elements.set(id, new ElementStub(id));
    return this.elements.get(id);
  }

  createElement(tag) {
    return new ElementStub(tag);
  }

  createElementNS(namespace, tag) {
    const element = new ElementStub(tag);
    element.namespaceURI = namespace;
    return element;
  }

  querySelector(selector) {
    return this.getElementById(selector);
  }
}

function storageStub(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
    values,
  };
}

function makeJwt(payload) {
  return `e30.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.signature`;
}

/**
 * Relógio controlado pelo teste: `Date.now()`, `setTimeout` e `clearTimeout` do app.js passam por aqui.
 * `avancar(ms)` roda os timers vencidos na ordem e espera a cadeia de promises de cada um terminar.
 */
function relogioFalso() {
  let agora = Date.now();
  let proximoId = 1;
  const timers = new Map();
  class DateFalso extends Date {
    constructor(...args) {
      if (args.length === 0) super(agora);
      else super(...args);
    }

    static now() {
      return agora;
    }
  }
  return {
    DateFalso,
    agora: () => agora,
    pendentes: () => timers.size,
    setTimeout: (funcao, ms = 0) => {
      const id = proximoId++;
      timers.set(id, { funcao, em: agora + ms });
      return id;
    },
    clearTimeout: (id) => { timers.delete(id); },
    async avancar(ms) {
      const alvo = agora + ms;
      for (;;) {
        const vencidos = [...timers.entries()].filter(([, timer]) => timer.em <= alvo).sort((a, b) => a[1].em - b[1].em);
        if (vencidos.length === 0) break;
        const [id, timer] = vencidos[0];
        timers.delete(id);
        agora = Math.max(agora, timer.em);
        timer.funcao();
        for (let rodada = 0; rodada < 3; rodada += 1) await settle();
      }
      agora = alvo;
    },
  };
}

function browserContext({ location = {}, session = {}, fetchImpl = async () => { throw new Error('Unexpected fetch'); } } = {}) {
  const relogio = relogioFalso();
  const document = new DocumentStub();
  document.getElementById('loading-state').hidden = true;
  document.getElementById('summary-content').hidden = true;
  const sessionStorage = storageStub(session);
  const assigned = [];
  const replacements = [];
  const windowListeners = new Map();
  const window = {
    location: {
      origin: location.origin || 'http://localhost:5173',
      pathname: location.pathname || '/',
      search: location.search || '',
      hash: location.hash || '',
      assign: (url) => assigned.push(String(url)),
    },
    listeners: windowListeners,
    addEventListener: (name, listener) => windowListeners.set(name, listener),
  };
  const fetchCalls = [];
  const context = vm.createContext({
    window,
    document,
    sessionStorage,
    history: { replaceState: (...args) => replacements.push(args) },
    crypto: webcrypto,
    fetch: (url, options = {}) => {
      fetchCalls.push({ url: String(url), options });
      return fetchImpl(String(url), options);
    },
    Headers,
    Response,
    URL,
    URLSearchParams,
    TextEncoder,
    Intl,
    Date: relogio.DateFalso,
    setTimeout: relogio.setTimeout,
    clearTimeout: relogio.clearTimeout,
    FormData: class {
      constructor(form) { this.form = form; }
      get(name) { return this.form.values[name] ?? ''; }
    },
    atob: (value) => Buffer.from(value, 'base64').toString('binary'),
    btoa: (value) => Buffer.from(value, 'binary').toString('base64'),
    setInterval: () => 1,
    clearInterval: () => {},
    console,
  });
  return { context, document, window, sessionStorage, assigned, replacements, fetchCalls, relogio };
}

/** `setup` roda logo depois de o script carregar, antes de o roteador exibir a primeira tela. */
async function bootWeb(options = {}) {
  const browser = browserContext(options);
  const script = fs.readFileSync(path.join(ROOT, 'clients/web/app.js'), 'utf8');
  vm.runInContext(script, browser.context, { filename: 'clients/web/app.js' });
  if (options.setup) options.setup(browser);
  await new Promise((resolve) => setImmediate(resolve));
  return browser;
}

/** Executa código no escopo do app.js: dá acesso às funções e constantes de nível superior. */
function runInWeb(browser, code) {
  return vm.runInContext(code, browser.context);
}

/** Troca o hash e dispara o `hashchange`, como o navegador faz. */
async function irPara(browser, hash) {
  browser.window.location.hash = hash;
  await browser.window.listeners.get('hashchange')();
}

/** `rotas(url, options)` responde às chamadas ao BFF: devolve uma Response, ou undefined para a URL não prevista. */
async function bootWebComSessao({ roles = ['GESTOR'], username = 'gestora-demo', hash = '', setup, rotas } = {}) {
  const nonce = 'nonce-de-teste';
  const accessToken = makeJwt({ preferred_username: username, realm_access: { roles } });
  const browser = await bootWeb({
    location: { search: '?code=authorization-code&state=state-de-teste', hash },
    session: { 'pluvia.pkce': 'verifier-de-teste', 'pluvia.nonce': nonce, 'pluvia.state': 'state-de-teste' },
    fetchImpl: async (url, options) => {
      if (url.endsWith('/token')) {
        return new Response(JSON.stringify({ access_token: accessToken, id_token: makeJwt({ nonce }), expires_in: 300 }), { status: 200 });
      }
      const resposta = rotas && await rotas(url, options);
      if (resposta) return resposta;
      throw new Error(`Unexpected Web URL: ${url}`);
    },
    setup,
  });
  await settle();
  return { browser, accessToken };
}

async function settle() {
  await Promise.resolve();
  await new Promise((resolve) => setImmediate(resolve));
  await Promise.resolve();
}

test('Web inicia login Authorization Code com PKCE S256, state e nonce', async () => {
  const browser = await bootWeb();
  const login = browser.document.getElementById('login-button').listeners.get('click');
  await login();

  assert.equal(browser.assigned.length, 1);
  const authorization = new URL(browser.assigned[0]);
  const query = authorization.searchParams;
  const verifier = browser.sessionStorage.getItem('pluvia.pkce');
  assert.equal(authorization.origin, 'http://localhost:8000');
  assert.equal(authorization.pathname, '/auth/realms/pluvia/protocol/openid-connect/auth');
  assert.equal(query.get('client_id'), 'pluvia-web');
  assert.equal(query.get('response_type'), 'code');
  assert.equal(query.get('code_challenge_method'), 'S256');
  assert.equal(query.get('code_challenge'), createHash('sha256').update(verifier).digest('base64url'));
  assert.equal(query.get('state'), browser.sessionStorage.getItem('pluvia.state'));
  assert.equal(query.get('nonce'), browser.sessionStorage.getItem('pluvia.nonce'));
  assert.equal(query.has('client_secret'), false);
});

test('Web valida callback, identifica o GESTOR e chama a API com o token, propagando o erro do serviço', async () => {
  const nonce = 'nonce-de-teste';
  const verifier = 'verifier-de-teste';
  const accessToken = makeJwt({
    preferred_username: 'gestora-demo',
    realm_access: { roles: ['GESTOR'] },
  });
  const idToken = makeJwt({ nonce });
  const browser = await bootWeb({
    location: { search: '?code=authorization-code&state=state-de-teste' },
    session: {
      'pluvia.pkce': verifier,
      'pluvia.nonce': nonce,
      'pluvia.state': 'state-de-teste',
    },
    fetchImpl: async (url, options) => {
      if (url.endsWith('/token')) {
        const form = new URLSearchParams(options.body);
        assert.equal(form.get('grant_type'), 'authorization_code');
        assert.equal(form.get('code_verifier'), verifier);
        return new Response(JSON.stringify({ access_token: accessToken, id_token: idToken, refresh_token: 'refresh', expires_in: 300 }), { status: 200 });
      }
      if (url.endsWith('/web/v1/painel?municipio=Lavras')) {
        assert.equal(new Headers(options.headers).get('authorization'), `Bearer ${accessToken}`);
        return new Response(JSON.stringify({ regioes: [], contadores: { porNivel: {} } }), { status: 200 });
      }
      if (url.endsWith('/web/v1/consultas')) {
        assert.equal(new Headers(options.headers).get('authorization'), `Bearer ${accessToken}`);
        return new Response(JSON.stringify({ status: 503, detail: 'Análise temporariamente indisponível.' }), {
          status: 503,
          headers: { 'content-type': 'application/problem+json' },
        });
      }
      throw new Error(`Unexpected Web URL: ${url}`);
    },
  });
  await settle();

  assert.equal(browser.fetchCalls.length, 2, 'troca do código e, em seguida, o painel da Visão geral');
  assert.equal(browser.sessionStorage.getItem('pluvia.state'), null);
  assert.deepEqual(browser.replacements.at(-1), [null, '', '/']);
  assert.match(browser.document.getElementById('identity').textContent, /gestora-demo.*GESTOR/);
  assert.equal(browser.document.getElementById('login-button').hidden, true);
  assert.equal(browser.document.getElementById('logout-button').hidden, false);
  assert.equal(runInWeb(browser, "temPerfil('GESTOR')"), true);

  assert.deepEqual(await runInWeb(browser, "api('/web/v1/painel?municipio=Lavras')"), { regioes: [], contadores: { porNivel: {} } });
  await assert.rejects(
    runInWeb(browser, "api('/web/v1/consultas', { method: 'POST', body: '{}' })"),
    /Análise temporariamente indisponível/,
  );
  assert.equal(browser.fetchCalls.length, 4);
});

test('Web rejeita state incorreto sem trocar o código e identifica o perfil TECNICO', async () => {
  const browser = await bootWeb({
    location: { search: '?code=authorization-code&state=incorreto' },
    session: {
      'pluvia.pkce': 'verifier',
      'pluvia.nonce': 'nonce',
      'pluvia.state': 'state-esperado',
    },
  });
  await settle();
  assert.equal(browser.fetchCalls.length, 0);
  assert.equal(browser.document.getElementById('notice').hidden, false);
  assert.equal(browser.sessionStorage.getItem('pluvia.pkce'), null);

  const accessToken = makeJwt({ preferred_username: 'tecnico-demo', realm_access: { roles: ['TECNICO'] } });
  const idToken = makeJwt({ nonce: 'nonce-tecnico' });
  const tecnico = await bootWeb({
    location: { search: '?code=authorization-code&state=state-tecnico' },
    session: { 'pluvia.pkce': 'verifier', 'pluvia.nonce': 'nonce-tecnico', 'pluvia.state': 'state-tecnico' },
    fetchImpl: async (url) => url.endsWith('/token')
      ? new Response(JSON.stringify({ access_token: accessToken, id_token: idToken, expires_in: 300 }), { status: 200 })
      : new Response(JSON.stringify({ regioes: [], contadores: { porNivel: {} } }), { status: 200 }),
  });
  await settle();
  assert.match(tecnico.document.getElementById('identity').textContent, /tecnico-demo.*TECNICO/);
  assert.equal(runInWeb(tecnico, "temPerfil('GESTOR')"), false);
  assert.equal(runInWeb(tecnico, "temPerfil('TECNICO')"), true);
});

test('Web renova token expirado e encerra a sessão pelo endpoint OIDC', async () => {
  const nonce = 'nonce-refresh';
  const expiredToken = makeJwt({ preferred_username: 'gestora-demo', realm_access: { roles: ['GESTOR'] } });
  const refreshedToken = makeJwt({ preferred_username: 'gestora-demo', realm_access: { roles: ['GESTOR'] } });
  const idToken = makeJwt({ nonce });
  const browser = await bootWeb({
    location: { search: '?code=authorization-code&state=state-refresh' },
    session: { 'pluvia.pkce': 'verifier', 'pluvia.nonce': nonce, 'pluvia.state': 'state-refresh' },
    fetchImpl: async (url, options) => {
      if (url.endsWith('/token')) {
        const form = new URLSearchParams(options.body);
        if (form.get('grant_type') === 'authorization_code') {
          return new Response(JSON.stringify({ access_token: expiredToken, id_token: idToken, refresh_token: 'refresh-token', expires_in: 1 }), { status: 200 });
        }
        assert.equal(form.get('grant_type'), 'refresh_token');
        assert.equal(form.get('refresh_token'), 'refresh-token');
        return new Response(JSON.stringify({ access_token: refreshedToken, id_token: idToken, refresh_token: 'rotated-refresh', expires_in: 300 }), { status: 200 });
      }
      if (url.endsWith('/web/v1/painel?municipio=Lavras')) {
        assert.equal(new Headers(options.headers).get('authorization'), `Bearer ${refreshedToken}`);
        return new Response(JSON.stringify({ regioes: [], contadores: { porNivel: {} } }), { status: 200 });
      }
      throw new Error(`Unexpected OIDC URL: ${url}`);
    },
  });
  await settle();
  assert.equal(browser.fetchCalls.length, 3, 'troca do código, renovação do token vencido e o painel da Visão geral');
  assert.equal(new URLSearchParams(browser.fetchCalls[1].options.body).get('grant_type'), 'refresh_token');

  await runInWeb(browser, "api('/web/v1/painel?municipio=Lavras')");
  assert.equal(browser.fetchCalls.length, 4);

  browser.document.getElementById('logout-button').listeners.get('click')();
  const logoutUrl = new URL(browser.assigned.at(-1));
  assert.equal(logoutUrl.pathname, '/auth/realms/pluvia/protocol/openid-connect/logout');
  assert.equal(logoutUrl.searchParams.get('client_id'), 'pluvia-web');
  assert.equal(logoutUrl.searchParams.get('id_token_hint'), idToken);
  assert.equal(logoutUrl.searchParams.get('post_logout_redirect_uri'), 'http://localhost:5173/');
  assert.equal(browser.document.getElementById('identity').textContent, 'Acesso da equipe');
  assert.equal(browser.document.getElementById('login-button').hidden, false);
  assert.equal(browser.document.getElementById('logout-button').hidden, true);
  assert.equal(browser.document.getElementById('body-visao-geral').children[0].textContent, 'Entre para ver os dados.');
});

const TELAS_WEB = ['visao-geral', 'sinalizacoes', 'acoes', 'assistente'];

function telasVisiveis(browser) {
  return TELAS_WEB.filter((tela) => browser.document.getElementById(`screen-${tela}`).hidden === false);
}

test('Web sem sessão mostra o convite em cada tela e não chama o BFF', async () => {
  const browser = await bootWeb();
  await settle();
  assert.deepEqual(telasVisiveis(browser), ['visao-geral']);
  for (const tela of TELAS_WEB) {
    if (tela !== 'visao-geral') await irPara(browser, `#/${tela}`);
    assert.deepEqual(telasVisiveis(browser), [tela]);
    assert.equal(browser.document.getElementById(`body-${tela}`).children[0].textContent, 'Entre para ver os dados.');
  }
  assert.equal(browser.fetchCalls.length, 0);
});

test('Web troca de tela pelo hash, marca o item ativo e cai em Visão geral para rota desconhecida', async () => {
  const { browser } = await bootWebComSessao();
  assert.deepEqual(telasVisiveis(browser), ['visao-geral']);
  assert.equal(browser.document.getElementById('nav-visao-geral').getAttribute('aria-current'), 'page');

  await irPara(browser, '#/acoes');
  assert.deepEqual(telasVisiveis(browser), ['acoes']);
  assert.equal(browser.document.getElementById('nav-acoes').getAttribute('aria-current'), 'page');
  assert.equal(browser.document.getElementById('nav-visao-geral').getAttribute('aria-current'), null);

  await irPara(browser, '#/acoes/7a3e5b20');
  assert.deepEqual(telasVisiveis(browser), ['acoes']);
  assert.equal(browser.document.getElementById('nav-acoes').getAttribute('aria-current'), 'page');
  assert.deepEqual(JSON.parse(runInWeb(browser, 'JSON.stringify(rotaDoHash("#/acoes/7a3e5b20"))')), { tela: 'acoes', param: '7a3e5b20' });

  await irPara(browser, '#/nao-existe');
  assert.deepEqual(telasVisiveis(browser), ['visao-geral']);
  assert.equal(browser.document.getElementById('nav-visao-geral').getAttribute('aria-current'), 'page');
});

test('Web carrega os dados da tela sob demanda, com estado de carregamento', async () => {
  const chamadas = [];
  let concluir;
  const { browser } = await bootWebComSessao({
    hash: '#/sinalizacoes',
    setup: (booted) => {
      booted.context.chamadas = chamadas;
      booted.context.espera = new Promise((resolve) => { concluir = resolve; });
      runInWeb(booted, 'TELAS.sinalizacoes.carregar = async (ctx) => { chamadas.push(ctx.tela); await espera; ctx.corpo.replaceChildren(el("p", "", "dados")); }');
      runInWeb(booted, 'TELAS.assistente.carregar = async (ctx) => { chamadas.push(ctx.tela); }');
    },
  });
  assert.deepEqual(chamadas, ['sinalizacoes']);
  assert.deepEqual(telasVisiveis(browser), ['sinalizacoes']);
  assert.equal(browser.document.getElementById('body-sinalizacoes').children[0].textContent, 'Carregando…');
  concluir();
  await settle();
  assert.equal(browser.document.getElementById('body-sinalizacoes').children[0].textContent, 'dados');

  await irPara(browser, '#/assistente');
  assert.deepEqual(chamadas, ['sinalizacoes', 'assistente']);
});

test('Web mostra o detail do erro do BFF na tela e mantém a navegação funcionando', async () => {
  const { browser } = await bootWebComSessao({
    setup: (booted) => {
      runInWeb(booted, "TELAS['visao-geral'].carregar = async () => { await api('/web/v1/painel'); }");
      runInWeb(booted, 'TELAS.acoes.carregar = async (ctx) => { ctx.corpo.replaceChildren(el("p", "", "lista de ações")); }');
    },
  });
  browser.fetchCalls.length = 0;
  const fetchOriginal = browser.context.fetch;
  browser.context.fetch = async (url, options) => {
    browser.fetchCalls.push({ url: String(url), options });
    return new Response(JSON.stringify({ title: 'Erro', detail: 'Risco indisponível no momento.' }), { status: 503, headers: { 'content-type': 'application/problem+json' } });
  };
  await irPara(browser, '#/visao-geral');
  const corpo = browser.document.getElementById('body-visao-geral');
  assert.equal(corpo.children[0].textContent, 'Risco indisponível no momento.');
  assert.equal(corpo.children[0].getAttribute('role'), 'alert');

  await irPara(browser, '#/acoes');
  assert.deepEqual(telasVisiveis(browser), ['acoes']);
  assert.equal(browser.document.getElementById('body-acoes').children[0].textContent, 'lista de ações');
  browser.context.fetch = fetchOriginal;
});

test('Web executa as limpezas registradas pela tela ao sair dela', async () => {
  const { browser } = await bootWebComSessao({
    setup: (booted) => {
      booted.context.limpezas = [];
      runInWeb(booted, "TELAS['visao-geral'].carregar = async (ctx) => { ctx.aoSair(() => limpezas.push('visao-geral')); }");
    },
  });
  assert.deepEqual(runInWeb(browser, 'limpezas'), []);
  await irPara(browser, '#/assistente');
  assert.deepEqual(runInWeb(browser, 'limpezas'), ['visao-geral']);
});

test('Web recolhe o menu abaixo de 900 px e fecha ao escolher uma tela', async () => {
  const browser = await bootWeb();
  const sidenav = browser.document.getElementById('sidenav');
  const toggle = browser.document.getElementById('menu-toggle');
  toggle.listeners.get('click')();
  assert.equal(sidenav.classList.contains('is-open'), true);
  assert.equal(toggle.getAttribute('aria-expanded'), 'true');
  await irPara(browser, '#/acoes');
  assert.equal(sidenav.classList.contains('is-open'), false);
  assert.equal(toggle.getAttribute('aria-expanded'), 'false');
});

test('index.html declara a navegação lateral, as 4 telas e a barra recolhível', () => {
  const html = fs.readFileSync(path.join(ROOT, 'clients/web/index.html'), 'utf8');
  const css = fs.readFileSync(path.join(ROOT, 'clients/web/styles.css'), 'utf8');
  for (const tela of TELAS_WEB) {
    assert.match(html, new RegExp(`id="nav-${tela}" href="#/${tela}"`));
    assert.match(html, new RegExp(`id="screen-${tela}"`));
    assert.match(html, new RegExp(`id="body-${tela}"`));
  }
  assert.match(html, /id="menu-toggle"[^>]*aria-expanded="false"/);
  assert.match(css, /@media \(max-width: 899px\)[\s\S]*\.menu-toggle\s*\{\s*display:\s*block/);
});

test('styles.css faz o atributo hidden vencer o display das classes, como o do botão Entrar', () => {
  const css = fs.readFileSync(path.join(ROOT, 'clients/web/styles.css'), 'utf8');
  assert.match(css, /^\[hidden\]\s*\{\s*display:\s*none\s*!important;?\s*\}/m);
});

/* ---------- Telas do painel web: dados de teste e utilitários de árvore ---------- */

const SVG_NS = 'http://www.w3.org/2000/svg';
const API = 'http://localhost:8000';
const ID_CENTRO = '11111111-1111-4111-8111-111111111111';
const ID_AGUA_LIMPA = '22222222-2222-4222-8222-222222222222';
const ID_VALE = '33333333-3333-4333-8333-333333333333';
const ID_ACAO = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ID_SINAL_1 = 'b1111111-1111-4111-8111-111111111111';
const ID_SINAL_2 = 'b2222222-2222-4222-8222-222222222222';
const ID_SINAL_3 = 'b3333333-3333-4333-8333-333333333333';
const ID_SINAL_4 = 'b4444444-4444-4444-8444-444444444444';

function descendentes(raiz) {
  return raiz.children.flatMap((filho) => [filho, ...descendentes(filho)]);
}

function classesDe(no) {
  return `${no.className || ''} ${no.attributes.class || ''}`.split(/\s+/);
}

function porClasse(raiz, classe) {
  return descendentes(raiz).filter((no) => classesDe(no).includes(classe));
}

function porId(raiz, id) {
  return descendentes(raiz).find((no) => no.id === id);
}

function textoDe(no) {
  return [no.textContent, ...no.children.map(textoDe)].filter(Boolean).join(' ');
}

function corpoDe(browser, tela) {
  return browser.document.getElementById(`body-${tela}`);
}

function json(corpo, status = 200) {
  return new Response(JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json' } });
}

function problema(status, detail) {
  return new Response(JSON.stringify({ status, detail }), { status, headers: { 'content-type': 'application/problem+json' } });
}

function caminhoDe(url) {
  return url.replace(API, '');
}

function quadrado(lon, lat, lado = 0.01) {
  return { type: 'Polygon', coordinates: [[[lon, lat], [lon + lado, lat], [lon + lado, lat + lado], [lon, lat + lado], [lon, lat]]] };
}

function regiaoDoPainel(regiaoId, nome, nivelAtencao, geometria) {
  return { regiaoId, nome, codigo: `LAV-${nome}`, geometria, nivelAtencao, sinalizacoesAbertas: 1, acoesAbertas: 0, atualizadoEm: '2026-11-25T12:00:00Z' };
}

function regioesComGeometria() {
  return [
    regiaoDoPainel(ID_CENTRO, 'Centro', 'ALTA_ATENCAO', quadrado(-45.0, -21.25)),
    regiaoDoPainel(ID_AGUA_LIMPA, 'Água Limpa', 'ATENCAO', quadrado(-44.98, -21.25)),
    regiaoDoPainel(ID_VALE, 'Vale', 'NORMAL', quadrado(-45.0, -21.27)),
  ];
}

function painel(regioes, extra = {}) {
  return {
    regioes,
    contadores: { porNivel: { NORMAL: 1, OBSERVACAO: 0, ATENCAO: 1, ALTA_ATENCAO: 1 }, sinalizacoesAbertas: 3, acoesEmAndamento: 2 },
    atualizadoEm: '2026-11-25T12:00:00Z',
    avisos: [],
    ...extra,
  };
}

function acaoDoBff(id, estado, extra = {}) {
  return {
    id, regiaoId: ID_CENTRO, tipo: 'VISTORIA', data: '2026-11-30', turno: 'MANHA', especialidade: 'GERAL', categoriaRecurso: 'KIT_VISTORIA',
    descricao: null, estado, motivoRejeicao: null, motivoCancelamento: null, criadaEm: '2026-11-26T10:00:00Z', ...extra,
  };
}

/* ---------- Tela de Ações (SAGA) ---------- */

test('Web Ações agrupa a lista por estado e convida a abrir a primeira ação quando está vazia', async () => {
  let acoes = [
    acaoDoBff('a0000001-0000-4000-8000-000000000001', 'PENDENTE'),
    acaoDoBff('a0000002-0000-4000-8000-000000000002', 'CONFIRMADA', { tipo: 'LIMPEZA_DRENAGEM', turno: 'TARDE' }),
    acaoDoBff('a0000003-0000-4000-8000-000000000003', 'PENDENTE', { regiaoId: ID_VALE }),
    acaoDoBff('a0000004-0000-4000-8000-000000000004', 'REJEITADA'),
  ];
  const { browser } = await bootWebComSessao({
    hash: '#/acoes',
    rotas: (url) => {
      if (url.endsWith('/web/v1/painel?municipio=Lavras')) return json(painel(regioesComGeometria()));
      if (url.endsWith('/web/v1/acoes?tamanho=100')) return json({ itens: acoes, pagina: 1, tamanho: 100, total: acoes.length });
      return undefined;
    },
  });
  const corpo = corpoDe(browser, 'acoes');
  const grupos = porClasse(corpo, 'acao-grupo');
  assert.deepEqual(grupos.map((grupo) => grupo.dataset.estado), ['PENDENTE', 'CONFIRMADA', 'REJEITADA']);
  assert.deepEqual(grupos.map((grupo) => textoDe(grupo.children[0])), ['Pendente (2)', 'Confirmada (1)', 'Rejeitada (1)']);

  const [primeira, segunda] = porClasse(grupos[0], 'acao-item');
  assert.equal(primeira.getAttribute('href'), '#/acoes/a0000001-0000-4000-8000-000000000001');
  assert.match(textoDe(primeira), /Vistoria.*Centro.*30\/11\/2026.*Manhã.*Pendente/);
  assert.match(textoDe(segunda), /Vale/);
  assert.match(textoDe(porClasse(grupos[1], 'acao-item')[0]), /Limpeza de drenagem.*Tarde/);

  acoes = [];
  await irPara(browser, '#/acoes');
  assert.equal(porClasse(corpo, 'acao-grupo').length, 0);
  assert.match(textoDe(corpo), /Nenhuma ação ainda.*primeira ação preventiva/);
});

test('Web Ações: o GESTOR abre a ação com Idempotency-Key e vai para o detalhe; o erro do BFF mantém o formulário', async () => {
  let recusar = true;
  const { browser } = await bootWebComSessao({
    hash: '#/acoes',
    rotas: (url, options) => {
      if (url.endsWith('/web/v1/painel?municipio=Lavras')) return json(painel(regioesComGeometria()));
      if (url.endsWith('/web/v1/acoes?tamanho=100')) return json({ itens: [], pagina: 1, tamanho: 100, total: 0 });
      if (url.endsWith('/web/v1/acoes') && options.method === 'POST') {
        return recusar ? problema(422, 'A região não aceita ações neste turno.') : json(acaoDoBff(ID_ACAO, 'PENDENTE'), 202);
      }
      return undefined;
    },
  });
  const corpo = corpoDe(browser, 'acoes');
  const form = porId(corpo, 'action-form');
  assert.ok(form, 'o GESTOR vê o formulário de nova ação');
  form.values = {
    regiaoId: ID_CENTRO, tipo: 'VISTORIA', data: '2026-12-01', turno: 'MANHA', especialidade: 'GERAL', categoriaRecurso: 'KIT_VISTORIA', descricao: ' Vistoria de rotina ',
  };
  const enviar = form.listeners.get('submit');
  const evento = { preventDefault() {} };

  await enviar(evento);
  const [recusado] = browser.fetchCalls.filter((chamada) => chamada.options.method === 'POST' && chamada.url.endsWith('/web/v1/acoes'));
  const erro = porClasse(form, 'form-error')[0];
  assert.equal(erro.hidden, false);
  assert.equal(erro.textContent, 'A região não aceita ações neste turno.');
  assert.equal(erro.getAttribute('role'), 'alert');
  assert.equal(form.values.descricao, ' Vistoria de rotina ');
  assert.equal(browser.window.location.hash, '#/acoes');

  recusar = false;
  await enviar(evento);
  const enviados = browser.fetchCalls.filter((chamada) => chamada.options.method === 'POST' && chamada.url.endsWith('/web/v1/acoes'));
  assert.equal(enviados.length, 2);
  const chave = new Headers(enviados[1].options.headers).get('idempotency-key');
  assert.match(chave, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.notEqual(chave, new Headers(recusado.options.headers).get('idempotency-key'));
  assert.deepEqual(JSON.parse(enviados[1].options.body), {
    regiaoId: ID_CENTRO, tipo: 'VISTORIA', data: '2026-12-01', turno: 'MANHA', especialidade: 'GERAL', categoriaRecurso: 'KIT_VISTORIA', descricao: 'Vistoria de rotina',
  });
  assert.equal(browser.window.location.hash, `#/acoes/${ID_ACAO}`);
});

test('Web Ações: o TECNICO não vê o formulário e recebe a indicação do perfil GESTOR', async () => {
  const { browser } = await bootWebComSessao({
    roles: ['TECNICO'],
    hash: '#/acoes',
    rotas: (url) => {
      if (url.endsWith('/web/v1/painel?municipio=Lavras')) return json(painel(regioesComGeometria()));
      if (url.endsWith('/web/v1/acoes?tamanho=100')) return json({ itens: [acaoDoBff(ID_ACAO, 'PENDENTE')], pagina: 1, tamanho: 100, total: 1 });
      return undefined;
    },
  });
  const corpo = corpoDe(browser, 'acoes');
  assert.equal(porId(corpo, 'action-form'), undefined);
  assert.match(textoDe(corpo), /Disponível para o perfil GESTOR/);
  assert.equal(porClasse(corpo, 'acao-item').length, 1);
});

test('Web Ações classifica os passos da SAGA em ida, recusa, compensação e ignorada', async () => {
  const { browser } = await bootWebComSessao();
  const passo = (mensagem, direcao, detalhe = null) => ({ mensagem, direcao, participante: 'EQUIPES', detalhe, registradoEm: '2026-11-26T10:00:00Z' });
  const casos = [
    [passo('ReservarEquipe', 'ENVIADA'), 'ida'],
    [passo('EquipeReservada', 'RECEBIDA'), 'ida'],
    [passo('ReservarRecurso', 'ENVIADA'), 'ida'],
    [passo('RecursoReservado', 'RECEBIDA'), 'ida'],
    [passo('ReservaEquipeRecusada', 'RECEBIDA', 'Sem equipe livre'), 'recusa'],
    [passo('ReservaRecursoRecusada', 'RECEBIDA', 'Sem recurso livre'), 'recusa'],
    [passo('LiberarEquipe', 'ENVIADA'), 'compensacao'],
    [passo('EquipeLiberada', 'RECEBIDA'), 'compensacao'],
    [passo('LiberarRecurso', 'ENVIADA'), 'compensacao'],
    [passo('RecursoLiberado', 'RECEBIDA'), 'compensacao'],
    [passo('ReservaRecursoRecusada', 'RECEBIDA', 'ReservaRecursoRecusada ignorada: a SAGA está em COMPENSANDO.'), 'ignorada'],
    [passo('EquipeReservada', 'RECEBIDA', 'EquipeReservada ignorada: a SAGA está em CONCLUIDA.'), 'ignorada'],
  ];
  browser.context.passos = casos.map(([item]) => item);
  const tipos = JSON.parse(runInWeb(browser, 'JSON.stringify(passos.map(tipoDoPasso))'));
  assert.deepEqual(tipos, casos.map(([, tipo]) => tipo));

  const raias = JSON.parse(runInWeb(browser, 'JSON.stringify(passos.map(raiaDoPasso))'));
  assert.deepEqual(raias, casos.map(([item]) => (item.direcao === 'ENVIADA' ? 'operacoes' : 'equipes')));
  browser.context.passoDaFrota = passo('ReservaRecursoRecusada', 'RECEBIDA');
  browser.context.passoDaFrota.participante = 'FROTA';
  assert.equal(runInWeb(browser, 'raiaDoPasso(passoDaFrota)'), 'frota');
});

function passoDaSaga(mensagem, direcao, participante, detalhe = null) {
  return { mensagem, direcao, participante, detalhe, registradoEm: '2026-11-26T10:00:00Z' };
}

const PASSOS_DA_COMPENSACAO = [
  passoDaSaga('ReservarEquipe', 'ENVIADA', 'EQUIPES'),
  passoDaSaga('EquipeReservada', 'RECEBIDA', 'EQUIPES'),
  passoDaSaga('ReservarRecurso', 'ENVIADA', 'FROTA'),
  passoDaSaga('ReservaRecursoRecusada', 'RECEBIDA', 'FROTA', 'Sem caminhão hidrojato livre'),
  passoDaSaga('LiberarEquipe', 'ENVIADA', 'EQUIPES'),
  passoDaSaga('EquipeLiberada', 'RECEBIDA', 'EQUIPES'),
  passoDaSaga('ReservaRecursoRecusada', 'RECEBIDA', 'FROTA', 'ReservaRecursoRecusada ignorada: a SAGA está em COMPENSADA.'),
];

function sagaDoBff(estado, passos, motivo = null) {
  return { sagaId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', acaoId: ID_ACAO, estado, motivo, passos, iniciadaEm: '2026-11-26T10:00:00Z', encerradaEm: null };
}

test('Web Ações desenha a linha do tempo da compensação e consulta a SAGA a cada 2 s até ela terminar', async () => {
  const sagas = [
    sagaDoBff('AGUARDANDO_EQUIPE', PASSOS_DA_COMPENSACAO.slice(0, 1)),
    sagaDoBff('AGUARDANDO_RECURSO', PASSOS_DA_COMPENSACAO.slice(0, 3)),
    sagaDoBff('COMPENSADA', PASSOS_DA_COMPENSACAO, 'Sem caminhão hidrojato livre'),
  ];
  let consultasDaSaga = 0;
  let consultasDaAcao = 0;
  const { browser } = await bootWebComSessao({
    hash: `#/acoes/${ID_ACAO}`,
    rotas: (url) => {
      const caminho = caminhoDe(url);
      if (caminho === '/web/v1/painel?municipio=Lavras') return json(painel(regioesComGeometria()));
      if (caminho === `/web/v1/acoes/${ID_ACAO}/saga`) return json(sagas[Math.min(consultasDaSaga++, sagas.length - 1)]);
      if (caminho === `/web/v1/acoes/${ID_ACAO}`) {
        const terminou = ++consultasDaAcao >= sagas.length;
        return json(acaoDoBff(ID_ACAO, terminou ? 'REJEITADA' : 'PENDENTE', terminou ? { motivoRejeicao: 'Sem caminhão hidrojato livre' } : {}));
      }
      return undefined;
    },
  });
  const corpo = corpoDe(browser, 'acoes');
  const passos = () => porClasse(corpo, 'timeline-step');
  assert.equal(consultasDaSaga, 1);
  assert.equal(passos().length, 1);
  assert.equal(browser.relogio.pendentes(), 1);
  assert.match(textoDe(corpo), /Pendente/);

  await browser.relogio.avancar(1999);
  assert.equal(consultasDaSaga, 1);
  await browser.relogio.avancar(1);
  assert.equal(consultasDaSaga, 2);
  assert.equal(passos().length, 3);
  assert.equal(browser.relogio.pendentes(), 1);

  await browser.relogio.avancar(2000);
  assert.equal(consultasDaSaga, 3);
  assert.deepEqual(passos().map((passo) => passo.dataset.tipo), ['ida', 'ida', 'ida', 'recusa', 'compensacao', 'compensacao', 'ignorada']);
  assert.deepEqual(passos().map((passo) => passo.dataset.raia), ['operacoes', 'equipes', 'operacoes', 'frota', 'operacoes', 'equipes', 'frota']);
  assert.deepEqual(porClasse(corpo, 'timeline-fluxo').map((no) => no.textContent), [
    'Operações → Equipes', 'Equipes → Operações', 'Operações → Frota', 'Frota → Operações', 'Operações → Equipes', 'Equipes → Operações', 'Frota → Operações',
  ]);
  assert.match(textoDe(passos()[3]), /ReservaRecursoRecusada.*Recusa.*Sem caminhão hidrojato livre/);
  assert.match(textoDe(passos()[4]), /LiberarEquipe.*Compensação/);
  assert.equal(porClasse(corpo, 'saga-motivo')[0].textContent, 'Motivo: Sem caminhão hidrojato livre');
  assert.match(textoDe(corpo), /Rejeitada/);
  assert.match(textoDe(corpo), /Motivo da rejeição.*Sem caminhão hidrojato livre/);
  assert.equal(browser.relogio.pendentes(), 0);

  await browser.relogio.avancar(10000);
  assert.equal(consultasDaSaga, 3);
});

test('Web Ações: no caminho feliz a linha do tempo mostra a ida e a consulta periódica nem começa', async () => {
  const ida = [
    passoDaSaga('ReservarEquipe', 'ENVIADA', 'EQUIPES'),
    passoDaSaga('EquipeReservada', 'RECEBIDA', 'EQUIPES'),
    passoDaSaga('ReservarRecurso', 'ENVIADA', 'FROTA'),
    passoDaSaga('RecursoReservado', 'RECEBIDA', 'FROTA'),
  ];
  const { browser } = await bootWebComSessao({
    hash: `#/acoes/${ID_ACAO}`,
    rotas: (url) => {
      const caminho = caminhoDe(url);
      if (caminho === '/web/v1/painel?municipio=Lavras') return json(painel(regioesComGeometria()));
      if (caminho === `/web/v1/acoes/${ID_ACAO}/saga`) return json(sagaDoBff('CONCLUIDA', ida));
      if (caminho === `/web/v1/acoes/${ID_ACAO}`) return json(acaoDoBff(ID_ACAO, 'CONFIRMADA'));
      return undefined;
    },
  });
  const corpo = corpoDe(browser, 'acoes');
  assert.deepEqual(porClasse(corpo, 'timeline-step').map((passo) => passo.dataset.tipo), ['ida', 'ida', 'ida', 'ida']);
  assert.match(textoDe(corpo), /Confirmada/);
  assert.equal(browser.relogio.pendentes(), 0);
});

test('Web Ações: sair do detalhe cancela a consulta periódica da SAGA', async () => {
  const { browser } = await bootWebComSessao({
    hash: `#/acoes/${ID_ACAO}`,
    rotas: (url) => {
      const caminho = caminhoDe(url);
      if (caminho === '/web/v1/painel?municipio=Lavras') return json(painel(regioesComGeometria()));
      if (caminho === `/web/v1/acoes/${ID_ACAO}/saga`) return json(sagaDoBff('AGUARDANDO_EQUIPE', PASSOS_DA_COMPENSACAO.slice(0, 1)));
      if (caminho === `/web/v1/acoes/${ID_ACAO}`) return json(acaoDoBff(ID_ACAO, 'PENDENTE'));
      return undefined;
    },
  });
  assert.equal(browser.relogio.pendentes(), 1);
  await irPara(browser, '#/assistente');
  assert.equal(browser.relogio.pendentes(), 0);
});

test('Web Ações: o TECNICO vê os dados da ação e a indicação do perfil GESTOR no lugar da SAGA', async () => {
  const { browser } = await bootWebComSessao({
    roles: ['TECNICO'],
    hash: `#/acoes/${ID_ACAO}`,
    rotas: (url) => {
      const caminho = caminhoDe(url);
      if (caminho === '/web/v1/painel?municipio=Lavras') return json(painel(regioesComGeometria()));
      if (caminho === `/web/v1/acoes/${ID_ACAO}`) return json(acaoDoBff(ID_ACAO, 'CONFIRMADA'));
      return undefined;
    },
  });
  const corpo = corpoDe(browser, 'acoes');
  assert.match(textoDe(corpo), /Vistoria.*Centro.*30\/11\/2026/);
  assert.match(textoDe(porClasse(corpo, 'saga-card')[0]), /Disponível para o perfil GESTOR/);
  assert.equal(porClasse(corpo, 'timeline-step').length, 0);
  assert.equal(browser.fetchCalls.some((chamada) => chamada.url.includes('/saga')), false);
  assert.equal(browser.relogio.pendentes(), 0);
});

/* ---------- Tela de Sinalizações (CQRS) ---------- */

function sinalizacaoDoBff(id, regiaoId, estado, nivelAtencao, origem, emitidaEm, extra = {}) {
  return { id, regiaoId, origem, nivelAtencao, motivo: `Motivo ${id.slice(0, 2)}`, fatores: [], estado, emitidaEm, reconhecidaPor: null, reconhecidaEm: null, encerradaEm: null, ...extra };
}

function sinalizacoesDeTeste() {
  return [
    sinalizacaoDoBff(ID_SINAL_1, ID_CENTRO, 'ABERTA', 'ALTA_ATENCAO', 'PREVISTO', '2026-11-25T12:00:00Z'),
    sinalizacaoDoBff(ID_SINAL_2, ID_AGUA_LIMPA, 'ABERTA', 'ATENCAO', 'OBSERVADO', '2026-11-24T12:00:00Z'),
    sinalizacaoDoBff(ID_SINAL_3, ID_AGUA_LIMPA, 'RECONHECIDA', 'ATENCAO', 'OBSERVADO', '2026-11-23T12:00:00Z', { reconhecidaEm: '2026-11-23T13:00:00Z' }),
    sinalizacaoDoBff(ID_SINAL_4, ID_VALE, 'ENCERRADA', 'NORMAL', 'OBSERVADO', '2026-11-22T12:00:00Z'),
  ];
}

function rotasDeSinalizacoes(sinalizacoes, extra = () => undefined) {
  return (url, options) => {
    const caminho = caminhoDe(url);
    if (caminho === '/web/v1/painel?municipio=Lavras') return json(painel(regioesComGeometria()));
    if (caminho === '/web/v1/sinalizacoes?tamanho=100') return json({ itens: sinalizacoes, pagina: 1, tamanho: 100, total: sinalizacoes.length });
    return extra(caminho, options);
  };
}

test('Web Sinalizações lista as sinalizações e filtra por estado e por nível', async () => {
  const { browser } = await bootWebComSessao({ roles: ['TECNICO'], hash: '#/sinalizacoes', rotas: rotasDeSinalizacoes(sinalizacoesDeTeste()) });
  const corpo = corpoDe(browser, 'sinalizacoes');
  const ids = () => porClasse(corpo, 'signal-item').map((item) => item.dataset.id);
  assert.deepEqual(ids(), [ID_SINAL_1, ID_SINAL_2, ID_SINAL_3, ID_SINAL_4]);

  const primeira = porClasse(corpo, 'signal-item')[0];
  assert.match(textoDe(primeira), /Centro.*Alta atenção.*Aberta.*Motivo b1.*Previsto.*Emitida em/);
  assert.match(textoDe(porClasse(corpo, 'signal-item')[2]), /Reconhecida.*Reconhecida em/);
  const botoes = descendentes(corpo).filter((no) => no.textContent === 'Reconhecer');
  assert.equal(botoes.length, 2);

  const estado = porId(corpo, 'filtro-estado');
  const nivel = porId(corpo, 'filtro-nivel');
  estado.value = 'ABERTA';
  estado.listeners.get('change')();
  assert.deepEqual(ids(), [ID_SINAL_1, ID_SINAL_2]);

  nivel.value = 'ATENCAO';
  nivel.listeners.get('change')();
  assert.deepEqual(ids(), [ID_SINAL_2]);

  estado.value = '';
  estado.listeners.get('change')();
  assert.deepEqual(ids(), [ID_SINAL_2, ID_SINAL_3]);

  estado.value = 'ABERTA';
  estado.listeners.get('change')();
  nivel.value = 'NORMAL';
  nivel.listeners.get('change')();
  assert.equal(ids().length, 0);
  assert.match(textoDe(corpo), /Nenhuma sinalização com esses filtros/);
});

test('Web Sinalizações: sem o perfil TECNICO o lugar do botão indica o perfil exigido', async () => {
  const { browser } = await bootWebComSessao({ roles: ['GESTOR'], hash: '#/sinalizacoes', rotas: rotasDeSinalizacoes(sinalizacoesDeTeste()) });
  const corpo = corpoDe(browser, 'sinalizacoes');
  assert.equal(descendentes(corpo).filter((no) => no.textContent === 'Reconhecer').length, 0);
  assert.equal(porClasse(corpo, 'role-hint').filter((no) => /perfil TECNICO/.test(no.textContent)).length, 2);
});

async function bootComReconhecimento({ reflexoApos }) {
  let navegador;
  let reconhecidaEm = null;
  const panoramas = [];
  const { browser } = await bootWebComSessao({
    roles: ['TECNICO'],
    hash: '#/sinalizacoes',
    setup: (booted) => { navegador = booted; },
    rotas: rotasDeSinalizacoes(sinalizacoesDeTeste(), (caminho, options) => {
      if (caminho === `/web/v1/sinalizacoes/${ID_SINAL_1}/reconhecimento` && options.method === 'POST') {
        reconhecidaEm = navegador.relogio.agora();
        return json({ ...sinalizacoesDeTeste()[0], estado: 'RECONHECIDA', reconhecidaEm: new Date(reconhecidaEm).toISOString() });
      }
      if (caminho === `/web/v1/panoramas/${ID_CENTRO}`) {
        panoramas.push(navegador.relogio.agora() - reconhecidaEm);
        const refletiu = reflexoApos != null && navegador.relogio.agora() - reconhecidaEm >= reflexoApos;
        return json({ regiaoId: ID_CENTRO, sinalizacoes: [{ id: ID_SINAL_1, estado: refletiu ? 'RECONHECIDA' : 'ABERTA' }] });
      }
      return undefined;
    }),
  });
  const corpo = corpoDe(browser, 'sinalizacoes');
  const botao = descendentes(porClasse(corpo, 'signal-item')[0]).find((no) => no.textContent === 'Reconhecer');
  return { browser, corpo, botao, panoramas };
}

test('Web Sinalizações: o TECNICO reconhece e a tela mede a defasagem até o panorama refletir a escrita', async () => {
  const { browser, corpo, botao, panoramas } = await bootComReconhecimento({ reflexoApos: 640 });
  await botao.listeners.get('click')();

  assert.match(textoDe(porClasse(corpo, 'signal-item')[0]), /Reconhecida/);
  assert.match(textoDe(porClasse(corpo, 'cqrs-message')[0]), /Centro: escrita confirmada\. Aguardando o modelo de leitura/);
  assert.equal(panoramas.length, 0);

  await browser.relogio.avancar(10000);
  assert.deepEqual(panoramas, [250, 500, 750]);
  const mensagem = porClasse(corpo, 'cqrs-message')[0];
  assert.match(mensagem.textContent, /escrita confirmada\. Modelo de leitura atualizado em 750 ms/);
  assert.equal(mensagem.dataset.kind, 'success');
  assert.equal(browser.relogio.pendentes(), 0);
});

test('Web Sinalizações: se o panorama não reflete em 10 s a tela avisa e para de consultar', async () => {
  const { browser, corpo, botao, panoramas } = await bootComReconhecimento({ reflexoApos: null });
  await botao.listeners.get('click')();

  await browser.relogio.avancar(9999);
  assert.equal(panoramas.length, 39);
  assert.match(porClasse(corpo, 'cqrs-message')[0].textContent, /Aguardando o modelo de leitura/);

  await browser.relogio.avancar(1);
  assert.equal(panoramas.length, 40);
  assert.equal(panoramas.at(-1), 10000);
  const mensagem = porClasse(corpo, 'cqrs-message')[0];
  assert.match(mensagem.textContent, /escrita confirmada\. O modelo de leitura ainda não refletiu a escrita \(10 s\)/);
  assert.equal(mensagem.dataset.kind, 'warning');
  assert.equal(browser.relogio.pendentes(), 0);

  await browser.relogio.avancar(5000);
  assert.equal(panoramas.length, 40);
});

test('Web Sinalizações: dois cliques seguidos em Reconhecer geram um único POST e o botão fica desabilitado', async () => {
  let liberar;
  const espera = new Promise((resolve) => { liberar = resolve; });
  const { browser } = await bootWebComSessao({
    roles: ['TECNICO'],
    hash: '#/sinalizacoes',
    rotas: rotasDeSinalizacoes(sinalizacoesDeTeste(), async (caminho, options) => {
      if (caminho !== `/web/v1/sinalizacoes/${ID_SINAL_1}/reconhecimento` || options.method !== 'POST') return undefined;
      await espera;
      return json({ ...sinalizacoesDeTeste()[0], estado: 'RECONHECIDA' });
    }),
  });
  const corpo = corpoDe(browser, 'sinalizacoes');
  const botaoDe = () => descendentes(porClasse(corpo, 'signal-item')[0]).find((no) => no.textContent === 'Reconhecer');
  const clicar = botaoDe().listeners.get('click');

  const primeiro = clicar();
  const segundo = clicar();
  assert.equal(botaoDe().disabled, true);
  liberar();
  await Promise.all([primeiro, segundo]);

  const posts = browser.fetchCalls.filter((chamada) => chamada.options.method === 'POST' && chamada.url.endsWith('/reconhecimento'));
  assert.equal(posts.length, 1);
  const mensagem = porClasse(corpo, 'cqrs-message')[0];
  assert.match(mensagem.textContent, /escrita confirmada\. Aguardando o modelo de leitura/);
  assert.notEqual(mensagem.dataset.kind, 'error');
});

test('Web Sinalizações: o botão Reconhecer volta a ficar habilitado depois de um erro', async () => {
  const { browser } = await bootWebComSessao({
    roles: ['TECNICO'],
    hash: '#/sinalizacoes',
    rotas: rotasDeSinalizacoes(sinalizacoesDeTeste(), (caminho, options) => (
      caminho === `/web/v1/sinalizacoes/${ID_SINAL_1}/reconhecimento` && options.method === 'POST' ? problema(503, 'Risco indisponível.') : undefined
    )),
  });
  const corpo = corpoDe(browser, 'sinalizacoes');
  const botaoDe = () => descendentes(porClasse(corpo, 'signal-item')[0]).find((no) => no.textContent === 'Reconhecer');
  await botaoDe().listeners.get('click')();
  assert.equal(botaoDe().disabled, false);
});

test('Web Sinalizações: sair da tela durante a medição cancela as consultas ao panorama', async () => {
  const { browser, botao, panoramas } = await bootComReconhecimento({ reflexoApos: null });
  await botao.listeners.get('click')();
  assert.equal(browser.relogio.pendentes(), 1);
  await irPara(browser, '#/assistente');
  assert.equal(browser.relogio.pendentes(), 0);
  await browser.relogio.avancar(10000);
  assert.equal(panoramas.length, 0);
});

test('Web Sinalizações: o erro do reconhecimento aparece na tela e a sinalização continua ABERTA', async () => {
  const { browser } = await bootWebComSessao({
    roles: ['TECNICO'],
    hash: '#/sinalizacoes',
    rotas: rotasDeSinalizacoes(sinalizacoesDeTeste(), (caminho, options) => (
      caminho === `/web/v1/sinalizacoes/${ID_SINAL_1}/reconhecimento` && options.method === 'POST'
        ? problema(409, 'Não é possível reconhecer a sinalização: ela está RECONHECIDA.')
        : undefined
    )),
  });
  const corpo = corpoDe(browser, 'sinalizacoes');
  const botao = descendentes(porClasse(corpo, 'signal-item')[0]).find((no) => no.textContent === 'Reconhecer');
  await botao.listeners.get('click')();

  const mensagem = porClasse(corpo, 'cqrs-message')[0];
  assert.match(mensagem.textContent, /Não é possível reconhecer a sinalização/);
  assert.equal(mensagem.dataset.kind, 'error');
  assert.equal(mensagem.getAttribute('role'), 'alert');
  assert.match(textoDe(porClasse(corpo, 'signal-item')[0]), /Aberta/);
  assert.equal(browser.relogio.pendentes(), 0);
  assert.equal(browser.fetchCalls.some((chamada) => chamada.url.includes('/web/v1/panoramas/')), false);
});

/* ---------- Tela Visão geral ---------- */

function pathsDoMapa(corpo) {
  return descendentes(corpo).filter((no) => no.namespaceURI === SVG_NS && no.id === 'path');
}

test('Web Visão geral projeta o GeoJSON, com um path por região e a cor do nível', async () => {
  const { browser } = await bootWebComSessao({ rotas: (url) => (url.endsWith('/web/v1/painel?municipio=Lavras') ? json(painel(regioesComGeometria())) : undefined) });
  const corpo = corpoDe(browser, 'visao-geral');

  browser.context.regioes = regioesComGeometria();
  const projecao = JSON.parse(runInWeb(browser, 'JSON.stringify(projetarRegioes(regioes))'));
  assert.equal(projecao.itens.length, 3);
  const [centro, aguaLimpa, vale] = projecao.itens;
  assert.ok(aguaLimpa.centro[0] > centro.centro[0], 'a região a leste fica à direita');
  assert.ok(vale.centro[1] > centro.centro[1], 'a região ao sul fica abaixo');
  assert.ok(Math.abs(vale.centro[0] - centro.centro[0]) < 1e-6);
  for (const item of projecao.itens) {
    assert.match(item.d, /^M[\d. L-]+ Z$/);
    for (const numero of item.d.match(/[\d.]+/g).map(Number)) assert.ok(numero >= 0 && numero <= Math.max(projecao.largura, projecao.altura));
    assert.ok(item.centro[0] > 0 && item.centro[0] < projecao.largura && item.centro[1] > 0 && item.centro[1] < projecao.altura);
  }

  const paths = pathsDoMapa(corpo);
  assert.equal(paths.length, 3);
  assert.deepEqual(paths.map((no) => no.dataset.level), ['ALTA_ATENCAO', 'ATENCAO', 'NORMAL']);
  assert.deepEqual(paths.map((no) => no.getAttribute('aria-label')), ['Centro, Alta atenção', 'Água Limpa, Atenção', 'Vale, Normal']);
  assert.ok(paths.every((no) => no.getAttribute('tabindex') === '0' && no.getAttribute('role') === 'button' && no.getAttribute('class') === 'map-region'));
  const rotulos = descendentes(corpo).filter((no) => no.namespaceURI === SVG_NS && no.id === 'text').map((no) => no.textContent);
  assert.deepEqual(rotulos, ['Centro', 'Água Limpa', 'Vale']);
  assert.match(textoDe(corpo), /Divisão do recorte piloto/);
  assert.equal(porClasse(corpo, 'legend-swatch').length, 4);
});

test('Web Visão geral mostra os contadores e "—" para o que o BFF devolve como null', async () => {
  const resposta = painel(regioesComGeometria(), {
    contadores: { porNivel: { NORMAL: 1, OBSERVACAO: 0, ATENCAO: 1, ALTA_ATENCAO: 1 }, sinalizacoesAbertas: 3, acoesEmAndamento: null },
    avisos: ['Operações ainda não disponibiliza uma lista completa de ações.'],
  });
  const { browser } = await bootWebComSessao({ rotas: (url) => (url.endsWith('/web/v1/painel?municipio=Lavras') ? json(resposta) : undefined) });
  const cartoes = porClasse(corpoDe(browser, 'visao-geral'), 'metric-card').map(textoDe);
  assert.deepEqual(cartoes, [
    '3 Regiões acompanhadas',
    '1 Normal',
    '0 Observação',
    '1 Atenção',
    '1 Alta atenção',
    '3 Sinalizações abertas',
    '— Ações em andamento Dado indisponível',
  ]);
  assert.match(textoDe(corpoDe(browser, 'visao-geral')), /Operações ainda não disponibiliza uma lista completa de ações/);
});

test('Web Visão geral cai para a lista de regiões, com o aviso do BFF, quando não há geometria', async () => {
  const semGeometria = regioesComGeometria().map((regiao) => ({ ...regiao, geometria: null }));
  const resposta = painel(semGeometria, { avisos: ['Território não disponibilizou a geometria das regiões.'] });
  const { browser } = await bootWebComSessao({ rotas: (url) => (url.endsWith('/web/v1/painel?municipio=Lavras') ? json(resposta) : undefined) });
  const corpo = corpoDe(browser, 'visao-geral');
  assert.equal(pathsDoMapa(corpo).length, 0);
  const itens = porClasse(corpo, 'region-item');
  assert.deepEqual(itens.map((item) => textoDe(item)), ['Centro Alta atenção', 'Água Limpa Atenção', 'Vale Normal']);
  assert.match(textoDe(corpo), /Território não disponibilizou a geometria das regiões/);
});

test('Web Visão geral abre o painel lateral da região, com a síntese e a origem, ou o aviso quando ela falta', async () => {
  const detalhes = {
    [ID_CENTRO]: {
      regiao: { id: ID_CENTRO, codigo: 'LAV-Centro', nome: 'Centro', municipio: 'Lavras', uf: 'MG', caracteristicas: { areaKm2: 3.2, tipoOcupacao: 'MISTA', proximidadeCursoAgua: true } },
      panorama: { regiaoId: ID_CENTRO, nivelAtencao: 'ALTA_ATENCAO', sinalizacoesAbertas: 2, fatores: [{ tipo: 'CHUVA', descricao: 'Chuva acumulada de 80 mm em 24 h', fonte: 'CEMADEN' }] },
      acoes: { abertas: 1, itens: [] },
      analise: { sintese: 'O Centro concentra o maior risco de alagamento.', fontes: [{ nome: 'CEMADEN', referencia: 'chuva, 2026-11-25' }], origem: 'LLM', latenciaMs: 900 },
      avisos: [],
    },
    [ID_AGUA_LIMPA]: {
      regiao: { id: ID_AGUA_LIMPA, codigo: 'LAV-Agua', nome: 'Água Limpa', municipio: 'Lavras', uf: 'MG' },
      panorama: { regiaoId: ID_AGUA_LIMPA, nivelAtencao: 'ATENCAO', sinalizacoesAbertas: 1, fatores: [] },
      acoes: null,
      analise: null,
      avisos: ['Análise ainda não disponibiliza a síntese por região neste fluxo.'],
    },
  };
  const { browser } = await bootWebComSessao({
    rotas: (url) => {
      const caminho = caminhoDe(url);
      if (caminho === '/web/v1/painel?municipio=Lavras') return json(painel(regioesComGeometria()));
      if (!caminho.startsWith('/web/v1/regioes/')) return undefined;
      const id = caminho.replace('/web/v1/regioes/', '');
      return detalhes[id] ? json(detalhes[id]) : problema(404, 'Região não encontrada.');
    },
  });
  const corpo = corpoDe(browser, 'visao-geral');
  const [centro, aguaLimpa, vale] = pathsDoMapa(corpo);
  const lateral = porId(corpo, 'region-panel');

  await centro.listeners.get('click')();
  assert.deepEqual([centro, aguaLimpa, vale].map((no) => no.getAttribute('aria-pressed')), ['true', 'false', 'false']);
  const texto = textoDe(lateral);
  assert.match(texto, /Centro.*Alta atenção/);
  assert.match(texto, /Município.*Lavras\/MG/);
  assert.match(texto, /Área.*3\.2 km²/);
  assert.match(texto, /Sinalizações abertas.*2/);
  assert.match(texto, /Ações abertas.*1/);
  assert.match(texto, /Chuva acumulada de 80 mm em 24 h \(CEMADEN\)/);
  assert.match(texto, /O Centro concentra o maior risco de alagamento\./);
  assert.match(texto, /Origem: LLM/);
  assert.match(texto, /CEMADEN: chuva, 2026-11-25/);

  const teclado = { key: 'Enter', preventDefault() {} };
  await aguaLimpa.listeners.get('keydown')(teclado);
  assert.deepEqual([centro, aguaLimpa, vale].map((no) => no.getAttribute('aria-pressed')), ['false', 'true', 'false']);
  const semSintese = textoDe(lateral);
  assert.match(semSintese, /Água Limpa.*Atenção/);
  assert.match(semSintese, /Município.*Lavras\/MG/);
  assert.match(semSintese, /Análise ainda não disponibiliza a síntese por região neste fluxo/);
  assert.doesNotMatch(semSintese, /Origem:/);

  await vale.listeners.get('click')();
  assert.equal(textoDe(lateral), 'Região não encontrada.');
  assert.equal(lateral.children[0].getAttribute('role'), 'alert');
});

/* ---------- Tela Assistente ---------- */

test('Web Assistente recusa pergunta curta, mostra trechos, origem e latência e marca o FALLBACK', async () => {
  const respostas = [
    { resposta: 'Avalie o histórico de chuva e a drenagem.', trechos: [{ titulo: 'Manual de drenagem', trecho: '...' }, { titulo: 'Protocolo de alerta', trecho: '...' }], origem: 'LLM', modelo: 'llama3', latenciaMs: 1234 },
    { resposta: 'Trecho recuperado sobre alagamento.', trechos: [{ titulo: 'Guia de alagamentos', trecho: '...' }], origem: 'FALLBACK', modelo: null, latenciaMs: 80 },
  ];
  const corpos = [];
  const { browser } = await bootWebComSessao({
    hash: '#/assistente',
    rotas: (url, options) => {
      if (caminhoDe(url) === '/web/v1/consultas') {
        corpos.push(JSON.parse(options.body));
        return corpos.length === 3 ? problema(503, 'Análise temporariamente indisponível.') : json(respostas[corpos.length - 1]);
      }
      return url.endsWith('/web/v1/painel?municipio=Lavras') ? json(painel(regioesComGeometria())) : undefined;
    },
  });
  const corpo = corpoDe(browser, 'assistente');
  const form = porId(corpo, 'question-form');
  const exemplos = porClasse(corpo, 'example-list')[0];
  const historico = () => porClasse(corpo, 'answer-card');
  const status = porClasse(form, 'role-hint')[0];
  const enviar = form.listeners.get('submit');
  const evento = { preventDefault() {} };
  assert.equal(exemplos.hidden, false);
  assert.equal(historico().length, 0);

  form.values = { pergunta: 'Oi' };
  await enviar(evento);
  assert.equal(corpos.length, 0);
  assert.match(status.textContent, /pelo menos 5 caracteres/);
  assert.equal(status.getAttribute('role'), 'alert');

  form.values = { pergunta: '  Como evitar alagamentos no Centro?  ' };
  await enviar(evento);
  assert.deepEqual(corpos[0], { pergunta: 'Como evitar alagamentos no Centro?', usarRecuperacao: true });
  assert.equal(historico().length, 1);
  const texto = textoDe(historico()[0]);
  assert.match(texto, /Como evitar alagamentos no Centro\?/);
  assert.match(texto, /Avalie o histórico de chuva e a drenagem\./);
  assert.match(texto, /Manual de drenagem/);
  assert.match(texto, /Protocolo de alerta/);
  assert.match(texto, /Origem: LLM/);
  assert.match(texto, /Latência: 1234 ms/);
  assert.equal(porClasse(historico()[0], 'fallback-note').length, 0);
  assert.equal(exemplos.hidden, true);

  form.values = { pergunta: 'E em áreas de encosta?' };
  await enviar(evento);
  assert.equal(historico().length, 2);
  assert.match(textoDe(historico()[0]), /E em áreas de encosta\?/);
  assert.match(textoDe(historico()[1]), /Como evitar alagamentos/);
  assert.match(textoDe(historico()[0]), /Origem: FALLBACK/);
  assert.match(textoDe(porClasse(historico()[0], 'fallback-note')[0]), /sem o modelo de linguagem/);
  assert.equal(porClasse(historico()[1], 'fallback-note').length, 0);

  form.values = { pergunta: 'Mais uma pergunta qualquer' };
  await enviar(evento);
  assert.equal(historico().length, 2);
  assert.equal(status.textContent, 'Análise temporariamente indisponível.');
  assert.equal(status.getAttribute('role'), 'alert');

  await irPara(browser, '#/visao-geral');
  await irPara(browser, '#/assistente');
  assert.equal(porClasse(corpo, 'answer-card').length, 2);
  assert.equal(porClasse(corpo, 'example-list')[0].hidden, true);
});

test('Web Assistente oferece perguntas de exemplo e clicar numa delas a envia', async () => {
  const corpos = [];
  const { browser } = await bootWebComSessao({
    hash: '#/assistente',
    rotas: (url, options) => {
      if (caminhoDe(url) !== '/web/v1/consultas') return undefined;
      corpos.push(JSON.parse(options.body));
      return json({ resposta: 'Resposta de exemplo.', trechos: [], origem: 'CACHE', latenciaMs: 5 });
    },
  });
  const corpo = corpoDe(browser, 'assistente');
  const exemplos = porClasse(corpo, 'example-list')[0];
  const botoes = exemplos.children.filter((no) => no.id === 'button');
  assert.equal(botoes.length, 3);
  assert.equal(exemplos.hidden, false);

  await botoes[1].listeners.get('click')();
  assert.deepEqual(corpos, [{ pergunta: botoes[1].textContent, usarRecuperacao: true }]);
  assert.equal(porClasse(corpo, 'answer-card').length, 1);
  assert.match(textoDe(porClasse(corpo, 'answer-card')[0]), /Origem: CACHE/);
  assert.equal(exemplos.hidden, true);
});

test('Mobile consulta APIs públicas sem credenciais, renderiza resumo e revalida ETag', async () => {
  const browser = browserContext({ fetchImpl: async (url, options) => {
    assert.equal(options.credentials, 'omit');
    assert.equal(new Headers(options.headers).has('authorization'), false);
    if (url.endsWith('/mobile/v1/publico/regioes?municipio=Lavras')) {
      return new Response(JSON.stringify({ itens: [{ id: 'regiao-centro', nome: 'Centro' }] }), { status: 200 });
    }
    if (url.endsWith('/mobile/v1/publico/regioes/regiao-centro/resumo')) {
      const headers = new Headers(options.headers);
      if (headers.has('if-none-match')) {
        assert.equal(headers.get('if-none-match'), '"centro-v1"');
        return new Response(null, { status: 304 });
      }
      return new Response(JSON.stringify({
        regiao: 'Centro', nivel: 'ATENCAO', rotulo: 'Atenção',
        mensagem: 'A região merece atenção.', atualizadoEm: '2026-11-26T12:00:00Z',
      }), { status: 200, headers: { ETag: '"centro-v1"' } });
    }
    throw new Error(`Unexpected Mobile URL: ${url}`);
  } });
  const script = fs.readFileSync(path.join(ROOT, 'clients/mobile/app.js'), 'utf8');
  vm.runInContext(script, browser.context, { filename: 'clients/mobile/app.js' });
  await settle();

  assert.equal(browser.fetchCalls.length, 2);
  assert.equal(browser.document.getElementById('region-name').textContent, 'Centro');
  assert.equal(browser.document.getElementById('attention-level').textContent, 'Atenção');
  assert.equal(browser.document.getElementById('summary-content').hidden, false);
  assert.equal(browser.document.getElementById('loading-state').hidden, true);

  const regionSelect = browser.document.getElementById('region-select');
  await regionSelect.listeners.get('change')();
  assert.equal(browser.fetchCalls.length, 3);
  assert.equal(browser.document.getElementById('region-name').textContent, 'Centro');
});

test('Mobile apresenta erro de dependência e mantém estados de carregamento consistentes', async () => {
  let requestCount = 0;
  const browser = browserContext({ fetchImpl: async () => {
    requestCount += 1;
    if (requestCount === 1) {
      return new Response(JSON.stringify({ itens: [{ id: 'regiao-centro', nome: 'Centro' }] }), { status: 200 });
    }
    return new Response(JSON.stringify({
      status: 503,
      detail: 'Território temporariamente indisponível.',
    }), { status: 503, headers: { 'content-type': 'application/problem+json' } });
  } });
  const script = fs.readFileSync(path.join(ROOT, 'clients/mobile/app.js'), 'utf8');
  vm.runInNewContext(script, browser.context, { filename: 'clients/mobile/app.js' });
  await settle();

  assert.equal(browser.fetchCalls.length, 2);
  assert.equal(browser.document.getElementById('message').hidden, false);
  assert.match(browser.document.getElementById('message').textContent, /Território temporariamente indisponível/);
  assert.equal(browser.document.getElementById('loading-state').hidden, true);
  assert.equal(browser.document.getElementById('empty-state').hidden, false);
});

test('páginas dos clientes declaram viewport e estilos adaptáveis', () => {
  const webHtml = fs.readFileSync(path.join(ROOT, 'clients/web/index.html'), 'utf8');
  const mobileHtml = fs.readFileSync(path.join(ROOT, 'clients/mobile/index.html'), 'utf8');
  const webCss = fs.readFileSync(path.join(ROOT, 'clients/web/styles.css'), 'utf8');
  const mobileCss = fs.readFileSync(path.join(ROOT, 'clients/mobile/styles.css'), 'utf8');
  assert.match(webHtml, /name="viewport"/);
  assert.match(mobileHtml, /name="viewport"/);
  assert.match(webCss, /@media/);
  assert.match(mobileCss, /@media/);
  assert.match(webHtml, /aria-live="polite"/);
  assert.match(mobileHtml, /aria-live="polite"/);
});
