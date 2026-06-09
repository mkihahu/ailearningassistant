import express from "express";
import {
  getQuizzes,
  getQuizById,
  submitQuiz,
  getQuizResults,
  deleteQuiz,
} from "../controllers/quizController.js";
import protect from "../middleware/auth.js";

const router = express.Router();

// Protect all routes
router.use(protect);

router.get("/:documentId", getQuizzes);
router.get("/quiz/:id", getQuizById);
router.post("/:id/submit", submitQuiz);
router.get("/:id/results", getQuizResults);
router.delete("/i:d", deleteQuiz);

export default router;
