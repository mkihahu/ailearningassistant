import express from "express";
import {
  uploadDocument,
  getDocuments,
  getDocument,
  deleteDocument,
} from "../controllers/documentController.js";
import protect from "../middleware/auth.js";
import { uploadDocument as upload } from "../config/multer.js";

const router = express.Router();

router.use(protect); // Protect all routes

router.post("/upload", upload.single("file"), uploadDocument);
router.get("/", getDocuments);
router.get("/:id", getDocument);
router.delete("/:id", deleteDocument);

export default router;
