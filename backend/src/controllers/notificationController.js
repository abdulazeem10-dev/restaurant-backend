const Notification = require("../models/Notification");

async function listMine(req, res) {
  const notifications = await Notification.find({ userId: req.user._id })
    .sort({ createdAt: -1 }).limit(50).lean();
  return res.json({ notifications, unreadCount: notifications.filter(item => !item.readAt).length });
}

async function markRead(req, res) {
  if (req.params.id.length !== 24 || !/^[a-f\d]{24}$/i.test(req.params.id)) return res.status(404).json({ error: "Notification not found" });
  const notification = await Notification.findOneAndUpdate(
    { _id: req.params.id, userId: req.user._id },
    { $set: { readAt: new Date() } },
    { new: true }
  ).lean();
  if (!notification) return res.status(404).json({ error: "Notification not found" });
  return res.json({ notification });
}

module.exports = { listMine, markRead };
