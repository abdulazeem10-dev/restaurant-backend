const { z } = require("zod");
const User = require("../models/User");

const addressSchema = z.object({
  label: z.string().trim().min(1).max(40).default("Home"),
  recipientType: z.enum(["self", "other"]),
  name: z.string().trim().min(1).max(100),
  phone: z.string().length(10).regex(/^\d{10}$/),
  flatBuilding: z.string().trim().min(1).max(120),
  lane: z.string().trim().min(1).max(180),
  landmark: z.string().trim().max(120).default(""),
  pincode: z.string().length(6).regex(/^\d{6}$/)
}).strict();

async function listAddresses(req, res) {
  const user = await User.findById(req.user._id).select("savedAddresses").lean();
  return res.json({ addresses: user?.savedAddresses || [] });
}

async function addAddress(req, res) {
  const parsed = addressSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Enter a label, recipient, 10-digit mobile number, complete address, and 6-digit PIN code" });
  const user = await User.findById(req.user._id);
  if (!user) return res.status(404).json({ error: "Customer account not found" });
  if (user.savedAddresses.length >= 10) return res.status(400).json({ error: "You can save up to 10 addresses" });
  user.savedAddresses.push(parsed.data);
  await user.save();
  return res.status(201).json({ address: user.savedAddresses[user.savedAddresses.length - 1] });
}

async function deleteAddress(req, res) {
  const user = await User.findById(req.user._id);
  if (!user) return res.status(404).json({ error: "Customer account not found" });
  const address = user.savedAddresses.id(req.params.id);
  if (!address) return res.status(404).json({ error: "Saved address not found" });
  address.deleteOne();
  await user.save();
  return res.status(204).end();
}

module.exports = { listAddresses, addAddress, deleteAddress };
