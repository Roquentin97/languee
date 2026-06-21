package com.example.langueedroid.domain

import com.example.langueedroid.core.domain.EntryValidator
import com.example.langueedroid.core.domain.Token
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class EntryValidatorTest {

    // -------------------------------------------------------------------------
    // isStandaloneMatch / findStandaloneMatches
    // -------------------------------------------------------------------------

    @Test
    fun `isStandaloneMatch returns true when word is standalone`() {
        assertTrue(EntryValidator.isStandaloneMatch("cat", "I have a cat here"))
    }

    @Test
    fun `isStandaloneMatch returns false when word only appears as substring`() {
        assertFalse(EntryValidator.isStandaloneMatch("cat", "concatenate"))
    }

    @Test
    fun `isStandaloneMatch is case-insensitive`() {
        assertTrue(EntryValidator.isStandaloneMatch("Cat", "A CAT sat on a mat"))
    }

    @Test
    fun `isStandaloneMatch returns true when word is at start of string`() {
        assertTrue(EntryValidator.isStandaloneMatch("hello", "hello world"))
    }

    @Test
    fun `isStandaloneMatch returns true when word is at end of string`() {
        assertTrue(EntryValidator.isStandaloneMatch("world", "hello world"))
    }

    @Test
    fun `isStandaloneMatch returns false when word is empty`() {
        assertFalse(EntryValidator.isStandaloneMatch("", "hello world"))
    }

    @Test
    fun `isStandaloneMatch returns false when word is blank`() {
        assertFalse(EntryValidator.isStandaloneMatch("  ", "hello world"))
    }

    @Test
    fun `findStandaloneMatches returns all occurrences`() {
        val matches = EntryValidator.findStandaloneMatches("cat", "a cat and another cat here")
        assertEquals(2, matches.size)
    }

    @Test
    fun `findStandaloneMatches returns empty list when no standalone match`() {
        val matches = EntryValidator.findStandaloneMatches("cat", "concatenate")
        assertTrue(matches.isEmpty())
    }

    @Test
    fun `findStandaloneMatches ranges point into original string`() {
        val context = "A Cat sat"
        val matches = EntryValidator.findStandaloneMatches("cat", context)
        assertEquals(1, matches.size)
        // Range points to "Cat" in the original (case preserved)
        assertEquals("Cat", context.substring(matches[0].first, matches[0].last + 1))
    }

    @Test
    fun `isStandaloneMatch handles word adjacent to non-letter punctuation`() {
        assertTrue(EntryValidator.isStandaloneMatch("run", "He will run, quickly"))
    }

    @Test
    fun `isStandaloneMatch does not match partial substring in word`() {
        assertFalse(EntryValidator.isStandaloneMatch("run", "He runs fast"))
    }

    // -------------------------------------------------------------------------
    // isContextValid
    // -------------------------------------------------------------------------

    @Test
    fun `isContextValid returns true when word is present standalone`() {
        assertTrue(EntryValidator.isContextValid("learn", "I want to learn French"))
    }

    @Test
    fun `isContextValid returns false when word is absent`() {
        assertFalse(EntryValidator.isContextValid("learn", "I want to study French"))
    }

    // -------------------------------------------------------------------------
    // countSentences
    // -------------------------------------------------------------------------

    @Test
    fun `countSentences returns 1 for a single sentence`() {
        assertEquals(1, EntryValidator.countSentences("Hello world"))
    }

    @Test
    fun `countSentences returns 2 for two period-delimited sentences`() {
        assertEquals(2, EntryValidator.countSentences("Hello world. How are you"))
    }

    @Test
    fun `countSentences counts exclamation marks as delimiters`() {
        assertEquals(2, EntryValidator.countSentences("Stop! Think again"))
    }

    @Test
    fun `countSentences counts question marks as delimiters`() {
        assertEquals(2, EntryValidator.countSentences("Are you sure? Yes"))
    }

    @Test
    fun `countSentences ignores trailing punctuation with empty segment`() {
        assertEquals(1, EntryValidator.countSentences("Hello world."))
    }

    @Test
    fun `countSentences returns 0 for empty text`() {
        assertEquals(0, EntryValidator.countSentences(""))
    }

    // -------------------------------------------------------------------------
    // extractSentenceContaining
    // -------------------------------------------------------------------------

    @Test
    fun `extractSentenceContaining returns sentence with word`() {
        val result = EntryValidator.extractSentenceContaining(
            "cat",
            "I have a dog. I also have a cat. The cat is friendly.",
        )
        assertEquals("I also have a cat.", result)
    }

    @Test
    fun `extractSentenceContaining returns null when word is absent`() {
        val result = EntryValidator.extractSentenceContaining(
            "bird",
            "I have a dog. I also have a cat.",
        )
        assertNull(result)
    }

    @Test
    fun `extractSentenceContaining matches case-insensitively`() {
        val result = EntryValidator.extractSentenceContaining(
            "cat",
            "First sentence. I have a CAT here. Last sentence.",
        )
        assertEquals("I have a CAT here.", result)
    }

    // -------------------------------------------------------------------------
    // isLikelySingleWord
    // -------------------------------------------------------------------------

    @Test
    fun `isLikelySingleWord returns true for a single word`() {
        assertTrue(EntryValidator.isLikelySingleWord("hello"))
    }

    @Test
    fun `isLikelySingleWord returns false for multiple words`() {
        assertFalse(EntryValidator.isLikelySingleWord("hello world"))
    }

    @Test
    fun `isLikelySingleWord ignores leading and trailing spaces`() {
        assertTrue(EntryValidator.isLikelySingleWord("  hello  "))
    }

    @Test
    fun `isLikelySingleWord returns true for word with punctuation (no space)`() {
        assertTrue(EntryValidator.isLikelySingleWord("hello,"))
    }

    // -------------------------------------------------------------------------
    // splitIntoTokens
    // -------------------------------------------------------------------------

    @Test
    fun `splitIntoTokens splits simple sentence into words and separators`() {
        val tokens = EntryValidator.splitIntoTokens("Hello world")
        assertEquals(3, tokens.size)
        assertTrue(tokens[0] is Token.Word)
        assertEquals("Hello", (tokens[0] as Token.Word).text)
        assertTrue(tokens[1] is Token.Separator)
        assertEquals(" ", (tokens[1] as Token.Separator).text)
        assertTrue(tokens[2] is Token.Word)
        assertEquals("world", (tokens[2] as Token.Word).text)
    }

    @Test
    fun `splitIntoTokens returns empty list for empty input`() {
        val tokens = EntryValidator.splitIntoTokens("")
        assertTrue(tokens.isEmpty())
    }

    @Test
    fun `splitIntoTokens handles punctuation between words`() {
        val tokens = EntryValidator.splitIntoTokens("cat, dog")
        assertTrue(tokens[0] is Token.Word)
        assertTrue(tokens[1] is Token.Separator)
        assertTrue(tokens[2] is Token.Word)
    }

    @Test
    fun `splitIntoTokens leading separator is Token Separator`() {
        val tokens = EntryValidator.splitIntoTokens(", hello")
        assertTrue(tokens[0] is Token.Separator)
        assertTrue(tokens[1] is Token.Word)
    }

    @Test
    fun `splitIntoTokens only separators for punctuation-only string`() {
        val tokens = EntryValidator.splitIntoTokens("... ")
        assertEquals(1, tokens.size)
        assertTrue(tokens[0] is Token.Separator)
    }
}
