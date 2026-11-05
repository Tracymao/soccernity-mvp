import { describe, it, expect } from "vitest";
import { initialsFor } from "./initials";

// The shared initials rule (B-230). The first block is the behaviour the
// NavDrawer's old local copy already had (its only coverage was the one
// Header.test.tsx case, "Adeniyi Christiana" -> "AC"); the rest pins the rule
// the Figma "Avatar - Initials" frame draws (6962:45997).
describe("initialsFor", () => {
  describe("the rule NavDrawer already used", () => {
    it("two words: first letter of each, upper-cased", () => {
      expect(initialsFor("Adeniyi Christiana")).toBe("AC");
      expect(initialsFor("adeniyi christiana")).toBe("AC");
    });

    it("one word: its first letter", () => {
      expect(initialsFor("Adeniyi")).toBe("A");
      expect(initialsFor("adeniyi")).toBe("A");
    });

    it("three or more words: first letter of the first and of the LAST word, middle names ignored", () => {
      expect(initialsFor("Adeniyi Olu Christiana")).toBe("AC");
      expect(initialsFor("Maria da Silva dos Santos Oliveira")).toBe("MO");
    });

    it("trims and collapses any whitespace between words", () => {
      expect(initialsFor("  Adeniyi \t  Christiana\n")).toBe("AC");
    });

    it("no word at all gives ?", () => {
      expect(initialsFor("")).toBe("?");
      expect(initialsFor("   ")).toBe("?");
      expect(initialsFor("\n\t")).toBe("?");
    });
  });

  it("never returns more than two characters, however long the name", () => {
    const long = Array.from({ length: 40 }, (_, i) => `Name${i}`).join(" ");
    expect(Array.from(initialsFor(long)).length).toBeLessThanOrEqual(2);
    expect(initialsFor(long)).toBe("NN");
    expect(Array.from(initialsFor("Supercalifragilisticexpialidocious")).length).toBe(1);
  });

  describe("non-Latin names", () => {
    it("Cyrillic, Greek and Arabic (upper-cased where the script has case)", () => {
      expect(initialsFor("иван петров")).toBe("ИП");
      expect(initialsFor("Αλέξανδρος Παπαδόπουλος")).toBe("ΑΠ");
      expect(initialsFor("محمد علي")).toBe("مع");
    });

    it("CJK: the first character of each word", () => {
      expect(initialsFor("李 小龙")).toBe("李小");
      expect(initialsFor("山田 太郎")).toBe("山太");
      expect(initialsFor("李小龙")).toBe("李");
    });

    it("accented Latin keeps the accent", () => {
      expect(initialsFor("émile zola")).toBe("ÉZ");
    });

    it("a letter whose upper case is longer still gives one character (the two-character cap holds)", () => {
      expect(initialsFor("ß")).toBe("S");
      expect(initialsFor("ßa müller")).toBe("SM");
    });
  });

  describe("a word that starts outside the Basic Multilingual Plane", () => {
    // The old local copy took parts[0][0], the first UTF-16 unit: for these it
    // returned half of a surrogate pair, which renders as a broken box.
    it("takes the whole code point, not half of it", () => {
      expect(initialsFor("𠮷野 家")).toBe("𠮷家");
      expect(initialsFor("⚽ Fan")).toBe("⚽F");
      expect(initialsFor("🙂 Fan")).toBe("🙂F");
      expect(initialsFor("Fan 🙂")).toBe("F🙂");
      expect(initialsFor("🙂")).toBe("🙂");
    });

    it("never produces a lone surrogate", () => {
      for (const name of ["𠮷野 家", "🙂 Fan", "Fan 🙂", "🙂", "𝒜lice 𝒵ed"]) {
        const out = initialsFor(name);
        // encodeURIComponent throws URIError on a lone surrogate.
        expect(() => encodeURIComponent(out)).not.toThrow();
        expect(Array.from(out).length).toBeLessThanOrEqual(2);
      }
    });
  });
});
