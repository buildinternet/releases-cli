import { Command } from "commander";
import chalk from "chalk";
import Table from "cli-table3";
import {
  listCollections,
  getCollection,
  createCollection,
  updateCollection,
  deleteCollection,
  replaceCollectionMembers,
  addCollectionMember,
  removeCollectionMember,
} from "../../api/client.js";
import { writeJson } from "../../lib/output.js";

type GlobalOpts = { json?: boolean };

function refToInput(ref: string): { orgId: string } | { orgSlug: string } {
  return ref.startsWith("org_") ? { orgId: ref } : { orgSlug: ref };
}

async function listAction(opts: GlobalOpts): Promise<void> {
  const rows = await listCollections();
  if (opts.json) {
    await writeJson(rows);
    return;
  }
  if (rows.length === 0) {
    console.log(chalk.yellow("No collections."));
    return;
  }
  const table = new Table({
    head: [
      chalk.cyan("Slug"),
      chalk.cyan("Name"),
      chalk.cyan("Members"),
      chalk.cyan("Description"),
    ],
  });
  for (const r of rows) {
    table.push([r.slug, r.name, String(r.memberCount), r.description ?? chalk.dim("—")]);
  }
  console.log(table.toString());
}

async function getAction(slug: string, opts: GlobalOpts): Promise<void> {
  const detail = await getCollection(slug);
  if (!detail) {
    console.error(chalk.red(`Collection not found: ${slug}`));
    process.exit(1);
  }
  if (opts.json) {
    await writeJson(detail);
    return;
  }
  console.log(chalk.bold(detail.name) + chalk.dim(` (${detail.slug})`));
  if (detail.description) console.log(detail.description);
  console.log("");
  if (detail.orgs.length === 0) {
    console.log(chalk.dim("No member orgs."));
    return;
  }
  console.log(chalk.cyan(`${detail.orgs.length} ${detail.orgs.length === 1 ? "org" : "orgs"}:`));
  for (const o of detail.orgs) console.log(`  - ${o.name} ${chalk.dim(`(${o.slug})`)}`);
}

type CreateOpts = GlobalOpts & { slug?: string; description?: string };
async function createAction(name: string, opts: CreateOpts): Promise<void> {
  const created = await createCollection({
    name,
    slug: opts.slug,
    description: opts.description,
  });
  if (opts.json) await writeJson(created);
  else console.log(chalk.green(`Created collection: ${created.name} (${created.slug})`));
}

type UpdateOpts = GlobalOpts & { name?: string; slug?: string; description?: string };
async function updateAction(slug: string, opts: UpdateOpts): Promise<void> {
  const patch: { name?: string; slug?: string; description?: string | null } = {};
  if (opts.name !== undefined) patch.name = opts.name;
  if (opts.slug !== undefined) patch.slug = opts.slug;
  if (opts.description !== undefined) patch.description = opts.description;
  if (Object.keys(patch).length === 0) {
    console.error(chalk.red("Nothing to update — pass --name, --slug, or --description."));
    process.exit(1);
  }
  const updated = await updateCollection(slug, patch);
  if (opts.json) await writeJson(updated);
  else console.log(chalk.green(`Updated collection: ${updated.name} (${updated.slug})`));
}

async function deleteAction(slug: string, opts: GlobalOpts): Promise<void> {
  await deleteCollection(slug);
  if (opts.json) await writeJson({ removed: slug });
  else console.log(chalk.green(`Deleted collection: ${slug}`));
}

async function memberAddAction(
  slug: string,
  org: string,
  opts: GlobalOpts & { position?: string },
): Promise<void> {
  const position = opts.position !== undefined ? Number(opts.position) : undefined;
  const result = await addCollectionMember(slug, { ...refToInput(org), position });
  if (opts.json) await writeJson(result);
  else
    console.log(
      chalk.green(`Added ${org} to ${slug}`) + chalk.dim(` (position ${result.position})`),
    );
}

async function memberSetAction(slug: string, orgList: string, opts: GlobalOpts): Promise<void> {
  const orgs = orgList
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((ref) => refToInput(ref));
  if (orgs.length === 0) {
    console.error(chalk.red("Provide at least one org (comma-separated org_… or slug)."));
    process.exit(1);
  }
  const result = await replaceCollectionMembers(slug, orgs);
  if (opts.json) await writeJson(result);
  else
    console.log(
      chalk.green(`Set ${result.members.length} members on ${slug}`) + chalk.dim(` (in order)`),
    );
}

async function memberRemoveAction(slug: string, org: string, opts: GlobalOpts): Promise<void> {
  await removeCollectionMember(slug, org);
  if (opts.json) await writeJson({ removed: org });
  else console.log(chalk.green(`Removed ${org} from ${slug}`));
}

export function registerCollectionCommand(program: Command) {
  const collection = program
    .command("collection")
    .description("Manage curated collections (cross-org playlists)");

  collection
    .command("list")
    .description("List collections")
    .option("--json", "Output as JSON")
    .action(listAction);

  collection
    .command("get")
    .description("Show a collection's detail and member orgs")
    .argument("<slug>", "Collection slug")
    .option("--json", "Output as JSON")
    .action(getAction);

  collection
    .command("create")
    .description("Create a collection")
    .argument("<name>", "Display name")
    .option("--slug <slug>", "Custom slug (defaults to name → kebab)")
    .option("--description <text>", "Optional description")
    .option("--json", "Output as JSON")
    .action(createAction);

  collection
    .command("update")
    .description("Update a collection's name, slug, or description")
    .argument("<slug>", "Current slug")
    .option("--name <name>", "New name")
    .option("--slug <slug>", "New slug (rotates the URL)")
    .option("--description <text>", "New description (pass empty string to clear)")
    .option("--json", "Output as JSON")
    .action(updateAction);

  collection
    .command("delete")
    .description("Delete a collection (cascade-removes membership)")
    .argument("<slug>", "Collection slug")
    .option("--json", "Output as JSON")
    .action(deleteAction);

  const members = collection.command("members").description("Manage collection membership");

  members
    .command("add")
    .description("Add an org to a collection")
    .argument("<slug>", "Collection slug")
    .argument("<org>", "Org id (org_…) or slug")
    .option("--position <n>", "Position (default 0)")
    .option("--json", "Output as JSON")
    .action(memberAddAction);

  members
    .command("set")
    .description("Replace full membership atomically (positions follow input order)")
    .argument("<slug>", "Collection slug")
    .argument("<orgs>", "Comma-separated org refs (org_… or slugs)")
    .option("--json", "Output as JSON")
    .action(memberSetAction);

  members
    .command("remove")
    .description("Remove an org from a collection")
    .argument("<slug>", "Collection slug")
    .argument("<org>", "Org id (org_…) or slug")
    .option("--json", "Output as JSON")
    .action(memberRemoveAction);
}
