import { containsDateShapedString } from './reason-date-check.util';

// B-129 (Decision Log #406 item 4): the server-side check that a DOB-correction
// reason holds no date. See the util for what it deliberately does not catch.

describe('containsDateShapedString: rejects date-shaped text', () => {
  it.each([
    // year first
    ['2010-03-04'],
    ['2010/3/4'],
    ['2010.03.04'],
    ['2010 - 03 - 04'],
    ['2010-03-04T00:00:00.000Z'],
    // day / month first
    ['04/03/2010'],
    ['4-3-2010'],
    ['4.3.2010'],
    ['04/03/10'],
    ['4-3-10'],
    // compact
    ['20100304'],
    ['04032010'],
    // month names with a day
    ['4 March'],
    ['4th of March'],
    ['3rd March'],
    ['04-Mar'],
    ['March 4'],
    ['Mar 4th'],
    ['mar. 4'],
    ['SEPT 12'],
    // month names with a year
    ['March 2010'],
    ['Mar, 2010'],
    ['2010 March'],
    ['march 2011'],
    // embedded in a sentence
    ['Parent supplied a birth certificate showing 4 March 2010, so correcting the year'],
    ['Wrong date entered at sign up; real one is 2011-07-19 per passport'],
    ['user typed 12/05/2012 by mistake'],
    ['born on the 9th of December'],
    // case and spacing
    ['MARCH 4'],
    ['  2010-03-04  '],
  ])('%j', (text) => {
    expect(containsDateShapedString(text)).toBe(true);
  });
});

describe('containsDateShapedString: allows ordinary reasons', () => {
  it.each([
    ['Parent supplied a birth certificate showing a different year'],
    ['Mistyped the year at sign up; verified against the school letter'],
    ['Support ticket 12345: DOB entered in the wrong field'],
    ['Corrected following the guardian’s report of incorrect details'],
    ['Age gate mis-click, user is a year older than entered'],
    ['Verified by phone with the guardian on the registered number'],
    ['Reference TKT-2026-1187'],
    ['marching band account, ticket 4821'],
    ['Month of the incident unclear but year confirmed by parent'],
    ['born in 2010'], // a bare year is not date-shaped: documented limit
    ['The mark on the form was unclear'],
    [''],
  ])('%j', (text) => {
    expect(containsDateShapedString(text)).toBe(false);
  });
});
