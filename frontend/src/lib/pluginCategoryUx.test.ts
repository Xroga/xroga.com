import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  catalogPrimaryCategory,
  pluginFromCatalog,
  pluginSearchScore,
} from './pluginCatalog';
import type { XrogaConnectCatalogToolkit } from './xrogaConnect';

function toolkit(
  slug: string,
  name: string,
  description: string,
  categories: string[],
): XrogaConnectCatalogToolkit {
  return {
    slug,
    name,
    description,
    authSchemes: [],
    managedAuthSchemes: [],
    noAuth: true,
    categories: categories.map((category, index) => ({
      id: `cat-${index}`,
      name: category,
    })),
    triggersCount: 0,
    toolsCount: 12,
    deprecated: false,
  };
}

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

test('travel shelf excludes scheduling, maps, weather, analytics, and browser tools', () => {
  assert.equal(
    catalogPrimaryCategory(
      toolkit(
        'cal',
        'Cal',
        'Shareable booking pages, calendar syncing and availability management.',
        ['Travel'],
      ),
    ),
    'Booking & Scheduling',
  );
  assert.equal(
    catalogPrimaryCategory(
      toolkit('google_maps', 'Google Maps', 'Geocoding, directions and places.', ['Travel']),
    ),
    'Maps & Location',
  );
  assert.equal(
    catalogPrimaryCategory(
      toolkit(
        'calendly',
        'Calendly',
        'Appointment scheduling and automated meeting invitations.',
        ['Travel'],
      ),
    ),
    'Booking & Scheduling',
  );
  assert.equal(
    catalogPrimaryCategory(
      toolkit('weathermap', 'OpenWeatherMap', 'Weather forecasts and climate data.', ['Travel']),
    ),
    'Weather & Utilities',
  );
  assert.equal(
    catalogPrimaryCategory(
      toolkit(
        'microsoft_clarity',
        'Microsoft Clarity',
        'Heatmaps, session recordings and product analytics.',
        ['Business Intelligence'],
      ),
    ),
    'Data & Analytics',
  );
  assert.equal(
    catalogPrimaryCategory(
      toolkit(
        'browser_tool',
        'Browser Tool',
        'Automate browser research and web scraping.',
        ['Web Scraping'],
      ),
    ),
    'Web Search & Scraping',
  );
});

test('hotel and project apps have dedicated user-facing categories', () => {
  assert.equal(
    catalogPrimaryCategory(
      toolkit(
        'bookingcom',
        'Booking.com',
        'Search hotels, stays and accommodation.',
        ['Travel'],
      ),
    ),
    'Hotels & Stays',
  );
  assert.equal(
    catalogPrimaryCategory(
      toolkit(
        'asana',
        'Asana',
        'Project management, tasks and team work planning.',
        ['Project Management'],
      ),
    ),
    'Project Management',
  );
});

test('search ranks exact brands first while natural-language needs can match several apps', () => {
  const exact = pluginFromCatalog(
    toolkit('calendly', 'Calendly', 'Appointment scheduling and booking.', ['Scheduling & Booking']),
  );
  const calendar = pluginFromCatalog(
    toolkit('google_calendar', 'Google Calendar', 'Calendar events and schedules.', ['Productivity']),
  );
  const travel = pluginFromCatalog(
    toolkit('skyscanner', 'Skyscanner', 'Find flights and travel options.', ['Travel']),
  );

  assert.ok(pluginSearchScore(exact, 'calendly') > pluginSearchScore(calendar, 'calendly'));

  const need = 'book meeting';
  const exactNeed = pluginSearchScore(exact, need, new Set(['calendly', 'google_calendar']));
  const calendarNeed = pluginSearchScore(calendar, need, new Set(['calendly', 'google_calendar']));
  const travelNeed = pluginSearchScore(travel, need, new Set(['calendly', 'google_calendar']));

  assert.ok(exactNeed > travelNeed);
  assert.ok(calendarNeed > travelNeed);
});

test('directory stays category-first with compact previews and a complete All Apps escape hatch', () => {
  const marketplace = source(
    'frontend/src/components/integrations/PluginMarketplace.tsx',
  );

  assert.match(marketplace, /title: 'Databases'/);
  assert.match(marketplace, /title: 'Deployment & Hosting'/);
  assert.match(marketplace, /title: 'Marketing & Growth'/);
  assert.match(marketplace, /title: 'Booking & Scheduling'/);
  assert.match(marketplace, /title: 'Hotels & Stays'/);
  assert.match(marketplace, /title: 'Project Management'/);
  assert.match(marketplace, /title: 'All Apps'/);
  assert.match(marketplace, /const CATEGORY_PREVIEW_LIMIT = 6/);
  assert.match(marketplace, /const CATEGORY_EXPAND_STEP = 10/);
  assert.match(marketplace, /Show 10 more/);
});

test('global and per-Plugin permission controls remain available', () => {
  const marketplace = source(
    'frontend/src/components/integrations/PluginMarketplace.tsx',
  );
  const detail = source(
    'frontend/src/components/integrations/PluginDetail.tsx',
  );

  assert.match(marketplace, /PluginPermissionControl buttonOnly showFullAccessShortcut/);
  assert.match(detail, /toolkit={permissionToolkit}/);
  assert.match(detail, /Authorization supported/);
  assert.match(detail, /Authorization used/);
  assert.match(detail, /Privacy policy/);
  assert.match(detail, /Terms of service/);
});
