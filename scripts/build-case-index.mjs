import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const compact = (value, limit = 700) => {
  const text = typeof value === 'string' ? value.trim() : '';
  return text.length > limit ? `${text.slice(0, limit)} […]` : text;
};
const cases = fs.readFileSync(path.join(root, 'public/data/cases.jsonl'), 'utf8')
  .trim().split(/\r?\n/).map(line => JSON.parse(line)).map(c => ({
    caseId: c.case_id,
    tittel: c.prosjektnavn,
    organisasjon: c.organisasjon,
    bransje: c.bransje,
    problem: compact(c.problem || c.beskrivelse_original),
    resultat: compact(c.maalt_resultat),
    alternativer: compact(c.alternativer_vurdert || c.enklere_ikke_KI_loesning),
    mangler: compact(c.manglende_dokumentasjon),
    evidens: c.evidensstyrke,
    kilde: c.kilde,
    kildeUrl: typeof c.kilde_url === 'string' && /^https?:\/\//i.test(c.kilde_url.trim()) ? c.kilde_url.trim() : ''
  }));
if (!cases.length || cases.some(c => !c.caseId || !c.tittel)) throw new Error('Case-ID/tittel mangler.');
if (new Set(cases.map(c => c.caseId)).size !== cases.length) throw new Error('Dupliserte case-ID-er.');
const output = JSON.stringify(cases);
fs.writeFileSync(path.join(root, 'public/data/case-index.json'), `${output}\n`, 'utf8');
console.log(`${cases.length} case; ${(Buffer.byteLength(output) / 1024 / 1024).toFixed(2)} MB. Ingen kildefiler endret.`);
