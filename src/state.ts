export interface Question {
  id: number;
  /** Number printed on the paper (may differ from the position in the list). */
  n: number;
  q: string;
  o: string[];
  /** Index of the correct option, or -1 when not set. */
  a: number;
  /** For papers whose questions are pictures: the question and its options as images. */
  pics?: { ctx: string; img: string }[];
}

export const state = {
  QS: [] as Question[],
  /** Questions dropped by "keep only questions that have options". */
  dropped: 0,
  uid: 0,
};

export const nextId = () => ++state.uid;
