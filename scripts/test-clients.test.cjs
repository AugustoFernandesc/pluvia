const assert = require('node:assert/strict');
const { webcrypto } = require('node:crypto');
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

async function settle() {
  await Promise.resolve();
  await new Promise((resolve) => setImmediate(resolve));
  await Promise.resolve();
}

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

test('página do cliente Mobile declara viewport e estilos adaptáveis', () => {
  const mobileHtml = fs.readFileSync(path.join(ROOT, 'clients/mobile/index.html'), 'utf8');
  const mobileCss = fs.readFileSync(path.join(ROOT, 'clients/mobile/styles.css'), 'utf8');
  assert.match(mobileHtml, /name="viewport"/);
  assert.match(mobileCss, /@media/);
  assert.match(mobileHtml, /aria-live="polite"/);
});
