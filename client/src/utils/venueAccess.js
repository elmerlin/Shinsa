export function buildMonthlyCadenceDraft(cadence = {}, fallbackCurrency = 'gbp') {
  const months = Math.max(1, parseInt(cadence?.months, 10) || 1);
  const label = String(cadence?.label || '').trim() || (months === 1 ? 'Monthly' : `${months} months`);
  return {
    key: String(cadence?.key || '').trim(),
    label,
    months,
    price_amount: cadence?.price_amount != null && cadence?.price_amount !== ''
      ? String((Number(cadence.price_amount) / 100).toFixed(2))
      : '',
    currency: String(cadence?.currency || fallbackCurrency || 'gbp').toLowerCase(),
    square_plan_variation_id: String(cadence?.square_plan_variation_id || '').trim(),
  };
}

export function getMonthlyCadenceOptions(plan) {
  if (!plan || plan.plan_type !== 'monthly') return [];

  const directOptions = Array.isArray(plan.monthly_cadences)
    ? plan.monthly_cadences
    : [];

  let parsedOptions = [];
  if (directOptions.length === 0 && plan.monthly_cadences_json) {
    try {
      parsedOptions = JSON.parse(plan.monthly_cadences_json);
    } catch {
      parsedOptions = [];
    }
  }

  const options = (directOptions.length > 0 ? directOptions : parsedOptions)
    .map((cadence, index) => {
      const months = Math.max(1, parseInt(cadence?.months, 10) || 1);
      return {
        key: String(cadence?.key || '').trim() || `cadence_${index + 1}`,
        label: String(cadence?.label || '').trim() || (months === 1 ? 'Monthly' : `${months} months`),
        months,
        price_amount: Math.max(0, parseInt(cadence?.price_amount, 10) || 0),
        discounted_amount: Math.max(0, parseInt(cadence?.discounted_amount, 10) || 0),
        discount_percent: Math.max(0, parseInt(cadence?.discount_percent, 10) || 0),
        currency: String(cadence?.currency || plan.currency || 'gbp').toLowerCase(),
        square_plan_variation_id: String(cadence?.square_plan_variation_id || '').trim(),
      };
    })
    .filter((cadence) => cadence.months > 0);

  if (options.length > 0) return options;

  return [{
    key: 'monthly',
    label: 'Monthly',
    months: 1,
    price_amount: Math.max(0, parseInt(plan.price_amount, 10) || 0),
    discounted_amount: Math.max(0, parseInt(plan.discounted_amount, 10) || parseInt(plan.price_amount, 10) || 0),
    discount_percent: Math.max(0, parseInt(plan.discount_percent, 10) || 0),
    currency: String(plan.currency || 'gbp').toLowerCase(),
    square_plan_variation_id: String(plan.square_plan_variation_id || '').trim(),
  }];
}

export function getCadenceIntervalLabel(cadence) {
  const months = Math.max(1, parseInt(cadence?.months, 10) || 1);
  if (months === 1) return 'billed monthly';
  if (months === 3) return 'billed quarterly';
  if (months === 6) return 'billed every 6 months';
  if (months === 12) return 'billed yearly';
  return `billed every ${months} months`;
}

export function getCadenceCycleSuffix(cadence) {
  const months = Math.max(1, parseInt(cadence?.months, 10) || 1);
  return months === 1 ? '/month' : `/${months} months`;
}
