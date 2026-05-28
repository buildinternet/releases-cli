import chalk from "chalk";
import { suggestOrgs, suggestSources } from "../api/client.js";

export async function orgNotFound(identifier: string): Promise<never> {
  console.error(chalk.red(`Organization not found: ${identifier}`));
  const suggestions = await suggestOrgs(identifier, 5);
  if (suggestions.length > 0) {
    console.error(chalk.dim("\nDid you mean?"));
    for (const s of suggestions) {
      console.error(`  ${chalk.cyan(s.slug)}  ${chalk.dim(s.name)}`);
    }
  }
  process.exit(1);
}

export async function sourceNotFound(identifier: string): Promise<never> {
  console.error(chalk.red(`Source not found: ${identifier}`));
  const suggestions = await suggestSources(identifier, 5);
  if (suggestions.length > 0) {
    console.error(chalk.dim("\nDid you mean?"));
    for (const s of suggestions) {
      console.error(`  ${chalk.cyan(s.slug)}  ${chalk.dim(s.name)}`);
    }
  }
  process.exit(1);
}

export function productNotFound(identifier: string): never {
  console.error(chalk.red(`Product not found: ${identifier}`));
  console.error(chalk.dim('Use an "org/slug" coordinate, a prod_… id, or a product slug.'));
  process.exit(1);
}
