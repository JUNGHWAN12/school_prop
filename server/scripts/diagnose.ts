/**
 * 로컬 진단: 견적서 한 장으로 파이프라인을 단계별 실행하고 각 단계의 결과/오류를 출력한다.
 * 사용: npx tsx scripts\diagnose.ts "C:\경로\견적서.pdf"   (server\.env 의 키를 사용)
 */
import { readFileSync } from 'node:fs';
import { basename, extname } from 'node:path';
import type { Env } from '../src/env';
import { normalizeExtraction } from '../src/extraction';
import { maskPersonalInfo } from '../src/masking/mask';
import { geminiExtract } from '../src/providers/gemini';
import { solarExtract, upstageOcr } from '../src/providers/upstage';

try {
  for (const line of readFileSync(new URL('../.env', import.meta.url), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (m && !line.trim().startsWith('#') && !(m[1] in process.env)) process.env[m[1]] = m[2];
  }
} catch { console.log('(server\\.env 없음: 환경변수만 사용)'); }
const env = process.env as Env;

const path = process.argv[2];
if (!path) { console.log('사용법: npx tsx scripts\\diagnose.ts "C:\\경로\\견적서.pdf"'); process.exit(1); }
const mime: Record<string, string> = { '.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' };
const file = new File([readFileSync(path)], basename(path), { type: mime[extname(path).toLowerCase()] ?? 'application/octet-stream' });

const step = async <T>(name: string, fn: () => Promise<T>): Promise<T | undefined> => {
  const t = Date.now();
  try {
    const r = await fn();
    console.log(`\n✔ ${name} 성공 (${Date.now() - t}ms)`);
    return r;
  } catch (e) {
    console.log(`\n✘ ${name} 실패 (${Date.now() - t}ms): ${e instanceof Error ? e.message : e}`);
  }
};

console.log(`키 설정: UPSTAGE_API_KEY=${env.UPSTAGE_API_KEY ? '있음' : '없음'}, GEMINI_API_KEY=${env.GEMINI_API_KEY ? '있음' : '없음'}`);
console.log(`모델: parse=${env.UPSTAGE_PARSE_MODEL ?? 'document-parse'}, solar=${env.UPSTAGE_SOLAR_MODEL ?? 'solar-pro2'}, gemini=${env.GEMINI_MODEL ?? 'gemini-2.5-flash'}`);

const text = await step('1) Upstage 문서 파싱(OCR)', () => upstageOcr(env, file));
if (!text) process.exit(2);
console.log(`   추출 텍스트 ${text.length}자. 앞부분:\n${text.slice(0, 600)}`);

const { text: masked, counts } = maskPersonalInfo(text);
console.log(`\n2) 마스킹 결과 건수: ${JSON.stringify(counts)}`);

for (const [name, fn] of [['3) Solar', solarExtract], ['4) Gemini(폴백)', geminiExtract]] as const) {
  const raw = await step(name, () => fn(env, masked));
  if (raw) {
    const n = normalizeExtraction(raw);
    console.log(JSON.stringify({ vat_mode: raw.vat_mode, 품목수: n.items.length, 경고: n.warnings }, null, 2));
    console.log(n.items.map((i) => `   ${i.itemName} | ${i.spec} | ${i.unit} | ${i.quantity} | ${i.unitPrice}`).join('\n'));
    const sum = n.items.reduce((a, i) => a + i.quantity * i.unitPrice, 0);
    console.log(`   합계(VAT 포함 환산): ${sum.toLocaleString('ko-KR')}원`);
  }
}
