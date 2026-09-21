import assert from 'node:assert/strict';

import test from 'node:test';

import {
  createStaticWebBootstrap,
  staticWebBrandFromPrompt,
} from './staticWebBootstrap.js';

test(
  'extracts a quoted landing-page name',
  () => {
    assert.equal(
      staticWebBrandFromPrompt(
        'Build a landing page named "Jhon Mix".',
      ),
      'Jhon Mix',
    );
  },
);

test(
  'extracts a name-is landing-page name',
  () => {
    assert.equal(
      staticWebBrandFromPrompt(
        'build a landing page website name is Jhon Mix.',
      ),
      'Jhon Mix',
    );
  },
);

test(
  'greenfield static bootstrap is dependency free',
  () => {
    const files =
      createStaticWebBootstrap(
        'Build a landing page named "Jhon Mix".',
      );

    const paths =
      files.map(
        (
          file,
        ) =>
          file.path,
      );

    assert.deepEqual(
      paths,
      [
        'index.html',
        'styles.css',
        'script.js',
      ],
    );

    assert.equal(
      paths.includes(
        'package.json',
      ),
      false,
    );

    assert.equal(
      paths.includes(
        'next.config.mjs',
      ),
      false,
    );
  },
);

test(
  'bootstrap contains the requested brand and real browser assets',
  () => {
    const files =
      createStaticWebBootstrap(
        'Build a landing page named "Jhon Mix".',
      );

    const index =
      files.find(
        (
          file,
        ) =>
          file.path ===
          'index.html',
      );

    assert.ok(
      index,
    );

    assert.match(
      index.content,
      /Jhon Mix/,
    );

    assert.match(
      index.content,
      /href="styles\.css"/,
    );

    assert.match(
      index.content,
      /src="script\.js"/,
    );

    assert.match(
      index.content,
      /id="services"/,
    );

    assert.match(
      index.content,
      /id="work"/,
    );

    assert.match(
      index.content,
      /id="about"/,
    );

    assert.match(
      index.content,
      /id="contact"/,
    );
  },
);
