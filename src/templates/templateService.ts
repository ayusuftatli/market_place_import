import YAML from "yaml";
import type { DataStore } from "../shared/dataStore";
import { badRequest, notFound } from "../shared/errors";
import type {
  MarketplaceTemplate,
  TemplateDetail,
  TemplateSummary,
} from "../shared/types";
import {
  getBuiltInTemplate,
  listBuiltInTemplates,
  summarizeTemplates,
  toTemplateDetail,
} from "./builtInTemplates";
import { parseTemplatePayload } from "./templateSchema";

export async function listTemplates(store: DataStore): Promise<TemplateSummary[]> {
  const overrides = await store.templateOverrides.list();
  return summarizeTemplates(
    listBuiltInTemplates().map((template) =>
      applyOverride(template, overrides.get(template.key) ?? null),
    ),
    new Set(overrides.keys()),
  );
}

export async function getTemplateDetail(
  store: DataStore,
  key: string,
): Promise<TemplateDetail> {
  const builtIn = getBuiltInTemplate(key);
  if (!builtIn) {
    throw notFound("Template not found");
  }

  const override = await store.templateOverrides.findByKey(key);
  return toTemplateDetail(
    override ? structuredClone(override.template) : builtIn,
    builtIn,
    override
      ? {
          format: override.format,
          content: override.content,
          templateVersion: override.templateVersion,
          updatedAt: override.updatedAt,
        }
      : null,
  );
}

export async function resolveTemplate(
  store: DataStore,
  key: string,
): Promise<MarketplaceTemplate> {
  const builtIn = getBuiltInTemplate(key);
  if (!builtIn) {
    throw notFound("Template not found");
  }

  const override = await store.templateOverrides.findByKey(key);
  return override ? structuredClone(override.template) : builtIn;
}

export async function upsertTemplateOverride(
  store: DataStore,
  key: string,
  input: {
    format?: unknown;
    content?: unknown;
  },
): Promise<TemplateDetail> {
  const builtIn = getBuiltInTemplate(key);
  if (!builtIn) {
    throw notFound("Template not found");
  }

  const parsed = parseTemplatePayload(input);
  if (parsed.template.key !== key) {
    throw badRequest(`Template key must remain '${key}'`);
  }

  const existing = await store.templateOverrides.findByKey(key);
  const nextVersion = existing
    ? existing.templateVersion + 1
    : builtIn.templateVersion + 1;
  const template = {
    ...parsed.template,
    templateVersion: nextVersion,
  };
  const content =
    parsed.format === "yaml"
      ? YAML.stringify(template)
      : JSON.stringify(template, null, 2);

  const override = await store.templateOverrides.upsert({
    key,
    format: parsed.format,
    content,
    template,
    templateVersion: nextVersion,
  });

  return toTemplateDetail(template, builtIn, {
    format: override.format,
    content: override.content,
    templateVersion: override.templateVersion,
    updatedAt: override.updatedAt,
  });
}

export async function deleteTemplateOverride(
  store: DataStore,
  key: string,
): Promise<TemplateDetail> {
  const builtIn = getBuiltInTemplate(key);
  if (!builtIn) {
    throw notFound("Template not found");
  }

  await store.templateOverrides.deleteByKey(key);
  return toTemplateDetail(builtIn, builtIn, null);
}

function applyOverride(
  template: MarketplaceTemplate,
  override: null | { template: MarketplaceTemplate },
): MarketplaceTemplate {
  return override ? structuredClone(override.template) : template;
}
