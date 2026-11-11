// 용어집 내보내기·가져오기 (JSON · CSV). 파일에는 용어집만 — API 키·사용량은 넣지 않는다.
import { PACKS, DEFAULT_GLOSSARY, cleanEntry, cleanPack, cloneGlossary, packName } from './glossary.js';

export const KIND_NAMES = { ko: '한국어', keep: '그대로', fix: '막기' };
const KIND_FROM_NAME = { '한국어': 'ko', '그대로': 'keep', '막기': 'fix', ko: 'ko', keep: 'keep', fix: 'fix' };
export const CSV_HEADER = ['묶음', '구분', '영어', '처리', '한국어'];

/** 묶음 이름(화면 이름 또는 id) → id. 모르는 이름은 그 이름 그대로 새 묶음 */
export function packIdFromName(name) {
  const n = String(name || '').trim();
  return PACKS.find(p => p.name === n || p.id === n)?.id || n;
}

/** 파일의 구분 칸이 비어 있으면 지금 구분을 그대로 */
const withGroup = (x, old) => (old && !x.group ? { ...x, group: old.group || '' } : { ...x });
const sameEntry = (a, b) => a.en === b.en && a.ko === b.ko && a.kind === b.kind && (a.group || '') === (b.group || '');

/** 내보낼 묶음. scope: pack(지금 묶음) · all(모든 묶음) · edited(기본값과 다른 줄만) */
export function exportPacks(g, scope = 'all', packId = 'common') {
  if (scope === 'pack') return { [packId]: g.packs[packId] || [] };
  if (scope === 'edited') {
    const out = {};
    for (const [id, list] of Object.entries(g.packs)) {
      const base = DEFAULT_GLOSSARY.packs[id] || [];
      const changed = list.filter(x => !base.some(b => sameEntry(b, x)));
      if (changed.length) out[id] = changed;
    }
    return out;
  }
  return g.packs;
}

export function toJSON(packs) {
  return JSON.stringify({ app: 'ai-sub-ko', type: 'glossary', v: 2, packs }, null, 2) + '\n';
}

const csvCell = v => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/** CSV (UTF-8, 엑셀이 한글을 알아보게 BOM 붙임) */
export function toCSV(packs) {
  const rows = [CSV_HEADER];
  for (const [id, list] of Object.entries(packs)) {
    for (const x of list) rows.push([packName(id), x.group || '', x.en, KIND_NAMES[x.kind], x.ko || '']);
  }
  return '﻿' + rows.map(r => r.map(c => csvCell(String(c))).join(',')).join('\r\n') + '\r\n';
}

/** 따옴표·줄바꿈을 아는 CSV 읽기 → 줄 배열 */
export function parseCSV(text) {
  const s = String(text).replace(/^﻿/, '');
  const rows = [];
  let row = [], cell = '', q = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"' && s[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

/**
 * 가져올 파일 읽기 → { packs: { id: [줄] }, skipped: [{ line, reason }] }.
 * JSON(이 확장이 내보낸 v2, 0.4 까지의 drivers/teams/terms) 과 CSV 를 안다. 읽을 수 없으면 throw
 */
export function parseImport(text) {
  const t = String(text || '').replace(/^﻿/, '').trim();
  if (!t) throw new Error('빈 파일이에요');
  if (t.startsWith('{')) return parseJSONImport(t);
  return parseCSVImport(t);
}

function parseJSONImport(t) {
  let data;
  try { data = JSON.parse(t); } catch { throw new Error('JSON 을 읽지 못했어요'); }
  const packs = {}, skipped = [];
  if (data && typeof data.packs === 'object' && data.packs) {
    for (const [name, list] of Object.entries(data.packs)) {
      const id = packIdFromName(name);
      packs[id] = [];
      (Array.isArray(list) ? list : []).forEach((x, i) => {
        const c = cleanEntry(x);
        if (c) packs[id].push(c);
        else skipped.push({ line: `${packName(id)} ${i + 1}번째`, reason: '영어·한국어·처리 값을 확인해 주세요' });
      });
    }
  } else if (data && (data.drivers || data.terms || data.teams)) {
    const legacy = (k, group) => (Array.isArray(data[k]) ? data[k] : []).filter(r => Array.isArray(r) && r.length >= 2)
      .map(([en, ko]) => (k === 'teams' || String(en).trim() === String(ko).trim() ? { en, ko: '', kind: 'keep', group } : { en, ko, kind: 'ko', group }));
    packs.f1 = cleanPack([...legacy('drivers', '드라이버'), ...legacy('teams', '팀'), ...legacy('terms', '용어')]);
  } else {
    throw new Error('이 확장의 용어집 파일이 아니에요');
  }
  return { packs, skipped };
}

function parseCSVImport(t) {
  const rows = parseCSV(t);
  const head = rows[0]?.map(c => c.trim()) || [];
  if (head.join(',') !== CSV_HEADER.join(',')) throw new Error(`첫 줄은 ${CSV_HEADER.join(',')} 이어야 해요`);
  const packs = {}, skipped = [];
  rows.slice(1).forEach((r, i) => {
    const line = `${i + 2}번째 줄`;
    if (r.every(c => !c.trim())) return; // 빈 줄
    const [pack, group, en, kindName, ko] = r.map(c => (c || '').trim());
    const kind = KIND_FROM_NAME[kindName];
    if (!en) return skipped.push({ line, reason: '영어 칸이 비어 있어요' });
    if (!kind) return skipped.push({ line, en, reason: '처리 값은 한국어 · 그대로 · 막기 중 하나여야 해요' });
    if (kind !== 'keep' && !ko) return skipped.push({ line, en, reason: '한국어 칸이 비어 있어요' });
    if (!pack) return skipped.push({ line, en, reason: '묶음 칸이 비어 있어요' });
    const id = packIdFromName(pack);
    (packs[id] ||= []).push(cleanEntry({ en, ko, kind, group }));
  });
  for (const id of Object.keys(packs)) packs[id] = cleanPack(packs[id]);
  return { packs, skipped };
}

/** 미리보기 숫자: 새 용어 · 바뀌는 용어 · 같은 용어 */
export function previewImport(g, incoming) {
  const added = [], changed = [];
  let same = 0;
  for (const [id, list] of Object.entries(incoming.packs)) {
    const cur = g.packs[id] || [];
    for (const raw of list) {
      const old = cur.find(c => c.en.toLowerCase() === raw.en.toLowerCase());
      const x = withGroup(raw, old);
      if (!old) added.push({ pack: id, entry: x });
      else if (sameEntry(old, x)) same += 1;
      else changed.push({ pack: id, entry: x, before: old });
    }
  }
  return { added, changed, same };
}

/**
 * 적용. merge: 지금 목록에 더하고 같은 영어는 파일 쪽으로 · replace: 파일에 든 묶음만 파일 내용으로 바꿈
 * (다른 묶음은 그대로)
 */
export function applyImport(g, incoming, mode = 'merge') {
  const out = cloneGlossary(g);
  for (const [id, list] of Object.entries(incoming.packs)) {
    if (mode === 'replace') { out.packs[id] = cleanPack(list); continue; }
    const cur = out.packs[id] || [];
    for (const x of list) {
      const i = cur.findIndex(c => c.en.toLowerCase() === x.en.toLowerCase());
      if (i >= 0) cur[i] = withGroup(x, cur[i]);
      else cur.push({ ...x });
    }
    out.packs[id] = cleanPack(cur);
  }
  return out;
}

/** 내려받을 파일 이름: ai-sub-ko-용어집-클라우드-20261026.json */
export function exportFileName(scope, packId, fmt, d = new Date()) {
  const p = n => String(n).padStart(2, '0');
  const what = scope === 'all' ? '전체' : scope === 'edited' ? '고친것' : packName(packId);
  return `ai-sub-ko-용어집-${what}-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}.${fmt === 'csv' ? 'csv' : 'json'}`;
}

