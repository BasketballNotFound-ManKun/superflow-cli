export interface SkillContract {
  name: string;
  owner: string;
  triggers: string[];
  excludes: string[];
  outputs: string[];
  neighbors: string[];
}

export interface SkillRegistryInput {
  skills: string[];
  contracts: SkillContract[];
}

export interface SkillRegistryAssets {
  zh: string[];
  en: string[];
}

export interface SkillRegistryAudit {
  ok: boolean;
  errors: string[];
  stats: {
    manifestSkills: number;
    contracts: number;
    missingContracts: number;
    missingMirrors: number;
  };
}

const OWNER_PATTERN = /^[a-z][a-z0-9-]{1,31}$/;

export function auditSkillRegistry(
  registry: SkillRegistryInput,
  assets: SkillRegistryAssets,
): SkillRegistryAudit {
  const errors: string[] = [];
  const manifestSkills = unique(registry.skills);
  const contracts = registry.contracts ?? [];
  const byName = new Map<string, SkillContract>();

  for (const contract of contracts) {
    if (!contract || typeof contract.name !== "string") {
      errors.push("contract name is missing");
      continue;
    }
    if (byName.has(contract.name)) {
      errors.push(`duplicate contract: ${contract.name}`);
      continue;
    }
    byName.set(contract.name, contract);
    if (!OWNER_PATTERN.test(contract.owner)) {
      errors.push(`invalid owner for ${contract.name}: ${contract.owner}`);
    }
    if (!nonEmptyList(contract.triggers)) {
      errors.push(`triggers must not be empty: ${contract.name}`);
    }
    if (!nonEmptyList(contract.outputs)) {
      errors.push(`outputs must not be empty: ${contract.name}`);
    }
    if (!Array.isArray(contract.excludes)) {
      errors.push(`excludes must be an array: ${contract.name}`);
    }
    if (!Array.isArray(contract.neighbors)) {
      errors.push(`neighbors must be an array: ${contract.name}`);
    }
  }

  const missingContracts = manifestSkills.filter((name) => !byName.has(name));
  for (const name of missingContracts) {
    errors.push(`missing contract: ${name}`);
  }
  for (const name of byName.keys()) {
    if (!manifestSkills.includes(name)) {
      errors.push(`contract is not in manifest: ${name}`);
    }
  }

  const mirrors = new Set(assets.en ?? []);
  const missingMirrors = manifestSkills.filter((name) => !mirrors.has(name));
  for (const name of missingMirrors) {
    errors.push(`missing English mirror: ${name}`);
  }

  const known = new Set(manifestSkills);
  for (const contract of contracts) {
    for (const neighbor of contract.neighbors ?? []) {
      if (!known.has(neighbor)) {
        errors.push(`${contract.name} references unknown neighbor: ${neighbor}`);
      }
    }
  }

  const triggerOwners = new Map<string, string>();
  for (const contract of contracts) {
    for (const trigger of contract.triggers ?? []) {
      const normalized = trigger.trim().toLowerCase();
      if (!normalized) continue;
      const previous = triggerOwners.get(normalized);
      if (previous && previous !== contract.name) {
        errors.push(
          `duplicate trigger '${trigger}' shared by ${previous} and ${contract.name}`,
        );
      } else {
        triggerOwners.set(normalized, contract.name);
      }
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    stats: {
      manifestSkills: manifestSkills.length,
      contracts: byName.size,
      missingContracts: missingContracts.length,
      missingMirrors: missingMirrors.length,
    },
  };
}

function unique(values: string[]): string[] {
  return [...new Set(Array.isArray(values) ? values : [])];
}

function nonEmptyList(values: unknown): values is string[] {
  return Array.isArray(values) && values.length > 0 && values.every(
    (value) => typeof value === "string" && value.trim().length > 0,
  );
}
