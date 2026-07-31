/**
 * Turns guided-question answers into (a) a natural prompt the user can read and
 * edit, and (b) the structured context the workspace build needs.
 *
 * The visible prompt stays plain English. Identifiers live in the structured
 * payload so the user is never shown implementation metadata they did not ask for.
 */

import type { ShowcaseTemplate } from './registry';

export type GuidedAnswers = Record<string, string>;

export interface ShowcaseBuildCommand {
  templateId: string;
  templateVersion: string;
  templateName: string;
  templateSlug: string;
  /** Set once a user-owned project exists. */
  projectId?: string;
  projectName: string;
  /** The editable, human-readable instruction shown in the workspace. */
  visiblePrompt: string;
  answers: GuidedAnswers;
  preserveFeatures: readonly string[];
  editableAreas: readonly string[];
  requiredValidation: readonly string[];
  /** Where the export should land, when the user has chosen a repository. */
  github?: {
    repoFullName: string;
    baseBranch?: string;
    targetDirectory?: string;
  };
}

function clean(value: string | undefined): string {
  return (value ?? '').trim().replace(/\s+/g, ' ');
}

/** Derives a usable project name without forcing the user to supply one. */
export function deriveProjectName(template: ShowcaseTemplate, answers: GuidedAnswers): string {
  const brand = clean(answers.brandName);
  if (brand) return brand.slice(0, 80);
  return `${template.name} project`;
}

/**
 * Builds the visible prompt. Only includes sentences the answers actually
 * support — an unanswered question must never turn into a fabricated claim.
 */
export function buildVisiblePrompt(template: ShowcaseTemplate, answers: GuidedAnswers): string {
  const brand = clean(answers.brandName);
  const parts: string[] = [
    brand
      ? `Customize the ${template.name} for ${brand}.`
      : `Customize the ${template.name} for my project.`,
  ];

  const purpose = clean(answers.purpose) || clean(answers.problem) || clean(answers.bookedThing) || clean(answers.propertyType);
  if (purpose) parts.push(`Purpose: ${purpose}`);

  const style = clean(answers.visualStyle);
  const colors = clean(answers.colors);
  if (style && colors) parts.push(`Use a ${style.toLowerCase()} look with a ${colors} palette.`);
  else if (style) parts.push(`Use a ${style.toLowerCase()} look.`);
  else if (colors) parts.push(`Use a ${colors} palette.`);

  const fonts = clean(answers.fonts);
  if (fonts) parts.push(`Typography: ${fonts}.`);

  const cta = clean(answers.primaryCta);
  if (cta) parts.push(`The main call to action is "${cta}".`);

  const pages = clean(answers.pages) || clean(answers.screens);
  if (pages) parts.push(`Include: ${pages}.`);

  const locations = clean(answers.locations);
  if (locations) parts.push(`Cover these locations: ${locations}.`);

  const users = clean(answers.users);
  if (users) parts.push(`Primary users: ${users}.`);

  const aiActions = clean(answers.aiActions);
  if (aiActions) parts.push(`AI actions to offer: ${aiActions}.`);

  const goal = clean(answers.goal);
  if (goal) parts.push(`Game goal: ${goal}.`);

  const theme = clean(answers.theme);
  if (theme) parts.push(`Visual theme: ${theme}.`);

  const integrations = clean(answers.integrations);
  if (integrations) parts.push(`Add these integrations: ${integrations}.`);

  const inquiry = clean(answers.inquiryMethod);
  if (inquiry) parts.push(`Make ${inquiry} the most prominent enquiry method.`);

  const payments = clean(answers.payments);
  if (payments && !/^not yet$/i.test(payments)) parts.push(`Payments: ${payments}.`);

  const signIn = clean(answers.signIn);
  if (signIn) parts.push(`Sign-in: ${signIn}.`);

  const availability = clean(answers.availability);
  if (availability) parts.push(`Availability rules: ${availability}.`);

  const difficulty = clean(answers.difficulty);
  if (difficulty) parts.push(`Difficulty: ${difficulty}.`);

  parts.push(`Keep working: ${template.capabilities.join(', ')}.`);

  const extra = clean(answers.instructions);
  if (extra) parts.push(extra);

  return parts.join(' ');
}

export function buildShowcaseCommand(opts: {
  template: ShowcaseTemplate;
  answers: GuidedAnswers;
  projectId?: string;
  github?: ShowcaseBuildCommand['github'];
}): ShowcaseBuildCommand {
  const { template, answers, projectId, github } = opts;
  return {
    templateId: template.id,
    templateVersion: template.templateVersion,
    templateName: template.name,
    templateSlug: template.slug,
    projectId,
    projectName: deriveProjectName(template, answers),
    visiblePrompt: buildVisiblePrompt(template, answers),
    answers,
    preserveFeatures: template.capabilities,
    editableAreas: template.editableAreas,
    requiredValidation: template.requiredValidation,
    github,
  };
}

/** Branch name for an export. Slug and id are both already server-validated. */
export function exportBranchName(templateSlug: string, shortProjectId: string): string {
  const safeSlug = templateSlug.replace(/[^a-z0-9-]/gi, '').toLowerCase().slice(0, 40);
  const safeId = shortProjectId.replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 8);
  return `xroga/template-${safeSlug}-${safeId}`;
}
