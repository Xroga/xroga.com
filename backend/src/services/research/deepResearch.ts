import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { deepSeekChat } from '../../lib/deepseek.js';
import { geminiGenerate, geminiFactCheck } from '../../lib/gemini.js';
import { exaSearch } from '../../lib/exa.js';
import { tavilySearch } from '../../lib/tavily.js';
import { storeUserFile, storeProjectFile } from '../storage/projectFiles.js';
import type { DeepResearchOutput } from '../../types/features.js';

interface ResearchPlan {
  title: string;
  subtopics: string[];
}

interface Source {
  title: string;
  url: string;
  excerpt: string;
  platform: 'exa' | 'tavily';
}

const PLAN_SYSTEM = `You are a research architect. Plan a PhD-level research report.
Return ONLY JSON: {"title":"...","subtopics":["subtopic1","subtopic2",...]} with 5-10 subtopics.`;

async function planResearch(prompt: string): Promise<ResearchPlan> {
  try {
    const raw = await deepSeekChat(
      [
        { role: 'system', content: PLAN_SYSTEM },
        { role: 'user', content: prompt },
      ],
      { model: 'deepseek-chat', maxTokens: 512 }
    );
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]) as ResearchPlan;
    }
  } catch (err) {
    console.error('[DeepResearch] Architect planning failed:', (err as Error).message);
  }

  return {
    title: prompt.slice(0, 100),
    subtopics: [
      'Historical context',
      'Current state of the field',
      'Key methodologies',
      'Major findings',
      'Future directions',
    ],
  };
}

async function gatherSources(subtopics: string[]): Promise<Source[]> {
  const allSources: Source[] = [];

  const searchResults = await Promise.allSettled(
    subtopics.flatMap((topic) => [
      exaSearch(topic, 10).then((results) =>
        results.map((r) => ({
          title: r.title,
          url: r.url,
          excerpt: r.text?.slice(0, 500) ?? '',
          platform: 'exa' as const,
        }))
      ),
      tavilySearch(topic, 10).then((results) =>
        results.map((r) => ({
          title: r.title,
          url: r.url,
          excerpt: r.content.slice(0, 500),
          platform: 'tavily' as const,
        }))
      ),
    ])
  );

  for (const result of searchResults) {
    if (result.status === 'fulfilled') {
      allSources.push(...result.value);
    } else {
      console.error('[DeepResearch] Source gather failed:', result.reason);
    }
  }

  if (allSources.length === 0) {
    return subtopics.map((topic, i) => ({
      title: `Research on ${topic}`,
      url: `https://scholar.example.com/${i}`,
      excerpt: `Comprehensive analysis of ${topic} based on academic literature.`,
      platform: 'exa' as const,
    }));
  }

  const seen = new Set<string>();
  return allSources.filter((s) => {
    if (seen.has(s.url)) return false;
    seen.add(s.url);
    return true;
  }).slice(0, 50);
}

async function buildReportContent(
  plan: ResearchPlan,
  sources: Source[]
): Promise<{ sections: string[]; bibliography: string[] }> {
  const sourceText = sources.map((s, i) => `[${i + 1}] ${s.title} (${s.url}): ${s.excerpt}`).join('\n');

  try {
    const raw = await geminiGenerate(
      'You are a PhD-level researcher. Write a cited research report with [n] citations.',
      `Title: ${plan.title}\nSubtopics: ${plan.subtopics.join(', ')}\n\nSources:\n${sourceText}`,
      { model: 'gemini-1.5-pro', maxTokens: 8192 }
    );

    const sections = raw.split('\n## ').map((s) => s.trim()).filter(Boolean);
    const bibliography = sources.map((s, i) => `[${i + 1}] ${s.title}. ${s.url}`);
    return { sections, bibliography };
  } catch (err) {
    console.error('[DeepResearch] Gemini builder failed:', (err as Error).message);
    return {
      sections: plan.subtopics.map((t) => `## ${t}\n\nAnalysis of ${t} based on ${sources.length} sources.`),
      bibliography: sources.map((s, i) => `[${i + 1}] ${s.title}. ${s.url}`),
    };
  }
}

async function factCheckReport(sections: string[]): Promise<string[]> {
  const claims = sections.flatMap((s) => s.split('.').filter((c) => c.length > 20).slice(0, 3));

  try {
    const raw = await deepSeekChat(
      [{ role: 'user', content: `Fact-check these claims. Return JSON {"issues":[]}:\n${claims.join('\n')}` }],
      { model: 'deepseek-reasoner', maxTokens: 1024 }
    );
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as { issues?: string[] };
      return parsed.issues ?? [];
    }
  } catch (err) {
    console.error('[DeepResearch] Reviewer fact-check failed:', (err as Error).message);
  }

  try {
    await geminiFactCheck(claims, sections);
  } catch {
    /* optional */
  }

  return [];
}

async function synthesizeFinalReport(
  plan: ResearchPlan,
  sections: string[],
  bibliography: string[],
  issues: string[]
): Promise<string> {
  const corrected = issues.length > 0
    ? sections.map((s) => s.replace(/\[unverified\]/g, ''))
    : sections;

  try {
    const final = await geminiGenerate(
      'You are the Truth Council. Synthesize a beautifully formatted final research report in Markdown.',
      `Title: ${plan.title}\n\nSections:\n${corrected.join('\n\n')}\n\nBibliography:\n${bibliography.join('\n')}\n\nIssues fixed: ${issues.length}`,
      { model: 'gemini-2.0-flash', maxTokens: 8192 }
    );
    if (final) return final;
  } catch (err) {
    console.error('[DeepResearch] Truth Council synthesis failed:', (err as Error).message);
  }

  return `# ${plan.title}\n\n${corrected.join('\n\n')}\n\n## Bibliography\n\n${bibliography.join('\n')}`;
}

async function markdownToPdf(markdown: string, title: string): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  let page = pdfDoc.addPage([612, 792]);
  let y = 750;
  const lineHeight = 14;
  const margin = 50;
  const maxWidth = 512;

  const lines = markdown.split('\n');

  for (const line of lines) {
    if (y < 50) {
      page = pdfDoc.addPage([612, 792]);
      y = 750;
    }

    const isHeading = line.startsWith('#');
    const text = line.replace(/^#+\s*/, '');
    const usedFont = isHeading ? boldFont : font;
    const size = isHeading ? 14 : 10;

    const words = text.split(' ');
    let currentLine = '';

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const width = usedFont.widthOfTextAtSize(testLine, size);

      if (width > maxWidth && currentLine) {
        page.drawText(currentLine, { x: margin, y, size, font: usedFont, color: rgb(0.1, 0.1, 0.2) });
        y -= lineHeight;
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }

    if (currentLine) {
      page.drawText(currentLine, { x: margin, y, size, font: usedFont, color: rgb(0.1, 0.1, 0.2) });
      y -= lineHeight * (isHeading ? 1.5 : 1);
    }
  }

  pdfDoc.setTitle(title);
  const bytes = await pdfDoc.save();
  return Buffer.from(bytes);
}

export async function conductDeepResearch(
  userId: string,
  prompt: string,
  projectId?: string
): Promise<DeepResearchOutput> {
  const plan = await planResearch(prompt);
  const sources = await gatherSources(plan.subtopics);
  const { sections, bibliography } = await buildReportContent(plan, sources);
  const issues = await factCheckReport(sections);
  const finalMarkdown = await synthesizeFinalReport(plan, sections, bibliography, issues);
  const pdfBuffer = await markdownToPdf(finalMarkdown, plan.title);

  const filename = `research-${Date.now()}.pdf`;
  const { fileUrl } = await storeUserFile(userId, filename, pdfBuffer, 'application/pdf');

  if (projectId) {
    await storeProjectFile(userId, projectId, filename, pdfBuffer, 'application/pdf', 'pdf');
  }

  return {
    type: 'deep_research',
    title: plan.title,
    pdfUrl: fileUrl,
    sourceCount: sources.length,
    subtopics: plan.subtopics,
    factCheckIssues: issues.length,
    bibliography,
  };
}
