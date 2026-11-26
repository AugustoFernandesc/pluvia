const API_BASE = 'http://localhost:8000';
const OIDC = 'http://localhost:8000/auth/realms/pluvia/protocol/openid-connect';
const CLIENT_ID = 'pluvia-web';
const REDIRECT_URI = `${window.location.origin}/`;
const state = { accessToken: null, refreshToken: null, idToken: null, expiresAt: 0, roles: [], username: '', selectedRegion: null, actionId: null, pollTimer: null, panel: null };
const $ = (id) => document.getElementById(id);

function decodeJwt(token) { const part = token.split('.')[1]; return JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/'))); }
function base64Url(bytes) { let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte); return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, ''); }
async function pkceChallenge(verifier) { return base64Url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)))); }
function randomToken(size = 32) { return base64Url(crypto.getRandomValues(new Uint8Array(size))); }
function showNotice(message, kind = 'info') { const notice = $('notice'); notice.textContent = message; notice.dataset.kind = kind; notice.hidden = false; }
function clearNotice() { $('notice').hidden = true; }

function updateIdentity() {
  const roles = state.roles.filter((role) => ['GESTOR', 'TECNICO'].includes(role));
  $('identity').textContent = state.accessToken ? `${state.username || 'Usuário'} · ${roles.join(', ') || 'sem perfil Web'}` : 'Acesso da equipe';
  $('login-button').hidden = Boolean(state.accessToken); $('logout-button').hidden = !state.accessToken;
  $('refresh-button').disabled = !state.accessToken; $('region-select').disabled = !state.accessToken;
  $('question-form').querySelector('button').disabled = !state.accessToken;
  $('action-form').hidden = !state.roles.includes('GESTOR'); $('role-label').textContent = roles.join(' · ') || 'GESTOR';
}

async function login() {
  const verifier = randomToken(48); const nonce = randomToken(); const oidcState = randomToken();
  sessionStorage.setItem('pluvia.pkce', verifier); sessionStorage.setItem('pluvia.nonce', nonce); sessionStorage.setItem('pluvia.state', oidcState);
  const query = new URLSearchParams({ client_id: CLIENT_ID, redirect_uri: REDIRECT_URI, response_type: 'code', scope: 'openid profile email', code_challenge: await pkceChallenge(verifier), code_challenge_method: 'S256', state: oidcState, nonce });
  window.location.assign(`${OIDC}/auth?${query.toString()}`);
}

async function trocarCodigo(code, receivedState) {
  const expectedState = sessionStorage.getItem('pluvia.state'); const verifier = sessionStorage.getItem('pluvia.pkce'); const nonce = sessionStorage.getItem('pluvia.nonce');
  sessionStorage.removeItem('pluvia.state'); sessionStorage.removeItem('pluvia.pkce'); sessionStorage.removeItem('pluvia.nonce');
  if (!expectedState || receivedState !== expectedState || !verifier || !nonce) throw new Error('A validação do retorno de autenticação falhou. Tente entrar novamente.');
  const form = new URLSearchParams({ grant_type: 'authorization_code', client_id: CLIENT_ID, redirect_uri: REDIRECT_URI, code, code_verifier: verifier });
  const response = await fetch(`${OIDC}/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error_description || data.error || 'Não foi possível concluir o login.');
  if (decodeJwt(data.id_token).nonce !== nonce) throw new Error('A validação do login expirou. Entre novamente.');
  acceptTokens(data); history.replaceState(null, '', window.location.pathname);
}

function acceptTokens(data) {
  const claims = decodeJwt(data.access_token); state.accessToken = data.access_token; state.refreshToken = data.refresh_token || null;
  state.idToken = data.id_token || null; state.expiresAt = Date.now() + Number(data.expires_in || 300) * 1000;
  state.roles = claims.realm_access?.roles || []; state.username = claims.preferred_username || claims.name || 'Usuário'; updateIdentity();
}

function clearSession(expired = false) {
  state.accessToken = null; state.refreshToken = null; state.idToken = null; state.roles = []; state.expiresAt = 0; updateIdentity();
  if (expired) showNotice('Sua sessão expirou. Entre novamente para continuar.', 'error');
}

async function refreshSession() {
  if (!state.refreshToken) { clearSession(true); throw new Error('Sua sessão expirou. Entre novamente.'); }
  const form = new URLSearchParams({ grant_type: 'refresh_token', client_id: CLIENT_ID, refresh_token: state.refreshToken });
  const response = await fetch(`${OIDC}/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form });
  const data = await response.json(); if (!response.ok) { clearSession(true); throw new Error('Sua sessão expirou. Entre novamente.'); } acceptTokens(data);
}

async function api(path, options = {}, retry = true) {
  if (!state.accessToken) throw new Error('Entre com seu usuário para acessar o painel.');
  if (Date.now() > state.expiresAt - 20000) await refreshSession();
  const headers = new Headers(options.headers || {}); headers.set('Accept', 'application/json'); headers.set('Authorization', `Bearer ${state.accessToken}`);
  if (options.body !== undefined) headers.set('Content-Type', 'application/json');
  const response = await fetch(`${API_BASE}${path}`, { ...options, headers, credentials: 'omit' });
  if (response.status === 401 && retry && state.refreshToken) { await refreshSession(); return api(path, options, false); }
  if (!response.ok) { const body = await response.json().catch(() => ({})); if (response.status === 401) clearSession(true); throw new Error(body.detail || body.title || body.message || `A solicitação falhou (HTTP ${response.status}).`); }
  return response.status === 204 ? null : response.json();
}

function cell(label, value) { const item = document.createElement('div'); item.className = 'detail-item'; const caption = document.createElement('span'); caption.textContent = label; const content = document.createElement('strong'); content.textContent = value == null ? 'Não disponível' : String(value); item.append(caption, content); return item; }

function mostrarMetricas(panel) {
  const metrics = $('metrics'); metrics.replaceChildren(); const levels = panel.contadores?.porNivel || {};
  const values = [['Regiões acompanhadas', panel.regioes?.length ?? 0, 'panoramas disponíveis'], ['Atenção elevada', levels.ALTA_ATENCAO ?? 0, 'nível publicado por Risco'], ['Atenção', levels.ATENCAO ?? 0, 'nível publicado por Risco'], ['Sinalizações abertas', panel.contadores?.sinalizacoesAbertas ?? 0, 'conforme o panorama'], ['Ações em andamento', panel.contadores?.acoesEmAndamento, 'conforme Operações']];
  for (const [title, value, caption] of values) { const card = document.createElement('article'); card.className = 'metric-card'; const label = document.createElement('span'); label.textContent = title; const number = document.createElement('strong'); number.textContent = value == null ? '—' : String(value); const note = document.createElement('small'); note.textContent = caption; card.append(label, number, note); metrics.append(card); }
}

function exibirDetalhe(data) {
  const risk = data.panorama || {}; const level = risk.nivelAtencao || 'NÃO INFORMADO'; const badge = $('risk-badge'); badge.textContent = level.replaceAll('_', ' '); badge.dataset.level = level; badge.hidden = false;
  const detail = $('region-detail'); detail.replaceChildren(); const grid = document.createElement('div'); grid.className = 'detail-grid';
  grid.append(cell('Município', data.regiao?.municipio), cell('UF', data.regiao?.uf), cell('Acumulado 24h (mm)', risk.chuva?.acumulado24hMm), cell('Acumulado 72h (mm)', risk.chuva?.acumulado72hMm), cell('Percentil local 72h', risk.chuva?.percentilLocal72h), cell('Sinalizações abertas', risk.sinalizacoesAbertas), cell('Atualizado em', risk.atualizadoEm), cell('Versão do panorama', risk.versao));
  const title = document.createElement('p'); title.textContent = data.regiao?.caracteristicas?.proximidadeCursoAgua === true ? 'A região possui proximidade de curso d’água registrada.' : 'Características territoriais conforme cadastro disponível.'; detail.append(grid, title);
  if (Array.isArray(risk.fatores) && risk.fatores.length) { const factors = document.createElement('div'); factors.className = 'data-block'; const heading = document.createElement('strong'); heading.textContent = 'Fatores publicados'; factors.append(heading); for (const factor of risk.fatores) { const p = document.createElement('p'); p.className = 'muted'; p.textContent = [factor.descricao, factor.fonte, factor.referencia].filter(Boolean).join(' · '); factors.append(p); } detail.append(factors); }
  if (data.analise?.sintese) { const synthesis = document.createElement('div'); synthesis.className = 'data-block analysis-summary'; const heading = document.createElement('strong'); heading.textContent = `Síntese da Análise · ${data.analise.origem || 'origem informada pelo serviço'}`; const p = document.createElement('p'); p.textContent = data.analise.sintese; synthesis.append(heading, p); if (Array.isArray(data.analise.fontes) && data.analise.fontes.length) { const list = document.createElement('ul'); list.className = 'analysis-sources'; for (const source of data.analise.fontes) { const item = document.createElement('li'); item.textContent = [source.nome, source.referencia].filter(Boolean).join(' · '); list.append(item); } synthesis.append(list); } detail.append(synthesis); }
  if (Array.isArray(data.avisos) && data.avisos.length) { const p = document.createElement('p'); p.className = 'muted'; p.textContent = `Blocos ainda indisponíveis: ${data.avisos.join(' ')}`; detail.append(p); }
}

function mostrarRegioes(regioes) {
  const select = $('region-select'); const list = $('region-list'); select.replaceChildren(); list.replaceChildren();
  for (const region of regioes) {
    const option = document.createElement('option'); option.value = region.regiaoId; option.textContent = region.nome; select.append(option);
    const row = document.createElement('div'); row.className = 'region-row'; const button = document.createElement('button'); button.type = 'button'; button.textContent = region.nome; button.addEventListener('click', () => { select.value = region.regiaoId; carregarRegiao(region.regiaoId); });
    const level = document.createElement('span'); level.className = 'level-chip'; level.dataset.level = region.nivelAtencao; level.textContent = String(region.nivelAtencao || 'Sem dado').replaceAll('_', ' '); row.append(button, level); list.append(row);
  }
  select.disabled = regioes.length === 0; const center = regioes.find((item) => item.nome.toLowerCase() === 'centro') || regioes[0];
  if (center) { select.value = center.regiaoId; carregarRegiao(center.regiaoId); } else list.textContent = 'Nenhuma região foi retornada por Risco.';
}

async function carregarRegiao(id) {
  if (!id || !state.accessToken) return; $('region-detail').textContent = 'Carregando dados reais de Território e Risco…'; clearNotice();
  try { const data = await api(`/web/v1/regioes/${encodeURIComponent(id)}`); state.selectedRegion = id; exibirDetalhe(data); }
  catch (error) { $('region-detail').textContent = error.message; showNotice(error.message, 'error'); }
}

async function carregarPainel() {
  if (!state.accessToken) return; $('refresh-button').disabled = true; clearNotice();
  try { const panel = await api('/web/v1/painel?municipio=Lavras'); state.panel = panel; mostrarMetricas(panel); mostrarRegioes(panel.regioes || []); if (panel.avisos?.length) showNotice(panel.avisos.join(' ')); }
  catch (error) { showNotice(error.message, 'error'); }
  finally { $('refresh-button').disabled = false; }
}

function limparAcao() { if (state.pollTimer) clearInterval(state.pollTimer); state.pollTimer = null; state.actionId = null; }
function mostrarSaga(acao, saga) {
  const target = $('saga-detail'); target.replaceChildren();
  const summary = document.createElement('p'); summary.className = 'muted'; summary.textContent = `Ação ${acao.id} · ${acao.tipo || 'tipo não informado'} · ${acao.estado || 'estado não informado'}`; target.append(summary);
  if (!saga) { const note = document.createElement('p'); note.className = 'muted'; note.textContent = 'O serviço ainda não publicou os dados da SAGA.'; target.append(note); return; }
  const title = document.createElement('strong'); title.textContent = `SAGA · ${saga.estado || 'estado não informado'}`; target.append(title);
  if (saga.motivo) { const reason = document.createElement('p'); reason.textContent = saga.motivo; target.append(reason); }
  if (Array.isArray(saga.passos) && saga.passos.length) { const list = document.createElement('ol'); list.className = 'saga-steps'; for (const step of saga.passos) { const item = document.createElement('li'); const name = document.createElement('strong'); name.textContent = step.mensagem || 'Etapa'; const detail = document.createElement('span'); detail.textContent = [step.direcao, step.participante, step.detalhe].filter(Boolean).join(' · '); item.append(name); if (detail.textContent) item.append(detail); list.append(item); } target.append(list); }
  else { const note = document.createElement('p'); note.className = 'muted'; note.textContent = 'Nenhuma etapa foi publicada até agora.'; target.append(note); }
}

async function consultarAcao(id) {
  if (!state.accessToken || !id) return;
  try {
    const [action, saga] = await Promise.all([api(`/web/v1/acoes/${encodeURIComponent(id)}`), state.roles.includes('GESTOR') ? api(`/web/v1/acoes/${encodeURIComponent(id)}/saga`) : Promise.resolve(null)]);
    const status = action.estado || action.status || 'Estado não informado'; $('saga-state').textContent = status; $('saga-state').dataset.level = status; mostrarSaga(action, saga); $('check-saga-button').hidden = false;
    if (['CONCLUIDA', 'CANCELADA', 'REJEITADA'].includes(String(action.estado)) || ['CONCLUIDA', 'COMPENSADA'].includes(String(saga?.estado))) { if (state.pollTimer) clearInterval(state.pollTimer); state.pollTimer = null; }
  } catch (error) { showNotice(error.message, 'error'); }
}

async function solicitarAcao(event) {
  event.preventDefault(); if (!state.roles.includes('GESTOR')) return showNotice('Apenas o perfil GESTOR pode solicitar uma ação preventiva.', 'error');
  const form = new FormData(event.currentTarget); const regionId = $('region-select').value; if (!regionId) return showNotice('Selecione uma região retornada pelo painel.', 'error');
  const body = { regiaoId: regionId, tipo: form.get('tipo'), data: form.get('data'), turno: form.get('turno'), especialidade: form.get('especialidade'), categoriaRecurso: form.get('categoriaRecurso') };
  const descricao = String(form.get('descricao') || '').trim(); if (descricao) body.descricao = descricao;
  const button = event.currentTarget.querySelector('button[type="submit"]'); button.disabled = true; showNotice('Enviando a solicitação uma única vez para Operações…');
  try {
    const result = await api('/web/v1/acoes', { method: 'POST', headers: { 'Idempotency-Key': crypto.randomUUID() }, body: JSON.stringify(body) });
    const id = result.id || result.acaoId; if (!id) throw new Error('Operações aceitou a solicitação sem devolver um identificador de ação.');
    limparAcao(); state.actionId = id; $('saga-state').textContent = 'Solicitação aceita'; showNotice(`Solicitação ${id} recebida. O estado será consultado em Operações.`, 'success');
    state.pollTimer = setInterval(() => consultarAcao(id), 5000); await consultarAcao(id);
  } catch (error) { showNotice(error.message, 'error'); }
  finally { button.disabled = false; }
}

async function perguntar(event) {
  event.preventDefault(); const pergunta = $('question').value.trim(); if (pergunta.length < 5) return showNotice('Escreva uma pergunta com pelo menos cinco caracteres.', 'error');
  const button = event.currentTarget.querySelector('button[type="submit"]'); button.disabled = true; $('answer').textContent = 'Consultando a base de conhecimento…'; clearNotice();
  try {
    const result = await api('/web/v1/consultas', { method: 'POST', body: JSON.stringify({ pergunta, usarRecuperacao: true, ...(state.selectedRegion ? { regiaoId: state.selectedRegion } : {}) }) });
    const answer = document.createElement('p'); answer.className = 'answer-text'; answer.textContent = result.resposta || 'A Análise não retornou uma resposta textual.'; const container = $('answer'); container.replaceChildren(answer);
    if (Array.isArray(result.trechos) && result.trechos.length) { const sources = document.createElement('div'); sources.className = 'source-list'; for (const item of result.trechos) { const chip = document.createElement('span'); chip.className = 'source-chip'; chip.textContent = item.titulo || 'Fonte consultada'; sources.append(chip); } container.append(sources); }
    if (result.origem) { const p = document.createElement('p'); p.className = 'muted'; p.textContent = `Origem da resposta: ${result.origem}`; container.append(p); }
  } catch (error) { $('answer').textContent = error.message; showNotice(error.message, 'error'); }
  finally { button.disabled = false; }
}

function logout() {
  const idToken = state.idToken; clearSession(); limparAcao(); if (!idToken) return;
  const query = new URLSearchParams({ id_token_hint: idToken, client_id: CLIENT_ID, post_logout_redirect_uri: REDIRECT_URI }); window.location.assign(`${OIDC}/logout?${query.toString()}`);
}

async function initialize() {
  $('login-button').addEventListener('click', () => login().catch((error) => showNotice(error.message, 'error'))); $('logout-button').addEventListener('click', logout);
  $('refresh-button').addEventListener('click', carregarPainel); $('region-select').addEventListener('change', (event) => carregarRegiao(event.target.value));
  $('action-form').addEventListener('submit', solicitarAcao); $('question-form').addEventListener('submit', perguntar); $('check-saga-button').addEventListener('click', () => consultarAcao(state.actionId));
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1); $('action-form').elements.data.value = new Date(tomorrow.getTime() - tomorrow.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const query = new URLSearchParams(window.location.search); if (query.has('error')) throw new Error(query.get('error_description') || 'O Keycloak não concluiu o login.');
  if (query.has('code')) await trocarCodigo(query.get('code'), query.get('state')); updateIdentity(); if (state.accessToken) await carregarPainel();
}

initialize().catch((error) => showNotice(error.message, 'error'));
