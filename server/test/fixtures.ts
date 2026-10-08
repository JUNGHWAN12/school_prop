/**
 * 회귀 테스트·평가용 견적서 데이터. 모두 가상의 업체·번호·주소로 만든 익명 데이터이며,
 * 실제 견적서에서 발견한 양식 패턴(VAT 별도, 용역 행, 정가/공급가, HTML 표 등)만 본뜬 것이다.
 * 실제 견적서 원문·개인정보는 절대 이 파일에 넣지 않는다.
 */
import type { RawExtraction, VatChoice, VatMode, VatSource } from '../src/extraction';

export interface ExpectedItem {
  /** 품명에 포함되어야 하는 문자열 */
  name: string;
  quantity: number;
  /** VAT 포함 예상단가(K-에듀파인에 들어갈 값) */
  unitPrice: number;
}

export interface FixtureCase {
  name: string;
  description: string;
  /** OCR 단계가 반환한다고 가정한 원문(마스킹 전) */
  ocrText: string;
  /** 사용자가 업로드 전에 고른 단가 기준(없으면 자동) */
  userVat?: VatChoice;
  /** 모델이 반환할 법한 응답(의도적으로 합계금액을 빠뜨리거나 정가를 단가로 쓰는 등 현실적인 오류 포함) */
  modelRaw: RawExtraction;
  expect: {
    items: ExpectedItem[];
    /** 품목 합계(원) */
    total: number;
    /** 견적서 합계금액을 찾아야 하는 경우 */
    statedTotal?: number;
    warnings?: { include?: string[]; exclude?: string[] };
    /** 적용되어야 할 단가 기준과 근거 */
    vat?: { mode: VatMode; source: VatSource };
  };
  /** 마스킹 후 원문에 남아 있으면 안 되는 문자열(가짜 개인정보) */
  maskedMustNotContain: string[];
  /** 마스킹 후에도 남아 있어야 하는 문자열(사업자등록번호·금액 등) */
  maskedMustContain: string[];
}

export const CASES: FixtureCase[] = [
  {
    name: 'shop-vat-excluded',
    description: '쇼핑몰형: 단가·금액이 공급가(VAT 별도), 합계에만 VAT 포함. 모델이 합계금액을 빠뜨림',
    ocrText: `                         견 적 서
등록번호 123-45-67890        상호 (주)가상상사      대표자 홍길동
주소 경기도 가상시 예시로 12     TEL 031-555-0123  FAX 031-555-0124
담당자 김가상 010-9876-5432   sales@example-shop.co.kr
수신: 가상고등학교 귀하
No  품명/규격                          수량   단가(공급가)   금액(공급가)
1   USB 케이블 A-B 1.5m [CODE: 1001]    10     2,000        20,000
2   라즈베리파이 5 8GB 보드 [CODE: 1002]   2   120,000       240,000
3   방열판 쿨러 [CODE: 1003]             2     7,000        14,000
4   점퍼 케이블 40P [CODE: 1004]         5       700         3,500
공급가액 277,500   부가세액 27,750
합계 (VAT 포함) 305,250원
입금계좌: 국민은행 123456-78-901234 (주)가상상사`,
    modelRaw: {
      vat_mode: 'excluded',
      items: [
        { item_name: 'USB 케이블 A-B 1.5m [CODE: 1001]', quantity: 10, unit_price: 2000, line_amount: 20000 },
        { item_name: '라즈베리파이 5 8GB 보드 [CODE: 1002]', quantity: 2, unit_price: 120000, line_amount: 240000 },
        { item_name: '방열판 쿨러 [CODE: 1003]', quantity: 2, unit_price: 7000, line_amount: 14000 },
        { item_name: '점퍼 케이블 40P [CODE: 1004]', quantity: 5, unit_price: 700, line_amount: 3500 },
      ],
    },
    expect: {
      items: [
        { name: 'USB 케이블', quantity: 10, unitPrice: 2200 },
        { name: '라즈베리파이', quantity: 2, unitPrice: 132000 },
        { name: '방열판', quantity: 2, unitPrice: 7700 },
        { name: '점퍼 케이블', quantity: 5, unitPrice: 770 },
      ],
      total: 305250,
      statedTotal: 305250,
      warnings: { include: ['VAT 포함(+10%)으로 환산'], exclude: ['다릅니다'] },
    },
    maskedMustNotContain: ['555-0123', '555-0124', '9876-5432', 'sales@example', '123456-78', '901234', '홍길동', '예시로 12', '김가상'],
    maskedMustContain: ['123-45-67890', '305,250', '277,500', '(주)가상상사', '가상고등학교 귀하'],
  },
  {
    name: 'service-row-included',
    description: '용역 행(작업비, 단위·규격 없음)이 있는 VAT 포함 견적서',
    ocrText: `                견 적 서
NO : 202610010011                       PAGE :  1  /  1
                           등록번호 111-22-33333
 공   상    호 주식회사 예시넷      성명 이가상
 급   주    소 서울특별시 예시구 샘플로 26
 자   TEL : 02-555-0142   FAX : 02-555-2070
견적일자 : 2026 년 10월 01일
합계금액 :  일금 일십삼만 원정 (￦ 130,000 ) (부가세포함)
순번  품목명/규격                         단위  수량   단가     금액    비고
 1  HDMI-HDMI 케이블 NEXT-1415HD4K 15M          1   30,000   30,000  1학년교무실
 2  HDMI TO HDMI 케이블 NEXT-1420HD 20M         1   45,000   45,000  2학년교무실
 3  작업비                                      1   55,000   55,000
               합계                              3          130,000
농협 1234-56-789012 (주)예시넷`,
    modelRaw: {
      vat_mode: 'included',
      items: [
        { item_name: 'HDMI-HDMI 케이블 NEXT-1415HD4K', spec: '15M', quantity: 1, unit_price: 30000, line_amount: 30000 },
        { item_name: 'HDMI TO HDMI 케이블 NEXT-1420HD', spec: '20M', quantity: 1, unit_price: 45000, line_amount: 45000 },
        { item_name: '작업비', quantity: 1, unit_price: 55000, line_amount: 55000 },
      ],
    },
    expect: {
      items: [
        { name: 'HDMI-HDMI', quantity: 1, unitPrice: 30000 },
        { name: 'HDMI TO HDMI', quantity: 1, unitPrice: 45000 },
        { name: '작업비', quantity: 1, unitPrice: 55000 },
      ],
      total: 130000,
      statedTotal: 130000,
      warnings: { exclude: ['다릅니다', '부가세 포함 여부'] },
    },
    maskedMustNotContain: ['555-0142', '555-2070', '789012', '이가상', '샘플로 26'],
    maskedMustContain: ['111-22-33333', '130,000', '202610010011', '주식회사 예시넷', '작업비'],
  },
  {
    name: 'service-row-missed-by-model',
    description: '모델이 작업비 행을 빠뜨린 경우 → 합계 불일치 경고가 떠야 함',
    ocrText: `합계금액 :  일금 일십삼만 원정 (￦ 130,000 ) (부가세포함)
 1  HDMI-HDMI 케이블 15M          1   30,000   30,000
 2  HDMI TO HDMI 케이블 20M       1   45,000   45,000
 3  작업비                         1   55,000   55,000`,
    modelRaw: {
      vat_mode: 'included',
      items: [
        { item_name: 'HDMI-HDMI 케이블 15M', quantity: 1, unit_price: 30000, line_amount: 30000 },
        { item_name: 'HDMI TO HDMI 케이블 20M', quantity: 1, unit_price: 45000, line_amount: 45000 },
      ],
    },
    expect: {
      items: [
        { name: 'HDMI-HDMI', quantity: 1, unitPrice: 30000 },
        { name: 'HDMI TO HDMI', quantity: 1, unitPrice: 45000 },
      ],
      total: 75000,
      statedTotal: 130000,
      warnings: { include: ['75,000원', '130,000원', '다릅니다'] },
    },
    maskedMustNotContain: [],
    maskedMustContain: ['130,000'],
  },
  {
    name: 'books-list-vs-supply',
    description: '도서 견적: 단가·정가 열은 정가, 공급가 열이 실제 청구액(할인). 절판 행은 금액 없음. 모델이 합계금액 누락·부가세 불명',
    ocrText: `                견 적 서
사업자등록번호 222-33-44444
상 호 가상서점   성명 박가상
사 업장주 소 서울특별시 예시구 샘플로 39-2
전 화 번 호 (064) 555-0123
가상고등학교 귀하
합계금액 : 일십사만이천사백 원정                \\142,400
연번  도서명                     저자     출판사     권수  단가    정가   공급가
1  운영체제                    홍길동  가상미디어   1   35,000  35,000  35,000
2  왜 건물은 지진에 무너지지 않을까?-절판  김가상  다른출판
3  빅데이터 시대, 성과를 이끌어 내는 데이터 문해력  이가상  프리렉   1   16,000  16,000  14,400
4  게임 프로그래밍 패턴          최가상  한빛미디어   1   35,000  35,000  31,500
5  피지컬AI 2026              정가상  스마트북스   1   25,000  25,000  22,500
6  운영체제                    조가상  퍼스트북    1   39,000  39,000  39,000
합   계                                        5  150,000 150,000 142,400`,
    modelRaw: {
      vat_mode: 'unknown',
      items: [
        { item_name: '운영체제', quantity: 1, unit_price: 35000, line_amount: 35000 },
        { item_name: '빅데이터 시대, 성과를 이끌어 내는 데이터 문해력', quantity: 1, unit_price: 16000, line_amount: 14400 },
        { item_name: '게임 프로그래밍 패턴', quantity: 1, unit_price: 35000, line_amount: 31500 },
        { item_name: '피지컬AI 2026', quantity: 1, unit_price: 25000, line_amount: 22500 },
        { item_name: '운영체제', quantity: 1, unit_price: 39000, line_amount: 39000 },
      ],
    },
    expect: {
      items: [
        { name: '운영체제', quantity: 1, unitPrice: 35000 },
        { name: '빅데이터', quantity: 1, unitPrice: 14400 },
        { name: '게임 프로그래밍', quantity: 1, unitPrice: 31500 },
        { name: '피지컬AI', quantity: 1, unitPrice: 22500 },
        { name: '운영체제', quantity: 1, unitPrice: 39000 },
      ],
      total: 142400,
      statedTotal: 142400,
      warnings: { include: ['공급가 기준'], exclude: ['다릅니다', '부가세 포함 여부'] },
    },
    maskedMustNotContain: ['555-0123', '박가상', '샘플로 39-2'],
    maskedMustContain: ['222-33-44444', '142,400', '가상서점', '운영체제', '가상고등학교 귀하'],
  },
  {
    name: 'books-multi-quantity-exempt',
    description: '도서 면세, 수량 2 이상: 단가는 공급가÷수량',
    ocrText: `견 적 서
사업자등록번호 333-44-55555  상호 샘플북스
TEL 051-555-0111
합계금액 : 구만삼천육백 원정 ₩93,600
No 도서명 수량 정가 공급가
1 AI 입문 3 18,000 48,600
2 데이터 구조 2 25,000 45,000`,
    modelRaw: {
      vat_mode: 'exempt',
      items: [
        { item_name: 'AI 입문', quantity: 3, unit_price: 18000, line_amount: 48600 },
        { item_name: '데이터 구조', quantity: 2, unit_price: 25000, line_amount: 45000 },
      ],
    },
    expect: {
      items: [
        { name: 'AI 입문', quantity: 3, unitPrice: 16200 },
        { name: '데이터 구조', quantity: 2, unitPrice: 22500 },
      ],
      total: 93600,
      statedTotal: 93600,
      warnings: { include: ['공급가 기준'], exclude: ['다릅니다'] },
    },
    maskedMustNotContain: ['555-0111'],
    maskedMustContain: ['333-44-55555', '93,600'],
  },
  {
    name: 'shipping-row',
    description: '배송비 행이 품목으로 포함되어야 하는 VAT 포함 견적서 ("총 합계" 표기)',
    ocrText: `견적서  (주)샘플오피스  등록번호 444-55-66666
(주)샘플오피스 서울특별시 예시구 샘플로 99 1층
TEL 070-5555-0199
1 문서 보관함 4 8,500 34,000
2 무선 마우스 2 12,000 24,000
3 배송비 1 3,000 3,000
총 합계: 61,000원 (VAT 포함)`,
    modelRaw: {
      vat_mode: 'included',
      items: [
        { item_name: '문서 보관함', quantity: 4, unit_price: 8500, line_amount: 34000 },
        { item_name: '무선 마우스', quantity: 2, unit_price: 12000, line_amount: 24000 },
        { item_name: '배송비', quantity: 1, unit_price: 3000, line_amount: 3000 },
      ],
    },
    expect: {
      items: [
        { name: '문서 보관함', quantity: 4, unitPrice: 8500 },
        { name: '무선 마우스', quantity: 2, unitPrice: 12000 },
        { name: '배송비', quantity: 1, unitPrice: 3000 },
      ],
      total: 61000,
      statedTotal: 61000,
      warnings: { exclude: ['다릅니다'] },
    },
    maskedMustNotContain: ['5555-0199', '샘플로 99'],
    maskedMustContain: ['444-55-66666', '61,000', '(주)샘플오피스'],
  },
  {
    name: 'html-table-ocr',
    description: 'Upstage 문서 파싱이 HTML 표로 반환하는 경우 (태그 속 숫자에 속지 않고 합계 탐색)',
    ocrText: `<table><tr><td colspan="3">견 적 서</td></tr><tr><td>사업자등록번호</td><td>555-66-77777</td></tr><tr><td>전화</td><td>02-555-0100</td></tr><tr><td>대표자</td><td>정 가 상</td></tr><tr><td>주소</td><td>서울특별시 예시구 샘플로 7</td></tr><tr><td>합계금액</td><td colspan="3">일금 오만이천 원정 (￦ 52,000)</td></tr><tr><td>품명</td><td>수량</td><td>단가</td><td>금액</td></tr><tr><td>A4 복사용지 (박스)</td><td>2</td><td>15,000</td><td>30,000</td></tr><tr><td>네임펜</td><td>11</td><td>2,000</td><td>22,000</td></tr></table>`,
    modelRaw: {
      vat_mode: 'included',
      items: [
        { item_name: 'A4 복사용지 (박스)', quantity: 2, unit_price: 15000, line_amount: 30000 },
        { item_name: '네임펜', quantity: 11, unit_price: 2000, line_amount: 22000 },
      ],
    },
    expect: {
      items: [
        { name: 'A4 복사용지', quantity: 2, unitPrice: 15000 },
        { name: '네임펜', quantity: 11, unitPrice: 2000 },
      ],
      total: 52000,
      statedTotal: 52000,
      warnings: { exclude: ['다릅니다'] },
    },
    maskedMustNotContain: ['555-0100', '정 가 상', '샘플로 7'],
    maskedMustContain: ['555-66-77777', '52,000', 'A4 복사용지', '네임펜'],
  },
  {
    name: 'no-total-in-document',
    description: '합계금액이 문서에 없는 단순 견적서: 대조 없이 품목만 반환, 경고 없음',
    ocrText: `견적서 사업자등록번호 666-77-88888
1 칠판지우개 3 1,500 4,500
2 분필 (박스) 2 2,500 5,000`,
    modelRaw: {
      vat_mode: 'included',
      items: [
        { item_name: '칠판지우개', quantity: 3, unit_price: 1500, line_amount: 4500 },
        { item_name: '분필 (박스)', quantity: 2, unit_price: 2500, line_amount: 5000 },
      ],
    },
    expect: {
      items: [
        { name: '칠판지우개', quantity: 3, unitPrice: 1500 },
        { name: '분필', quantity: 2, unitPrice: 2500 },
      ],
      total: 9500,
      warnings: { exclude: ['다릅니다', '공급가 기준'] },
    },
    maskedMustNotContain: [],
    maskedMustContain: ['666-77-88888'],
  },
  {
    name: 'vat-user-selected-excluded',
    description: '사용자가 VAT 별도를 선택: 합계금액이 없고 모델은 "포함"으로 잘못 답해도 선택이 우선',
    ocrText: `견 적 서
품명 수량 단가 금액
마우스 3 10,000 30,000
키보드 2 20,000 40,000`,
    userVat: 'excluded',
    modelRaw: {
      vat_mode: 'included',
      items: [
        { item_name: '마우스', quantity: 3, unit_price: 10000, line_amount: 30000 },
        { item_name: '키보드', quantity: 2, unit_price: 20000, line_amount: 40000 },
      ],
    },
    expect: {
      items: [
        { name: '마우스', quantity: 3, unitPrice: 11000 },
        { name: '키보드', quantity: 2, unitPrice: 22000 },
      ],
      total: 77000,
      vat: { mode: 'excluded', source: 'user' },
      warnings: { include: ['VAT 포함(+10%)으로 환산'] },
    },
    maskedMustNotContain: [],
    maskedMustContain: ['마우스'],
  },
  {
    name: 'vat-total-infers-excluded',
    description: '자동: 모델은 "포함"으로 답했지만 합계금액(77,000)이 품목 합계(70,000)×1.1과 맞아 VAT 별도로 판별',
    ocrText: `견 적 서
합계금액 : 일금 칠만칠천 원정 (￦ 77,000)
품명 수량 단가 금액
마우스 3 10,000 30,000
키보드 2 20,000 40,000`,
    modelRaw: {
      vat_mode: 'included',
      items: [
        { item_name: '마우스', quantity: 3, unit_price: 10000, line_amount: 30000 },
        { item_name: '키보드', quantity: 2, unit_price: 20000, line_amount: 40000 },
      ],
    },
    expect: {
      items: [
        { name: '마우스', quantity: 3, unitPrice: 11000 },
        { name: '키보드', quantity: 2, unitPrice: 22000 },
      ],
      total: 77000,
      statedTotal: 77000,
      vat: { mode: 'excluded', source: 'total' },
      warnings: { include: ['합계 기준을 따랐습니다'], exclude: ['다릅니다'] },
    },
    maskedMustNotContain: [],
    maskedMustContain: ['77,000'],
  },
  {
    name: 'vat-total-infers-included',
    description: '자동: 모델은 "별도"로 답했지만 품목 합계가 합계금액(70,000)과 그대로 맞아 포함으로 판별',
    ocrText: `견 적 서
합계금액 : 일금 칠만 원정 (￦ 70,000) (부가세포함)
품명 수량 단가 금액
마우스 3 10,000 30,000
키보드 2 20,000 40,000`,
    modelRaw: {
      vat_mode: 'excluded',
      items: [
        { item_name: '마우스', quantity: 3, unit_price: 10000, line_amount: 30000 },
        { item_name: '키보드', quantity: 2, unit_price: 20000, line_amount: 40000 },
      ],
    },
    expect: {
      items: [
        { name: '마우스', quantity: 3, unitPrice: 10000 },
        { name: '키보드', quantity: 2, unitPrice: 20000 },
      ],
      total: 70000,
      statedTotal: 70000,
      vat: { mode: 'included', source: 'total' },
      warnings: { include: ['합계 기준을 따랐습니다'], exclude: ['다릅니다', '환산'] },
    },
    maskedMustNotContain: [],
    maskedMustContain: ['70,000'],
  },
  {
    name: 'vat-user-choice-contradicts-total',
    description: '사용자가 "포함"을 골랐지만 합계금액은 별도 기준에 맞음 → 선택을 따르되 확인하도록 안내',
    ocrText: `견 적 서
합계금액 : 일금 칠만칠천 원정 (￦ 77,000)
품명 수량 단가 금액
마우스 3 10,000 30,000
키보드 2 20,000 40,000`,
    userVat: 'included',
    modelRaw: {
      vat_mode: 'excluded',
      items: [
        { item_name: '마우스', quantity: 3, unit_price: 10000, line_amount: 30000 },
        { item_name: '키보드', quantity: 2, unit_price: 20000, line_amount: 40000 },
      ],
    },
    expect: {
      items: [
        { name: '마우스', quantity: 3, unitPrice: 10000 },
        { name: '키보드', quantity: 2, unitPrice: 20000 },
      ],
      total: 70000,
      statedTotal: 77000,
      vat: { mode: 'included', source: 'user' },
      warnings: { include: ["선택하신 'VAT 포함' 기준으로는", "'VAT 별도'로 계산하면 맞습니다"] },
    },
    maskedMustNotContain: [],
    maskedMustContain: ['77,000'],
  },
];
