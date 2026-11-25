const $ = id => document.getElementById(id);
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, char =>
  ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[char]));
const labels = {confirm:'Confirm installation', access:'Request landlord access', clarify:'Clarify install window'};
const tabs = ['Review desk', 'Orders', 'Follow-ups', 'Activity', 'Ask the desk'];
let data, selected, tab = tabs[0], noticeTimer;
async function api(path, payload) {
  const options = payload ? {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload)} : {};
  const response = await fetch('/api/' + path, options);
  const result = await response.json();
  if (!response.ok) throw Error(result.error || 'Request failed');
  return result;
}
function notice(message) {
  $('notice').textContent = message;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => $('notice').textContent = '', 5000);
}
async function refresh() {
  data = await api('state');
  selected ??= data.messages.at(-1)?.id;
  render();
}
function dateReview(select) {
  const foot = select.closest('.foot');
  const approve = foot.querySelector('[data-decision]:last-child');
  const dismiss = foot.querySelector('[data-decision="dismiss"]');
  const p = data.proposals.find(row => row.id === Number(approve.dataset.id));
  const o = data.orders.find(row => row.id === select.value);
  const changed = p.kind === 'confirm' && o && o.install && o.install !== p.target;
  foot.parentElement.querySelector('.date-change')?.remove();
  approve.disabled = !o;
  approve.dataset.decision = changed ? 'reschedule' : 'approve';
  approve.dataset.previous = changed ? o.install : '';
  approve.textContent = changed ? 'Accept new date' : 'Approve';
  dismiss.dataset.previous = approve.dataset.previous;
  dismiss.textContent = changed ? 'Keep current date' : 'Dismiss';
  if (!changed) return;
  const last = data.audit.slice().reverse().map(a => data.proposals.find(x => x.id === a.pid))
    .find(x => x && x.state === 'approved' && x.chosen === o.id && x.kind === 'confirm' && x.target === o.install);
  function source(row) {
    const m = row && data.messages.find(x => x.id === row.mid);
    return m ? '<button data-mid="'+m.id+'">'+escapeHTML(m.subject)+'</button><blockquote>'+escapeHTML(row.quote)+'</blockquote>' : 'Source unavailable';
  }
  const panel = document.createElement('aside');
  panel.className = 'date-change';
  panel.innerHTML = '<h3>Install date changed</h3><p><strong>Current · '+escapeHTML(o.install)+'</strong></p>'+source(last)+
    '<p><strong>Proposed · '+escapeHTML(p.target)+'</strong></p>'+source(p);
  foot.before(panel);
}
function card(p) {
  const orders = data.orders.filter(o => o.site === p.site && (!p.city || o.city === p.city));
  const pending = p.state === 'pending';
  const choices = orders.map(o => '<option value="'+escapeHTML(o.id)+'">'+escapeHTML(o.id+' · '+o.city)+'</option>').join('');
  const selector = '<select aria-label="Order for '+escapeHTML(p.site)+'" id="order-'+p.id+'">'+
    (orders.length === 1 ? '' : '<option value="">'+(orders.length ? 'Choose matching order' : 'No matching order')+'</option>')+choices+'</select>';
  return '<article class="card"><div class="spread"><span class="ord">'+escapeHTML([p.site,p.city].filter(Boolean).join(' / '))+'</span><span class="tag '+escapeHTML(p.state)+'">'+escapeHTML(p.state)+'</span></div><h3>'+labels[p.kind]+(p.target?' · '+escapeHTML(p.target):'')+'</h3><blockquote>'+escapeHTML(p.quote)+'</blockquote>'+
    (pending ? '<div class="foot">'+selector+'<div class="action"><button data-decision="dismiss" data-id="'+p.id+'">Dismiss</button><button class="primary" data-decision="approve" data-id="'+p.id+'" '+(orders.length === 1?'':'disabled')+'>Approve</button></div></div>' : '<span class="meta">'+escapeHTML(p.chosen || 'Dismissed by reviewer')+'</span>')+'</article>';
}
function review() {
  const m = data.messages.find(item => item.id === selected);
  if (!m) return '<p class="empty">Add a carrier update to start reviewing.</p>';
  const proposals = data.proposals.filter(p => p.mid === m.id);
  const inbox = data.messages.slice().reverse().map(item => {
    const pending = data.proposals.filter(p => p.mid === item.id && p.state === 'pending').length;
    return '<button class="pick '+(m.id === item.id?'active':'')+'" data-mid="'+item.id+'"><strong>'+escapeHTML(item.subject)+'</strong><span class="meta">'+escapeHTML(item.day)+' · '+pending+' pending</span></button>';
  }).join('');
  return '<div class="layout"><aside class="inbox"><div class="sectionLabel">Incoming updates</div>'+inbox+'</aside><section><article class="paper"><p class="kicker">Carrier message</p><h2 class="subject">'+escapeHTML(m.subject)+'</h2><p class="meta">'+escapeHTML(m.day)+' &nbsp; / &nbsp; '+escapeHTML(m.engine)+'</p><p class="body">'+escapeHTML(m.body)+'</p></article><div class="spread subhead"><h2>Proposed actions</h2><span class="num">'+proposals.filter(p=>p.state==="pending").length+' awaiting review</span></div>'+ (proposals.map(card).join('') || '<p class="empty">No supported actions were extracted.</p>')+'</section></div>';
}
function ledger(headings, rows, empty) {
  if (!rows.length) return '<div class="ledger empty">'+empty+'</div>';
  return '<div class="ledger"><table><thead><tr>'+headings.map(h=>'<th>'+h+'</th>').join('')+'</tr></thead><tbody>'+rows.map(row=>'<tr>'+row.map(cell=>'<td>'+escapeHTML(cell)+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';
}
function render() {
  const counts = [data.proposals.filter(p=>p.state==='pending').length,data.orders.length,data.tasks.length,data.audit.length];
  $('nav').innerHTML = tabs.map((name,i)=>'<button data-tab="'+i+'" aria-current="'+(name===tab)+'">'+name+(counts[i]===undefined?'':' <span class="count">'+counts[i]+'</span>')+'</button>').join('');
  let view;
  if(tab===tabs[0]) view=review();
  if(tab===tabs[1]) view=ledger(['Order','Site','City','Install date'],data.orders.map(o=>[o.id,o.site,o.city,o.install || 'Unscheduled']),'No orders yet.');
  if(tab===tabs[2]) view=ledger(['Order','Follow-up draft'],data.tasks.map(t=>[t.oid,t.draft]),'Approved access and clarification requests appear here.');
  if(tab===tabs[3]) view=ledger(['Time (UTC)','Decision','Source update'],data.audit.slice().reverse().map(a=>{
    const p=data.proposals.find(item=>item.id===a.pid);
    return [a.at,a.note,data.messages.find(m=>m.id===p?.mid)?.subject];
  }),'Review an action to start the activity log.');
  if(tab === 'Ask the desk') view = chatView();
  $('workspace').innerHTML=view;
  $('workspace').querySelectorAll('.foot select').forEach(dateReview);
}
$('nav').onclick = e => {const b=e.target.closest('[data-tab]'); if(b){tab=tabs[b.dataset.tab]; render();}};
$('workspace').onchange = e => {
  if(e.target.matches('.foot select')) dateReview(e.target);

};
$('workspace').onclick = async e => {
  const b=e.target.closest('button'); if(!b)return;
  if(b.dataset.mid){tab=tabs[0]; selected=Number(b.dataset.mid); render(); return;}
  if(!b.dataset.decision)return;
  b.disabled=true;
  try{
    await api('review',{id:Number(b.dataset.id),action:b.dataset.decision,previous:b.dataset.previous,order:$('order-'+b.dataset.id).value});
    await refresh(); notice('Decision saved');
  }catch(err){notice(err.message); await refresh();}
};
function fillSample(){
  const sample=data.samples[Number($('sample').value)];
  $('subject').value=sample?.subject || ''; $('body').value=sample?.body || '';
  $('day').value=sample?.day || new Date().toLocaleDateString('sv-SE');
  $('err').textContent='';
}
$('new').onclick=()=>{
  if(!data)return;
  $('sample').innerHTML=data.samples.map((s,i)=>'<option value="'+i+'">'+escapeHTML(s.subject)+'</option>').join('')+'<option value="-1">Write a custom update</option>';
  $('sample').value=data.model?'-1':'1'; fillSample();
  $('mode').textContent=data.model?'Custom updates use '+data.model+' locally.':'Offline demo · Samples replay saved extractions. Custom updates require a local model.';
  $('compose').showModal();
};
$('sample').onchange=fillSample;
$('close').onclick=()=>$('compose').close();
$('form').onsubmit=async e=>{
  e.preventDefault(); $('analyze').disabled=true; $('analyze').textContent='Analyzing…'; $('err').textContent='';
  try{
    const result=await api('ingest',{subject:$('subject').value,body:$('body').value,day:$('day').value});
    selected=result.id; tab=tabs[0]; await refresh(); $('compose').close(); notice('Update ready for review');
  }catch(err){$('err').textContent=err.message;}
  finally{$('analyze').disabled=false; $('analyze').textContent='Analyze update →';}
};
const turns = [];
let chatContext = {}, asking = false;
function chatView() {
  const messages = turns.map(t => {
    const links = (t.sources || []).map(s => '<button data-mid="'+Number(s.id)+'">'+escapeHTML(s.subject)+'</button>').join(' ');
    return '<article class="chat-turn"><strong>'+t.role+'</strong><p>'+escapeHTML(t.answer)+'</p>'+
      (t.draft ? '<label>Follow-up draft<textarea rows="5" data-draft="'+turns.indexOf(t)+'">'+escapeHTML(t.draft)+'</textarea></label><button data-copy="'+turns.indexOf(t)+'">Approve &amp; copy draft</button>' : '')+
      (links ? '<div class="sources">Source updates · '+links+'</div>' : '')+'</article>';
  }).join('');
  return '<section class="chat-panel"><div class="spread"><h2>Ask the desk</h2><button data-reset '+(asking?'disabled':'')+'>New conversation</button></div>'+
    (messages || '<p class="chat-hint">Ask about an order, check a blocker, or draft a carrier follow-up.</p>')+
    '<form id="chat-form"><label for="question">Your question</label><textarea id="question" rows="2" maxlength="2000" required placeholder="What’s blocking King St?"></textarea><button class="primary" '+(asking?'disabled':'')+'>'+(asking?'Checking orders…':'Ask the desk')+'</button></form></section>';
}
$('workspace').addEventListener('input', e => {
  if(e.target.matches('[data-draft]')) turns[Number(e.target.dataset.draft)].draft=e.target.value;
});
$('workspace').addEventListener('click', async e => {
  if(e.target.closest('[data-reset]')) { turns.length=0; chatContext={}; render(); }
  const copy=e.target.closest('[data-copy]');
  if(copy) {
    try { await navigator.clipboard.writeText(turns[Number(copy.dataset.copy)].draft); notice('Approved draft copied'); }
    catch { notice('Select the draft and copy it manually.'); }
  }
});
$('workspace').addEventListener('submit', async e => {
  if(e.target.id !== 'chat-form')return;
  e.preventDefault();
  const question=$('question').value.trim();
  if(!question || asking)return;
  turns.push({role:'You',answer:question});
  asking=true; render();
  try {
    const reply=await api('chat',{question,context:chatContext});
    chatContext=reply.context;
    turns.push({...reply, role:'Dispatch'});
  } catch(err) {turns.push({role:'Dispatch',answer:err.message});}
  finally {asking=false; render(); if(tab==='Ask the desk') $('question').focus();}
});
refresh().catch(err=>$('workspace').textContent='Could not open the desk. '+err.message);
