/** Single browser application owner for the Fieldwork POC. */
const app = { state: null, catalog: [], view: 'today', busy: false, plan: null, result: null }
const $ = s => document.querySelector(s)
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
const button = (action, label, id = '', primary = false) => `<button class="${primary ? 'primary' : 'secondary'}" data-action="${action}" data-id="${escape(id)}">${label}</button>`
const heading = (kicker, title, sub) => `<div class="kicker">${kicker}</div><h1>${title}</h1><p class="sub">${sub}</p>`
const field = (name, label, value, type = 'text', attrs = '') => `<label for="${name}">${label}</label><input id="${name}" name="${name}" type="${type}" value="${escape(value)}" required ${attrs}>`
const areaInput = value => field('area', 'Area (ha)', value, 'number', 'min="0.01" max="100000" step="any"')
const textarea = (name, label, value) => `<label for="${name}">${label}</label><textarea id="${name}" name="${name}" required maxlength="2000">${escape(value)}</textarea>`
const note = text => `<p class="note">${text}</p>`
function notice(message) { $('#notice').textContent = message; setTimeout(() => { $('#notice').textContent = '' }, 6000) }
function dialog(html) { $('#modal-body').innerHTML = html; if (!$('#modal').open) $('#modal').showModal() }
function close() { $('#modal').close() }
async function request(command) {
  const response = await fetch('/fieldwork/api', command ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(command) } : {})
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || 'Could not load this workspace. Reopen the authenticated launch URL.')
  return data
}
async function mutate(command) {
  const data = await request(command)
  app.state = data.state
  return data.result
}
function render() {
  const views = [['today', '◒', 'Today'], ['farm', '⌂', 'My farm'], ['community', '◎', 'Community'], ['experiments', '↗', 'Experiments'], ['plugins', '⊞', 'Plug-ins']]
  $('nav').innerHTML = views.map(([id, icon, label]) => `<button data-view="${id}" class="${id === app.view ? 'selected' : ''}" ${id === app.view ? 'aria-current="page"' : ''}><span aria-hidden="true">${icon}</span>${label}</button>`).join('')
  $('#farm-name').textContent = app.state.farm.name
  $('#content').innerHTML = ({ today, farm, community, experiments, plugins }[app.view])()
}
function today() {
  const f = app.state.farm
  return heading('YOUR FARM, AT YOUR PACE', 'A little more knowledge. A better next step.', 'Start with your current approach. Add a useful tool. Test one change before making it your way.') + `<section class="card hero"><div class="row"><span class="kicker">YOUR CURRENT APPROACH</span><span class="badge">Farmer-reported baseline</span></div><h2>${escape(f.crop)} · ${f.area} ha</h2><p>${escape(f.approach)}</p><div class="rule">${escape(f.reason)}</div>${button('navigate', 'Review my farm', 'farm')}</section><div class="grid"><section class="card"><div class="field-icon">01 / Compare</div><h2>Keep most. Try a little.</h2><p>Explore a crop change on a small area while keeping your baseline visible.</p>${button('open-plugin', 'Explore crop planner', 'crop-plan', true)}</section><section class="card"><div class="field-icon">02 / Learn</div><h2>Borrow a starting point.</h2><p>See a neighbour’s method, including what they still don’t know. Adapt it privately.</p>${button('navigate', 'Explore community', 'community')}</section></div><section class="card row"><div><h3>Your learning notebook</h3><span class="muted">${app.state.experiments.length} private experiments · ${app.state.active.length} active plugins</span></div>${button('navigate', 'Open experiments', 'experiments')}</section>`
}
function farm() {
  const f = app.state.farm
  return heading('MY FARM', 'Start with what you know.', 'Your context belongs to this runtime. Keep your approach and its reasons together.') + `<form class="card" data-form="farm"><h2>Farm context</h2><div class="fields"><div>${field('name', 'Farm name', f.name)}</div><div>${field('region', 'Broad region', f.region)}</div><div>${areaInput(f.area)}</div><div>${field('crop', 'Current main crop', f.crop)}</div></div>${textarea('approach', 'What do you currently do?', f.approach)}${textarea('reason', 'Why does this work for you?', f.reason)}${note('Farmer-reported context. Updating these notes does not rewrite existing experiments or publish your records.')}<div class="actions"><button class="primary">Save my context</button></div></form><section class="card"><h3>Private by default</h3><p>Records are saved on this computer. Community sharing uses a separate summary you preview. A cloud model receives context only when you choose to use the agent and its farm-context tool.</p></section>`
}
function community() {
  return heading('COMMUNITY', 'Useful knowledge has a context.', 'Explore a method. Keep its limitations. Make your own private version.') + `<p class="badge sample">Local demo feed · no online publication or real growers</p><div class="grid">${app.state.posts.map(p => `<article class="card"><div class="row"><span class="note">${escape(p.author)}</span><span class="badge ${p.sample ? 'sample' : ''}">${p.sample ? 'Sample knowledge' : 'Your local summary'}</span></div><h2>${escape(p.title)}</h2><p>${escape(p.takeaway)}</p><details><summary>Method & limits</summary><p><b>Baseline:</b> ${escape(p.baseline)}</p><p><b>Change:</b> ${escape(p.change)}</p>${note(`Source: ${escape(p.source)}`)}${note('A starting point, not a prescription. Results may not transfer to another field or season.')}</details><div class="actions">${button('adapt', 'Adapt privately', p.id, true)}${!p.sample ? button('withdraw', 'Remove summary', p.id) : ''}</div></article>`).join('')}</div>`
}
function experiments() {
  return (app.state.runs.length ? `<details class="card"><summary>Saved comparisons · ${app.state.runs.length} recent runs</summary>${app.state.runs.map(r => `<div class="observation"><h3>${escape(r.plugin)} · v${r.version}</h3><p>${escape(JSON.stringify(r.inputs))}</p><p>${escape(JSON.stringify(r.result))}</p></div>`).join('')}</details>` : '') + heading('EXPERIMENTS', 'One change. A record worth keeping.', 'Compare against your baseline. Keep observations distinct from interpretation. An inconclusive result is still useful.') + (app.state.experiments.length ? app.state.experiments.map(t => `<article class="card"><div class="row"><h2>${escape(t.title)}</h2><span class="badge">${t.status === 'draft' ? 'Private draft' : 'Tracking observations'}</span></div><div class="grid"><div><h3>Current approach</h3><p>${escape(t.baseline)}</p></div><div><h3>Proposed change</h3><p>${escape(t.change)}</p></div></div>${note(`Source: ${escape(t.source)}`)}<h3>Observations</h3>${t.observations.map(o => `<div class="observation">${escape(o)}</div>`).join('') || '<p class="muted">No observations yet. Start tracking when you are ready.</p>'}<div class="actions">${t.status === 'draft' ? button('edit', 'Adapt this draft', t.id) + button('track', 'Start observation tracking', t.id, true) : button('observe', 'Record an observation', t.id, true)}${button('share', 'Preview a summary', t.id)}</div></article>`).join('') : `<div class="card empty"><h2>Your first experiment starts with a question.</h2><p>Adapt a community method or use the crop planner to draft a small comparison.</p>${button('navigate', 'Find a method', 'community', true)}</div>`)
}
function plugins() {
  return heading('PLUG-INS', 'Build your own way of working.', 'Each tool adds something specific. Try a sample first; activation is a separate choice.') + `<div class="steps"><span>1 · Capture your approach</span><span>2 · Add a source or calculation</span><span>3 · Test a small change</span><span>4 · Keep what you learn</span></div>` + app.catalog.map(p => `<article class="card plugin"><div><span class="kicker">${escape(p.role)}</span><h2>${escape(p.name)}</h2><p>${escape(p.description)}</p></div><span class="badge ${app.state.active.includes(p.id) ? '' : 'sample'}">${app.state.active.includes(p.id) ? 'Active · v1' : 'Available · v1'}</span><div class="actions">${button('sample', 'Try sample', p.id)}${app.state.active.includes(p.id) ? button('open-plugin', 'Open', p.id, true) + button('pause', 'Pause', p.id) : button('activate', 'Review activation', p.id, true)}</div></article>`).join('')
}
function openPlugin(id) {
  if (!app.state.active.includes(id)) { activate(id); return }
  if (id === 'farm' || id === 'community') { app.view = id; render(); return }
  if (id === 'seed-cost') dialog(`<h2>Seed cost check</h2><p>Compare two quotes at the same planting rate.</p><form data-form="seed"><div class="fields"><div>${areaInput(app.state.farm.area)}</div><div>${field('rate', 'Planting rate (bags/ha)', 1.5, 'number', 'min="0.01" step="any"')}</div><div>${field('current', 'Current quote (CAD/bag)', 120, 'number', 'min="0" step="any"')}</div><div>${field('alternative', 'Alternative quote (CAD/bag)', 108, 'number', 'min="0" step="any"')}</div></div><div class="actions"><button class="primary">Compare costs</button></div></form><div id="calculation"></div>`)
  if (id === 'crop-plan') dialog(`<h2>Keep your baseline. Try a small change.</h2><p>${escape(app.state.farm.crop)} · ${app.state.farm.area} ha currently available</p><form data-form="plan">${field('crop', 'What crop or approach would you like to explore?', 'Locally reviewed cover-crop mix')}${field('trialArea', 'Trial area (ha)', Math.min(.5, app.state.farm.area), 'number', `min="0.01" max="${app.state.farm.area}" step="any"`)}${note('An area comparison, not a crop recommendation. Keep equipment, soil, timing, and rotation constraints in your review.')}<div class="actions"><button class="primary">Compare area allocation</button></div></form><div id="calculation"></div>`)
  if (id === 'weather') dialog(`<span class="badge sample">Sample forecast · not live weather</span><h2>A forecast adds context.</h2><p>Keep your own field observations beside it.</p><div class="weather">${[['Day 1', 'Rain', '8 mm'], ['Day 2', 'Cloud', '2 mm'], ['Day 3', 'Clear', '0 mm']].map(d => `<div class="card"><h3>${d[0]}</h3><p>${d[1]}</p><div class="metric">${d[2]}</div></div>`).join('')}</div><div class="rule">Your note: ${escape(app.state.farm.reason)}</div>${note('No provider is connected. A dry forecast does not establish soil workability. A future plugin can record issue time and source beside your observation.')}`)
}
function activate(id) {
  const p = app.catalog.find(p => p.id === id)
  dialog(`<span class="kicker">ACTIVATION REVIEW · V1</span><h2>${escape(p.name)}</h2><p>${escape(p.description)}</p><p>Scope: this local demo workspace. No background jobs, online sharing, or external data requests.</p>${note('You can pause this plugin without deleting your records.')}<div class="actions">${button('confirm-activate', 'Activate this plugin', id, true)}</div>`)
}
function sample(id) {
  const p = app.catalog.find(p => p.id === id)
  dialog(`<span class="badge sample">Sample only · nothing activated or saved</span><h2>${escape(p.name)}</h2><p>${escape(p.description)}</p><div class="rule">${escape(({ farm: 'Keep the wet-field planting note beside your crop history.', community: 'Copy a neighbour’s method into your own private draft, with attribution.', 'crop-plan': 'Keep 11.5 ha of the current approach; compare a change on 0.5 ha.', 'seed-cost': 'Example: 12 ha × 1.5 bags/ha × CAD 12/bag difference = CAD 216 less in purchase cost.', weather: 'Sample: 8 mm of rain tomorrow. Your field note still says the lower area drains slowly.' })[id])}</div><div class="actions">${button('activate', 'Review activation', id, true)}</div>`)
}
function sharing(id) {
  const t = app.state.experiments.find(t => t.id === id)
  dialog(`<h2>Choose what to share.</h2><p>Only the fields below and the method will be included. Your raw observations and farm context stay private.</p><form data-form="preview" data-id="${escape(id)}">${field('title', 'Summary title', t.title)}${textarea('takeaway', 'What did you learn? Include uncertainty.', 'We are still learning. This result is specific to our field and conditions.')}<div class="actions"><button class="primary">Preview selected summary</button></div></form>${note('Audience: local demo feed only. Free text is not automatically anonymized; check it for private details.')}`)
}
$('#close-dialog').addEventListener('click', close)
$('#modal').addEventListener('click', e => { if (e.target === $('#modal')) close() })
document.addEventListener('click', async event => {
  const view = event.target.closest('[data-view]')
  if (view) { app.view = view.dataset.view; render(); return }
  const target = event.target.closest('[data-action]')
  if (!target || app.busy) return
  const { action, id } = target.dataset
  try {
    app.busy = true
    if (action === 'navigate') { app.view = id; render() }
    if (action === 'open-plugin') openPlugin(id)
    if (action === 'sample') sample(id)
    if (action === 'activate') activate(id)
    if (action === 'confirm-activate' || action === 'pause') {
      await mutate({ action: 'activate', plugin: id, enabled: action === 'confirm-activate' }); close(); render(); notice(action === 'pause' ? 'Plugin paused. Your records are kept.' : 'Plugin activated. You decide when to use it.')
    }
    if (action === 'adapt') { await mutate({ action: 'adapt', postId: id }); app.view = 'experiments'; render(); notice('Method copied into a private draft. Tracking has not started.') }
    if (action === 'edit') {
      const t = app.state.experiments.find(t => t.id === id)
      dialog(`<h2>Make this method fit your farm.</h2><form data-form="edit" data-id="${escape(id)}">${field('title', 'Experiment title', t.title)}${textarea('baseline', 'Your current approach', t.baseline)}${textarea('change', 'The one change you want to test', t.change)}<div class="actions"><button class="primary">Save private draft</button></div></form>`)
    }
    if (action === 'track') dialog(`<h2>Start observation tracking?</h2><p>This lets you record what happens. It does not approve a farming treatment or schedule physical work.</p><div class="actions">${button('confirm-track', 'Start tracking', id, true)}</div>`)
    if (action === 'confirm-track') { await mutate({ action: 'track', id }); close(); render() }
    if (action === 'observe') dialog(`<h2>What happened?</h2><form data-form="observe" data-id="${escape(id)}">${textarea('observation', 'Record a measurement, condition, or deviation.', '')}<div class="actions"><button class="primary">Save observation privately</button></div></form>`)
    if (action === 'share') sharing(id)
    if (action === 'withdraw') { await mutate({ action: 'withdraw', id }); render(); notice('Summary removed. Your private experiment is kept.') }
    if (action === 'draft-plan') {
      await mutate({ action: 'draft', title: `Explore ${app.plan.proposal}`, baseline: `${app.state.farm.crop} across ${app.state.farm.area} ha. ${app.state.farm.approach}`, change: `Try ${app.plan.proposal} on ${app.plan.trialArea} ha; retain the current approach on ${app.plan.retainedArea} ha.` }); close(); app.view = 'experiments'; render()
    }
  } catch (error) { notice(error.message) } finally { app.busy = false }
})
document.addEventListener('submit', async event => {
  const form = event.target.closest('[data-form]')
  if (!form) return
  event.preventDefault()
  if (app.busy) return
  app.busy = true
  const submit = form.querySelector('button[type="submit"], button:not([type])')
  if (submit) submit.disabled = true
  const values = Object.fromEntries(new FormData(form))
  const type = form.dataset.form
  try {
    if (type === 'farm') { await mutate({ action: 'farm', farm: { ...values, area: Number(values.area) } }); render(); notice('Farm context saved on this computer.') }
    if (type === 'seed') {
      const r = await mutate({ action: 'seed', ...Object.fromEntries(Object.entries(values).map(([k, v]) => [k, Number(v)])) })
      $('#calculation').innerHTML = `<div class="rule"><h3>Purchase-cost comparison</h3><p>Current: CAD ${r.currentCost.toFixed(2)} · Alternative: CAD ${r.alternativeCost.toFixed(2)}</p><div class="metric">CAD ${Math.abs(r.saving).toFixed(2)} <small>${r.saving >= 0 ? 'less' : 'more'} in purchase cost</small></div>${note(escape(r.scope))}</div>`
    }
    if (type === 'plan') {
      app.plan = await mutate({ action: 'plan', crop: values.crop, trialArea: Number(values.trialArea) })
      $('#calculation').innerHTML = `<div class="rule"><h3>Your baseline stays visible.</h3><p>Keep ${app.plan.retainedArea} ha of ${escape(app.plan.baseline)}. Explore ${escape(app.plan.proposal)} on ${app.plan.trialArea} ha.</p>${note(escape(app.plan.scope))}${button('draft-plan', 'Save a private experiment draft', '', true)}</div>`
    }
    if (type === 'edit') { await mutate({ action: 'edit', id: form.dataset.id, ...values }); close(); render(); notice('Draft adapted. Source attribution is kept.') }
    if (type === 'observe') { await mutate({ action: 'observe', id: form.dataset.id, observation: values.observation }); close(); render(); notice('Observation saved privately.') }
    if (type === 'preview') {
      const t = app.state.experiments.find(t => t.id === form.dataset.id)
      dialog(`<span class="badge sample">Preview · local demo audience</span><h2>${escape(values.title)}</h2><p>${escape(values.takeaway)}</p><div class="rule"><p>Baseline: ${escape(t.baseline)}</p><p>Change: ${escape(t.change)}</p></div>${note('Author: You · local demo. Raw observations and farm context are excluded. Check all text for private details.')}<form data-form="publish" data-id="${escape(t.id)}"><input type="hidden" name="title" value="${escape(values.title)}"><input type="hidden" name="takeaway" value="${escape(values.takeaway)}"><button class="primary">Confirm sharing to local demo feed</button></form>`)
    }
    if (type === 'publish') { await mutate({ action: 'publish', id: form.dataset.id, title: values.title, takeaway: values.takeaway, confirmed: true }); close(); app.view = 'community'; render(); notice('Summary added to the local demo feed. Nothing was uploaded.') }
  } catch (error) { notice(error.message) } finally { app.busy = false; if (submit?.isConnected) submit.disabled = false }
})
try { const data = await request(); app.state = data.state; app.catalog = data.catalog; render() }
catch (error) { $('#content').textContent = error.message }
