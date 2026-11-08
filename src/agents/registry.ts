/** The full company roster, assembled from the department definitions. */

import type { AgentDefinition } from '../core/types.js';
import { executive } from './definitions/executive.js';
import { sourcing } from './definitions/sourcing.js';
import { growth } from './definitions/growth.js';
import { storefront } from './definitions/storefront.js';
import { customer } from './definitions/customer.js';
import { finance } from './definitions/finance.js';
import { dataDept, platform } from './definitions/platform.js';

export const ROSTER: AgentDefinition[] = [
  ...executive,
  ...sourcing,
  ...growth,
  ...storefront,
  ...customer,
  ...finance,
  ...dataDept,
  ...platform,
];

export function findAgent(id: string): AgentDefinition | undefined {
  return ROSTER.find((a) => a.id === id);
}

/** Fails fast on a roster that references agents that do not exist. */
export function validateRoster(roster: AgentDefinition[] = ROSTER): string[] {
  const ids = new Set(roster.map((a) => a.id));
  const problems: string[] = [];

  if (ids.size !== roster.length) problems.push('duplicate agent ids in roster');

  for (const a of roster) {
    if (a.reportsTo && !ids.has(a.reportsTo)) {
      problems.push(`${a.id}: reportsTo "${a.reportsTo}" does not exist`);
    }
    for (const target of a.canMessage) {
      if (target !== '*' && !ids.has(target)) {
        problems.push(`${a.id}: canMessage "${target}" does not exist`);
      }
    }
  }
  return problems;
}
