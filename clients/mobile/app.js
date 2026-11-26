const API_BASE = 'http://localhost:8000';
const regionSelect = document.getElementById('region-select');
const state = { cached: new Map(), request: 0 };

function showMessage(message, kind = 'info') { const element = document.getElementById('message'); element.textContent = message; element.dataset.kind = kind; element.hidden = false; }
function clearMessage() { document.getElementById('message').hidden = true; }

async function loadRegions() {
  regionSelect.disabled = true;
  try {
    const response = await fetch(`${API_BASE}/mobile/v1/publico/regioes?municipio=Lavras`, { headers: { Accept: 'application/json' }, credentials: 'omit' });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.detail || body.title || `Não foi possível carregar as regiões (HTTP ${response.status}).`);
    const items = Array.isArray(body.itens) ? body.itens : []; regionSelect.replaceChildren();
    const placeholder = document.createElement('option'); placeholder.value = ''; placeholder.textContent = items.length ? 'Selecione uma região' : 'Nenhuma região disponível'; regionSelect.append(placeholder);
    for (const region of items) { const option = document.createElement('option'); option.value = region.id; option.textContent = region.nome; regionSelect.append(option); }
    regionSelect.disabled = items.length === 0;
    if (!items.length) { showMessage('Território não retornou regiões para consulta.'); return; }
    const center = items.find((item) => item.nome.toLowerCase() === 'centro') || items[0]; regionSelect.value = center.id; await loadSummary(center.id);
  } catch (error) {
    regionSelect.replaceChildren(); const option = document.createElement('option'); option.value = ''; option.textContent = 'Regiões indisponíveis'; regionSelect.append(option); showMessage(error.message, 'error');
  }
}

function showSummary(data) {
  document.getElementById('empty-state').hidden = true; document.getElementById('loading-state').hidden = true; document.getElementById('summary-content').hidden = false;
  document.getElementById('region-name').textContent = data.regiao; document.getElementById('attention-level').textContent = data.rotulo; document.getElementById('attention-level').dataset.level = data.nivel;
  document.getElementById('level-mark').dataset.level = data.nivel; document.getElementById('summary-message').textContent = data.mensagem;
  const time = document.getElementById('updated-at'); time.textContent = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(data.atualizadoEm)); time.dateTime = data.atualizadoEm;
}

async function loadSummary(regionId) {
  if (!regionId) { document.getElementById('summary-content').hidden = true; document.getElementById('empty-state').hidden = false; return; }
  const requestId = ++state.request; clearMessage(); document.getElementById('summary').setAttribute('aria-busy', 'true');
  document.getElementById('empty-state').hidden = true; document.getElementById('summary-content').hidden = true; document.getElementById('loading-state').hidden = false;
  try {
    const cached = state.cached.get(regionId); const headers = new Headers({ Accept: 'application/json' }); if (cached?.etag) headers.set('If-None-Match', cached.etag);
    const response = await fetch(`${API_BASE}/mobile/v1/publico/regioes/${encodeURIComponent(regionId)}/resumo`, { headers, credentials: 'omit' });
    if (requestId !== state.request) return;
    if (response.status === 304 && cached) { showSummary(cached.data); return; }
    const body = await response.json().catch(() => ({})); if (!response.ok) throw new Error(body.detail || body.title || `Não foi possível consultar a região (HTTP ${response.status}).`);
    state.cached.set(regionId, { data: body, etag: response.headers.get('ETag') }); showSummary(body);
  } catch (error) {
    if (requestId !== state.request) return; document.getElementById('loading-state').hidden = true; document.getElementById('empty-state').hidden = false;
    document.querySelector('#empty-state h2').textContent = 'Não foi possível atualizar'; document.querySelector('#empty-state p').textContent = 'Tente novamente quando a conexão estiver disponível.'; showMessage(error.message, 'error');
  } finally { if (requestId === state.request) document.getElementById('summary').setAttribute('aria-busy', 'false'); }
}

regionSelect.addEventListener('change', () => loadSummary(regionSelect.value));
loadRegions();
