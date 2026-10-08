# Edu-Approval

견적서(PDF/이미지)를 올리면 AI가 품목을 읽어 **K-에듀파인 품목내역 엑셀**과 **품의문 본문**을 만들어 주는 학교 행정 도우미입니다.

- 사이트: https://junghwan12.github.io/school_prop/
- 대상: 교원, 행정실 지출·회계·물품 담당자

> AI가 읽은 결과는 **반드시 원본 견적서와 비교해 확인**한 뒤 사용하세요. 화면의 "확인 필요" 안내와 합계 일치 표시는 이를 돕기 위한 장치입니다.

---

## 주요 기능

| 기능 | 설명 |
|------|------|
| 견적서 분석 | PDF·JPG·PNG(최대 10MB)에서 품명·규격·단위·수량·단가를 추출. 업체마다 다른 양식을 처리 |
| 금액 검증 | 견적서 합계금액과 품목 합계를 대조해 누락·불일치를 경고. 정가/공급가 열이 다르면 공급가 기준. **단가 기준(VAT 포함/별도/면세)은 사용자 선택 > 합계금액 기반 자동 판별 > AI 판단 순으로 결정**하고 별도면 VAT 포함 단가로 환산 |
| 품의문 생성 | 약식 구매 / 행사·대회 참가 / 식비·급량비 템플릿, 한글 금액(`금팔만오천원`) 자동 변환, 본문 직접 수정, 클립보드 복사 |
| 엑셀 내려받기 | K-에듀파인 `품목내역(통합)` 서식(시트 `품목내역`, 5열)으로 생성. 기본 `.xlsx`, 보조 `.xls` |
| 개인정보 보호 | 전화번호·주민등록번호·계좌번호·이메일·대표자(담당자) 이름·주소는 AI로 보내기 전에 서버에서 **항상** 마스킹 |

## 사용 방법

1. 업로드 전에 위쪽에서 **견적서 단가 기준**을 고릅니다. 견적서에 `부가세 별도`/`공급가액`으로 표시된 단가면 **VAT 별도**, 부가세가 이미 들어 있으면 **VAT 포함**, 도서 등 부가세가 없으면 **면세**입니다. 잘 모르겠으면 **자동 판별**(기본값)을 두세요. 마지막 선택은 브라우저에 기억됩니다.
2. 사이트에서 견적서 파일을 끌어놓거나 클릭해 선택합니다.
3. 왼쪽 **분석 안내**에서 "확인 필요" 항목, 적용된 **단가 기준**(직접 선택 / 합계금액 기준 자동 판별 / AI 판단), 견적서 합계 일치 여부를 확인합니다.
4. 아래 **품목 그리드**에서 품명·규격·단위·수량·단가를 수정하거나 행을 추가·삭제합니다.
5. 오른쪽에서 품의 템플릿을 고르고 사업명·행사 정보 등을 입력해 본문을 완성한 뒤 **품의문 클립보드 복사**를 누릅니다.
6. **K-에듀파인 엑셀 다운로드(.xlsx)** 로 파일을 받아 K-에듀파인에 일괄 등록합니다.

AI 분석이 실패하거나 하루 사용 한도를 넘으면 안내가 표시되며, 품목을 직접 입력해도 품의문과 엑셀을 만들 수 있습니다.

## 동작 방식

```
브라우저(React, GitHub Pages)
   │  견적서 업로드
   ▼
API(Hono, Cloudflare Workers)
   1. Upstage Document Parse   견적서 → 텍스트(OCR)
   2. 개인정보 마스킹(필수)     전화·주민번호·계좌·이메일·대표자/담당자 이름·주소
   3. Upstage Solar            마스킹된 텍스트 → 품목 JSON   (실패 시 Gemini로 폴백)
   4. 검증·정규화               단가 기준(VAT) 적용, 정가/공급가 처리, 합계 대조
   ▼
브라우저: 품목 편집 → 품의문 · 엑셀 생성(브라우저에서 처리)
```

- 원본 파일·이미지는 AI(Solar/Gemini)에 전달되지 않고, **마스킹된 텍스트만** 전달됩니다. 문서 파싱 단계가 실패하면 외부로 보내지 않고 수동 입력으로 안내합니다.
- 서버는 견적서를 저장하지 않으며 로그에도 본문을 남기지 않습니다(단계별 소요 시간·폴백 여부 등만 기록).
- API 키는 서버(Cloudflare 시크릿)에만 있으며 브라우저에 노출되지 않습니다.

## 저장소 구조

```
web/               React + Vite + TypeScript + Tailwind + Zustand (한글 금액, 템플릿, 엑셀, UI)
server/            Hono API (마스킹, 프로바이더, 추출 정규화, 요청 제한) — Cloudflare Workers
server/scripts/    diagnose.ts  로컬 진단 스크립트
docs/              배포가이드.md, 요구사항명세서.md(초기 명세), samples/(K-에듀파인 원본 서식)
.github/workflows/ pages.yml(웹 자동 배포), worker.yml(수동 배포, 선택)
개발계획서.md       설계·결정 사항 기록
향후개선계획.md      이후 개선 로드맵
```

## 개발 환경 (Windows PowerShell 기준)

사전 준비: Node.js 22 LTS, Git. 구버전 PowerShell(5.x)은 `&&`를 지원하지 않으므로 **명령을 한 줄씩** 실행하세요.

```powershell
git clone https://github.com/JUNGHWAN12/school_prop
cd school_prop
```

서버 (http://localhost:8787)

```powershell
cd server
npm i
copy .env.example .env
notepad .env
npm run dev
```

`.env`에 `UPSTAGE_API_KEY`, `GEMINI_API_KEY`를 입력합니다. 이 파일은 커밋하지 않습니다(`.gitignore`).

웹 (http://localhost:5173, `/api`는 8787로 프록시) — 새 PowerShell 창에서

```powershell
cd web
npm i
npm run dev
```

테스트·타입체크

```powershell
cd web
npm test
npm run typecheck
cd ..\server
npm test
npm run typecheck
```

견적서 한 장으로 분석 단계를 점검하는 진단(문서 파싱 → 마스킹 → Solar → Gemini, 단계별 성공 여부와 소요 시간 출력)

```powershell
cd server
npx tsx scripts\diagnose.ts "C:\경로\견적서.pdf"
```

## 테스트와 정확도 평가

**자동 테스트(회귀)** — 마스킹, 합계 탐색, 단가 환산, 합계 대조를 익명 견적서 데이터 8종(`server/test/fixtures.ts`)으로 검증합니다. PR마다 GitHub Actions(`ci.yml`)가 웹·서버 테스트와 타입체크를 실행합니다.

**실제 모델 평가** — 같은 데이터를 실제 Solar/Gemini에 보내 결과를 기대값과 비교합니다(키 필요, `server\.env`). 프롬프트·모델을 바꾼 뒤 기존 양식이 깨지지 않는지 확인할 때 사용하세요.

```powershell
cd server
npx tsx scripts\eval.ts
npx tsx scripts\eval.ts --provider gemini
npx tsx scripts\eval.ts --case books
```

운영과 같은 모델로 평가하려면 `server\.env`에 `UPSTAGE_SOLAR_MODEL=solar-pro4`를 넣으세요.

**실제 견적서 점검** — 폴더 안의 PDF/이미지를 전체 파이프라인(문서 파싱 → 마스킹 → 모델 → 검증)으로 돌려, 품목 수·합계·견적서 합계와의 일치 여부·경고를 요약합니다. 기대값 비교는 없고 파일은 저장소에 올라가지 않습니다.

```powershell
npx tsx scripts\eval.ts --files "C:\견적서폴더"
```

틀리는 견적서를 발견하면 **개인정보를 가린 텍스트**로 `server/test/fixtures.ts`에 사례를 추가해 주세요(실제 업체명·번호·주소·계좌는 넣지 않습니다).

## 설정

서버 환경변수 (`server/wrangler.toml`의 `[vars]` 또는 시크릿)

| 이름 | 구분 | 기본값 / 예 | 설명 |
|------|------|-------------|------|
| `UPSTAGE_API_KEY` | 시크릿 | - | Upstage API 키 |
| `GEMINI_API_KEY` | 시크릿 | - | Gemini API 키 (폴백용) |
| `PRIMARY_PROVIDER` | 변수 | `upstage` | 우선 프로바이더 (`upstage`/`gemini`) |
| `FALLBACK_PROVIDER` | 변수 | `gemini` | 폴백 프로바이더. `none`이면 폴백 안 함 |
| `UPSTAGE_SOLAR_MODEL` | 변수 | `solar-pro4` (코드 기본값 `solar-pro2`) | 품목 추출 모델 |
| `UPSTAGE_PARSE_MODEL` | 변수 | `document-parse` | 문서 파싱 모델 |
| `GEMINI_MODEL` | 변수 | `gemini-2.5-flash` | 폴백 모델 |
| `ALLOWED_ORIGIN` | 변수 | `https://junghwan12.github.io` | 허용할 웹 출처(CORS, 쉼표 구분) |
| `PROVIDER_TIMEOUT_MS` | 변수 | `60000` | 외부 AI 호출 1회당 최대 대기(밀리초). 넘기면 폴백으로 전환 |
| `RATE_LIMIT_PER_MIN` | 변수 | `10` | IP당 분당 요청 수 |
| `DAILY_CALL_LIMIT` | 변수 | `200` | 하루 전체 분석 호출 상한 (한국 시간 자정 초기화, Durable Object로 모든 인스턴스가 공유) |
| `DAILY_PER_IP_LIMIT` | 변수 | `50` | 하루 IP당 분석 호출 상한 |
| `MAX_FILE_MB` | 변수 | `10` | 업로드 최대 크기(MB) |
| `DISABLE_EXTRACT` | 변수 | (없음) | `true`이면 AI 분석을 즉시 중지(킬 스위치). 품목 직접 입력은 계속 가능 |
| `TURNSTILE_SECRET_KEY` | 시크릿 | (없음) | 설정하면 Cloudflare Turnstile 사람 확인을 필수로 요구 |

웹 빌드 변수

| 이름 | 설명 |
|------|------|
| `VITE_API_BASE` | 배포된 API(Worker) 주소. GitHub 저장소 Variables의 `API_BASE_URL`에서 주입. 로컬은 비워 둠 |
| `VITE_TURNSTILE_SITE_KEY` | Turnstile 사이트 키(공개값). GitHub 저장소 Variables의 `TURNSTILE_SITE_KEY`에서 주입. 비우면 Turnstile 비활성 |
| `VITE_BASE` | 정적 호스팅 경로(GitHub Pages는 `/school_prop/`). 워크플로가 자동 설정 |

## 배포

`main`에 병합하면 자동으로 배포됩니다.

- **웹**: `.github/workflows/pages.yml` → GitHub Pages (`web/**` 변경 시 테스트·빌드·배포)
- **API**: Cloudflare Workers Builds(저장소 연동). 루트 `/server`, 배포 명령 `npx wrangler deploy`
- 최초 설정(Cloudflare 가입, 시크릿 등록, Pages 설정, 저장소 변수)은 [`docs/배포가이드.md`](docs/배포가이드.md) 참고

## 알아 두어야 할 점

- **공개 API입니다.** 로그인은 없고 여러 겹의 장치로 남용을 제한합니다. Upstage·Google 콘솔에서 월 사용 한도를 설정하는 것이 가장 확실한 최후 방어선입니다.
  1. 출처 검사: 허용된 웹 사이트(`ALLOWED_ORIGIN`)에서 온 요청만 처리
  2. Cloudflare Turnstile: 자동화된 호출 차단(시크릿 설정 시)
  3. IP당 분당 요청 수 + **하루 전체·IP별 호출 상한**(Durable Object 공유 카운터)
  4. 파일 형식·크기 제한(기본 10MB), 잘못된 요청은 일일 상한을 소모하지 않음
  5. 킬 스위치(`DISABLE_EXTRACT=true`)로 비상 시 분석 즉시 중지
- **마스킹 범위**: 전화번호, 주민등록번호, 계좌번호, 이메일, 대표자·담당자 이름(`대표자`, `성명`, `담당자` 등 라벨 뒤), 주소(`주소`, `사업장주소` 등 라벨 뒤 전체와 라벨 없는 도로명주소). 상호(회사명)·사업자등록번호·학교명·품목명·금액·문서번호는 유지됩니다. 라벨이 없거나 독특한 표기의 이름은 가려지지 않을 수 있으니, 견적서 원본에는 민감정보가 있다는 점을 유의하세요.
- 모델명·API 엔드포인트는 환경변수로 교체할 수 있습니다. 모델이 바뀌면 정확도가 달라질 수 있으니 배포 후 대표 견적서로 확인하세요.
- 처리 시간 목표는 단일 페이지 견적서 기준 **60초 이내**입니다(보통 10~20초: 문서 파싱 약 2초 + 모델 약 11초). 문서 파싱·Solar·Gemini는 각각 최대 60초까지 기다린 뒤 다음 단계로 넘어가므로, 연속으로 지연되면 최악의 경우 몇 분까지 걸릴 수 있습니다. 여러 장·여러 페이지 견적서는 지원 범위를 확대 중입니다(향후개선계획 참고).
- 엑셀 라이브러리 `xlsx`는 구버전(0.18.5)을 사용 중이며 교체를 검토합니다.

## 문서

- [개발계획서.md](개발계획서.md): 요구사항, 기술 결정, 아키텍처, 확정 사항(마스킹 강제, 폴백, 무예산 운영 등)
- [향후개선계획.md](향후개선계획.md): 우선순위별 개선 과제와 일정
- [docs/배포가이드.md](docs/배포가이드.md): 배포 절차
- [docs/요구사항명세서.md](docs/요구사항명세서.md): 초기 요구사항 명세 (일부는 구현에서 변경됨)
