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
  it('대표자·담당자 이름은 라벨 뒤에서만 가린다', () => {
    const cases: [string, string][] = [
      ['대표자 홍길동', '대표자 ***'],
      ['대 표 자 : 홍길동', '대 표 자 : ***'],
      ['성명 허 성주', '성명 ***'],
      ['대표이사 김가상  TEL 02-111-2222', '대표이사 ***  TEL 02-***-2222'],
      ['<td>대표자명</td><td>홍 길 동</td>', '<td>대표자명</td><td>***</td>'],
      ['| 성명 | 오성혁 |', '| 성명 | *** |'],
      ['담당자 김가상 과장', '담당자 *** 과장'],
    ];
    for (const [input, out] of cases) expect(maskPersonalInfo(input).text, input).toBe(out);
  });
  it('주소는 라벨 값 전체를 가린다(다음 라벨·칸 전까지)', () => {
    const cases: [string, string][] = [
      ['주소 경기도 가상시 예시로 12     TEL 031-555-0123', '주소 ***     TEL 031-***-0123'],
      ['사 업장주 소 서귀포시 대정읍 하모상가로39-2', '사 업장주 소 ***'],
      ['<td>주소</td><td>서울특별시 예시구 샘플로 7</td>', '<td>주소</td><td>***</td>'],
      ['사업장 소재지: 부산광역시 해운대구 해운대로 1', '사업장 소재지: ***'],
    ];
    for (const [input, out] of cases) expect(maskPersonalInfo(input).text, input).toBe(out);
  });
  it('라벨 없는 도로명주소도 가린다', () => {
    expect(maskPersonalInfo('(주)샘플오피스 서울특별시 예시구 샘플로 99 1층').text).toBe('(주)샘플오피스 ***');
  });
  it('이름·주소 오탐 방지: 상호·학교명·품목·헤더 행은 보존', () => {
    const keep = [
      '대정고등학교 귀하', '상 호 주식회사 해피넷', '1학년교무실 2학년교무실', '합계 3 130,000', '운영체제 35,000',
      '성명판 홍길동', '주소 | 전화 | 팩스', '대표 합계', '품명 규격 단위 수량 단가', '납품장소 1학년교무실',
    ];
    for (const k of keep) expect(maskPersonalInfo(k).text, k).toBe(k);
  });
  it('마스킹 건수에 이름·주소 포함', () => {
    const r = maskPersonalInfo('대표자 홍길동\n주소 경기도 가상시 예시로 12');
    expect(r.counts).toMatchObject({ name: 1, address: 1 });
  });
  it('이메일', () => {
    expect(maskPersonalInfo('a.b@school.kr').text).toBe('***@school.kr');
  });
});
