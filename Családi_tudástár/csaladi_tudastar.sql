-- ============================================================================
-- Családi tudástár – teljes, egy lépéses telepítő (MySQL / MariaDB)
-- Csak importáld be (phpMyAdmin főoldal → Importálás), előtte nem kell semmit
-- létrehoznod. Bármennyiszer lefuttatható: a táblákat újralétrehozza.
-- Minden mintafiók jelszava: Csalad2026  (e-mail: lásd a csaladtag táblát)
-- Regisztrációhoz nem kell kód; a családhoz csatlakozáshoz igen.
-- ============================================================================
SET NAMES utf8mb4;
CREATE DATABASE IF NOT EXISTS csaladi_tudastar CHARACTER SET utf8mb4 COLLATE utf8mb4_hungarian_ci;
USE csaladi_tudastar;

DROP TABLE IF EXISTS cikk_cimke;
DROP TABLE IF EXISTS cikk;
DROP TABLE IF EXISTS cimke;
DROP TABLE IF EXISTS kategoria;
DROP TABLE IF EXISTS csalad_tagok;
DROP TABLE IF EXISTS csalad;
DROP TABLE IF EXISTS meghivo;
DROP TABLE IF EXISTS csaladtag;

CREATE TABLE csaladtag (
  csaladtag_id INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
  nev          VARCHAR(80)  NOT NULL,
  szerep       VARCHAR(30)  NOT NULL,             -- pl. Anya, Apa, Nagymama
  email        VARCHAR(120) NOT NULL UNIQUE,
  jelszo_hash  VARCHAR(255) NOT NULL,             -- password_hash() eredménye
  created_at   TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_hungarian_ci;

-- Családok tábla
CREATE TABLE csalad (
  csalad_id    INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
  nev          VARCHAR(255) NOT NULL,
  meghivo_kod  VARCHAR(60)  NOT NULL UNIQUE,
  letrehozo_id INT          NOT NULL,
  created_at   TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (letrehozo_id) REFERENCES csaladtag (csaladtag_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_hungarian_ci;

-- Kapcsolótábla a felhasználók és családok között
CREATE TABLE csalad_tagok (
  id           INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
  csalad_id    INT          NOT NULL,
  csaladtag_id INT          NOT NULL,
  felnott      TINYINT(1)   NOT NULL DEFAULT 0,   -- 1 = felnőtt fiók ebben a családban
  created_at   TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (csalad_id)    REFERENCES csalad (csalad_id)       ON DELETE CASCADE,
  FOREIGN KEY (csaladtag_id) REFERENCES csaladtag (csaladtag_id) ON DELETE CASCADE,
  UNIQUE KEY unique_user_family (csalad_id, csaladtag_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_hungarian_ci;

-- Meghívók (kompatibilitáshoz)
CREATE TABLE meghivo (
  meghivo_id INT         NOT NULL AUTO_INCREMENT PRIMARY KEY,
  kod        VARCHAR(60) NOT NULL UNIQUE,
  felnott    TINYINT(1)  NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_hungarian_ci;

CREATE TABLE kategoria (
  kategoria_id INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
  nev          VARCHAR(60)  NOT NULL UNIQUE,
  leiras       VARCHAR(200) NOT NULL DEFAULT '',
  szin         CHAR(7)      NOT NULL DEFAULT '#1E4A41'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_hungarian_ci;

CREATE TABLE cimke (
  cimke_id INT         NOT NULL AUTO_INCREMENT PRIMARY KEY,
  nev      VARCHAR(40) NOT NULL UNIQUE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_hungarian_ci;

CREATE TABLE cikk (
  cikk_id      INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
  csalad_id    INT          NOT NULL,
  cim          VARCHAR(150) NOT NULL,
  tartalom     TEXT         NOT NULL,
  kategoria_id INT          NOT NULL,
  szerzo_id    INT          NOT NULL,
  kiemelt      TINYINT(1)   NOT NULL DEFAULT 0,
  letrehozva   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modositva    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (csalad_id)    REFERENCES csalad (csalad_id)       ON DELETE CASCADE,
  FOREIGN KEY (kategoria_id) REFERENCES kategoria (kategoria_id),
  FOREIGN KEY (szerzo_id)    REFERENCES csaladtag (csaladtag_id),
  FULLTEXT KEY ft_kereses (cim, tartalom)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_hungarian_ci;

CREATE TABLE cikk_cimke (
  cikk_id  INT NOT NULL,
  cimke_id INT NOT NULL,
  PRIMARY KEY (cikk_id, cimke_id),
  FOREIGN KEY (cikk_id)  REFERENCES cikk (cikk_id)   ON DELETE CASCADE,
  FOREIGN KEY (cimke_id) REFERENCES cimke (cimke_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_hungarian_ci;

-- Minta adatok
INSERT INTO csaladtag (csaladtag_id, nev, szerep, email, jelszo_hash) VALUES
  (1, 'Kovács Anna', 'Anya', 'anna@kovacs.example', '$2y$10$oQkG.nUNETMFlN4PjYSuPe.vuUoSfpXHuLOHBNGRLLZKeL0aYlQpe'),
  (2, 'Kovács Péter', 'Apa', 'peter@kovacs.example', '$2y$10$oQkG.nUNETMFlN4PjYSuPe.vuUoSfpXHuLOHBNGRLLZKeL0aYlQpe'),
  (3, 'Kovács Dóra', 'Lánya', 'dora@kovacs.example', '$2y$10$oQkG.nUNETMFlN4PjYSuPe.vuUoSfpXHuLOHBNGRLLZKeL0aYlQpe'),
  (4, 'Kovács Margit', 'Nagymama', 'margit@kovacs.example', '$2y$10$oQkG.nUNETMFlN4PjYSuPe.vuUoSfpXHuLOHBNGRLLZKeL0aYlQpe');

INSERT INTO csalad (csalad_id, nev, meghivo_kod, letrehozo_id) VALUES
  (1, 'Kovács család', 'KOVACS-CSALAD-2026', 1);

INSERT INTO csalad_tagok (csalad_id, csaladtag_id, felnott) VALUES
  (1, 1, 1),
  (1, 2, 1),
  (1, 3, 0),
  (1, 4, 1);

INSERT INTO meghivo (kod, felnott) VALUES
  ('KOVACS-FELNOTT-2026', 1),
  ('KOVACS-GYEREK-2026', 0);

INSERT INTO kategoria (kategoria_id, nev, leiras, szin) VALUES
  (1, 'Receptek', 'Családi kedvencek lépésről lépésre', '#B3452E'),
  (2, 'Háztartás', 'Javítások, karbantartás, hasznos trükkök', '#1F7466'),
  (3, 'Egészség', 'Házi patika és egészségügyi tudnivalók', '#2F62A8'),
  (4, 'Családtörténet', 'Felmenők, történetek, régi fotók', '#7E4C94'),
  (5, 'Fontos tudnivalók', 'Telefonszámok, jelszavak, elérhetőségek', '#8F6A00');

INSERT INTO cimke (cimke_id, nev) VALUES
  (1, 'hagyományos'),
  (2, 'gyors'),
  (3, 'leves'),
  (4, 'édesség'),
  (5, 'sürgős'),
  (6, 'otthon'),
  (7, 'karbantartás');

INSERT INTO cikk (cikk_id, csalad_id, cim, tartalom, kategoria_id, szerzo_id, kiemelt, letrehozva) VALUES
  (1, 1, 'Nagymama gulyásleves', 'Hozzávalók (6 adag): 60 dkg marhalábszár, 2 fej vöröshagyma, 3 evőkanál olaj, 2 evőkanál pirospaprika, 4 burgonya, 2 sárgarépa, 1 zöldpaprika, 1 paradicsom, só, őrölt kömény.
A hagymát olajon üvegesre pirítjuk, lehúzzuk a tűzről, belekeverjük a paprikát, majd ráadjuk a kockázott húst. Sóval, köménnyel és kevés vízzel félpuhára pároljuk, aztán felöntjük, hozzáadjuk a zöldségeket, és kb. 2 órán át főzzük. A csipetkét mindig a végén tesszük bele.', 1, 4, 1, '2026-09-14 18:30:00'),
  (2, 1, 'Palacsinta alaptészta', 'Hozzávalók: 25 dkg liszt, 4 dl tej, 2 tojás, 1 csipet só, 1 evőkanál olaj.
Csomómentesre keverjük, 20 percig pihentetjük. Forró, kiolajozott serpenyőben mindkét oldalát aranybarnára sütjük. Lekvárral vagy kakaós túróval tálaljuk.', 1, 1, 0, '2026-09-20 09:10:00'),
  (3, 1, 'Mit tegyünk csőtörés esetén?', 'A főcsap a fürdőszoba szekrényének hátuljában van, a vízóra mellett.
1. Zárd el a főcsapot (óramutató járásával megegyező irányba).
2. Kapcsold le az áramot a nedves helyiségben.
3. Hívd Apát vagy a vízszerelőt.', 2, 2, 1, '2026-10-02 20:15:00'),
  (4, 1, 'Mosógép vízkőmentesítése', 'Háromhavonta futtass le egy üres, 60 fokos programot mosógéptisztítóval vagy kb. 100 g citromsavval. A gumitömítést utána töröld szárazra, a mosószer-fiókot hagyd nyitva száradni.', 2, 1, 0, '2026-10-05 16:40:00'),
  (5, 1, 'Házi patika: mi hol van?', 'A házi patika a nappali felső szekrényében van, a piros dobozban. Félévente nézzük át a lejárati dátumokat, a lejártakat vigyük vissza a gyógyszertárba. A lázmérő és a sebtapasz a doboz felső rekeszében van.', 3, 1, 0, '2026-10-11 11:00:00'),
  (6, 1, 'A Kovács család gyökerei', 'A Kovács család Szegedről származik. Dédnagyapánk, Kovács Gyula (1921–1994) asztalos volt, a műhelye ma is áll a nagyi kertjében. Nagymama lánykori neve Horváth. A régi fotók a nagyi szekrényében, a kék albumban vannak.', 4, 4, 0, '2026-10-18 15:25:00'),
  (7, 1, 'Fontos telefonszámok', 'Segélyhívó: 112
Háziorvos: 06 1 000 0000 (példa)
Vízszerelő: 06 30 000 0000 (példa)
Iskolatitkárság: 06 1 000 0001 (példa)
Cseréljétek ki a példaszámokat a sajátjaitokra.', 5, 2, 1, '2026-10-25 08:00:00'),
  (8, 1, 'Wi-Fi és az otthoni hálózat', 'Hálózat neve: KovacsOtthon. A jelszó a router hátoldalán olvasható. Ha lassú a net, kapcsold ki a routert 30 másodpercre, majd kapcsold vissza. A vendégeknek a KovacsVendeg hálózatot adjuk meg.', 5, 3, 0, '2026-11-01 19:45:00');

INSERT INTO cikk_cimke (cikk_id, cimke_id) VALUES
  (1, 1),
  (1, 3),
  (2, 2),
  (2, 4),
  (3, 5),
  (3, 6),
  (4, 7),
  (4, 6),
  (5, 6),
  (6, 1),
  (7, 5),
  (8, 6),
  (8, 7);
