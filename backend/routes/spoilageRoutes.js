const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");
const runMlTask = require("../mlQueue");

const router = express.Router();
const uploadDir = path.join(__dirname, "..", "uploads");
const PROJECT_ROOT = path.join(__dirname, "..", "..");
const PYTHON_PATH =
  process.env.PYTHON ||
  (process.platform === "win32"
    ? path.join(PROJECT_ROOT, "ml", ".venv", "Scripts", "python.exe")
    : path.join(PROJECT_ROOT, "ml", ".venv", "bin", "python"));

fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, callback) => callback(null, uploadDir),
  filename: (_req, file, callback) => {
    callback(null, `${Date.now()}-${file.originalname}`);
  },
});

const upload = multer({ storage });

function parsePipelineOutput(output) {
  const lines = output.trim().split(/\r?\n/).filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try {
      return JSON.parse(lines[index]);
    } catch {
      continue;
    }
  }
  throw new Error("The ML pipeline did not return valid JSON.");
}

function runPipeline(imagePath) {
  const scriptPath = path.join(
    __dirname,
    "..",
    "..",
    "ml",
    process.env.ML_PROFILE === "starter"
      ? "analyze_produce_starter.py"
      : "analyze_produce_pipeline.py",
  );

  return runMlTask(
    () =>
      new Promise((resolve, reject) => {
        const process = spawn(PYTHON_PATH, [scriptPath, imagePath], {
          windowsHide: true,
        });
        let stdout = "";
        let stderr = "";
        let settled = false;

        process.stdout.on("data", (chunk) => {
          stdout += chunk.toString();
        });
        process.stderr.on("data", (chunk) => {
          stderr += chunk.toString();
        });
        process.once("error", (error) => {
          settled = true;
          reject(new Error(`Could not start the ML pipeline: ${error.message}`));
        });
        process.once("close", (code) => {
          if (settled) return;
          settled = true;

          let result;
          try {
            result = parsePipelineOutput(stdout);
          } catch (error) {
            reject(new Error(stderr.trim() || error.message));
            return;
          }

          if (code !== 0 || result.success !== true) {
            reject(
              new Error(result.message || stderr.trim() || "ML analysis failed."),
            );
            return;
          }

          resolve(result);
        });
      }),
  );
}

router.post("/analyze", upload.single("image"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      success: false,
      message: "No image was uploaded.",
    });
  }

  try {
    const result = await runPipeline(req.file.path);
    return res.json(result);
  } catch (error) {
    console.error("Produce analysis failed:", error.message);
    return res.status(500).json({
      success: false,
      message: error.message || "Image analysis failed.",
    });
  } finally {
    fs.promises.unlink(req.file.path).catch((error) => {
      if (error.code !== "ENOENT") {
        console.error("Could not delete temporary image:", error.message);
      }
    });
  }
});

module.exports = router;
