export default function analyze(text: string): {
    token: string
    position: number
}[] {

    if (text.trim().length === 0) {
        return []
    }

    const tokens = tokenize(text)
    const filteredTokens = filterStopwords(tokens)
    return filteredTokens
}

export function tokenize(text: string): {
    token: string
    position: number
}[] {
    const words = text.split(/\W+/)
    const tokens = words.map((word, index) => ({ token: word.toLowerCase().trim(), position: index }))
    return tokens
}

export function filterStopwords(tokens: { token: string; position: number }[]): { token: string; position: number }[] {
    return tokens.filter(({ token }) => !stopwords.includes(token.toLowerCase()) && token.trim().length > 0)
}

// Begin Stemmer logic

export class Stemmer {
    stem(word: string): string {
        if (word.length < 3) {
            return word.toLowerCase()
        }
        word = word.toLowerCase()

        word = this.step1a(word)
        word = this.step1b(word)
        word = this.step1c(word)
        word = this.step2(word)
        word = this.step3(word)
        word = this.step4(word)
        word = this.step5(word)

        return word
    }

    private isConsonant(word: string, index: number): boolean {
        const char = word[index]

        switch (char) {
            case "a":
            case "e":
            case "i":
            case "o":
            case "u":
                return false
            case "y":
                return index === 0 ? true : !this.isConsonant(word, index - 1)
            default:
                return true
        }
    }

    private measure(word: string): number { // Measure number of VC sequences in the word
        let m = 0
        let i = 0
        const length = word.length

        // Skip initial consonants
        while (i < length && this.isConsonant(word, i)) {
            i++
        }

        while (i < length) {
            // Skip vowel sequences (VV)
            while (i < length && !this.isConsonant(word, i)) {
                i++
            }

            // End at the end of the word
            if (i >= length) {
                break
            }

            // We now have a consonant following a vowel, so we have a VC sequence
            m++

            // Skip consonant sequences (CC)
            while (i < length && this.isConsonant(word, i)) {
                i++
            }
        }

        return m
    }

    private containsVowel(word: string): boolean {
        for (let i = 0; i < word.length; i++) {
            if (!this.isConsonant(word, i)) {
                return true
            }
        }
        return false
    }

    private endsWithDoubleConsonant(word: string): boolean {
        if (word.length < 2) {
            return false
        }
        const lastChar = word[word.length - 1]
        const secondLastChar = word[word.length - 2]
        return lastChar === secondLastChar && this.isConsonant(word, word.length - 1)
    }

    private cvc(word: string): boolean {
        if (word.length < 3) {
            return false
        }
        const last = word.length - 1
        return this.isConsonant(word, last) && !this.isConsonant(word, last - 1) && this.isConsonant(word, last - 2) && !["w", "x", "y"].includes(word[last])
    }

    // Stemming steps

    private step1a(word: string): string {
        if (word.endsWith("sses")) {
            return word.slice(0, -2)
        } else if (word.endsWith("ies")) {
            return word.slice(0, -2)
        } else if (word.endsWith("ss")) {
            return word
        } else if (word.endsWith("s")) {
            return word.slice(0, -1)
        }
        return word
    }

    private step1b(word: string): string {
        if (word.endsWith("eed")) {
            const stem = word.slice(0, -3)
            if (this.measure(stem) > 0) {
                return stem + "ee"
            }
        } else if ((word.endsWith("ed") && this.containsVowel(word.slice(0, -2))) || (word.endsWith("ing") && this.containsVowel(word.slice(0, -3)))) {
            let stem = word.endsWith("ed") ? word.slice(0, -2) : word.slice(0, -3)
            if (stem.endsWith("at") || stem.endsWith("bl") || stem.endsWith("iz")) {
                return stem + "e"
            }
            if (this.endsWithDoubleConsonant(stem) && !["l", "s", "z"].includes(stem[stem.length - 1])) {
                return stem.slice(0, -1)
            }
            if (this.measure(stem) === 1 && this.cvc(stem)) {
                return stem + "e"
            }
            return stem
        }
        return word
    }

    private step1c(word: string): string {
        if (word.endsWith("y") && this.containsVowel(word.slice(0, -1))) {
            return word.slice(0, -1) + "i"
        }

        return word
    }

    private step2(word: string): string {
        return this.applyRules(word, STEP2)
    }

    private step3(word: string): string {
        return this.applyRules(word, STEP3)
    }

    private step4(word: string): string {
        for (const suffix of STEP4) {
            if (!word.endsWith(suffix)) {
                continue
            }

            const stem = word.slice(0, -suffix.length)

            if (this.measure(stem) <= 1) {
                continue
            }
            if (
                suffix === "ion" &&
                !stem.endsWith("s") && 
                !stem.endsWith("t")
            ) {
                continue
            }
            return stem
        }

        return word
    }


    private step5(word: string): string {
        // Step 5a
        if (word.endsWith("e")) {
            const stem = word.slice(0, -1)
            if (this.measure(stem) > 1 || (this.measure(stem) === 1 && !this.cvc(stem))) {
                return stem
            }
        }

        // Step 5b
        if (this.measure(word) > 1 && this.endsWithDoubleConsonant(word) && word.endsWith("l")) {
            return word.slice(0, -1)
        }

        return word
    }

    private applyRules(word: string, rules: { [key: string]: string }): string {
        for (const suffix in rules) {
            if (word.endsWith(suffix)) {
                const stem = word.slice(0, -suffix.length)
                if (this.measure(stem) > 0) {
                    return stem + rules[suffix]
                }
            }
        }
        return word
    }
}

const stopwords = [
    "i",
    "me",
    "my",
    "myself",
    "we",
    "our",
    "ours",
    "ourselves",
    "you",
    "your",
    "yours",
    "yourself",
    "yourselves",
    "he",
    "him",
    "his",
    "himself",
    "she",
    "her",
    "hers",
    "herself",
    "it",
    "its",
    "itself",
    "they",
    "them",
    "their",
    "theirs",
    "themselves",
    "what",
    "which",
    "who",
    "whom",
    "this",
    "that",
    "these",
    "those",
    "am",
    "is",
    "are",
    "was",
    "were",
    "be",
    "been",
    "being",
    "have",
    "has",
    "had",
    "having",
    "do",
    "does",
    "did",
    "doing",
    "a",
    "an",
    "the",
    "and",
    "but",
    "if",
    "or",
    "because",
    "as",
    "until",
    "while",
    "of",
    "at",
    "by",
    "for",
    "with",
    "about",
    "against",
    "between",
    "into",
    "through",
    "during",
    "before",
    "after",
    "above",
    "below",
    "to",
    "from",
    "up",
    "down",
    "in",
    "out",
    "on",
    "off",
    "over",
    "under",
    "again",
    "further",
    "then",
    "once",
    "here",
    "there",
    "when",
    "where",
    "why",
    "how",
    "all",
    "any",
    "both",
    "each",
    "few",
    "more",
    "most",
    "other",
    "some",
    "such",
    "no",
    "nor",
    "not",
    "only",
    "own",
    "same",
    "so",
    "than",
    "too",
    "very",
    "s",
    "t",
    "can",
    "will",
    "just",
    "don",
    "should",
    "now"
]

const STEP2: { [key: string]: string } = {
    "ational": "ate",
    "tional": "tion",
    "enci": "ence",
    "anci": "ance",
    "izer": "ize",
    "abli": "able",
    "alli": "al",
    "entli": "ent",
    "eli": "e",
    "ousli": "ous",
    "ization": "ize",
    "ation": "ate",
    "ator": "ate",
    "alism": "al",
    "iveness": "ive",
    "fulness": "ful",
    "ousness": "ous",
    "aliti": "al",
    "iviti": "ive",
    "biliti": "ble",
}

const STEP3: { [key: string]: string } = {
    "icate": "ic",
    "ative": "",
    "alize": "al",
    "iciti": "ic",
    "ical": "ic",
    "ful": "",
    "ness": "",
}

const STEP4 = [
    "al",
    "ance",
    "ence",
    "er",
    "ic",
    "able",
    "ible",
    "ant",
    "ement",
    "ment",
    "ent",
    "ion",
    "ou",
    "ism",
    "ate",
    "iti",
    "ous",
    "ive",
    "ize",
]