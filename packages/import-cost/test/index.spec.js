const fs = require('fs');
const path = require('path');
const { expect } = require('chai');
const { importCost: runner, cleanup, Lang } = require('../src/index.js');
const { clearSizeCache, cacheFileName } = require('../src/package-info.js');
const { DebounceError } = require('../src/debounce-promise.js');

const DEFAULT_CONFIG = {
  concurrent: false,
  maxCallTime: Infinity,
};

function fixture(fileName) {
  return path.join(__dirname, 'fixtures', fileName);
}

function whenDone(emitter) {
  return new Promise((resolve, reject) => {
    let start;
    const calculated = [];
    emitter.on('start', packages => {
      expect(start).to.equal(undefined);
      start = packages;
    });
    emitter.on('calculated', packages => calculated.push(packages));
    emitter.on('done', packages => {
      expect(start.length).to.equal(packages.length);
      expect(calculated.length).to.equal(packages.length);
      resolve(packages);
    });
    emitter.on('error', reject);
  });
}

const LANGUAGES = {
  ts: Lang.TYPESCRIPT,
  js: Lang.JAVASCRIPT,
  jsx: Lang.JAVASCRIPT,
  vue: Lang.VUE,
  svelte: Lang.SVELTE,
};

function importCost(fileName, language = null, config = DEFAULT_CONFIG) {
  if (!language) language = LANGUAGES[fileName.split('.').pop()];
  return runner(fileName, fs.readFileSync(fileName, 'utf-8'), language, config);
}

function sizeOf(packages, name) {
  return packages.filter(x => x.name === name).shift().size;
}

function gzipOf(packages, name) {
  return packages.filter(x => x.name === name).shift().gzip;
}

function getPackages(fileName) {
  return whenDone(importCost(fixture(fileName)));
}

async function verify(
  fileName,
  pkg = 'chai',
  minSize = 10000,
  maxSize = 15000,
  gzipLowBound = 0.01,
  gzipHighBound = 0.8,
) {
  const packages = await getPackages(fileName);
  const size = sizeOf(packages, pkg);
  expect(size).to.be.within(minSize, maxSize);
  expect(gzipOf(packages, pkg)).to.be.within(
    size * gzipLowBound,
    size * gzipHighBound,
  );
}

async function timed(fn) {
  const time = process.hrtime();
  await fn();
  const diff = process.hrtime(time);
  return Math.round((diff[0] * 1e9 + diff[1]) / 1e6);
}

describe('importCost', () => {
  beforeEach(() => clearSizeCache());
  afterEach(() => {
    clearSizeCache();
    cleanup();
  });

  describe('imports', () => {
    it('calculates size of require in javascript', () => {
      return verify('require.js');
    });
    it('calculates size of require in typescript', () => {
      return verify('require.ts');
    });
    it('calculates size of template require in javascript', () => {
      return verify('require-template.js');
    });
    it('calculates size of template require in typescript', () => {
      return verify('require-template.ts');
    });
    it('calculates size of import in javascript', () => {
      return verify('import.js');
    });
    it('calculates size of import in typescript', () => {
      return verify('import.ts');
    });
    it('calculate size of imports in a file containing typescript features not supported by babel', () => {
      return verify('typescript-not-supported-features.ts');
    });
    it('calculates size of aliased import in javascript', () => {
      return verify('import-aliased.js');
    });
    it('calculates size of aliased import in typescript', () => {
      return verify('import-aliased.ts');
    });
    it('calculates size of import with no semicolon in typescript', () => {
      return verify('import-no-semicolon.ts');
    });
    it('calculates size of legacy import in javascript', () => {
      return verify('import-legacy.js');
    });
    it('calculates size of legacy import in typescript', () => {
      return verify('import-legacy.ts');
    });
    it('calculates size of node import in javascript', () => {
      return verify('import-node.js', 'node-stuff');
    });
    it('calculates size of namespace import in javascript', () => {
      return verify('import-namespace.js');
    });
    it('calculates size of imports in a file with shorthand react fragments', () => {
      return verify('react-fragments.jsx');
    });
    it('calculates size of namespace import in typescript', () => {
      return verify('import-namespace.ts');
    });
    it('calculates size of specifiers import in javascript', () => {
      return verify('import-specifiers.js');
    });
    it('calculates size of specifiers import in typescript', () => {
      return verify('import-specifiers.ts');
    });
    it('calculates size of mixed default+named import in javascript', () => {
      return verify('import-mixed.js');
    });
    it('calculates size of mixed default+named import in typescript', () => {
      return verify('import-mixed.ts');
    });
    it('calculates size of mixed default+global import in javascript', () => {
      return verify('import-global-mixed.js', 'react');
    });
    it('calculates size of mixed default+global import in typescript', () => {
      return verify('import-global-mixed.ts', 'react');
    });
    it('calculates size of cherry pick import in javascript', () => {
      return verify('import-cherry.js', 'chai/abc');
    });
    it('calculates size of cherry pick import in typescript', () => {
      return verify('import-cherry.ts', 'chai/abc');
    });
    it('calculates size of scoped import in javascript', () => {
      return verify('import-scoped.js', '@angular/core');
    });
    it('calculates size of scoped import in typescript', () => {
      return verify('import-scoped.ts', '@angular/core');
    });
    it('calculates size of scoped esm import in javascript', () => {
      return verify('import-scoped-esm.js', '@angular/core/esm');
    });
    it('calculates size of scoped esm import in typescript', () => {
      return verify('import-scoped-esm.ts', '@angular/core/esm');
    });
    it('calculates size of shaken import in javascript', () => {
      return verify('import-shaken.js', 'react', 200, 300);
    });
    it('calculates size of shaken import in typescript', () => {
      return verify('import-shaken.ts', 'react', 200, 300);
    });
    it('calculates size of production env import in javascript', () => {
      return verify('import-env.js', 'react-dom', 200, 300);
    });
    it('calculates size of production env import in typescript', () => {
      return verify('import-env.ts', 'react-dom', 200, 300);
    });
    it('calculates size without externals', () => {
      return verify('import-externals.js', 'wix-style', 200, 300);
    });
    it('calculates size without peerDependencies', () => {
      return verify('import-peer.js', 'haspeerdeps', 200, 300);
    });
    it('supports a monorepo-like structure', () => {
      return verify('./yarn-workspace/import-nested-project.js', 'chai');
    });
    it('supports a monorepo-like structure with scoped module', () => {
      return verify('./yarn-workspace/import-with-scope.js', '@angular/core');
    });
    it('supports a monorepo-like structure with scoped module and file name', () => {
      return verify(
        './yarn-workspace/import-with-scope-filename.js',
        '@angular/core/index.js',
      );
    });
    it('calculates size of a dynamic import in javascript', () => {
      return verify('dynamic-import.js');
    });
    it('calculates size of a dynamic import in typescript', () => {
      return verify('dynamic-import.ts');
    });
    it('calculates size of a vue script', () => {
      return verify('vue.vue');
    });
    it('calculates size of a svelte script', () => {
      return verify('svelte.svelte');
    });
  });

  describe('caching', () => {
    it('caches the results import string & version', async () => {
      expect(await timed(() => verify('import.js'))).to.be.within(100, 1500);
      expect(await timed(() => verify('import-specifiers.js'))).to.be.within(
        100,
        1500,
      );
      expect(await timed(() => verify('import.ts'))).to.be.within(0, 100);
    });
    it('ignores order of javascript imports for caching purposes', async () => {
      expect(await timed(() => verify('import-specifiers.js'))).to.be.within(
        100,
        1500,
      );
      expect(
        await timed(() => verify('import-specifiers-reversed.js')),
      ).to.be.within(0, 100);
      expect(await timed(() => verify('import-mixed.js'))).to.be.within(
        100,
        1500,
      );
      expect(
        await timed(() => verify('import-mixed-reversed.js')),
      ).to.be.within(0, 120);
    });
    it('ignores order of typescript imports for caching purposes', async () => {
      expect(await timed(() => verify('import-specifiers.ts'))).to.be.within(
        100,
        1500,
      );
      expect(
        await timed(() => verify('import-specifiers-reversed.ts')),
      ).to.be.within(0, 100);
      expect(await timed(() => verify('import-mixed.ts'))).to.be.within(
        100,
        1500,
      );
      expect(
        await timed(() => verify('import-mixed-reversed.ts')),
      ).to.be.within(0, 100);
    });
    it('debounce any consecutive calculations of same import line', () => {
      const p1 = expect(
        whenDone(
          runner(
            fixture('import.js'),
            'import "chai";',
            LANGUAGES.js,
            DEFAULT_CONFIG,
          ),
        ),
      ).to.be.rejectedWith(DebounceError);
      const p2 = expect(
        whenDone(
          runner(
            fixture('import.js'),
            'import "chai/index";',
            LANGUAGES.js,
            DEFAULT_CONFIG,
          ),
        ),
      ).to.be.fulfilled;
      return Promise.all([p1, p2]);
    });
    it('caches everything to filesystem', async () => {
      expect(await timed(() => verify('import.js'))).to.be.within(100, 1500);
      expect(await timed(() => verify('import-specifiers.js'))).to.be.within(
        100,
        1500,
      );
      fs.renameSync(cacheFileName, `${cacheFileName}.bak`);
      clearSizeCache();
      fs.renameSync(`${cacheFileName}.bak`, cacheFileName);
      expect(await timed(() => verify('import.ts'))).to.be.within(0, 100);
    });
  });

  describe('error handling', () => {
    it('not added to package list if dependency is missing', async () => {
      const packages = await whenDone(importCost(fixture('failed-missing.js')));
      expect(packages.filter(x => x.name === 'sinon').length).to.equal(0);
    });
    it('results in 0 if bundle fails', async () => {
      const packages = await whenDone(importCost(fixture('failed-bundle.js')));
      expect(sizeOf(packages, 'jest')).to.equal(0);
    });
    it('errors on broken javascript', () => {
      return expect(whenDone(importCost(fixture('incomplete.bad.js')))).to.be
        .rejected;
    });
    it('errors on broken typescript', () => {
      return expect(whenDone(importCost(fixture('incomplete.bad.ts')))).to.be
        .rejected;
    });
    it('errors on broken vue', () => {
      return expect(whenDone(importCost(fixture('incomplete.bad.vue')))).to.be
        .rejected;
    });
    it('completes with empty array for unknown file type', async () => {
      const packages = await whenDone(
        importCost(fixture('require.js'), 'flow'),
      );
      expect(packages).to.eql([]);
    });
    it('should handle timeouts gracefully', async () => {
      const packages = await whenDone(
        importCost(fixture('require.js'), LANGUAGES.js, {
          concurrent: true,
          maxCallTime: 10,
        }),
      );
      expect(packages[0].size).to.equal(0);
      expect(packages[0].error.type).to.equal('TimeoutError');
    });
  });
});
