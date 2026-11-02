const PLAN_TIERS = Object.freeze({
  bronze: Object.freeze({ maxAccounts: 5 }),
  silver: Object.freeze({ maxAccounts: 7 }),
  gold: Object.freeze({ maxAccounts: 9 })
});

const PLAN_PRICES_PAISE = Object.freeze({
  bronze: Object.freeze({ 1: 500000, 2: 600000, 3: 700000 }),
  silver: Object.freeze({ 1: 600000, 2: 700000, 3: 800000 }),
  gold: Object.freeze({ 1: 700000, 2: 800000, 3: 900000 })
});

function normalizePlanTier(tier) {
  const normalized = String(tier || "bronze").toLowerCase();
  return Object.hasOwn(PLAN_TIERS, normalized) ? normalized : "bronze";
}

function accountLimitFor(tier) {
  return PLAN_TIERS[normalizePlanTier(tier)].maxAccounts;
}

function makePlanId(tier, years) {
  return `${normalizePlanTier(tier)}-${years}-year`;
}

function subscriptionPricePaise(tier, years) {
  return PLAN_PRICES_PAISE[normalizePlanTier(tier)][years] || null;
}

module.exports = { PLAN_TIERS, PLAN_PRICES_PAISE, normalizePlanTier, accountLimitFor, makePlanId, subscriptionPricePaise };
