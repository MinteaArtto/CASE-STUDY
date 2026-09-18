const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const rateLimit = require("express-rate-limit");
const crypto = require("crypto");
const nodemailer = require("nodemailer");

const User = require("../models/User");
const requireAuth = require("../middleware/authMiddleware");

const router = express.Router();

// ============================================================
// RATE LIMITERS
// ============================================================

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,

  message: {
    success: false,
    message: "Too many login attempts. Please try again later.",
  },
});

const registerLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,

  message: {
    success: false,
    message: "Too many registration attempts. Please try again later.",
  },
});

const forgotPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,

  message: {
    success: false,
    message: "Too many password reset requests. Please try again later.",
  },
});

const resetPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,

  message: {
    success: false,
    message: "Too many password reset attempts. Please try again later.",
  },
});

const changePasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,

  message: {
    success: false,
    message: "Too many password change attempts. Please try again later.",
  },
});

// ============================================================
// VALIDATION
// ============================================================

const usernameRegex = /^[A-Za-z0-9_.]{2,30}$/;

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const passwordRegex =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,20}$/;

// ============================================================
// HELPERS
// ============================================================

function normalizeEmail(email) {
  return String(email || "")
    .trim()
    .toLowerCase();
}

function publicUser(user) {
  return {
    id: user._id,
    username: user.username,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

function createToken(user) {
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is missing from .env");
  }

  return jwt.sign(
    {
      userId: user._id.toString(),
      role: user.role,
    },

    process.env.JWT_SECRET,

    {
      expiresIn: process.env.JWT_EXPIRES_IN || "7d",
    },
  );
}

// ============================================================
// MAILTRAP TRANSPORTER
// ============================================================

function createEmailTransporter() {
  if (
    !process.env.EMAIL_HOST ||
    !process.env.EMAIL_PORT ||
    !process.env.EMAIL_USER ||
    !process.env.EMAIL_PASSWORD
  ) {
    throw new Error("Mailtrap email configuration is missing from .env");
  }

  return nodemailer.createTransport({
    host: process.env.EMAIL_HOST,

    port: Number(process.env.EMAIL_PORT),

    secure: false,

    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASSWORD,
    },
  });
}

// ============================================================
// REGISTER
//
// POST /api/auth/register
// ============================================================

router.post(
  "/register",

  registerLimiter,

  async (req, res) => {
    try {
      const { username, email, password } = req.body;

      const cleanUsername = String(username || "").trim();

      const cleanEmail = normalizeEmail(email);

      const cleanPassword = String(password || "");

      // ======================================================
      // REQUIRED FIELDS
      // ======================================================

      if (!cleanUsername || !cleanEmail || !cleanPassword) {
        return res.status(400).json({
          success: false,

          message: "Username, email, and password are required.",
        });
      }

      // ======================================================
      // USERNAME VALIDATION
      // ======================================================

      if (!usernameRegex.test(cleanUsername)) {
        return res.status(400).json({
          success: false,

          message:
            "Username must be 2-30 characters and may only contain letters, numbers, underscores, and periods.",
        });
      }

      // ======================================================
      // EMAIL VALIDATION
      // ======================================================

      if (!emailRegex.test(cleanEmail)) {
        return res.status(400).json({
          success: false,

          message: "Please enter a valid email address.",
        });
      }

      // ======================================================
      // PASSWORD VALIDATION
      // ======================================================

      if (!passwordRegex.test(cleanPassword)) {
        return res.status(400).json({
          success: false,

          message:
            "Password must be 8-20 characters and contain at least one uppercase letter, one lowercase letter, one number, and one special character.",
        });
      }

      // ======================================================
      // CHECK EMAIL
      // ======================================================

      const existingEmail = await User.findOne({
        email: cleanEmail,
      });

      if (existingEmail) {
        return res.status(409).json({
          success: false,

          message: "An account with this email already exists.",
        });
      }

      // ======================================================
      // CHECK USERNAME
      // ======================================================

      const existingUsername = await User.findOne({
        username: cleanUsername,
      });

      if (existingUsername) {
        return res.status(409).json({
          success: false,

          message: "This username is already taken.",
        });
      }

      // ======================================================
      // HASH PASSWORD
      // ======================================================

      const passwordHash = await bcrypt.hash(cleanPassword, 12);

      // ======================================================
      // CREATE USER
      // ======================================================

      const user = await User.create({
        username: cleanUsername,
        email: cleanEmail,
        password: passwordHash,
        role: "user",
      });

      // ======================================================
      // CREATE JWT
      // ======================================================

      const token = createToken(user);

      return res.status(201).json({
        success: true,

        message: "Account created successfully.",

        token,

        user: publicUser(user),
      });
    } catch (error) {
      console.error("Registration error:", error);

      if (error?.code === 11000) {
        const duplicateField = Object.keys(error.keyPattern || {})[0];

        if (duplicateField === "username") {
          return res.status(409).json({
            success: false,

            message: "This username is already taken.",
          });
        }

        return res.status(409).json({
          success: false,

          message: "An account with this email already exists.",
        });
      }

      return res.status(500).json({
        success: false,

        message: "Failed to create account.",
      });
    }
  },
);

// ============================================================
// LOGIN
//
// POST /api/auth/login
// ============================================================

router.post(
  "/login",

  loginLimiter,

  async (req, res) => {
    try {
      const { email, password } = req.body;

      const cleanEmail = normalizeEmail(email);

      const cleanPassword = String(password || "");

      if (!cleanEmail || !cleanPassword) {
        return res.status(400).json({
          success: false,

          message: "Email and password are required.",
        });
      }

      // ======================================================
      // FIND USER
      // ======================================================

      const user = await User.findOne({
        email: cleanEmail,
      }).select("+password");

      if (!user) {
        return res.status(401).json({
          success: false,

          message: "Invalid email or password.",
        });
      }

      // ======================================================
      // CHECK PASSWORD
      // ======================================================

      const passwordMatches = await bcrypt.compare(
        cleanPassword,
        user.password,
      );

      if (!passwordMatches) {
        return res.status(401).json({
          success: false,

          message: "Invalid email or password.",
        });
      }

      // ======================================================
      // CREATE JWT
      // ======================================================

      const token = createToken(user);

      return res.json({
        success: true,

        message: "Login successful.",

        token,

        user: publicUser(user),
      });
    } catch (error) {
      console.error("Login error:", error);

      return res.status(500).json({
        success: false,

        message: "Failed to log in.",
      });
    }
  },
);

// ============================================================
// FORGOT PASSWORD
//
// POST /api/auth/forgot-password
// ============================================================

router.post(
  "/forgot-password",

  forgotPasswordLimiter,

  async (req, res) => {
    try {
      const cleanEmail = normalizeEmail(req.body.email);

      // ======================================================
      // VALIDATE EMAIL
      // ======================================================

      if (!cleanEmail || !emailRegex.test(cleanEmail)) {
        return res.status(400).json({
          success: false,

          message: "Please enter a valid email address.",
        });
      }

      // ======================================================
      // FIND USER
      // ======================================================

      const user = await User.findOne({
        email: cleanEmail,
      });

      // ======================================================
      // GENERIC RESPONSE
      //
      // Do not reveal whether an account exists.
      // ======================================================

      if (!user) {
        return res.json({
          success: true,

          message:
            "If an account exists for that email, a password reset link has been sent.",
        });
      }

      // ======================================================
      // CREATE RESET TOKEN
      // ======================================================

      const resetToken = crypto.randomBytes(32).toString("hex");

      // ======================================================
      // HASH TOKEN BEFORE SAVING
      // ======================================================

      const hashedToken = crypto
        .createHash("sha256")
        .update(resetToken)
        .digest("hex");

      // ======================================================
      // SAVE TOKEN
      //
      // Expires after 15 minutes.
      // ======================================================

      user.resetPasswordToken = hashedToken;

      user.resetPasswordExpires = new Date(Date.now() + 15 * 60 * 1000);

      await user.save();

      // ======================================================
      // CREATE RESET URL
      // ======================================================

      const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";

      const resetUrl = `${frontendUrl}/reset-password/${resetToken}`;

      // ======================================================
      // SEND MAILTRAP EMAIL
      // ======================================================

      const transporter = createEmailTransporter();

      try {
        await transporter.sendMail({
          from: '"MaMaV" <noreply@mamav.local>',

          to: user.email,

          subject: "Reset your MaMaV password",

          text:
            `You requested a password reset for your MaMaV account.\n\n` +
            `Open the link below to create a new password:\n\n` +
            `${resetUrl}\n\n` +
            `This link expires in 15 minutes.\n\n` +
            `If you did not request this reset, you can ignore this email.`,

          html: `
            <div
              style="
                font-family: Arial, sans-serif;
                max-width: 560px;
                margin: 0 auto;
                padding: 32px;
                color: #1f2937;
              "
            >
              <h1
                style="
                  font-size: 26px;
                  margin: 0 0 16px;
                "
              >
                Reset your password
              </h1>

              <p
                style="
                  font-size: 15px;
                  line-height: 1.6;
                "
              >
                We received a request to reset the password
                for your MaMaV account.
              </p>

              <p
                style="
                  font-size: 15px;
                  line-height: 1.6;
                "
              >
                Click the button below to create a new password.
              </p>

              <div
                style="
                  margin: 28px 0;
                "
              >
                <a
                  href="${resetUrl}"
                  style="
                    display: inline-block;
                    background: #1f2937;
                    color: #ffffff;
                    padding: 13px 22px;
                    border-radius: 999px;
                    text-decoration: none;
                    font-size: 14px;
                    font-weight: 600;
                  "
                >
                  Reset password
                </a>
              </div>

              <p
                style="
                  font-size: 14px;
                  line-height: 1.6;
                "
              >
                This password reset link will expire in 15 minutes.
              </p>

              <p
                style="
                  font-size: 13px;
                  line-height: 1.6;
                  color: #6b7280;
                  margin-top: 24px;
                "
              >
                If you did not request a password reset,
                you can safely ignore this email.
              </p>
            </div>
          `,
        });

        console.log(`Password reset email sent to Mailtrap for: ${user.email}`);
      } catch (emailError) {
        // ====================================================
        // REMOVE TOKEN IF EMAIL FAILED
        // ====================================================

        user.resetPasswordToken = null;

        user.resetPasswordExpires = null;

        await user.save();

        console.error("Password reset email error:", emailError);

        return res.status(500).json({
          success: false,

          message: "Could not send the password reset email.",
        });
      }

      return res.json({
        success: true,

        message:
          "If an account exists for that email, a password reset link has been sent.",
      });
    } catch (error) {
      console.error("Forgot password error:", error);

      return res.status(500).json({
        success: false,

        message: "Could not process the password reset request.",
      });
    }
  },
);

// ============================================================
// RESET PASSWORD
//
// POST /api/auth/reset-password/:token
// ============================================================

router.post(
  "/reset-password/:token",

  resetPasswordLimiter,

  async (req, res) => {
    try {
      const resetToken = String(req.params.token || "").trim();

      const newPassword = String(req.body.password || "");

      // ======================================================
      // TOKEN REQUIRED
      // ======================================================

      if (!resetToken) {
        return res.status(400).json({
          success: false,

          message: "Password reset token is required.",
        });
      }

      // ======================================================
      // PASSWORD VALIDATION
      // ======================================================

      if (!passwordRegex.test(newPassword)) {
        return res.status(400).json({
          success: false,

          message:
            "Password must be 8-20 characters and contain at least one uppercase letter, one lowercase letter, one number, and one special character.",
        });
      }

      // ======================================================
      // HASH TOKEN FROM URL
      // ======================================================

      const hashedToken = crypto
        .createHash("sha256")
        .update(resetToken)
        .digest("hex");

      // ======================================================
      // FIND USER WITH VALID TOKEN
      // ======================================================

      const user = await User.findOne({
        resetPasswordToken: hashedToken,

        resetPasswordExpires: {
          $gt: new Date(),
        },
      }).select("+password +resetPasswordToken +resetPasswordExpires");

      if (!user) {
        return res.status(400).json({
          success: false,

          message: "This password reset link is invalid or has expired.",
        });
      }

      // ======================================================
      // DON'T ALLOW SAME PASSWORD
      // ======================================================

      const samePassword = await bcrypt.compare(newPassword, user.password);

      if (samePassword) {
        return res.status(400).json({
          success: false,

          message:
            "Your new password must be different from your current password.",
        });
      }

      // ======================================================
      // HASH NEW PASSWORD
      // ======================================================

      const passwordHash = await bcrypt.hash(newPassword, 12);

      // ======================================================
      // UPDATE PASSWORD
      // ======================================================

      user.password = passwordHash;

      // ======================================================
      // INVALIDATE RESET TOKEN
      // ======================================================

      user.resetPasswordToken = null;

      user.resetPasswordExpires = null;

      await user.save();

      return res.json({
        success: true,

        message:
          "Password reset successfully. You can now log in using your new password.",
      });
    } catch (error) {
      console.error("Reset password error:", error);

      return res.status(500).json({
        success: false,

        message: "Could not reset the password.",
      });
    }
  },
);

// ============================================================
// CHANGE PASSWORD
//
// POST /api/auth/change-password
// Authorization: Bearer <token>
// ============================================================

router.post(
  "/change-password",

  changePasswordLimiter,

  requireAuth,

  async (req, res) => {
    try {
      const currentPassword = String(req.body.currentPassword || "");

      const newPassword = String(req.body.newPassword || "");

      // ======================================================
      // REQUIRED FIELDS
      // ======================================================

      if (!currentPassword || !newPassword) {
        return res.status(400).json({
          success: false,

          message: "Current password and new password are required.",
        });
      }

      // ======================================================
      // NEW PASSWORD VALIDATION
      // ======================================================

      if (!passwordRegex.test(newPassword)) {
        return res.status(400).json({
          success: false,

          message:
            "Password must be 8-20 characters and contain at least one uppercase letter, one lowercase letter, one number, and one special character.",
        });
      }

      // ======================================================
      // FIND AUTHENTICATED USER WITH PASSWORD
      // ======================================================

      const user = await User.findById(req.user._id).select(
        "+password +resetPasswordToken +resetPasswordExpires",
      );

      if (!user) {
        return res.status(404).json({
          success: false,

          message: "User account not found.",
        });
      }

      // ======================================================
      // VERIFY CURRENT PASSWORD
      // ======================================================

      const currentPasswordMatches = await bcrypt.compare(
        currentPassword,
        user.password,
      );

      if (!currentPasswordMatches) {
        return res.status(401).json({
          success: false,

          message: "Current password is incorrect.",
        });
      }

      // ======================================================
      // DON'T ALLOW SAME PASSWORD
      // ======================================================

      const samePassword = await bcrypt.compare(newPassword, user.password);

      if (samePassword) {
        return res.status(400).json({
          success: false,

          message:
            "Your new password must be different from your current password.",
        });
      }

      // ======================================================
      // HASH NEW PASSWORD
      // ======================================================

      const passwordHash = await bcrypt.hash(newPassword, 12);

      // ======================================================
      // UPDATE PASSWORD
      // ======================================================

      user.password = passwordHash;

      // Invalidate any existing forgot-password link.
      user.resetPasswordToken = null;

      user.resetPasswordExpires = null;

      await user.save();

      return res.json({
        success: true,

        message: "Password changed successfully.",
      });
    } catch (error) {
      console.error("Change password error:", error);

      return res.status(500).json({
        success: false,

        message: "Could not change the password.",
      });
    }
  },
);

// ============================================================
// CURRENT USER
//
// GET /api/auth/me
// ============================================================

router.get(
  "/me",

  requireAuth,

  async (req, res) => {
    return res.json({
      success: true,

      user: publicUser(req.user),
    });
  },
);

// ============================================================
// LOGOUT
// ============================================================

router.post(
  "/logout",

  requireAuth,

  async (req, res) => {
    return res.json({
      success: true,

      message: "Logged out successfully.",
    });
  },
);

module.exports = router;
