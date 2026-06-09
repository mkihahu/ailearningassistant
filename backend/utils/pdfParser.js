import fs from "fs/promises";
import { PDFParse } from "pdf-parse";

/**
 * Extract text content from a PDF file
 * @param {string} filePath - The path to the PDF file
 * @returns {Promise<{text: string, numPages: number, info: object, metadata: object}>} - The extracted text content
 */
export const extractTextFromPdf = async (filePath) => {
  try {
    const dataBuffer = await fs.readFile(filePath);
    // pdf-parse expects a Uint8Array, so we convert the Buffer to Uint8Array
    const parser = new PDFParse(new Uint8Array(dataBuffer));
    const data = await parser.getText();
    return {
      text: data.text,
      numPages: data.numpages,
      info: data.info,
      metadata: data.metadata,
    };
  } catch (error) {
    console.error("Error extracting text from PDF:", error);
    throw new Error("Failed to extract text from PDF");
  }
};
