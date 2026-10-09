/*
  One-tap answers for business facts the site rarely states (tier 3: AI never guesses them).
  A pick is stored as the owner's own value (user_edited). "Not sure" and "Prefer not to say"
  store nothing and mark the field Not applicable, so it stops showing in "Next to do".
*/

export const QUICK_PICKS = {
  "company.legalEntityType": ["LLC", "Corporation", "Partnership", "Sole proprietor", "Nonprofit", "Not sure"],
  "company.employeeCount": ["1 to 10", "11 to 50", "51 to 200", "201 to 500", "500+"],
  "company.revenue": ["Under $250k", "$250k to $1M", "$1M to $5M", "$5M+", "Prefer not to say"],
} as const;

export type QuickPickPath = keyof typeof QUICK_PICKS;

// Answers that mean "skip this field" rather than a value
const SKIP = new Set<string>(["Not sure", "Prefer not to say"]);

export type PickAction = { set: string } | { notApplicable: true };

/** What tapping `option` does: store it as the value, or mark the field Not applicable. */
export function pickAction(option: string): PickAction {
  return SKIP.has(option) ? { notApplicable: true } : { set: option };
}
