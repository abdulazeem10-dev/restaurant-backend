function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function normalizedPhone(value) {
  if (typeof value !== "string") return "";
  const phone = value.replace(/[\s().-]/g, "");
  if (/^\d{10}$/.test(phone)) return `+91${phone}`;
  if (/^\+[1-9]\d{7,14}$/.test(phone)) return phone;
  return "";
}

async function sendEmail(to, subject, message, orderId) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from || !to) return;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [to],
      subject: `Food Platform · ${subject}`,
      text: `${message}\nOrder #${String(orderId).slice(-6)}`,
      html: `<p>${escapeHtml(message)}</p><p>Order #${escapeHtml(String(orderId).slice(-6))}</p>`
    }),
    signal: AbortSignal.timeout(8000)
  });
  if (!response.ok) throw new Error(`Email provider returned ${response.status}`);
}

async function sendSms(to, message) {
  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_MESSAGING_SERVICE_SID, TWILIO_FROM_NUMBER } = process.env;
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || (!TWILIO_MESSAGING_SERVICE_SID && !TWILIO_FROM_NUMBER) || !to) return;
  const values = { To: to, Body: message.slice(0, 1500) };
  if (TWILIO_MESSAGING_SERVICE_SID) values.MessagingServiceSid = TWILIO_MESSAGING_SERVICE_SID;
  else values.From = TWILIO_FROM_NUMBER;
  const credentials = Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString("base64");
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`, {
    method: "POST",
    headers: { Authorization: `Basic ${credentials}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(values),
    signal: AbortSignal.timeout(8000)
  });
  if (!response.ok) throw new Error(`SMS provider returned ${response.status}`);
}

async function sendOrderAlerts({ order, event, customer, restaurantStaff }) {
  const jobs = [];
  if (event.audiences.includes("customer") && customer) {
    const email = customer.email && sendEmail(customer.email, event.customerTitle || event.title, event.customerMessage, order._id);
    if (email) jobs.push(email);
    const smsTo = normalizedPhone(order.deliveryDetails?.phone || customer.phone);
    const smsMessage = `${event.customerTitle || event.title}: ${event.customerMessage} Order #${String(order._id).slice(-6)}.`;
    const sms = smsTo && sendSms(smsTo, smsMessage);
    if (sms) jobs.push(sms);
  }
  if (event.audiences.includes("restaurant")) {
    for (const staff of restaurantStaff) {
      if (staff.email) jobs.push(sendEmail(staff.email, event.restaurantTitle || event.title, event.restaurantMessage, order._id));
    }
  }
  const results = await Promise.allSettled(jobs);
  for (const result of results) if (result.status === "rejected") console.error("Order alert provider error:", result.reason.message);
}

module.exports = { sendOrderAlerts };
