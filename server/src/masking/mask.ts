/**
 * 개인정보 마스킹 (강제 적용). AI로 보내기 전에 OCR 텍스트에 적용한다.
 * 대상: 주민등록번호, 전화번호, 계좌번호, 이메일, 대표자·담당자 이름, 주소.
 * 상호(회사명)·사업자등록번호·금액·문서번호·학교명·품목명은 보존.
 */
export interface MaskResult { text: string; counts: Record<string, number> }

const BANK_WORDS = /계좌|은행|입금|예금주|무통장|농협|국민|신한|우리|하나|기업|카카오뱅크|토스뱅크|케이뱅크|새마을|우체국|수협|SC제일|제일/;

const maskKeepLast = (s: string, keep: number) => {
  let seen = 0;
  const total = (s.match(/\d/g) ?? []).length;
  return s.replace(/\d/g, (d) => (++seen > total - keep ? d : '*'));
};

// ── 이름·주소 (라벨 기반) ─────────────────────────────────────────────
// 견적서 양식이 제각각이라 글자 사이 공백('대 표 자', '사 업장주 소')과 HTML/마크다운 표 구분자를 허용한다.
const SEP = String.raw`(?:[ \t]|<[^>]*>|[:：|])+`;
const NAME_LABEL = String.raw`(?:대\s*표\s*자\s*명?|대\s*표\s*이\s*사|대\s*표|성\s*명|담\s*당\s*자\s*명?|담\s*당)`;
/** 한글 2~4자(글자 사이 공백 한 칸 허용: '허 성주', '홍 길 동'). 뒤에 한글이 이어지면 이름이 아니라 단어의 일부로 본다 */
const NAME = String.raw`[가-힣](?:[ \t]?[가-힣]){1,3}(?![가-힣])`;
const ADDR_LABEL = String.raw`(?:사\s*업\s*장\s*|배\s*송\s*)?(?:주\s*소|소\s*재\s*지)`;
const ADDR_END = String.raw`(?:\s{2,}|[ \t](?:TEL|Tel|tel|FAX|Fax|fax|전\s*화|팩\s*스|대\s*표|성\s*명|업\s*태|종\s*목|등\s*록|상\s*호|E-?mail|이메일|홈페이지)|\n|<|\||$)`;
/** 라벨 없이 나타나는 도로명주소: (시·도·군·구·읍·면)+ 도로명 + 번호 */
const ROAD_ADDR = /(?:[가-힣]{2,}(?:특별시|광역시|특별자치시|특별자치도|도|시|군|구|읍|면)[ \t]+){1,4}[가-힣0-9]+(?:로|길)[ \t]?\d+(?:-\d+)?(?:[ \t]*\([^)\n]{1,20}\))?(?:[ \t]*\d+층)?/g;

/** 이름이 아닌 라벨·일반 단어(오탐 방지) */
const NOT_A_NAME = new Set([
  '귀하', '귀중', '주소', '전화', '번호', '상호', '업태', '종목', '팩스', '연락처', '이메일', '대표', '담당', '성명',
  '사업자', '등록', '일자', '견적', '합계', '공급', '품목', '품명', '수량', '단가', '금액', '규격', '단위', '비고',
  '납품', '유효', '결제', '조건', '일시', '직위', '직책', '부서', '이하', '여백',
]);
const isLabelWord = (v: string) => NOT_A_NAME.has(v.replace(/\s/g, '')) || /^(?:전화|팩스|연락처|상호|업태|종목|등록|사업자|이메일|TEL|FAX)/i.test(v.trim());

export function maskPersonalInfo(input: string): MaskResult {
  const counts = { rrn: 0, phone: 0, account: 0, email: 0, name: 0, address: 0 };
  let text = input;

  // 주민등록번호 (하이픈 있음 / 날짜 형식 검증된 13자리)
  text = text.replace(/(?<!\d)\d{6}-[1-8]\d{6}(?!\d)/g, () => (counts.rrn++, '******-*******'));
  text = text.replace(/(?<!\d)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])[1-4]\d{6}(?!\d)/g, () => (counts.rrn++, '*************'));

  // 이메일
  text = text.replace(/[A-Za-z0-9._%+-]+@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g, (_m, domain) => (counts.email++, `***@${domain}`));

  // 대표자·담당자 이름: '대표자 홍길동', '성명: 이가상', '<td>대표자</td><td>홍 길 동</td>'
  text = text.replace(new RegExp(`(${NAME_LABEL})(${SEP})(${NAME})`, 'g'), (m, label: string, sep: string, name: string) => {
    if (isLabelWord(name)) return m;
    counts.name++;
    return `${label}${sep}***`;
  });

  // 주소: 라벨 뒤의 값 전체(다음 칸·다음 라벨 전까지)를 가림
  text = text.replace(new RegExp(`(${ADDR_LABEL})(${SEP})([^\\n<|]+?)(?=${ADDR_END})`, 'gm'), (m, label: string, sep: string, value: string) => {
    if (!/[가-힣0-9]/.test(value) || value.trim().length < 3 || isLabelWord(value)) return m;
    counts.address++;
    return `${label}${sep}***`;
  });
  // 라벨 없는 도로명주소
  text = text.replace(ROAD_ADDR, () => (counts.address++, '***'));

  // 계좌번호: 은행/계좌 관련 단어가 있는 줄에서만 (사업자등록번호 오탐 방지)
  text = text
    .split('\n')
    .map((line) => {
      if (!BANK_WORDS.test(line)) return line;
      return line.replace(/(?<![\d-])\d{2,6}(?:-\d{2,8}){1,3}(?![\d-])|(?<!\d)\d{10,16}(?!\d)/g, (m) => {
        const bizNo = /^\d{3}-\d{2}-\d{5}$/.test(m) && /사업자|등록번호/.test(line);
        if (bizNo) return m;
        if (/^(01[016789]|0[2-6]\d?|070)-\d{3,4}-\d{4}$/.test(m)) return m; // 전화번호는 아래 단계에서 처리
        counts.account++;
        return maskKeepLast(m, 4);
      });
    })
    .join('\n');

  // 전화번호: 휴대폰·지역번호(가운데 자리 마스킹), 대표번호
  // 괄호 지역번호 "(064) 794-2309", "064)794-2309" 형식도 처리
  text = text.replace(/(?<![\d-])\(?(01[016789]|0[2-6]\d?|070)\)?[-. ]?(\d{3,4})[-. ]?(\d{4})(?![\d-])/g, (_m, a, b, c) => {
    counts.phone++;
    return `${a}-${'*'.repeat(b.length)}-${c}`;
  });

  return { text, counts };
}
