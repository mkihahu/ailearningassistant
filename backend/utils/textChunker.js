/**
 * Split text into chunks for better AI processing
 * @param {string} text - The input text to be chunked
 * @param {number} chunkSize - The maximum size of each chunk (default: 500 characters)
 * @param {number} overlap - The number of characters to overlap between chunks (default: 50 characters)
 * @returns {Array<content: string, chunkIndex: number, pageNumber: number>} - An array of chunk objects with content and index
 */

export const chunkText = (text, chunkSize = 500, overlap = 50) => {
  if (!text || text.trim().length === 0) {
    return [];
  }

  // Clean text while preserving paragraph structure
  const cleanedText = text
    .replace(/\r\n/g, "\n") // Normalize newlines
    .replace(/\s+/g, " ") // Replace multiple spaces with a single space
    .replace(/\n /g, "\n") // Remove spaces at the end of lines
    .replace(/ \n/g, "\n") // Remove spaces at the beginning of lines
    .trim();

  // Split text into paragraphs (single or double new lines)
  const paragraphs = cleanedText
    .split(/\n+/)
    .filter((p) => p.trim().length > 0);

  const chunks = [];
  let currentChunk = [];
  let currentWordCount = 0;
  let chunkIndex = 0;

  for (const paragraph of paragraphs) {
    const paragraphWords = paragraph.trim().split(/\s+/);
    const paragraphWordCount = paragraphWords.length;

    // If single paragraph exceeds chunk size, split it by words
    if (paragraphWordCount > chunkSize) {
      if (currentChunk.length > 0) {
        chunks.push({
          content: currentChunk.join("\n\n"),
          chunkIndex: chunkIndex++,
          pageNumber: 0, // Page number can be set to 0 for split paragraphs
        });
        currentChunk = [];
        currentWordCount = 0;
      }

      // Split long paragraph into word-based chunks
      for (let i = 0; i < paragraphWords.length; i += chunkSize - overlap) {
        const chunkWords = paragraphWords.slice(i, i + chunkSize);
        chunks.push({
          content: chunkWords.join(" "),
          chunkIndex: chunkIndex++,
          pageNumber: 0,
        });
        if (i + chunkSize < paragraphWords.length) break; // Stop if we've reached the end of the paragraph
      }
      continue;
    }

    // If adding the paragraph exceeds chunk size, save current chunk
    if (
      currentWordCount + paragraphWordCount > chunkSize &&
      currentChunk.length > 0
    ) {
      chunks.push({
        content: currentChunk.join("\n\n"),
        chunkIndex: chunkIndex++,
        pageNumber: 0,
      });

      // Create overlap from previous chunk
      const prevChunkText = currentChunk.join(" ");
      const pevWords = prevChunkText.split(/\s+/);
      const overlapText = prevWords
        .slice(-Math.min(overlap, pevWords.length))
        .join(" ");

      currentChunk = [overlapText, paragraph].trim();
      currentWordCount = overlapText.split(/\s+/).length + paragraphWordCount;
    } else {
      currentChunk.push(paragraph.trim());
      currentWordCount += paragraphWordCount;
    }
  }
  // Push any remaining content as the last chunk
  if (currentChunk.length > 0) {
    chunks.push({
      content: currentChunk.join("\n\n"),
      chunkIndex: chunkIndex++,
      pageNumber: 0,
    });
  }

  // Fallback if no chunks created, split by words
  if (chunks.length === 0 && cleanedText.length > 0) {
    const allWords = cleanedText.split(/\s+/);
    for (let i = 0; i < allWords.length; i += chunkSize - overlap) {
      const chunkWords = allWords.slice(i, i + chunkSize);
      chunks.push({
        content: chunkWords.join(" "),
        chunkIndex: chunkIndex++,
        pageNumber: 0,
      });
      if (i + chunkSize <= allWords.length) break; // Stop if we've reached the end of the text
    }
  }
  return chunks;
};

/**
 * Find relevant chunks based on keyword matching
 * @param {Array<{Object}>} chunks - The array of chunk objects
 * @param {string} query - The search query to match against chunk content
 * @param {number} maxChunks - The maximum number of relevant chunks to return (default: 5)
 * @returns {Array<{Object}>} - An array of relevant chunks sorted by relevance
 */
export const findRelevantChunks = (chunks, query, maxChunks = 3) => {
  if (!chunks || chunks.length === 0 || !query) {
    return [];
  }

  // Common stop words to exclude from relevance scoring
  const stopWords = new Set([
    "the",
    "is",
    "in",
    "and",
    "to",
    "of",
    "a",
    "that",
    "it",
    "with",
    "as",
    "for",
    "was",
    "on",
    "are",
    "by",
    "this",
    "be",
    "or",
    "from",
    "at",
    "which",
  ]);

  // Extract and clean query words
  const queryWords = query
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stopWords.has(w));

  if (queryWords.length === 0) {
    // Return clean chunk objects without mongoose metadata
    return chunks.slice(0, maxChunks).map((chunk) => ({
      content: chunk.content,
      chunkIndex: chunk.chunkIndex,
      pageNumber: chunk.pageNumber,
      _id: chunk._id, // Include _id if needed for reference
    }));
  }

  const scoredChunks = chunks.map((chunk, index) => {
    const content = chunk.content.toLowerCase();
    const contentWords = content.split(/\s+/).length;
    let score = 0;

    // Score each query word
    for (const word of queryWords) {
      // Exact word match (higher score)
      const exactMatches = (
        content.match(new RegExp(`\\b${word}\\b`, "g")) || []
      ).length;
      score += exactMatches * 3; // Exact matches are weighted more

      // Partial word match (lower score)
      const partialMatches = (content.match(new RegExp(word, "g")) || [])
        .length;
      score += Math.max(0, partialMatches - exactMatches) * 1.5; // Partial matches are weighted less
    }

    // Bonus: Multiple query words in the same chunk increases relevance
    const uniqueWordsFound = queryWords.filter((w) =>
      content.includes(w),
    ).length;
    if (uniqueWordsFound > 1) {
      score += uniqueWordsFound * 2; // Bonus for multiple query words
    }

    // Normalize score by content length to avoid bias towards longer chunks
    const normalizeScore = score / Math.sqrt(contentWords);

    // Small random tie-breaker to ensure consistent ordering of equally scored chunks
    const positionBonus = 1 - (index / chunks.length) * 0.1; // Earlier chunks get a slight boost

    // Return clean object without Mongoose metadata
    return {
      content: chunk.content,
      chunkIndex: chunk.chunkIndex,
      pageNumber: chunk.pageNumber,
      score: normalizeScore * positionBonus,
      rawScore: score,
      matchedWords: uniqueWordsFound,
      _id: chunk._id, // Include _id if needed for reference
    };
  });

  return (
    scoredChunks
      .filter((c) => c.score > 0) // Only include chunks with a positive score
      .sort((a, b) => {
        if (b.score !== a.score) {
          return b.score - a.score;
        }
        if (b.matchedWords !== a.matchedWords) {
          return b.matchedWords - a.matchedWords;
        }
        return a.chunkIndex - b.chunkIndex; // Tie-breaker: earlier chunks first
      })
      // Sort by relevance score
      .slice(0, maxChunks)
  ); // Return top relevant chunks
};
