import { describe, expect, it } from 'vitest';
import { maskPersonalInfo } from './mask';

describe('maskPersonalInfo', () => {
  it('주민등록번호', () => {
    expect(maskPersonalInfo('주민 900101-1234567').text).toBe('주민 ******-*******');
    expect(maskPersonalInfo('9001011234567').text).toBe('*************');
  });
  it('전화번호', () => {
    expect(maskPersonalInfo('010-1234-5678').text).toBe('010-****-5678');
    expect(maskPersonalInfo('TEL 02-123-4567 / 031-1234-5678').text).toBe('TEL 02-***-4567 / 031-****-5678');
    expect(maskPersonalInfo('01012345678').text).toBe('010-****-5678');
  });
  it('괄호 지역번호 형식', () => {
    expect(maskPersonalInfo('전화번호 (064) 794-2309').text).toBe('전화번호 064-***-2309');
    expect(maskPersonalInfo('TEL (02)123-4567').text).toBe('TEL 02-***-4567');
  });
  it('계좌번호는 은행 문맥에서만', () => {
    expect(maskPersonalInfo('농협 301-1234-5678-91').text).toBe('농협 ***-****-**78-91');
    expect(maskPersonalInfo('입금계좌: 110-123-456789').text).toBe('입금계좌: ***-***-**6789');
    expect(maskPersonalInfo('문서번호 123-4567-8901').text).toBe('문서번호 123-4567-8901');
  });
  it('사업자등록번호·금액·날짜는 보존', () => {
    const t = '사업자등록번호 123-45-67890 합계 1,234,567원 2026-10-06 단가 15300';
    expect(maskPersonalInfo(t).text).toBe(t);
  });
  it('사업자번호가 계좌 문맥 줄에 있어도 보존', () => {
    const t = '사업자등록번호 123-45-67890 (농협)';
    expect(maskPersonalInfo(t).text).toBe(t);
  });
  it('같은 줄의 전화번호와 계좌번호', () => {
    expect(maskPersonalInfo('농협 301-1234-5678-91 / 010-1234-5678').text).toBe('농협 ***-****-**78-91 / 010-****-5678');
  });
  it('이메일', () => {
    expect(maskPersonalInfo('a.b@school.kr').text).toBe('***@school.kr');
  });
});
