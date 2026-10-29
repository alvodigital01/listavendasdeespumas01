const DAILY_LIMIT = 25;
const START_DATE = '2026-10-29';
const CONTACT_KEY = 'rc_contatados_agenda';
const LEGACY_KEYS = ['rc_contatados', 'rc_contatados_pagina2', 'rc_contatados_pagina3'];
const el = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[char]));
const key = lead => lead.nome + '|' + (lead.telefone || lead.wpp_num);
const LEAD_NUMBERS = new Map(ALL_LEADS.map((lead, index) => [lead, index + 1]));

function makeSchedule(leads) {
  const days = [];
  const date = new Date(START_DATE + 'T12:00:00Z');
  for (let offset = 0; offset < leads.length; offset += DAILY_LIMIT) {
    while (date.getUTCDay() === 0) date.setUTCDate(date.getUTCDate() + 1);
    days.push({date: date.toISOString().slice(0, 10), leads: leads.slice(offset, offset + DAILY_LIMIT)});
    date.setUTCDate(date.getUTCDate() + 1);
  }
  return days;
}
const SCHEDULE = makeSchedule(ALL_LEADS);
const requestedDate = new URLSearchParams(window.location.search).get('dia');
let dayIndex = Math.max(0, SCHEDULE.findIndex(day => day.date === requestedDate));
let current = 'todos', hideDone = false, query = '';

function readSaved(storageKey) {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey) || '{}');
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch { return {}; }
}
function loadDone() {
  // Import old page records once; later unmarking must not restore old records.
  const saved = readSaved(CONTACT_KEY);
  if (saved.version === 1) return saved.contacts || {};
  const contacts = Object.assign({}, ...LEGACY_KEYS.map(readSaved));
  try { localStorage.setItem(CONTACT_KEY, JSON.stringify({version: 1, contacts})); } catch {}
  return contacts;
}
let done = loadDone();
function saveDone() {
  try { localStorage.setItem(CONTACT_KEY, JSON.stringify({version: 1, contacts: done})); }
  catch { el('feedback').textContent = 'O navegador não conseguiu salvar a marcação. Mantenha esta página aberta.'; }
}
function shortDate(value) { return value.slice(8, 10) + '/' + value.slice(5, 7); }
function weekday(value) { return new Date(value + 'T12:00:00Z').toLocaleDateString('pt-BR', {weekday: 'long', timeZone: 'UTC'}); }
function render_msg(tpl, lead) {
  const values = {nome: lead.nome, cidade: lead.cidade || 'sua cidade', bairro: lead.bairro ? lead.bairro + ', ' : '', categoria: (lead.categoria || 'estofados').toLowerCase(), saudacao: 'tudo bem'};
  return tpl.replace(/\{(nome|cidade|bairro|categoria|saudacao)\}/g, (_, name) => values[name] || '');
}
function listNow() {
  return SCHEDULE[dayIndex].leads.filter(lead => {
    if (current === 'com' && !lead.wpp_num) return false;
    if (current === 'sem' && lead.wpp_num) return false;
    if (current === 'contatados' && !done[key(lead)]) return false;
    if (current !== 'contatados' && hideDone && done[key(lead)]) return false;
    return !query || [lead.nome, lead.cidade, lead.bairro, lead.categoria, lead.telefone, lead.whatsapp].join(' ').toLocaleLowerCase('pt-BR').includes(query);
  });
}
function renderDays() {
  el('day-nav').innerHTML = SCHEDULE.map((day, index) => {
    const contacted = day.leads.filter(lead => done[key(lead)]).length;
    return `<a class="page-link day-link${index === dayIndex ? ' active' : ''}" href="?dia=${day.date}" ${index === dayIndex ? 'aria-current="page"' : ''}><strong>${shortDate(day.date)}</strong><span>${day.leads.length} leads · ${contacted} contatados</span></a>`;
  }).join('');
  el('previous-day').hidden = dayIndex === 0;
  el('previous-day').href = '?dia=' + SCHEDULE[Math.max(0, dayIndex - 1)].date;
  el('next-day').hidden = dayIndex === SCHEDULE.length - 1;
  el('next-day').href = '?dia=' + SCHEDULE[Math.min(SCHEDULE.length - 1, dayIndex + 1)].date;
}
function stats() {
  const day = SCHEDULE[dayIndex];
  const count = day.leads.filter(lead => done[key(lead)]).length;
  el('day-heading').textContent = shortDate(day.date) + ' · ' + weekday(day.date);
  el('day-detail').textContent = `Dia ${dayIndex + 1} de ${SCHEDULE.length} · Leads #${LEAD_NUMBERS.get(day.leads[0])} a #${LEAD_NUMBERS.get(day.leads.at(-1))} · ${listNow().length} nesta visão`;
  document.title = shortDate(day.date) + ' · Agenda de leads · Rocha Decor Espumas';
  el('stats').innerHTML = `<div class="stat"><b>${day.leads.length}</b><span>Leads do dia</span></div><div class="stat"><b>${day.leads.length - count}</b><span>Pendentes do dia</span></div><div class="stat hi"><b>${count}</b><span>Contatados do dia</span></div><div class="stat"><b>${ALL_LEADS.length}</b><span>Leads na agenda</span></div>`;
  el('cntTodos').textContent = `(${day.leads.length})`;
  el('cntCom').textContent = `(${day.leads.filter(lead => lead.wpp_num).length})`;
  el('cntSem').textContent = `(${day.leads.filter(lead => !lead.wpp_num).length})`;
  el('cntDone').textContent = `(${count})`;
}
function preview(lead = listNow()[0] || SCHEDULE[dayIndex].leads[0]) {
  el('prevtext').textContent = render_msg(el('tpl').value, lead);
  el('preview-label').textContent = 'Prévia: ' + lead.nome;
}
function markDone(lead, value) {
  const contacted = value === undefined ? !done[key(lead)] : value;
  if (contacted) done[key(lead)] = new Date().toISOString();
  else delete done[key(lead)];
  saveDone(); draw();
}
function sendWpp(lead) {
  preview(lead);
  window.open(`https://wa.me/${lead.wpp_num}?text=${encodeURIComponent(render_msg(el('tpl').value, lead))}`, '_blank', 'noopener');
  markDone(lead, true);
}
async function copyMsg(lead, button) {
  preview(lead);
  try {
    await navigator.clipboard.writeText(render_msg(el('tpl').value, lead));
    button.textContent = '✓ Copiado';
    setTimeout(() => { button.textContent = 'Copiar mensagem'; }, 1500);
  } catch { el('feedback').textContent = 'Não foi possível copiar. Selecione o texto na prévia e use Ctrl+C.'; }
}
function card(lead) {
  const contacted = done[key(lead)];
  const links = [];
  if (lead.telefone) links.push(`<a href="tel:${lead.telefone.replace(/\D/g, '')}">${esc(lead.telefone)}</a>`);
  if (lead.site) links.push(`<a href="${esc(lead.site)}" target="_blank" rel="noopener">Site</a>`);
  if (lead.instagram) links.push(`<a href="${esc(lead.instagram)}" target="_blank" rel="noopener">Instagram</a>`);
  if (lead.email) links.push(`<a href="mailto:${esc(lead.email)}">E-mail</a>`);
  if (lead.maps || lead.url_maps) links.push(`<a href="${esc(lead.maps || lead.url_maps)}" target="_blank" rel="noopener">Maps</a>`);
  const row = document.createElement('li');
  row.className = 'card lead-row' + (contacted ? ' done' : '');
  row.innerHTML = `<div class="lead-main"><div class="cname"><span class="lead-number">#${String(LEAD_NUMBERS.get(lead)).padStart(3, '0')}</span>${esc(lead.nome)}</div><div class="ccat">${esc(lead.categoria)}${lead.cidade ? ' · ' + esc([lead.bairro, lead.cidade].filter(Boolean).join(', ')) : ''}</div><div class="contact">${links.join('')}</div>${contacted ? `<div class="stampline">✓ Contatado em ${esc(new Date(contacted).toLocaleString('pt-BR'))}</div>` : ''}${!lead.telefone && !lead.wpp_num ? '<div class="hint">Sem telefone cadastrado. Consulte os links disponíveis.</div>' : ''}${lead.obs ? `<details><summary>Observações</summary><p class="obs">${esc(lead.obs)}</p></details>` : ''}</div><div class="actions">${lead.wpp_num ? '<button class="btn btn-wpp" data-act="wpp">WhatsApp</button>' : lead.telefone ? `<a class="btn btn-call" href="tel:${lead.telefone.replace(/\D/g, '')}">Ligar</a>` : ''}<button class="btn btn-copy" data-act="copy">Copiar mensagem</button><button class="btn btn-ghost" data-act="toggle" title="${contacted ? 'Desfazer contato' : 'Marcar contatado'}">${contacted ? '↩' : '✓'}</button></div>`;
  row.querySelectorAll('[data-act]').forEach(button => {
    button.onclick = () => {
      if (button.dataset.act === 'wpp') sendWpp(lead);
      else if (button.dataset.act === 'copy') copyMsg(lead, button);
      else markDone(lead);
    };
  });
  return row;
}
function draw() {
  const list = listNow();
  el('grid').innerHTML = '';
  list.forEach(lead => el('grid').appendChild(card(lead)));
  el('empty').hidden = list.length > 0;
  const pending = list.filter(lead => lead.wpp_num && !done[key(lead)]);
  el('bulkbar').hidden = !pending.length || current === 'contatados';
  el('queue-count').textContent = `${pending.length} leads com WhatsApp pendentes nesta visão.`;
  stats(); renderDays(); preview();
}
el('seq').onclick = () => {
  const lead = listNow().find(lead => lead.wpp_num && !done[key(lead)]);
  if (lead) sendWpp(lead);
};
document.querySelectorAll('.tab').forEach(tab => tab.onclick = () => {
  document.querySelectorAll('.tab').forEach(item => item.classList.remove('active'));
  tab.classList.add('active'); current = tab.dataset.list; draw();
});
el('tpl').oninput = () => preview();
el('search').oninput = event => { query = event.target.value.trim().toLocaleLowerCase('pt-BR'); draw(); };
el('fPend').onclick = function () { hideDone = !hideDone; this.classList.toggle('on', hideDone); this.setAttribute('aria-pressed', String(hideDone)); draw(); };
el('vars').innerHTML = ['{nome}', '{cidade}', '{bairro}', '{categoria}', '{saudacao}'].map(value => `<button type="button" class="chip" data-v="${value}">${value}</button>`).join('');
document.querySelectorAll('.chip').forEach(chip => chip.onclick = () => {
  const input = el('tpl');
  input.setRangeText(chip.dataset.v, input.selectionStart, input.selectionEnd, 'end'); input.focus(); preview();
});
window.addEventListener('storage', event => { if (event.key === CONTACT_KEY) { done = loadDone(); draw(); } });
draw();
