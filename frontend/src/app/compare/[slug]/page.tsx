import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { EditorialPage } from '@/components/seo/EditorialPage';

import {
  XrogaVsLovablePage,
  XROGA_VS_LOVABLE_DESCRIPTION,
  XROGA_VS_LOVABLE_OG_IMAGE,
  XROGA_VS_LOVABLE_PATH,
  XROGA_VS_LOVABLE_TITLE,
} from '@/components/seo/XrogaVsLovablePage';

import {
  XrogaVsBoltPage,
  XROGA_VS_BOLT_DESCRIPTION,
  XROGA_VS_BOLT_OG_IMAGE,
  XROGA_VS_BOLT_PATH,
  XROGA_VS_BOLT_TITLE,
} from '@/components/seo/XrogaVsBoltPage';

import {
  COMPARISONS,
} from '@/lib/seoGrowthContent';

import {
  buildMetadata,
  SITE_NAME,
  SITE_URL,
} from '@/lib/seo';


const LOVABLE_SLUG =
  'xroga-vs-lovable';

const BOLT_SLUG =
  'xroga-vs-bolt';


export function generateStaticParams() {
  return COMPARISONS.map(
    ({
      slug,
    }) => ({
      slug,
    }),
  );
}


export async function generateMetadata({
  params,
}: {
  params:
    Promise<{
      slug: string;
    }>;
}): Promise<Metadata> {

  const {
    slug,
  } =
    await params;


  if (
    slug ===
    LOVABLE_SLUG
  ) {

    const base =
      buildMetadata({
        title:
          XROGA_VS_LOVABLE_TITLE,

        description:
          XROGA_VS_LOVABLE_DESCRIPTION,

        path:
          XROGA_VS_LOVABLE_PATH,

        keywords: [
          'Xroga vs Lovable',
          'Xroga vs Lovable 2026',
          'Lovable alternative',
          'Lovable existing repository',
          'can Lovable import GitHub repository',
          'Lovable GitHub integration',
          'Lovable code ownership',
          'Lovable pricing 2026',
          'AI app builder existing repository',
          'AI app builder with GitHub',
          'Lovable vs Xroga',
        ],
      });


    const image =
      `${SITE_URL}${XROGA_VS_LOVABLE_OG_IMAGE}`;


    return {
      ...base,

      openGraph: {
        type:
          'article',

        locale:
          'en_US',

        url:
          `${SITE_URL}${XROGA_VS_LOVABLE_PATH}`,

        siteName:
          SITE_NAME,

        title:
          XROGA_VS_LOVABLE_TITLE,

        description:
          XROGA_VS_LOVABLE_DESCRIPTION,

        publishedTime:
          '2026-09-09',

        modifiedTime:
          '2026-09-23',

        images: [
          {
            url:
              image,

            width:
              1200,

            height:
              630,

            alt:
              'Xroga vs Lovable 2026 AI app builder comparison',
          },
        ],
      },

      twitter: {
        card:
          'summary_large_image',

        title:
          XROGA_VS_LOVABLE_TITLE,

        description:
          XROGA_VS_LOVABLE_DESCRIPTION,

        images: [
          image,
        ],
      },
    };
  }


  if (
    slug ===
    BOLT_SLUG
  ) {

    const base =
      buildMetadata({
        title:
          XROGA_VS_BOLT_TITLE,

        description:
          XROGA_VS_BOLT_DESCRIPTION,

        path:
          XROGA_VS_BOLT_PATH,

        keywords: [
          'Xroga vs Bolt.new',
          'Xroga vs Bolt',
          'Bolt vs Xroga',
          'Bolt.new alternative',
          'Bolt alternative 2026',
          'Bolt AI alternative',
          'Bolt AI app builder alternative',
          'Bolt.new review 2026',
          'AI app builder comparison',
          'best AI app builder 2026',
          'AI app builder for non technical founders',
          'AI app builder for startups',
          'AI app builder for businesses',
          'no code AI app builder',
          'vibe coding tools',
          'browser AI app builder',
          'AI coding agent existing repository',
          'AI app builder existing GitHub repo',
          'AI app builder with web research',
          'AI builder with browser testing',
          'AI app builder with integrations',
          'Bolt mobile browser alternative',
          'Bolt Python alternative',
          'Bolt PHP alternative',
        ],
      });


    const image =
      `${SITE_URL}${XROGA_VS_BOLT_OG_IMAGE}`;


    return {
      ...base,

      openGraph: {
        type:
          'article',

        locale:
          'en_US',

        url:
          `${SITE_URL}${XROGA_VS_BOLT_PATH}`,

        siteName:
          SITE_NAME,

        title:
          XROGA_VS_BOLT_TITLE,

        description:
          XROGA_VS_BOLT_DESCRIPTION,

        publishedTime:
          '2026-09-23',

        modifiedTime:
          '2026-09-23',

        images: [
          {
            url:
              image,

            width:
              1672,

            height:
              941,

            alt:
              'Xroga vs Bolt.new 2026 AI app builder comparison',
          },
        ],
      },

      twitter: {
        card:
          'summary_large_image',

        title:
          XROGA_VS_BOLT_TITLE,

        description:
          XROGA_VS_BOLT_DESCRIPTION,

        images: [
          image,
        ],
      },
    };
  }


  const page =
    COMPARISONS.find(
      (item) =>
        item.slug ===
        slug,
    );


  if (
    !page
  ) {
    return {};
  }


  return buildMetadata({
    title:
      page.title,

    description:
      page.description,

    path:
      `/compare/${slug}`,

    keywords: [
      `Xroga vs ${page.competitor}`,
      `${page.competitor} alternative`,
    ],
  });
}


export default async function Comparison({
  params,
}: {
  params:
    Promise<{
      slug: string;
    }>;
}) {

  const {
    slug,
  } =
    await params;


  if (
    slug ===
    LOVABLE_SLUG
  ) {
    return (
      <XrogaVsLovablePage />
    );
  }


  if (
    slug ===
    BOLT_SLUG
  ) {
    return (
      <XrogaVsBoltPage />
    );
  }


  const page =
    COMPARISONS.find(
      (item) =>
        item.slug ===
        slug,
    );


  if (
    !page
  ) {
    notFound();
  }


  return (
    <EditorialPage
      path={
        `/compare/${slug}`
      }

      title={
        page.title
      }

      description={
        page.description
      }

      eyebrow="Product comparison"

      intro={
        page.summary
      }

      updated={
        page.lastVerified
      }

      note="This is a fit comparison, not a universal ranking. Competitor facts come from the linked official documentation; Xroga statements describe the current product."

      breadcrumbs={[
        {
          label:
            'Compare',

          href:
            '/compare',
        },

        {
          label:
            `Xroga vs ${page.competitor}`,

          href:
            `/compare/${slug}`,
        },
      ]}

      sources={
        page.sources
      }

      related={[
        '/compare',
        '/ai-app-builder',
        '/pricing',
      ]}

      sections={[
        {
          heading:
            `When ${page.competitor} may be the better fit`,

          paragraphs: [
            page.bestFor,
          ],
        },

        {
          heading:
            'What the official documentation confirms',

          paragraphs: [
            'The following points are deliberately limited to statements documented by the vendor.',
          ],

          bullets:
            page.facts,
        },

        {
          heading:
            'How Xroga approaches the work',

          paragraphs: [
            page.xrogaDifference,
          ],
        },

        {
          heading:
            'Questions to decide with',

          paragraphs: [
            'Use a representative project and answer these before choosing a platform.',
          ],

          bullets:
            page.decisionPoints,
        },

        {
          heading:
            'Run a fair evaluation',

          paragraphs: [
            `Give Xroga and ${page.competitor} the same bounded task from a representative project. Compare the changed code, required intervention, checks, failure reporting, ownership, and the evidence returned after deployment. Do not treat a marketing demo as an independent test.`,
          ],
        },
      ]}
    />
  );
}
