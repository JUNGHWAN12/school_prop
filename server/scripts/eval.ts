/**
 * 실제 모델 평가: 익명 회귀 데이터(test/fixtures.ts)의 OCR 텍스트를 마스킹한 뒤 실제 LLM에 보내 결과를 기대값과 비교한다.
 * (문서 파싱(OCR)은 건너뛰고, 모델의 품목 추출·정규화 정확도만 본다)
 *
 *   npx tsx scripts\eval.ts                       # 기본: Solar
 *   npx tsx scripts\eval.ts --provider gemini     # Gemini 평가
 *   npx tsx scripts\eval.ts --case books          # 이름에 'books'가 들어간 케이스만
 *   npx tsx scripts\eval.ts --files "C:\견적서폴더"  # 실제 견적서(PDF/PNG/JPG) 전체 파이프라인 요약(기대값 비교 없음)
 *
 * 키는 server\.env 에서 읽는다. 실제 견적서 파일은 저장소에 올리지 않는다.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import type { Env } from '../src/env';
import { finalizeExtraction } from '../src/extraction';
import { maskPersonalInfo } from '../src/masking/mask';
import { geminiExtract } from '../src/providers/gemini';
import { solarExtract, upstageOcr } from '../src/providers/upstage';
import { CASES } from '../test/fixtures';

try {
  for (const line of readFileSync(new URL('../.env', import.meta.url), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (m && !line.trim().startsWith('#') && !(m[1] in process.env)) process.env[m[1]] = m[2];
  }
} catch { /* .env 없음 */ }
const env = process.env as Env;

const args = process.argv.slice(2);
const opt = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const provider = (opt('provider') ?? 'upstage') === 'gemini' ? 'gemini' : 'upstage';
const llm = provider === 'gemini' ? geminiExtract : solarExtract;
const won = (n: number) => n.toLocaleString('ko-KR');

async function runFiles(dir: string) {
  const mime: Record<string, string> = { '.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' };
  const files = readdirSync(dir).filter((f) => mime[extname(f).toLowerCase()]);
  console.log(`${files.length}개 파일 · 프로바이더 ${provider}\n`);
  for (const f of files) {
    const t = Date.now();
    try {
      const file = new File([readFileSync(join(dir, f))], basename(f), { type: mime[extname(f).toLowerCase()] });
      const text = await upstageOcr(env, file);
      const { text: masked, counts } = maskPersonalInfo(text);
      const n = finalizeExtraction(await llm(env, masked), masked);
      const sum = n.items.reduce((a, i) => a + i.quantity * i.unitPrice, 0);
      const ok = n.statedTotal !== undefined && Math.abs(sum - n.statedTotal) <= Math.max(10, Math.round(n.statedTotal * 0.002));
      console.log(`${ok ? '✔' : '?'} ${f}  (${Date.now() - t}ms, 마스킹 ${JSON.stringify(counts)})`);
      console.log(`   품목 ${n.items.length}개, 합계 ${won(sum)}원 / 견적서 합계 ${n.statedTotal !== undefined ? won(n.statedTotal) + '원' : '확인 불가'}`);
      for (const w of n.warnings) console.log(`   ⚠ ${w}`);
    } catch (e) {
      console.log(`✘ ${f}: ${e instanceof Error ? e.message : e}`);
    }
  }
}

async function runCases() {
  const only = opt('case');
  const cases = CASES.filter((c) => !only || c.name.includes(only));
  console.log(`${cases.length}개 케이스 · 프로바이더 ${provider} (${provider === 'gemini' ? env.GEMINI_MODEL ?? 'gemini-2.5-flash' : env.UPSTAGE_SOLAR_MODEL ?? 'solar-pro2'})\n`);
  let pass = 0;
  for (const c of cases) {
    const t = Date.now();
    const problems: string[] = [];
    try {
      const { text: masked } = maskPersonalInfo(c.ocrText);
      const n = finalizeExtraction(await llm(env, masked), masked);
      if (n.items.length !== c.expect.items.length) problems.push(`품목 수 ${n.items.length} (기대 ${c.expect.items.length})`);
      c.expect.items.forEach((e, i) => {
        const g = n.items[i];
        if (!g) return problems.push(`${i + 1}번 품목 없음 (기대 ${e.name})`);
        if (!g.itemName.includes(e.name)) problems.push(`${i + 1}번 품명 '${g.itemName}' (기대 '${e.name}' 포함)`);
        if (g.quantity !== e.quantity) problems.push(`${i + 1}번 수량 ${g.quantity} (기대 ${e.quantity})`);
        if (g.unitPrice !== e.unitPrice) problems.push(`${i + 1}번 단가 ${g.unitPrice} (기대 ${e.unitPrice})`);
      });
      const sum = n.items.reduce((a, i) => a + i.quantity * i.unitPrice, 0);
      if (sum !== c.expect.total) problems.push(`합계 ${won(sum)} (기대 ${won(c.expect.total)})`);
      for (const w of c.expect.warnings?.include ?? []) if (!n.warnings.join('\n').includes(w)) problems.push(`경고에 '${w}' 없음`);
      for (const w of c.expect.warnings?.exclude ?? []) if (n.warnings.join('\n').includes(w)) problems.push(`경고에 '${w}'가 불필요하게 포함`);
    } catch (e) {
      problems.push(`호출 실패: ${e instanceof Error ? e.message : e}`);
    }
    if (problems.length === 0) pass += 1;
    console.log(`${problems.length === 0 ? '✔' : '✘'} ${c.name} (${Date.now() - t}ms)`);
    for (const p of problems) console.log(`    - ${p}`);
  }
  console.log(`\n결과: ${pass}/${cases.length} 통과`);
  process.exitCode = pass === cases.length ? 0 : 1;
}

const dir = opt('files');
await (dir ? runFiles(dir) : runCases());
