const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { z } = require("zod");
const { createHash, randomBytes } = require("node:crypto");
const { OAuth2Client } = require("google-auth-library");
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
  phone: z.string().trim().min(8).max(25),
  password: z.string().min(12).max(128)
}).strict();

const googleSchema = z.object({
  credential: z.string().min(20).max(10000)
}).strict();

const loginSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(128)
}).strict();

const phoneOtpRequestSchema = z.object({
  phone: z.string().trim().min(8).max(25)
}).strict();

const phoneOtpVerifySchema = phoneOtpRequestSchema.extend({
  code: z.string().regex(/^\d{6}$/)
}).strict();

function normalizePhoneNumber(value) {
  const phone = value.replace(/[\s().-]/g, "");
  if (/^\d{10}$/.test(phone)) return `+91${phone}`;
  if (/^\+?[1-9]\d{7,14}$/.test(phone)) return phone.startsWith("+") ? phone : `+${phone}`;
  return null;
}

function phoneLookupCandidates(phone) {
  const digits = phone.replace(/\D/g, "");
  const candidates = [phone, digits];
  if (digits.startsWith("91") && digits.length === 12) candidates.push(digits.slice(2));
  return [...new Set(candidates)];
}

function twilioVerifyConfig() {
  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_VERIFY_SERVICE_SID } = process.env;
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_VERIFY_SERVICE_SID) return null;
  return { accountSid: TWILIO_ACCOUNT_SID, authToken: TWILIO_AUTH_TOKEN, serviceSid: TWILIO_VERIFY_SERVICE_SID };
}

async function twilioVerifyRequest(config, resource, values) {
  const credentials = Buffer.from(`${config.accountSid}:${config.authToken}`).toString("base64");
  const response = await fetch(`https://verify.twilio.com/v2/Services/${config.serviceSid}/${resource}`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams(values)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error("Twilio Verify request failed with status:", response.status);
    throw new Error("SMS verification is temporarily unavailable");
  }
  return data;
}

function loginResponse(user) {
  return {
    accessToken: jwt.sign(
      { sub: String(user._id) },
      process.env.JWT_SECRET,
      { algorithm: "HS256", expiresIn: process.env.JWT_EXPIRES_IN || "15m" }
    ),
    tokenType: "Bearer",
    expiresIn: process.env.JWT_EXPIRES_IN || "15m",
    user: { id: user._id, name: user.name, email: user.email, phone: user.phone, role: user.role }
  };
}

async function register(req, res) {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid registration details" });

  const phone = parsed.data.phone.replace(/[\s().-]/g, "");
  if (!/^\+?[1-9]\d{7,14}$/.test(phone)) {
    return res.status(400).json({ error: "Enter a valid phone number with country code, such as +919876543210" });
  }

  const email = parsed.data.email.toLowerCase();
  const existing = await User.findOne({ email });
  if (existing) return res.status(409).json({ error: "Unable to register with these details" });

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  const user = await User.create({
    name: parsed.data.name,
    email,
    phone,
    passwordHash,
    role: "customer",
    status: "active"
  });

  return res.status(201).json({
    user: { id: user._id, name: user.name, email: user.email, phone: user.phone, role: user.role }
  });
}

async function login(req, res) {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid login details" });

  const user = await User.findOne({ email: parsed.data.email.toLowerCase() }).select("+passwordHash");
  const valid = user?.passwordHash && await bcrypt.compare(parsed.data.password, user.passwordHash);

  if (!valid || user.status !== "active") {
    return res.status(401).json({ error: "Invalid email or password" });
  }

  return res.json(loginResponse(user));
}

async function requestPhoneOtp(req, res) {
  const parsed = phoneOtpRequestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Enter a valid phone number" });
  const phone = normalizePhoneNumber(parsed.data.phone);
  if (!phone) return res.status(400).json({ error: "Enter a valid phone number, such as +919876543210" });
  const config = twilioVerifyConfig();
  if (!config) return res.status(503).json({ error: "Phone login is not configured yet. Use email/password or Google sign-in for now." });

  const user = await User.findOne({ phone: { $in: phoneLookupCandidates(phone) }, role: "customer", status: "active" });
  if (user) {
    try {
      await twilioVerifyRequest(config, "Verifications", { To: phone, Channel: "sms" });
    } catch {
      return res.status(502).json({ error: "Could not send the code. Please try again later." });
    }
  }

  return res.json({ message: "If an active customer account uses that number, an OTP has been sent." });
}

async function verifyPhoneOtp(req, res) {
  const parsed = phoneOtpVerifySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Enter a valid phone number and the 6-digit code" });
  const phone = normalizePhoneNumber(parsed.data.phone);
  if (!phone) return res.status(400).json({ error: "Enter a valid phone number" });
  const config = twilioVerifyConfig();
  if (!config) return res.status(503).json({ error: "Phone login is not configured yet. Use email/password or Google sign-in for now." });

  let verification;
  try {
    verification = await twilioVerifyRequest(config, "VerificationCheck", { To: phone, Code: parsed.data.code });
  } catch {
    return res.status(401).json({ error: "That code is invalid or expired. Request a new one and try again." });
  }
  if (verification.status !== "approved") {
    return res.status(401).json({ error: "That code is invalid or expired. Request a new one and try again." });
  }

  const user = await User.findOne({ phone: { $in: phoneLookupCandidates(phone) }, role: "customer", status: "active" });
  if (!user) return res.status(401).json({ error: "That code is invalid or expired. Request a new one and try again." });
  return res.json(loginResponse(user));
}

async function googleLogin(req, res) {
  const parsed = googleSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Google sign-in response is missing or invalid" });
  if (!process.env.GOOGLE_CLIENT_ID) {
    return res.status(503).json({ error: "Google sign-in is not configured yet" });
  }

  let payload;
  try {
    const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
    const ticket = await client.verifyIdToken({
      idToken: parsed.data.credential,
      audience: process.env.GOOGLE_CLIENT_ID
    });
    payload = ticket.getPayload();
  } catch {
    return res.status(401).json({ error: "Google sign-in could not be verified. Please try again." });
  }

  if (!payload?.sub || !payload.email || payload.email_verified !== true) {
    return res.status(401).json({ error: "Use a Google account with a verified email address" });
  }

  const email = payload.email.toLowerCase();
  let user = await User.findOne({ email }).select("+googleSub");
  if (user && (user.role !== "customer" || user.status !== "active")) {
    return res.status(403).json({ error: "Google sign-in is available for active customer accounts only" });
  }
  if (user?.googleSub && user.googleSub !== payload.sub) {
    return res.status(401).json({ error: "This email is linked to a different Google account" });
  }

  if (!user) {
    user = await User.create({
      name: payload.name?.trim().slice(0, 100) || email.split("@")[0],
      email,
      role: "customer",
      status: "active",
      googleSub: payload.sub
    });
  } else if (!user.googleSub) {
    user.googleSub = payload.sub;
    await user.save();
  }

  const accessToken = jwt.sign(
    { sub: String(user._id) },
    process.env.JWT_SECRET,
    { algorithm: "HS256", expiresIn: process.env.JWT_EXPIRES_IN || "15m" }
  );

  return res.json({
    accessToken,
    tokenType: "Bearer",
    expiresIn: process.env.JWT_EXPIRES_IN || "15m",
    user: { id: user._id, name: user.name, email: user.email, phone: user.phone, role: user.role }
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

module.exports = { register, login, requestPhoneOtp, verifyPhoneOtp, googleLogin, requestPasswordReset, resetPassword, me };
