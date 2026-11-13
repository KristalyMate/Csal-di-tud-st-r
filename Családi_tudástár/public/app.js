const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

let TAGOK = [], KATEGORIAK = [], CIKKEK = [], ki = null, aktivCsaladId = null, aktivFelnott = 0;
const allapot = {kat: 0, cimke: '', q: ''};

async function api(a, body) {
  let r;
  try {
    r = await fetch('api?a=' + a, body ? {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)} : {});
  } catch (e) {
    throw new Error('A szerver nem érhető el.');
  }
  const j = await r.json().catch(() => ({hiba: 'Váratlan válasz a szervertől.'}));
  if (r.status === 401 && a !== 'belepes') { belepesKell(); throw new Error('Bejelentkezés szükséges.'); }
  if (!r.ok) throw new Error(j.hiba || 'Hiba történt.');
  return j;
}

const katOf = id => KATEGORIAK.find(k => k.kategoria_id === id);
const szerzoOf = id => TAGOK.find(t => t.csaladtag_id === id) || {nev: 'Ismeretlen', szerep: ''};
const datum = s => new Date(s.replace(' ', 'T')).toLocaleDateString('hu-HU', {year: 'numeric', month: 'long', day: 'numeric'});

function szurt() {
  const q = allapot.q.trim().toLowerCase();
  return CIKKEK
    .filter(c => (!allapot.kat || c.kategoria_id === allapot.kat)
              && (!allapot.cimke || c.cimkek.includes(allapot.cimke))
              && (!q || (c.cim + ' ' + c.tartalom + ' ' + c.cimkek.join(' ')).toLowerCase().includes(q)))
    .sort((a, b) => b.kiemelt - a.kiemelt || b.letrehozva.localeCompare(a.letrehozva));
}

function rajzol() {
  const fulek = [{kategoria_id: 0, nev: 'Minden bejegyzés', szin: '#1E4A41'}, ...KATEGORIAK];
  $('#tabs').innerHTML = fulek.map(k => {
    const n = k.kategoria_id ? CIKKEK.filter(c => c.kategoria_id === k.kategoria_id).length : CIKKEK.length;
    return `<button class="tab${allapot.kat === k.kategoria_id ? ' on' : ''}" data-kat="${k.kategoria_id}" style="--c:${k.szin}">${esc(k.nev)}<span>${n}</span></button>`;
  }).join('');

  const cimkek = [...new Set(CIKKEK.flatMap(c => c.cimkek))].sort((a, b) => a.localeCompare(b, 'hu'));
  $('#tags').innerHTML = cimkek.map(t => `<button class="chip${allapot.cimke === t ? ' on' : ''}" data-cimke="${esc(t)}">${esc(t)}</button>`).join('');

  const lista = szurt();
  $('#lista').innerHTML = lista.length ? lista.map(c => {
    const k = katOf(c.kategoria_id) || {nev: '', szin: '#1E4A41'}, sz = szerzoOf(c.szerzo_id);
    const kivonat = c.tartalom.replace(/\s+/g, ' ');
    return `<article class="kartya" style="--c:${k.szin}">
      <h2><button data-id="${c.cikk_id}">${esc(c.cim)}</button></h2>
      <p>${esc(kivonat.length > 150 ? kivonat.slice(0, 150) + '…' : kivonat)}</p>
      <div class="meta">${c.kiemelt ? '<span class="star">★ Kiemelt</span> | ' : ''}${esc(k.nev)} | ${esc(sz.nev)} | ${datum(c.letrehozva)}</div>
    </article>`;
  }).join('') : '<div class="ures">Nincs találat ebben a családi tudástárban.</div>';
}

function felulet() {
  const vanFiók = !!ki;
  $('#fiok').hidden = !vanFiók;
  if (vanFiók) {
    $('#ki-nev').textContent = `${ki.nev} (${ki.szerep})`;
  }

  const vanCsaladja = ki && ki.csaladok && ki.csaladok.length > 0;
  
  if (!vanCsaladja || !aktivCsaladId) {
    $('.wrap').hidden = true;
    $('#uj').hidden = true;
    $('#tagok-btn').hidden = true;
    $('#q').hidden = true;
    $('#csalad-valto-fejlec').hidden = true;
    $('#csalad-kezelo').hidden = false;

    if (vanCsaladja) {
      $('#sajat-csaladok-lista').innerHTML = '<h3>Családjaid:</h3>' + ki.csaladok.map(cs => `
        <div style="display:flex; justify-content:space-between; align-items:center; background:var(--card); padding:0.5rem 1rem; margin-bottom:0.5rem; border-radius:0.4rem; border:1px solid var(--line);">
          <span><strong>${esc(cs.nev)}</strong>${cs.meghivo_kod ? ` (Meghívókód: <code>${esc(cs.meghivo_kod)}</code>)` : ''} – ${cs.felnott ? 'Felnőtt' : 'Gyerek'}</span>
          <button class="btn fo" onclick="csaladValtas(${cs.csalad_id})">Megnyitás</button>
        </div>
      `).join('');
    } else {
      $('#sajat-csaladok-lista').innerHTML = '<p>Még nem tartozol egy családhoz sem. Csatlakozz egy kóddal, vagy hozz létre sajátot!</p>';
    }
  } else {
    $('#csalad-kezelo').hidden = true;
    $('.wrap').hidden = false;
    $('#uj').hidden = false;
    $('#tagok-btn').hidden = false;
    $('#q').hidden = false;
    $('#csalad-valto-fejlec').hidden = false;

    // a meghívókódot csak a felnőttek látják
    const akt = ki.csaladok.find(cs => cs.csalad_id === aktivCsaladId);
    $('#meghivo-kod').hidden = !(akt && akt.meghivo_kod);
    $('#meghivo-kod code').textContent = akt && akt.meghivo_kod ? akt.meghivo_kod : '';

    $('#aktiv-csalad-select').innerHTML = ki.csaladok.map(cs => `
      <option value="${cs.csalad_id}" ${cs.csalad_id === aktivCsaladId ? 'selected' : ''}>${esc(cs.nev)} (${cs.felnott ? 'Felnőtt' : 'Gyerek'})</option>
    `).join('');
  }
}

async function csaladValtas(id) {
  aktivCsaladId = +id;
  try {
    const d = await api('adatok', {csalad_id: aktivCsaladId});
    TAGOK = d.tagok;
    KATEGORIAK = d.kategoriak;
    CIKKEK = d.cikkek;
    aktivFelnott = d.aktivFelnott;
    ki = (await api('ki')).felhasznalo || ki; // a családlista (felnőtt/gyerek címke) is frissüljön
    felulet();
    rajzol();
  } catch (e) {
    alert(e.message);
    aktivCsaladId = null;
    felulet();
  }
}

$('#aktiv-csalad-select').addEventListener('change', e => {
  csaladValtas(+e.target.value);
});

// --- Bejelentkezés / Regisztráció ---
let regisztral = false;
function hiba(uzenet) { $('#b-hiba').textContent = uzenet; $('#b-hiba').hidden = !uzenet; }
function mod(r) {
  regisztral = r;
  $('#b-cim').textContent = r ? 'Fiók létrehozása' : 'Bejelentkezés';
  $('#b-regi').hidden = !r;
  ['#b-nev', '#b-szerep'].forEach(s => $(s).required = r);
  $('#b-jelszo').minLength = r ? 8 : 0;
  $('#b-kuld').textContent = r ? 'Fiók létrehozása' : 'Belépés';
  $('#b-valt').textContent = r ? 'Van már fiókom' : 'Új fiókot hozok létre';
  hiba('');
}
function belepesKell() {
  ki = null; aktivCsaladId = null; CIKKEK = []; felulet(); mod(false);
  if (!$('#belepes').open) $('#belepes').showModal();
}

$('#b-valt').addEventListener('click', () => mod(!regisztral));
$('#belepes').addEventListener('cancel', e => { if (!ki) e.preventDefault(); });

$('#b-urlap').addEventListener('submit', async e => {
  e.preventDefault();
  const adat = {email: $('#b-email').value, jelszo: $('#b-jelszo').value};
  if (regisztral) Object.assign(adat, {nev: $('#b-nev').value, szerep: $('#b-szerep').value});
  try {
    const res = await api(regisztral ? 'regisztracio' : 'belepes', adat);
    ki = res.felhasznalo;
    $('#b-urlap').reset();
    $('#belepes').close();
    
    if (ki.csaladok && ki.csaladok.length > 0) {
      await csaladValtas(ki.csaladok[0].csalad_id);
    } else {
      felulet();
    }
  } catch (er) { hiba(er.message); }
});

$('#kilep').addEventListener('click', async () => { try { await api('kilepes', {}); } catch (e) {} belepesKell(); });

// --- Család létrehozása és Csatlakozás ---
$('#cs-urlap').addEventListener('submit', async e => {
  e.preventDefault();
  $('#cs-hiba').hidden = true;
  try {
    const res = await api('csalad_csatlakozas', {kod: $('#cs-kod').value});
    ki = res.felhasznalo;
    $('#cs-urlap').reset();
    const utolsoCsalad = ki.csaladok[ki.csaladok.length - 1];
    await csaladValtas(utolsoCsalad.csalad_id);
  } catch (er) { $('#cs-hiba').textContent = er.message; $('#cs-hiba').hidden = false; }
});

$('#uj-csalad-urlap').addEventListener('submit', async e => {
  e.preventDefault();
  try {
    const res = await api('csalad_letrehozas', {nev: $('#uj-csalad-nev').value});
    ki = res.felhasznalo;
    $('#uj-csalad-urlap').reset();
    const utolsoCsalad = ki.csaladok[ki.csaladok.length - 1];
    await csaladValtas(utolsoCsalad.csalad_id);
  } catch (er) { alert(er.message); }
});

// --- Családtagok modal & Szerepkör váltás (JAVÍTVA) ---
function tagokModalFrissites() {
  $('#tagok-lista-kontener').innerHTML = TAGOK.map(t => `
    <div style="display:flex; justify-content:space-between; align-items:center; padding:0.5rem 0; border-bottom:1px solid var(--line);">
      <div>
        <strong>${esc(t.nev)}</strong> (${esc(t.szerep)}) – <em>${t.felnott ? 'Felnőtt' : 'Gyerek'}</em>
      </div>
      ${aktivFelnott && t.csaladtag_id !== ki.csaladtag_id ? `
        <button class="btn" onclick="szerepValt(${t.csaladtag_id}, ${t.felnott ? 0 : 1})">
          Legyen ${t.felnott ? 'gyerek' : 'felnőtt'}
        </button>` : ''}
    </div>
  `).join('');
}

$('#tagok-btn').addEventListener('click', () => {
  tagokModalFrissites();
  $('#tagok-modal').showModal();
});

$('#tagok-bezar').addEventListener('click', () => $('#tagok-modal').close());

window.szerepValt = async (tagId, ujFelnott) => {
  try {
    await api('szerep_valt', {csalad_id: aktivCsaladId, csaladtag_id: tagId, felnott: ujFelnott});
    await csaladValtas(aktivCsaladId);
    tagokModalFrissites(); // JAVÍTVA: közvetlenül a belső HTML-t frissíti, nem hív meg újra showModal()-t
  } catch (e) {
    alert(e.message);
  }
};

// --- Cikk olvasás / törlés / új ---
document.addEventListener('click', e => {
  const t = e.target.closest('[data-kat],[data-cimke],[data-id]');
  if (t && t.dataset.kat !== undefined) { allapot.kat = +t.dataset.kat; rajzol(); }
  else if (t && t.dataset.cimke !== undefined) { allapot.cimke = allapot.cimke === t.dataset.cimke ? '' : t.dataset.cimke; rajzol(); }
  else if (t && t.dataset.id !== undefined) megnyit(t.dataset.id);
  if (e.target.id === 'torol') torol(e.target.dataset.torol);
  if (e.target.id === 'bezar' || e.target.id === 'olvaso') $('#olvaso').close();
});
$('#q').addEventListener('input', e => { allapot.q = e.target.value; rajzol(); });

function megnyit(id) {
  const c = CIKKEK.find(x => x.cikk_id === +id);
  if (!c) return;
  const k = katOf(c.kategoria_id) || {nev: ''}, sz = szerzoOf(c.szerzo_id);
  $('#olvaso').innerHTML = `<h2 id="o-cim">${esc(c.cim)}</h2>
    <div class="meta">${esc(k.nev)} | ${esc(sz.nev)} (${esc(sz.szerep)}) | ${datum(c.letrehozva)}</div>
    <p class="text">${esc(c.tartalom)}</p>
    <div class="tags">${c.cimkek.map(t => `<span class="chip">${esc(t)}</span>`).join('')}</div>
    <div class="row">
      ${aktivFelnott ? `<button class="btn veszely" id="torol" type="button" data-torol="${c.cikk_id}">Bejegyzés törlése</button>` : ''}
      <button class="btn m" id="bezar" type="button">Bezárás</button>
    </div>`;
  $('#olvaso').showModal();
}

async function torol(id) {
  if (!confirm('Biztosan törlöd ezt a bejegyzést?')) return;
  try { await api('torol', {cikk_id: +id}); $('#olvaso').close(); await csaladValtas(aktivCsaladId); }
  catch (e) { alert(e.message); }
}

$('#uj').addEventListener('click', () => {
  $('#f-kat').innerHTML = KATEGORIAK.map(k => `<option value="${k.kategoria_id}">${esc(k.nev)}</option>`).join('');
  $('#urlap').reset();
  $('#szerk').showModal();
});
$('#megse').addEventListener('click', () => $('#szerk').close());
$('#urlap').addEventListener('submit', async e => {
  e.preventDefault();
  try {
    await api('uj', {
      csalad_id: aktivCsaladId,
      cim: $('#f-cim',).value, tartalom: $('#f-szoveg').value, kategoria_id: +$('#f-kat').value,
      cimkek: $('#f-cimkek').value.split(',').map(s => s.trim()).filter(Boolean)
    });
    $('#szerk').close(); await csaladValtas(aktivCsaladId);
  } catch (er) { alert(er.message); }
});

// --- Indulás ---
(async () => {
  try {
    const res = await api('ki');
    ki = res.felhasznalo;
    if (!ki) { belepesKell(); return; }
    if (ki.csaladok && ki.csaladok.length > 0) {
      await csaladValtas(ki.csaladok[0].csalad_id);
    } else {
      felulet();
    }
  } catch (e) {
    belepesKell();
  }
})();