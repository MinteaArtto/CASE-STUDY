const path = require("path");
const crypto = require("crypto");
const { spawn } = require("child_process");

// ============================================================
// PATHS
// ============================================================

const pythonPath = path.join(
  __dirname,
  "..",
  "..",
  "ml",
  ".venv",
  "Scripts",
  "python.exe",
);

const pipelineScript = path.join(
  __dirname,
  "..",
  "..",
  "ml",
  "analyze_spoilage_pipeline.py",
);

// ============================================================
// SETTINGS
// ============================================================

const STARTUP_TIMEOUT_MS = 180000;

const REQUEST_TIMEOUT_MS = 120000;

// ============================================================
// SERVICE STATE
// ============================================================

let pythonProcess = null;

let stdoutBuffer = "";

let readyPromise = null;

let readyResolve = null;

let readyReject = null;

let startupTimer = null;

const pendingRequests = new Map();

// ============================================================
// CLEAR READY STATE
// ============================================================

function clearReadyState() {
  if (startupTimer) {
    clearTimeout(startupTimer);

    startupTimer = null;
  }

  readyPromise = null;
  readyResolve = null;
  readyReject = null;
}

// ============================================================
// REJECT PENDING REQUESTS
// ============================================================

function rejectPendingRequests(error) {
  for (const [id, request] of pendingRequests) {
    clearTimeout(request.timer);

    request.reject(error);

    pendingRequests.delete(id);
  }
}

// ============================================================
// HANDLE PYTHON MESSAGE
// ============================================================

function handlePythonMessage(message) {
  // ----------------------------------------------------------
  // READY
  // ----------------------------------------------------------

  if (message?.type === "ready") {
    console.log("Spoilage ML service ready.");

    console.log("ML device:", message.device);

    if (startupTimer) {
      clearTimeout(startupTimer);

      startupTimer = null;
    }

    if (readyResolve) {
      readyResolve();
    }

    return;
  }

  // ----------------------------------------------------------
  // STARTUP ERROR
  // ----------------------------------------------------------

  if (message?.type === "startup_error") {
    const error = new Error(
      message.message || "Spoilage ML service failed to start.",
    );

    if (readyReject) {
      readyReject(error);
    }

    return;
  }

  // ----------------------------------------------------------
  // CLASSIFICATION RESULT
  // ----------------------------------------------------------

  if (!message?.id) {
    return;
  }

  const pending = pendingRequests.get(message.id);

  if (!pending) {
    return;
  }

  clearTimeout(pending.timer);

  pendingRequests.delete(message.id);

  pending.resolve(message.result);
}

// ============================================================
// PROCESS STDOUT
// ============================================================

function processStdoutChunk(chunk) {
  stdoutBuffer += chunk.toString();

  const lines = stdoutBuffer.split(/\r?\n/);

  stdoutBuffer = lines.pop() || "";

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) {
      continue;
    }

    try {
      const message = JSON.parse(trimmed);

      handlePythonMessage(message);
    } catch (error) {
      console.error("Could not parse spoilage ML service output:", trimmed);
    }
  }
}

// ============================================================
// START PYTHON SERVICE
// ============================================================

function startPythonService() {
  if (pythonProcess && !pythonProcess.killed && readyPromise) {
    return readyPromise;
  }

  console.log("Starting persistent spoilage ML service...");

  console.log("Python:", pythonPath);

  console.log("Pipeline:", pipelineScript);

  stdoutBuffer = "";

  readyPromise = new Promise((resolve, reject) => {
    readyResolve = resolve;

    readyReject = reject;
  });

  pythonProcess = spawn(pythonPath, [pipelineScript, "--server"], {
    stdio: ["pipe", "pipe", "pipe"],

    windowsHide: true,
  });

  // ----------------------------------------------------------
  // STARTUP TIMEOUT
  // ----------------------------------------------------------

  startupTimer = setTimeout(() => {
    const error = new Error("Spoilage ML service startup timed out.");

    if (readyReject) {
      readyReject(error);
    }

    stopPythonService();
  }, STARTUP_TIMEOUT_MS);

  // ----------------------------------------------------------
  // STDOUT
  // ----------------------------------------------------------

  pythonProcess.stdout.on("data", processStdoutChunk);

  // ----------------------------------------------------------
  // STDERR
  // ----------------------------------------------------------

  pythonProcess.stderr.on("data", (data) => {
    const message = data.toString().trim();

    if (message) {
      console.log(`[Spoilage ML] ${message}`);
    }
  });

  // ----------------------------------------------------------
  // START ERROR
  // ----------------------------------------------------------

  pythonProcess.on("error", (error) => {
    console.error("Spoilage ML service process error:", error);

    if (readyReject) {
      readyReject(error);
    }

    rejectPendingRequests(error);

    pythonProcess = null;

    clearReadyState();
  });

  // ----------------------------------------------------------
  // PROCESS CLOSED
  // ----------------------------------------------------------

  pythonProcess.on("close", (code) => {
    console.log(`Spoilage ML service exited with code ${code}.`);

    const error = new Error(
      `Spoilage ML service stopped unexpectedly with code ${code}.`,
    );

    if (readyReject) {
      readyReject(error);
    }

    rejectPendingRequests(error);

    pythonProcess = null;

    clearReadyState();
  });

  return readyPromise;
}

// ============================================================
// STOP PYTHON SERVICE
// ============================================================

function stopPythonService() {
  if (pythonProcess && !pythonProcess.killed) {
    try {
      pythonProcess.kill();
    } catch {
      // Ignore shutdown errors.
    }
  }

  pythonProcess = null;

  clearReadyState();
}

// ============================================================
// ANALYZE IMAGE
// ============================================================

async function analyzeSpoilageImage(imagePath) {
  await startPythonService();

  if (!pythonProcess || pythonProcess.killed) {
    throw new Error("Spoilage ML service is not running.");
  }

  const requestId = crypto.randomUUID();

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingRequests.delete(requestId);

      reject(new Error("Spoilage classification timed out."));
    }, REQUEST_TIMEOUT_MS);

    pendingRequests.set(requestId, {
      resolve,
      reject,
      timer,
    });

    const payload =
      JSON.stringify({
        id: requestId,

        image_path: imagePath,
      }) + "\n";

    pythonProcess.stdin.write(payload, (error) => {
      if (!error) {
        return;
      }

      clearTimeout(timer);

      pendingRequests.delete(requestId);

      reject(error);
    });
  });
}

// ============================================================
// WARM UP IMMEDIATELY WHEN BACKEND STARTS
// ============================================================

startPythonService()
  .then(() => {
    console.log("Spoilage classifier warm-up complete.");
  })
  .catch((error) => {
    console.error("Spoilage classifier warm-up failed:", error.message);
  });

// ============================================================
// CLEAN SHUTDOWN
// ============================================================

process.once("SIGINT", () => {
  stopPythonService();
});

process.once("SIGTERM", () => {
  stopPythonService();
});

// ============================================================
// EXPORT
// ============================================================

module.exports = {
  analyzeSpoilageImage,
  startPythonService,
  stopPythonService,
};
