import { describe, expect, it } from "vitest";
import { cleanPaper, reflow, splitOptions } from "../src/parse/clean";
import { applyKey, parseKey } from "../src/parse/key";
import { buildText, colKind, joinItems, pageToLines, type Item } from "../src/pdf/layout";

const paper = `1. What is the capital of France?
(1) Berlin (2) Paris (3) Madrid (4) Rome
2. Which planet is the Red Planet?
(1) Venus
(2) Mars
(3) Jupiter
(4) Saturn
3. Water boils at
A) 50 C
B) 100 C
C) 150 C
D) 200 C`;

describe("cleanPaper", () => {
  const qs = cleanPaper(paper, false);

  it("splits numbered questions", () => {
    expect(qs.map((q) => q.n)).toEqual([1, 2, 3]);
  });
  it("splits inline (1) (2) options", () => {
    expect(qs[0].q).toBe("What is the capital of France?");
    expect(qs[0].o).toEqual(["Berlin", "Paris", "Madrid", "Rome"]);
  });
  it("splits options on their own lines", () => {
    expect(qs[1].o).toEqual(["Venus", "Mars", "Jupiter", "Saturn"]);
  });
  it("splits A) B) C) D) options", () => {
    expect(qs[2].o).toEqual(["50 C", "100 C", "150 C", "200 C"]);
  });
  it("accepts 'Question number N' labels", () => {
    const r = cleanPaper("Question number 1\nPick one\n(1) a (2) b\nQuestion number 2\nAgain\n(1) c (2) d", false);
    expect(r.map((q) => q.n)).toEqual([1, 2]);
  });
  it("strips Hindi text when asked", () => {
    const r = cleanPaper("1. भारत की राजधानी What is the capital?\n(1) Delhi (2) Pune", true);
    expect(r[0].q).toBe("What is the capital?");
  });
});

describe("splitOptions / reflow", () => {
  it("returns no options when none are present", () => {
    expect(splitOptions("Just a heading")).toEqual({ q: "Just a heading", o: [] });
  });
  it("re-joins wrapped lines and hyphenated words", () => {
    expect(reflow("The quick brown\nfox jumps over the lazy-\ndog")).toBe("The quick brown fox jumps over the lazydog");
  });
  it("keeps list items on their own lines", () => {
    expect(reflow("Statement I: a\nStatement II: b")).toBe("Statement I: a\nStatement II: b");
  });
});

describe("answer key", () => {
  it("understands several formats", () => {
    expect(parseKey("1. B  2-(3)  3 C  4: 1")).toEqual({ 1: 1, 2: 2, 3: 2, 4: 0 });
  });
  it("applies only to matching questions", () => {
    const qs = cleanPaper(paper, false);
    expect(applyKey(qs, parseKey("1. B\n2. C\n9. A"))).toBe(2);
    expect(qs.map((q) => q.a)).toEqual([1, 2, -1]);
  });
});

describe("pdf layout", () => {
  const item = (s: string, x: number, y = 100, w = s.length * 5): Item => ({ s, x, y, w, h: 10 });

  it("marks wide gaps as table columns", () => {
    expect(joinItems([item("LIST-I", 0), item("LIST-II", 200)], 10)).toBe("LIST-I | LIST-II");
  });
  it("detects label sequences", () => {
    expect(colKind(["A", "B", "C"])).toBe("letters");
    expect(colKind(["I", "II", "III"])).toBe("roman");
    expect(colKind(["1", "2"])).toBe("digits");
    expect(colKind(["A", "C"])).toBe("");
  });
  it("orders text top to bottom", () => {
    expect(pageToLines([item("second", 0, 80), item("first", 0, 120)])).toEqual(["first", "second"]);
  });
  it("removes repeated headers and page numbers", () => {
    const page = (n: number) => ["Exam Paper 2024", `${n}. Question text`, "(1) a (2) b", `Page ${n}`];
    const text = buildText([page(1), page(2), page(3)], true);
    expect(text).not.toMatch(/Exam Paper/);
    expect(text).not.toMatch(/Page \d/);
    expect(text).toMatch(/2\. Question text/);
  });
  it("keeps everything when stripping is off", () => {
    expect(buildText([["Header", "x"], ["Header", "y"]], false)).toContain("Header");
  });
});
