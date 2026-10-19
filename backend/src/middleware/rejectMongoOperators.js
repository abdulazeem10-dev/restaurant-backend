const MAX_INPUT_DEPTH = 20;

function containsMongoOperatorKey(input) {
  const pending = [{ value: input, depth: 0 }];

  while (pending.length) {
    const { value, depth } = pending.pop();
    if (!value || typeof value !== "object") continue;
    if (depth > MAX_INPUT_DEPTH) return true;

    for (const [key, child] of Object.entries(value)) {
      // MongoDB operators and dotted paths must never come from a client.
      if (key.startsWith("$") || key.includes(".") || ["__proto__", "prototype", "constructor"].includes(key)) return true;
      if (child && typeof child === "object") pending.push({ value: child, depth: depth + 1 });
    }
  }

  return false;
}

function rejectMongoOperators(req, res, next) {
  if (containsMongoOperatorKey(req.body) || containsMongoOperatorKey(req.query)) {
    return res.status(400).json({ error: "Request contains unsupported field names." });
  }
  return next();
}

module.exports = rejectMongoOperators;
