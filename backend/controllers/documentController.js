import Document from "../models/Document.js";
import Flashcard from "../models/Flashcard.js";
import Quiz from "../models/Quiz.js";
import { extractTextFromPdf } from "../utils/pdfParser.js";
import { chunkText } from "../utils/textChunker.js";
import fs from "fs/promises";
import mongoose from "mongoose";

// @desc    Upload a document
// @route   POST /api/documents/upload
// @access  Private
export const uploadDocument = async (req, res, next) => {
  const { title } = req.body;

  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    if (!title) {
      // Delete uploaded file if title is missing
      await fs.unlink(req.file.path).catch(() => {
        console.error(
          "Failed to delete file after validation error:",
          req.file.path,
        );
      });
      return res.status(400).json({ message: "Title is required" });
    }

    // Construct the URL for the uploaded file
    const baseUrl = `http://localhost:${process.env.PORT || 8000}`;
    const fileUrl = `${baseUrl}/uploads/documents/${req.file.filename}`;

    // Create a new document in the database
    const document = await Document.create({
      userId: req.user._id,
      title,
      fileName: req.file.originalname,
      filePath: fileUrl,
      fileSize: req.file.size,
      status: "processing",
    });

    // Process PDF in the background (in production, use a que like Bull or RabbitMQ)
    processPDF(document._id, req.file.path).catch((err) => {
      console.error("Error processing PDF:", err);
    });

    res.status(201).json({
      success: true,
      message: "Document uploaded successfully and is being processed",
      data: document,
    });
  } catch (error) {
    // If there's an error, delete the uploaded file to prevent orphaned files
    if (req.file) {
      await fs.unlink(req.file.path).catch(() => {
        console.error("Failed to delete file after error:", req.file.path);
      });
    }
    next(error);
    res.status(500).json({ message: "Server error" });
  }
};

// Background function to process the PDF and update the document status
const processPDF = async (documentId, filePath) => {
  try {
    // Extract text from the PDF
    const { text } = await extractTextFromPdf(filePath);

    // Chunk the extracted text
    const chunks = chunkText(text, 500, 50);

    // Update the document with extracted text and chunks
    await Document.findByIdAndUpdate(documentId, {
      extractedText: text,
      chunks: chunks,
      status: "ready",
    });

    console.log(`Document ${documentId} processed successfully`);
  } catch (error) {
    console.error(`Error processing document ${documentId}:`, error);
    // Update document status to 'error' if processing fails
    await Document.findByIdAndUpdate(documentId, { status: "failed" });
  }
};

// @desc    Get all documents for the authenticated user
// @route   GET /api/documents
// @access  Private
export const getDocuments = async (req, res, next) => {
  try {
    const documents = await Document.aggregate([
      {
        $match: { userId: new mongoose.Types.ObjectId(req.user._id) },
      },
      {
        $lookup: {
          from: "flashcards",
          localField: "_id",
          foreignField: "documentId",
          as: "flashcardSets",
        },
      },
      {
        $lookup: {
          from: "quizzes",
          localField: "_id",
          foreignField: "documentId",
          as: "quizzes",
        },
      },
      {
        $addFields: {
          flashcardCount: { $size: "$flashcardSets" },
          quizCount: { $size: "$quizzes" },
        },
      },
      {
        $project: {
          extractedText: 0,
          chunks: 0,
          flashcardSets: 0,
          quizzes: 0,
        },
      },
      {
        $sort: { uploadDate: -1 },
      },
    ]);

    res.status(200).json({
      success: true,
      count: documents.length,
      data: documents,
    });
  } catch (error) {
    next(error);
    res.status(500).json({ message: "Server error" });
  }
};

// @desc    Get a single document by ID
// @route   GET /api/documents/:id
// @access  Private
export const getDocument = async (req, res, next) => {
  try {
    const document = await Document.findOne({
      _id: req.params.id,
      userId: req.user._id,
    });

    if (!document) {
      return res.status(404).json({ message: "Document not found" });
    }

    // Get counts of associated flashcards and quizzes
    const flashcardCount = await Flashcard.countDocuments({
      documentId: document._id,
      userId: req.user._id,
    });
    const quizCount = await Quiz.countDocuments({
      documentId: document._id,
      userId: req.user._id,
    });

    // Update last accessed
    document.lastAccessed = Date.now();
    await document.save();

    // Combine document data with counts
    const documentData = document.toObject();
    documentData.flashcardCount = flashcardCount;
    documentData.quizCount = quizCount;

    res.status(200).json({ success: true, data: documentData });
  } catch (error) {
    next(error);
    res.status(500).json({ message: "Server error" });
  }
};

// @desc    Delete a document by ID
// @route   DELETE /api/documents/:id
// @access  Private
export const deleteDocument = async (req, res, next) => {
  try {
    const document = await Document.findOne({
      _id: req.params.id,
      userId: req.user._id,
    });

    if (!document) {
      return res.status(404).json({ message: "Document not found" });
    }

    // Delete the associated file from the server
    await fs.unlink(document.filePath).catch(() => {
      console.error("Failed to delete file:", document.filePath);
    });

    // Delete document
    await document.deleteOne();

    res.status(200).json({ message: "Document deleted successfully" });
  } catch (error) {
    next(error);
    res.status(500).json({ message: "Server error" });
  }
};
