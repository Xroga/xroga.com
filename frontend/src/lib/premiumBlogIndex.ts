import type { GuidePage } from './seoGrowthContent';
import { premiumReplitAlternatives } from './premiumBlogs/replit-alternatives';
import { premiumBase44Alternatives } from './premiumBlogs/base44-alternatives';
import { premiumAiCodingToolsExistingGithubRepositories } from './premiumBlogs/ai-coding-tools-existing-github-repositories';
import { premiumBuildSecureClientPortalWithAi } from './premiumBlogs/build-secure-client-portal-with-ai';
import { premiumTurnSpreadsheetIntoWebAppWithAi } from './premiumBlogs/turn-spreadsheet-into-web-app-with-ai';
import { premiumAiAppHostingCosts } from './premiumBlogs/ai-app-hosting-costs';
import { premiumAiModifyExistingWebsite } from './premiumBlogs/ai-modify-existing-website';
import { premiumAiAppPreviewWorksProductionFails } from './premiumBlogs/ai-app-preview-works-production-fails';
import { premiumSupabaseLoginFailsAfterDeployment } from './premiumBlogs/supabase-login-fails-after-deployment';
import { premiumSupabaseRlsAiBuiltApps } from './premiumBlogs/supabase-rls-ai-built-apps';

/** Each authored article has its own source file and reuses the current canonical route. */
const sourceArticles: GuidePage[] = [premiumReplitAlternatives, premiumBase44Alternatives, premiumAiCodingToolsExistingGithubRepositories, premiumBuildSecureClientPortalWithAi, premiumTurnSpreadsheetIntoWebAppWithAi, premiumAiAppHostingCosts, premiumAiModifyExistingWebsite, premiumAiAppPreviewWorksProductionFails, premiumSupabaseLoginFailsAfterDeployment, premiumSupabaseRlsAiBuiltApps];
export const PREMIUM_BLOG_ARTICLES: GuidePage[] = sourceArticles.map((article) => ({
  ...article,
  sections: article.sections.map((section, index) => index === 4 ? {
    ...section,
    image: { src: `/blog-visuals/${article.slug}-workflow.svg`, alt: `Three-stage editorial workflow for ${article.title}`, caption: 'Original educational workflow illustration. Not a screenshot of a tested product.' },
  } : section),
}));
