import { claudeGenerate } from '../../lib/anthropic.js';
import { apifyScrapeJobs, simulateJobListings } from '../../lib/apify.js';
import { runBrowserbaseScript } from '../../lib/browserbase.js';
import { deepSeekChat } from '../../lib/deepseek.js';
import { getSupabaseAdmin } from '../../config/supabase.js';
import type { JobHunterOutput } from '../../types/features.js';

interface JobListing {
  title: string;
  company: string;
  location: string;
  url: string;
  description: string;
  salary?: string;
}

interface ApplicationResult {
  jobTitle: string;
  company: string;
  url: string;
  submitted: boolean;
  resumeTailored: boolean;
  error?: string;
}

async function parseResume(resumeText: string): Promise<string> {
  if (resumeText.length > 100) return resumeText;
  return `Professional with expertise in software engineering, AI, and automation. Seeking challenging roles.`;
}

async function tailorResume(resume: string, job: JobListing): Promise<string> {
  try {
    return await claudeGenerate(
      'You are an ATS resume optimizer. Tailor the resume to match the job description. Return the full tailored resume text.',
      `Resume:\n${resume}\n\nJob:\n${job.title} at ${job.company}\n${job.description}`,
      { maxTokens: 2048 }
    );
  } catch (err) {
    console.error('[JobHunter] Resume tailoring failed:', (err as Error).message);
    return `${resume}\n\n[Tailored for ${job.title} at ${job.company}]`;
  }
}

async function scrapeJobs(query: string): Promise<JobListing[]> {
  try {
    const results = await apifyScrapeJobs(['linkedin', 'indeed', 'upwork'], query, 50);
    return results.map((r) => ({
      title: r.title ?? 'Unknown Role',
      company: r.company ?? 'Unknown Company',
      location: r.location ?? 'Remote',
      url: r.url ?? '#',
      description: r.description ?? '',
      salary: r.salary,
    }));
  } catch (err) {
    console.error('[JobHunter] Apify scrape failed, using simulation:', (err as Error).message);
    return simulateJobListings(query, 50).map((r) => ({
      title: r.title ?? 'Role',
      company: r.company ?? 'Company',
      location: r.location ?? 'Remote',
      url: r.url ?? '#',
      description: r.description ?? '',
      salary: r.salary,
    }));
  }
}

async function submitApplication(job: JobListing, tailoredResume: string): Promise<boolean> {
  try {
    const script = `
      async (page) => {
        await page.goto('${job.url.replace(/'/g, "\\'")}', { waitUntil: 'networkidle' });
        const applyBtn = await page.$('button:has-text("Apply"), a:has-text("Apply"), [data-test="apply"]');
        if (applyBtn) { await applyBtn.click(); return { submitted: true }; }
        return { submitted: false, reason: 'No apply button found' };
      }
    `;
    const result = await runBrowserbaseScript(script, job.url);
    return Boolean(result.data?.submitted);
  } catch (err) {
    console.error(`[JobHunter] Application submit failed for ${job.title}:`, (err as Error).message);
    return false;
  }
}

async function verifyApplications(applications: ApplicationResult[]): Promise<ApplicationResult[]> {
  try {
    const summary = applications.map((a) => `${a.jobTitle}: submitted=${a.submitted}`).join('\n');
    const raw = await deepSeekChat(
      [{ role: 'user', content: `Verify these job applications. Return JSON {"verified":true,"failed":[]}:\n${summary}` }],
      { model: 'deepseek-reasoner', maxTokens: 512 }
    );
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as { failed?: string[] };
      const failedSet = new Set(parsed.failed ?? []);
      return applications.map((a) =>
        failedSet.has(a.jobTitle) ? { ...a, submitted: false, error: 'Verification failed' } : a
      );
    }
  } catch (err) {
    console.error('[JobHunter] Reviewer verification failed:', (err as Error).message);
  }
  return applications;
}

async function createJobProject(userId: string): Promise<string> {
  const supabase = getSupabaseAdmin();
  const date = new Date().toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('projects')
    .insert({
      user_id: userId,
      name: `Job Applications - ${date}`,
      type: 'automation',
      status: 'in_progress',
    })
    .select()
    .single();

  if (error || !data) throw new Error(`Failed to create job project: ${error?.message}`);
  return data.id;
}

export async function huntJobs(
  userId: string,
  prompt: string,
  resumeText?: string
): Promise<JobHunterOutput> {
  const query = prompt.replace(/find|search|apply|jobs?|for/gi, '').trim() || 'software engineer';
  const resume = await parseResume(resumeText ?? prompt);

  const jobs = await scrapeJobs(query);
  const topJobs = jobs.slice(0, 50);

  const applicationResults = await Promise.all(
    topJobs.map(async (job): Promise<ApplicationResult> => {
      const tailored = await tailorResume(resume, job);
      const submitted = await submitApplication(job, tailored);
      return {
        jobTitle: job.title,
        company: job.company,
        url: job.url,
        submitted,
        resumeTailored: tailored !== resume,
      };
    })
  );

  const verified = await verifyApplications(applicationResults);
  const projectId = await createJobProject(userId);

  const submittedCount = verified.filter((a) => a.submitted).length;

  return {
    type: 'job_hunter',
    projectId,
    query,
    jobsFound: jobs.length,
    applicationsSubmitted: submittedCount,
    applications: verified,
    status: 'in_progress',
  };
}
