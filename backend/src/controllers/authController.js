const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { z } = require("zod");
const { createHash, randomBytes } = require("node:crypto");
const User = require("../models/User");

const passwordResetRequestSchema = z.object({
  email: z.string().trim().email().max(254)
}).strict();

const passwordResetSchema = z.object({
  token: z.string().regex(/^[a-f0-9]{64}$/i),
  password: z.string().min(12).max(128)
}).strict();

function hashResetToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

async function sendPasswordResetEmail(email, token) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  const frontendOrigin = process.env.FRONTEND_ORIGIN?.split(",")[0].trim().replace(/\/$/, "");
  if (!apiKey || !from || !frontendOrigin) {
    const error = new Error("Password reset email is not configured. Set RESEND_API_KEY, EMAIL_FROM, and FRONTEND_ORIGIN.");
    error.status = 503;
    throw error;
  }

  const resetUrl = new URL("/customer/reset-password.html", frontendOrigin);
  resetUrl.searchParams.set("token", token);
  const link = resetUrl.toString();
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from,
      to: [email],
      subject: "Reset your Food Platform password",
      text: `Use this link to reset your password. It expires in 30 minutes: ${link}\n\nIf you did not request this, you can ignore this email.`,
      html: `<p>Use the link below to reset your Food Platform password. It expires in 30 minutes.</p><p><a href="${link}">Reset password</a></p><p>If you did not request this, you can ignore this email.</p>`
    })
  });

  if (!response.ok) {
    const details = await response.text();
    console.error("Password reset email provider error:", details);
    throw new Error("Could not send password reset email");
  }
}

const registerSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(254),
  password: z.string().min(12).max(128)
}).strict();

const loginSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(128)
}).strict();

async function register(req, res) {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid registration details" });

  const email = parsed.data.email.toLowerCase();
  const existing = await User.findOne({ email });
  if (existing) return res.status(409).json({ error: "Unable to register with these details" });

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  const user = await User.create({
    name: parsed.data.name,
    email,
    passwordHash,
    role: "customer",
    status: "active"
  });

  return res.status(201).json({
    user: { id: user._id, name: user.name, email: user.email, role: user.role }
  });
}

async function login(req, res) {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid login details" });

  const user = await User.findOne({ email: parsed.data.email.toLowerCase() }).select("+passwordHash");
  const valid = user && await bcrypt.compare(parsed.data.password, user.passwordHash);

  if (!valid || user.status !== "active") {
    return res.status(401).json({ error: "Invalid email or password" });
  }

  const token = jwt.sign(
    { sub: String(user._id) },
    process.env.JWT_SECRET,
    { algorithm: "HS256", expiresIn: process.env.JWT_EXPIRES_IN || "15m" }
  );

  return res.json({
    accessToken: token,
    tokenType: "Bearer",
    expiresIn: process.env.JWT_EXPIRES_IN || "15m",
    user: { id: user._id, name: user.name, email: user.email, role: user.role }
  });
}

async function requestPasswordReset(req, res) {
  const parsed = passwordResetRequestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Enter a valid email address" });

  const user = await User.findOne({ email: parsed.data.email.toLowerCase(), status: "active" })
    .select("+passwordResetTokenHash +passwordResetExpires");

  if (user) {
    const token = randomBytes(32).toString("hex");
    user.passwordResetTokenHash = hashResetToken(token);
    user.passwordResetExpires = new Date(Date.now() + 30 * 60 * 1000);
    await user.save();

    try {
      await sendPasswordResetEmail(user.email, token);
    } catch (error) {
      user.passwordResetTokenHash = undefined;
      user.passwordResetExpires = undefined;
      await user.save();
      throw error;
    }
  }

  return res.json({ message: "If an active account uses that email, a password reset link has been sent." });
}

async function resetPassword(req, res) {
  const parsed = passwordResetSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Use a valid reset link and a password of at least 12 characters" });
  }

  const user = await User.findOne({
    passwordResetTokenHash: hashResetToken(parsed.data.token),
    passwordResetExpires: { $gt: new Date() },
    status: "active"
  }).select("+passwordResetTokenHash +passwordResetExpires");

  if (!user) return res.status(400).json({ error: "This reset link is invalid or expired. Request a new one." });

  user.passwordHash = await bcrypt.hash(parsed.data.password, 12);
  user.passwordResetTokenHash = undefined;
  user.passwordResetExpires = undefined;
  await user.save();

  return res.json({ message: "Password reset successfully. You can now sign in." });
}

function me(req, res) {
  return res.json({
    user: {
      id: req.user._id,
      name: req.user.name,
      email: req.user.email,
      role: req.user.role,
      status: req.user.status
    }
  });
}

module.exports = { register, login, requestPasswordReset, resetPassword, me };
