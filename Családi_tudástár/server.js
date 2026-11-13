const path = require('path');
const crypto = require('crypto');
const express = require('express');
const session = require('express-session');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

const PORT = process.env.PORT || 3000;
const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1', user: process.env.DB_USER || 'root',
  password: process.env.DB_PASS || '', database: process.env.DB_NAME || 'csaladi_tudastar',
  charset: 'utf8mb4', dateStrings: true, connectionLimit: 5
});

const app = express();
app.use(session({
  secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
  resave: false, saveUninitialized: false, cookie: {httpOnly: true, sameSite: 'lax'}
}));
app.use(express.json({limit: '100kb'}));
app.use(express.static(path.join(__dirname, 'public')));

async function ki(req) {
  if (!req.session.uid) return null;
  const [r] = await pool.query('SELECT csaladtag_id, nev, szerep FROM csaladtag WHERE csaladtag_id = ?', [req.session.uid]);
  if (!r[0]) return null;
  const user = r[0];
  const [csaladok] = await pool.query(`
    SELECT c.csalad_id, c.nev, IF(ct.felnott = 1, c.meghivo_kod, NULL) AS meghivo_kod, ct.felnott 
    FROM csalad_tagok ct 
    JOIN csalad c ON c.csalad_id = ct.csalad_id 
    WHERE ct.csaladtag_id = ?
  `, [user.csaladtag_id]);
  user.csaladok = csaladok; // JAVÍTVA: ékezet eltávolítva
  return user;
}
const belep = (req, id) => new Promise((ok, no) => req.session.regenerate(e => e ? no(e) : (req.session.uid = id, ok())));
const POST_ONLY = ['regisztracio', 'belepes', 'csalad_letrehozas', 'csalad_csatlakozas', 'szerep_valt', 'kilepes', 'uj', 'torol'];

app.all('/api', async (req, res) => {
  const valasz = (adat, kod = 200) => res.status(kod).json(adat);
  const hiba = (uzenet, kod = 400) => valasz({hiba: uzenet}, kod);
  const a = req.query.a || '', post = req.method === 'POST', b = req.body || {};
  const sz = (k, max) => String(b[k] ?? '').trim().slice(0, max);
  try {
    if (POST_ONLY.includes(a) && !post) return hiba('Ez a kérés csak POST lehet.', 405);
    if (post && !req.is('application/json')) return hiba('Érvénytelen kérés.', 415);
    const en = await ki(req);
    if (!['ki', 'regisztracio', 'belepes', 'kilepes'].includes(a) && !en) return hiba('Előbb jelentkezz be.', 401);

    switch (a) {
      case 'ki':
        return valasz({felhasznalo: en});

      case 'regisztracio': {
        const nev = sz('nev', 80), szerep = sz('szerep', 30), email = sz('email', 120).toLowerCase(), jelszo = String(b.jelszo ?? '');
        if (!nev || !szerep) return hiba('Add meg a neved és a szereped.');
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return hiba('Hibás e-mail-cím.');
        if (jelszo.length < 8) return hiba('A jelszó legalább 8 karakter legyen.');
        let ins;
        try {
          [ins] = await pool.query('INSERT INTO csaladtag (nev, szerep, email, jelszo_hash) VALUES (?, ?, ?, ?)',
            [nev, szerep, email, await bcrypt.hash(jelszo, 10)]);
        } catch (e) {
          if (e.code === 'ER_DUP_ENTRY') return hiba('Ezzel az e-mail-címmel már van fiók.', 409);
          throw e;
        }
        await belep(req, ins.insertId);
        return valasz({felhasznalo: await ki(req)}, 201);
      }

      case 'belepes': {
        const [r] = await pool.query('SELECT csaladtag_id, jelszo_hash FROM csaladtag WHERE email = ?', [sz('email', 120).toLowerCase()]);
        if (!r.length || !(await bcrypt.compare(String(b.jelszo ?? ''), r[0].jelszo_hash))) {
          return hiba('Hibás e-mail-cím vagy jelszó.', 401);
        }
        await belep(req, r[0].csaladtag_id);
        return valasz({felhasznalo: await ki(req)});
      }

      case 'csalad_letrehozas': {
        const nev = sz('nev', 80);
        if (!nev) return hiba('Add meg a család nevét.');
        const kod = 'CSALAD-' + Math.random().toString(36).substring(2, 8).toUpperCase();
        const c = await pool.getConnection();
        try {
          await c.beginTransaction();
          const [r] = await c.query('INSERT INTO csalad (nev, meghivo_kod, letrehozo_id) VALUES (?, ?, ?)', [nev, kod, en.csaladtag_id]);
          await c.query('INSERT INTO csalad_tagok (csalad_id, csaladtag_id, felnott) VALUES (?, ?, 1)', [r.insertId, en.csaladtag_id]);
          await c.commit();
          return valasz({felhasznalo: await ki(req)}, 201);
        } catch (e) {
          await c.rollback();
          throw e;
        } finally { c.release(); }
      }

      case 'csalad_csatlakozas': {
        const kod = sz('kod', 60);
        const [cs] = await pool.query('SELECT csalad_id FROM csalad WHERE meghivo_kod = ?', [kod]);
        if (!cs.length) return hiba('A meghívókód nem érvényes.', 403);
        const csaladId = cs[0].csalad_id;
        const [van] = await pool.query('SELECT * FROM csalad_tagok WHERE csalad_id = ? AND csaladtag_id = ?', [csaladId, en.csaladtag_id]);
        if (van.length) return hiba('Már csatlakoztál ehhez a családhoz.', 409);

        await pool.query('INSERT INTO csalad_tagok (csalad_id, csaladtag_id, felnott) VALUES (?, ?, 0)', [csaladId, en.csaladtag_id]);
        return valasz({felhasznalo: await ki(req)});
      }

      case 'szerep_valt': {
        const celCsaladId = +b.csalad_id;
        const celTagId = +b.csaladtag_id;
        const ujFelnott = b.felnott ? 1 : 0;

        const [jog] = await pool.query('SELECT felnott FROM csalad_tagok WHERE csalad_id = ? AND csaladtag_id = ?', [celCsaladId, en.csaladtag_id]);
        if (!jog.length || !jog[0].felnott) return hiba('Nincs jogosultságod.', 403);

        const [cel] = await pool.query('SELECT felnott FROM csalad_tagok WHERE csalad_id = ? AND csaladtag_id = ?', [celCsaladId, celTagId]);
        if (!cel.length) return hiba('Ez a felhasználó nem tagja a családnak.', 404);
        if (!ujFelnott && cel[0].felnott) {
          const [[{db}]] = await pool.query('SELECT COUNT(*) AS db FROM csalad_tagok WHERE csalad_id = ? AND felnott = 1', [celCsaladId]);
          if (db <= 1) return hiba('Legalább egy felnőttnek maradnia kell a családban.', 409);
        }
        await pool.query('UPDATE csalad_tagok SET felnott = ? WHERE csalad_id = ? AND csaladtag_id = ?', [ujFelnott, celCsaladId, celTagId]);
        return valasz({felhasznalo: await ki(req)});
      }

      case 'kilepes':
        return req.session.destroy(() => valasz({ok: true}));

      case 'adatok': {
        const csaladId = +b.csalad_id;
        if (!csaladId) return hiba('Válassz ki egy családot.');
        
        const [tagsag] = await pool.query('SELECT felnott FROM csalad_tagok WHERE csalad_id = ? AND csaladtag_id = ?', [csaladId, en.csaladtag_id]);
        if (!tagsag.length) return hiba('Nem vagy tagja ennek a családnak.', 403);

        const [cikkek] = await pool.query(`SELECT c.cikk_id, c.cim, c.tartalom, c.kategoria_id, c.szerzo_id, c.kiemelt, c.letrehozva,
            GROUP_CONCAT(m.nev SEPARATOR ',') AS cimkek
          FROM cikk c 
          LEFT JOIN cikk_cimke cc ON cc.cikk_id = c.cikk_id 
          LEFT JOIN cimke m ON m.cimke_id = cc.cimke_id
          WHERE c.csalad_id = ?
          GROUP BY c.cikk_id`, [csaladId]);
        cikkek.forEach(c => { c.cimkek = c.cimkek ? c.cimkek.split(',') : []; });
        
        const [tagok] = await pool.query(`
          SELECT t.csaladtag_id, t.nev, t.szerep, ct.felnott 
          FROM csalad_tagok ct 
          JOIN csaladtag t ON t.csaladtag_id = ct.csaladtag_id 
          WHERE ct.csalad_id = ?
        `, [csaladId]);

        const [kategoriak] = await pool.query('SELECT kategoria_id, nev, leiras, szin FROM kategoria');
        return valasz({tagok, kategoriak, cikkek, aktivFelnott: tagsag[0].felnott});
      }

      case 'uj': {
        const csaladId = +b.csalad_id;
        const cim = sz('cim', 150), tartalom = sz('tartalom', 20000);
        if (!cim || !tartalom) return hiba('A cím és a tartalom kötelező.');
        
        const [tagsag] = await pool.query('SELECT felnott FROM csalad_tagok WHERE csalad_id = ? AND csaladtag_id = ?', [csaladId, en.csaladtag_id]);
        if (!tagsag.length) return hiba('Nincs jogosultságod.', 403);
        const [kat] = await pool.query('SELECT 1 FROM kategoria WHERE kategoria_id = ?', [+b.kategoria_id || 0]);
        if (!kat.length) return hiba('Válassz érvényes kategóriát.');

        const cimkek = [...new Set((Array.isArray(b.cimkek) ? b.cimkek : [])
          .map(t => String(t).replace(/,/g, '').trim().toLowerCase().slice(0, 40)).filter(Boolean))].slice(0, 8);
        const c = await pool.getConnection();
        try {
          await c.beginTransaction();
          const [r] = await c.query('INSERT INTO cikk (csalad_id, cim, tartalom, kategoria_id, szerzo_id) VALUES (?, ?, ?, ?, ?)',
            [csaladId, cim, tartalom, +b.kategoria_id || 0, en.csaladtag_id]);
          for (const t of cimkek) {
            const [m] = await c.query('INSERT INTO cimke (nev) VALUES (?) ON DUPLICATE KEY UPDATE cimke_id = LAST_INSERT_ID(cimke_id)', [t]);
            await c.query('INSERT IGNORE INTO cikk_cimke (cikk_id, cimke_id) VALUES (?, ?)', [r.insertId, m.insertId]);
          }
          await c.commit();
          return valasz({cikk_id: r.insertId}, 201);
        } catch (e) {
          await c.rollback();
          throw e;
        } finally { c.release(); }
      }

      case 'torol': {
        const cikkId = +b.cikk_id || 0;
        // csak az a felnőtt törölhet, aki tagja annak a családnak, amelyikhez a bejegyzés tartozik
        const [jog] = await pool.query(`SELECT 1 FROM cikk c
          JOIN csalad_tagok ct ON ct.csalad_id = c.csalad_id
          WHERE c.cikk_id = ? AND ct.csaladtag_id = ? AND ct.felnott = 1`, [cikkId, en.csaladtag_id]);
        if (!jog.length) return hiba('Nincs jogosultságod a törléshez.', 403);
        const [r] = await pool.query('DELETE FROM cikk WHERE cikk_id = ?', [cikkId]);
        if (!r.affectedRows) return hiba('A bejegyzés nem található.', 404);
        return valasz({ok: true});
      }

      default:
        return hiba('Ismeretlen kérés.', 404);
    }
  } catch (e) {
    console.error(e);
    return hiba('Szerverhiba történt.', 500);
  }
});

app.use((err, req, res, next) => res.status(400).json({hiba: 'Érvénytelen kérés.'}));

pool.query('SELECT 1')
  .then(() => app.listen(PORT, () => console.log(`Fut a szerver: http://localhost:${PORT}`)))
  .catch(e => { console.error('Adatbázis hiba:', e); process.exit(1); });