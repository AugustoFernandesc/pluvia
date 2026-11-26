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
    this.elements = id === 'action-form' ? { data: { value: '' } } : {};
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

function browserContext({ location = {}, session = {}, fetchImpl = async () => { throw new Error('Unexpected fetch'); } } = {}) {
  const document = new DocumentStub();
  document.getElementById('loading-state').hidden = true;
  document.getElementById('summary-content').hidden = true;
  const sessionStorage = storageStub(session);
  const assigned = [];
  const replacements = [];
  const window = {
    location: {
      origin: location.origin || 'http://localhost:5173',
      pathname: location.pathname || '/',
      search: location.search || '',
      assign: (url) => assigned.push(String(url)),
    },
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
    Date,
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
  return { context, document, window, sessionStorage, assigned, replacements, fetchCalls };
}

async function bootWeb(options = {}) {
  const browser = browserContext(options);
  const script = fs.readFileSync(path.join(ROOT, 'clients/web/app.js'), 'utf8');
  vm.runInContext(script, browser.context, { filename: 'clients/web/app.js' });
  await new Promise((resolve) => setImmediate(resolve));
  return browser;
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

test('Web valida callback, autoriza GESTOR, solicita ação idempotente e trata erro da Análise', async () => {
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
      if (url.endsWith('/web/v1/acoes') && options.method === 'POST') {
        const headers = new Headers(options.headers);
        const body = JSON.parse(options.body);
        assert.match(headers.get('idempotency-key'), /^[0-9a-f-]{36}$/i);
        assert.equal(body.regiaoId, 'regiao-centro');
        assert.equal(body.tipo, 'LIMPEZA_DRENAGEM');
        assert.equal(body.categoriaRecurso, 'CAMINHAO_HIDROJATO');
        assert.equal(headers.get('authorization'), `Bearer ${accessToken}`);
        return new Response(JSON.stringify({ id: 'acao-1', tipo: body.tipo, estado: 'SOLICITADA' }), { status: 202 });
      }
      if (url.endsWith('/web/v1/acoes/acao-1/saga')) {
        return new Response(JSON.stringify({ estado: 'EM_ANDAMENTO', passos: [{ mensagem: 'Equipe alocada' }] }), { status: 200 });
      }
      if (url.endsWith('/web/v1/acoes/acao-1')) {
        return new Response(JSON.stringify({ id: 'acao-1', tipo: 'LIMPEZA_DRENAGEM', estado: 'EM_ANDAMENTO' }), { status: 200 });
      }
      if (url.endsWith('/web/v1/consultas')) {
        assert.equal(new Headers(options.headers).get('authorization'), `Bearer ${accessToken}`);
        assert.equal(JSON.parse(options.body).usarRecuperacao, true);
        return new Response(JSON.stringify({ status: 503, detail: 'Análise temporariamente indisponível.' }), {
          status: 503,
          headers: { 'content-type': 'application/problem+json' },
        });
      }
      throw new Error(`Unexpected Web URL: ${url}`);
    },
  });
  await settle();

  assert.equal(browser.fetchCalls.length, 2);
  assert.equal(browser.sessionStorage.getItem('pluvia.state'), null);
  assert.deepEqual(browser.replacements.at(-1), [null, '', '/']);
  assert.match(browser.document.getElementById('identity').textContent, /gestora-demo.*GESTOR/);
  assert.equal(browser.document.getElementById('action-form').hidden, false);
  assert.equal(browser.document.getElementById('question-form').querySelector('button').disabled, false);

  const regionSelect = browser.document.getElementById('region-select');
  regionSelect.value = 'regiao-centro';
  const actionForm = browser.document.getElementById('action-form');
  actionForm.values = {
    tipo: 'LIMPEZA_DRENAGEM',
    data: '2026-11-27',
    turno: 'MANHA',
    especialidade: 'DRENAGEM',
    categoriaRecurso: 'CAMINHAO_HIDROJATO',
    descricao: '',
  };
  await actionForm.listeners.get('submit')({ currentTarget: actionForm, preventDefault() {} });
  assert.equal(browser.fetchCalls.length, 5);
  assert.equal(browser.document.getElementById('saga-state').textContent, 'EM_ANDAMENTO');
  assert.equal(browser.document.getElementById('saga-detail').children.length, 3);

  browser.document.getElementById('question').value = 'Como se preparar para uma chuva forte?';
  const questionForm = browser.document.getElementById('question-form');
  await questionForm.listeners.get('submit')({ currentTarget: questionForm, preventDefault() {} });
  assert.equal(browser.fetchCalls.length, 6);
  assert.match(browser.document.getElementById('answer').textContent, /Análise temporariamente indisponível/);
});

test('Web rejeita state incorreto sem trocar o código e mantém ação oculta para TECNICO', async () => {
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
  assert.equal(tecnico.document.getElementById('action-form').hidden, true);
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
  assert.equal(browser.fetchCalls.length, 3);

  browser.document.getElementById('logout-button').listeners.get('click')();
  const logoutUrl = new URL(browser.assigned.at(-1));
  assert.equal(logoutUrl.pathname, '/auth/realms/pluvia/protocol/openid-connect/logout');
  assert.equal(logoutUrl.searchParams.get('client_id'), 'pluvia-web');
  assert.equal(logoutUrl.searchParams.get('id_token_hint'), idToken);
  assert.equal(logoutUrl.searchParams.get('post_logout_redirect_uri'), 'http://localhost:5173/');
  assert.equal(browser.document.getElementById('action-form').hidden, true);
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
