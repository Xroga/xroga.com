import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { analyzeFile, isTestPath, scanJsTs } from './languageAdapters.js';

const names = (a: ReturnType<typeof analyzeFile>) => a.symbols.map((s) => `${s.kind}:${s.parent ? `${s.parent}.` : ''}${s.name}`);

describe('TypeScript / JavaScript adapter', () => {
  const SRC = `
import { z } from 'zod';
import type { Invoice } from '../types';
import def, * as ns from "./helpers/index";
export * from './reexported';
export { a as b, c } from './other';
const lazy = () => import('./lazy');
const cjs = require('./legacy');

/** function fake() {} inside a comment must not count */
const text = "export function inString() {}";
const tpl = \`class InTemplate { run() {} } \${nested(\`deep\`)}\`;
const re = /export function inRegex\\(/g;

export async function validateInvoiceNotification(input: Invoice, strict = false): Promise<boolean> {
  const helper = function inner() { return 1; };
  return true;
}

export default class NotificationService extends Base {
  private retries = 3;
  async send(to: string, body: string): Promise<void> {}
  static create(opts: Options) { return new NotificationService(); }
  get size() { return 1; }
  helper = () => 1;
}

export const handler = async (req: Request, res: Response) => { res.end(); };
export const MAX_RETRIES = 5;
const notExported = (x: number) => x * 2;
export interface Options { retries: number }
export type Handler = (r: Request) => void;
export enum Mode { A, B }
function localOnly() {}
module.exports = { legacyOne, legacyTwo: 2 };
`;
  const a = analyzeFile('packages/billing/src/notify.ts', SRC);

  it('finds real declarations, kinds, export status and signatures, and none that live inside comments, strings, templates or regexes', () => {
    const got = names(a);
    for (const expected of ['function:validateInvoiceNotification', 'class:NotificationService', 'method:NotificationService.send', 'method:NotificationService.create', 'function:handler', 'const:MAX_RETRIES', 'function:notExported', 'interface:Options', 'type:Handler', 'enum:Mode', 'function:localOnly']) assert.ok(got.includes(expected), `${expected} in ${got.join(', ')}`);
    for (const invented of ['function:fake', 'function:inString', 'class:InTemplate', 'function:inRegex', 'function:inner']) assert.ok(!got.includes(invented), `${invented} must not exist`);
    const validate = a.symbols.find((s) => s.name === 'validateInvoiceNotification')!;
    assert.equal(validate.exported, true);
    assert.match(validate.signature!, /\(input: Invoice, strict = false\): Promise<boolean>/);
    assert.equal(a.symbols.find((s) => s.name === 'localOnly')!.exported, false);
    assert.equal(a.symbols.find((s) => s.name === 'send')!.parent, 'NotificationService');
    assert.ok(a.symbols.find((s) => s.name === 'validateInvoiceNotification')!.line > 10);
  });

  it('collects every import form with its kind, and only real ones', () => {
    const spec = (k: string) => a.imports.filter((i) => i.kind === k).map((i) => i.specifier).sort();
    assert.deepEqual(spec('static'), ['./helpers/index', 'zod']);
    assert.deepEqual(spec('type'), ['../types']);
    assert.deepEqual(spec('reexport'), ['./other', './reexported']);
    assert.deepEqual(spec('dynamic'), ['./lazy']);
    assert.deepEqual(spec('require'), ['./legacy']);
  });

  it('collects exports, including re-exports, default and CommonJS', () => {
    for (const e of ['validateInvoiceNotification', 'handler', 'MAX_RETRIES', 'Options', 'Handler', 'Mode', 'default', 'b', 'c', 'legacyOne', 'legacyTwo']) assert.ok(a.exports.includes(e), e);
    assert.ok(!a.exports.includes('localOnly'));
  });

  it('keeps a partial result for source that does not scan cleanly, and flags it', () => {
    const broken = analyzeFile('x.ts', 'export function ok() {}\nexport function broken( {\n  const s = "unterminated\n');
    assert.equal(broken.malformed, true);
    assert.ok(broken.symbols.some((s) => s.name === 'ok'));
    assert.equal(scanJsTs('const a = 1;').clean, true);
    assert.equal(scanJsTs('/* never closed').clean, false);
  });

  it('reads TSX, test titles and ESM-style .js specifiers', () => {
    const t = analyzeFile('src/a.test.ts', `import { x } from './a.js';\ndescribe('invoices', () => { it('rejects empty ids', () => {}); test("accepts valid ids", () => {}); });`);
    assert.equal(t.isTest, true);
    assert.deepEqual(t.testNames, ['invoices', 'rejects empty ids', 'accepts valid ids']);
    assert.deepEqual(t.imports.map((i) => i.specifier), ['./a.js']);
    const tsx = analyzeFile('web/Button.tsx', 'export function Button({ label }: { label: string }) { return <button>{label}</button>; }\nexport const Card = () => <div/>;');
    assert.deepEqual(names(tsx), ['function:Button', 'function:Card']);
  });

  it('survives hostile input without throwing and without inventing symbols', () => {
    for (const src of ['', '\0\0\0', '}}}}{{{{', '`${`${`', '"'.repeat(5000), 'function '.repeat(2000), '/'.repeat(4000)]) {
      const r = analyzeFile('hostile.ts', src);
      assert.ok(Array.isArray(r.symbols));
    }
    assert.equal(analyzeFile('a.ts', 'x'.repeat(2_000_000)).symbols.length, 0);
  });
});

describe('Python adapter', () => {
  const SRC = `
import os, sys as system
from .models import Order, Customer
from app.services import billing
from pkg import (
    alpha,
    beta as b,
)

__all__ = ["create_order", "OrderService"]

"""
def in_docstring():
    pass
"""

# def commented():

@router.get("/orders/{order_id}")
async def get_order(order_id: int, db: Session = Depends(get_db)) -> Order:
    return db.get(order_id)

def _private(x):
    pass

class OrderService(Base):
    def __init__(self, db):
        self.db = db

    @staticmethod
    def total(items: list[int]) -> int:
        def nested():
            pass
        return sum(items)

def test_unknown_customer_returns_404():
    assert True
`;
  const a = analyzeFile('api/orders.py', SRC);

  it('finds functions, classes and methods with signatures, decorators and export status; never a def inside a docstring or comment', () => {
    const got = names(a);
    for (const e of ['function:get_order', 'function:_private', 'class:OrderService', 'method:OrderService.__init__', 'method:OrderService.total', 'function:test_unknown_customer_returns_404']) assert.ok(got.includes(e), `${e} in ${got.join(', ')}`);
    for (const n of ['function:in_docstring', 'function:commented']) assert.ok(!got.includes(n), n);
    const get = a.symbols.find((s) => s.name === 'get_order')!;
    assert.match(get.signature!, /\(order_id: int, db: Session = Depends\(get_db\)\) -> Order/);
    assert.deepEqual(get.annotations, ['@router.get("/orders/{order_id}")']);
    assert.equal(a.symbols.find((s) => s.name === '_private')!.exported, false);
  });

  it('collects absolute, relative and from-import module references, and __all__', () => {
    const specs = a.imports.map((i) => i.specifier);
    for (const s of ['os', 'sys', '.models', '.models.Order', 'app.services', 'app.services.billing', 'pkg', 'pkg.alpha', 'pkg.beta']) assert.ok(specs.includes(s), `${s} in ${specs.join(', ')}`);
    assert.ok(a.exports.includes('create_order') && a.exports.includes('OrderService'));
  });

  it('recognises tests by name and by path', () => {
    assert.deepEqual(a.testNames, ['test_unknown_customer_returns_404']);
    assert.equal(a.isTest, true);
    assert.equal(isTestPath('tests/test_orders.py'), true);
    assert.equal(isTestPath('app/orders_test.py'), true);
    assert.equal(isTestPath('app/orders.py'), false);
  });
});

describe('Go adapter', () => {
  const SRC = `package importer

import (
	"fmt"
	str "strings"
	"github.com/acme/tool/internal/store"
)

import "os"

// func Commented() {}
const doc = \`func InRaw() {}\`

type Options struct {
	DryRun bool
}

type Runner interface {
	Run(o Options) error
}

func Import(path string, opts Options) (int, error) {
	fmt.Println("func inString() {}")
	return 0, nil
}

func (r *Runner) helper(x int) {}

func unexported() {}
`;
  const a = analyzeFile('internal/importer/import.go', SRC);

  it('finds the package, functions, methods and types with signatures and export status', () => {
    const got = names(a);
    for (const e of ['module:importer', 'function:Import', 'method:Runner.helper', 'function:unexported', 'struct:Options', 'interface:Runner']) assert.ok(got.includes(e), `${e} in ${got.join(', ')}`);
    for (const n of ['function:Commented', 'function:InRaw', 'function:inString']) assert.ok(!got.includes(n), n);
    assert.match(a.symbols.find((s) => s.name === 'Import')!.signature!, /\(path string, opts Options\) \(int, error\)/);
    assert.deepEqual([...a.exports].sort(), ['Import', 'Options', 'Runner']);
  });

  it('collects block and single imports, including aliased ones', () => {
    assert.deepEqual(a.imports.map((i) => i.specifier).sort(), ['fmt', 'github.com/acme/tool/internal/store', 'os', 'strings']);
  });

  it('recognises Go tests', () => {
    const t = analyzeFile('internal/importer/import_test.go', 'package importer\nimport "testing"\nfunc TestImportDryRun(t *testing.T) {}\nfunc helperNotATest() {}\nfunc BenchmarkImport(b *testing.B) {}');
    assert.equal(t.isTest, true);
    assert.deepEqual(t.testNames, ['TestImportDryRun', 'BenchmarkImport']);
  });
});

describe('other languages', () => {
  it('uses name-level extraction and says so; unreadable or data files yield nothing', () => {
    const rb = analyzeFile('lib/a.rs', 'pub fn compute(x: i32) -> i32 { x }\nstruct Thing;');
    assert.equal(rb.parse, 'lexical');
    assert.ok(rb.symbols.some((s) => s.name === 'compute'));
    assert.equal(analyzeFile('data.json', '{"a":1}').parse, 'none');
    assert.equal(analyzeFile('README.md', '# title').symbols.length, 0);
  });
});
