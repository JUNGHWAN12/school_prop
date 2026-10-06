/**
 * 개인정보 마스킹 (강제 적용). AI로 보내기 전에 OCR 텍스트에 적용한다.
 * 대상: 주민등록번호, 전화번호, 계좌번호, 이메일. 사업자등록번호·금액·문서번호는 보존.
 */
export interface MaskResult { text: string; counts: Record<string, number> }

const BANK_WORDS = /계좌|은행|입금|예금주|무통장|농협|국민|신한|우리|하나|기업|카카오뱅크|토스뱅크|케이뱅크|새마을|우체국|수협|SC제일|제일/;

const maskKeepLast = (s: string, keep: number) => {
  let seen = 0;
  const total = (s.match(/\d/g) ?? []).length;
  return s.replace(/\d/g, (d) => (++seen > total - keep ? d : '*'));
};

export function maskPersonalInfo(input: string): MaskResult {
  const counts = { rrn: 0, phone: 0, account: 0, email: 0 };
  let text = input;

  // 주민등록번호 (하이픈 있음 / 날짜 형식 검증된 13자리)
  text = text.replace(/(?<!\d)\d{6}-[1-8]\d{6}(?!\d)/g, () => (counts.rrn++, '******-*******'));
  text = text.replace(/(?<!\d)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])[1-4]\d{6}(?!\d)/g, () => (counts.rrn++, '*************'));

  // 이메일
  text = text.replace(/[A-Za-z0-9._%+-]+@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g, (_m, domain) => (counts.email++, `***@${domain}`));

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
