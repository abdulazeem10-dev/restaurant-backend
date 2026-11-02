const PLAN_TIERS = Object.freeze({
  bronze: Object.freeze({ maxAccounts: 5 }),
  silver: Object.freeze({ maxAccounts: 7 }),
  gold: Object.freeze({ maxAccounts: 9 })
});

const TERM_PRICES_PAISE = Object.freeze({ 1: 500000, 2: 900000, 3: 1200000 });

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

module.exports = { PLAN_TIERS, TERM_PRICES_PAISE, normalizePlanTier, accountLimitFor, makePlanId };
