const DIGITS = ['', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구'];
const SMALL_UNITS = ['', '십', '백', '천'];
const BIG_UNITS = ['', '만', '억', '조'];

/** 4자리 이하 그룹(0~9999)을 한글로. 십/백/천 앞의 '일'은 생략한다. */
function groupToKorean(n: number): string {
  let out = '';
  const d = [Math.floor(n / 1000) % 10, Math.floor(n / 100) % 10, Math.floor(n / 10) % 10, n % 10];
  d.forEach((digit, i) => {
    if (digit === 0) return;
    const unitIdx = 3 - i;
    out += (digit === 1 && unitIdx > 0 ? '' : DIGITS[digit]) + SMALL_UNITS[unitIdx];
  });
  return out;
}

/** 정수 금액 → 한글 숫자 (예: 85770 → 팔만오천칠백칠십). 0은 '영'. */
export function numberToKorean(amount: number): string {
  if (!Number.isFinite(amount) || amount < 0) throw new RangeError('0 이상의 유한한 수여야 합니다');
  let n = Math.round(amount);
  if (n === 0) return '영';
  const groups: number[] = [];
  while (n > 0) {
    groups.push(n % 10000);
    n = Math.floor(n / 10000);
  }
  if (groups.length > BIG_UNITS.length) throw new RangeError('금액이 너무 큽니다');
  let out = '';
  for (let i = groups.length - 1; i >= 0; i--) {
    if (groups[i] === 0) continue;
    // 만/억/조 단위 앞에서는 '일'을 생략하지 않는다 (일만, 일억)
    out += groupToKorean(groups[i]) + BIG_UNITS[i];
  }
  return out;
}

/** 금액 → `금팔만오천칠백칠십원` */
export function amountToKoreanWon(amount: number): string {
  return `금${numberToKorean(amount)}원`;
}

export const formatWon = (n: number) => n.toLocaleString('ko-KR');
