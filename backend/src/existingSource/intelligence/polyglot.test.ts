import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { FakeGitHub, type FakeFile } from '../fakeGitHub.testsupport.js';
import { ExistingSourceService } from '../service.js';
import { InMemorySourceBindingStore } from '../store.js';
import { InMemoryCodeIndexStore } from './codeIndexStore.js';
import { ExistingSourceIntelligence, IndexCoordinator } from './service.js';

const USER = '11111111-1111-4111-8111-111111111111';

const PYTHON_API: FakeFile[] = [
  { path: 'pyproject.toml', content: '[project]\nname = "ledger-api"\n[tool.pytest.ini_options]\ntestpaths = ["tests"]\n' },
  { path: 'app/__init__.py', content: '' },
  { path: 'app/main.py', content: 'from fastapi import FastAPI\nfrom app.routes.invoices import router as invoices_router\n\napp = FastAPI()\napp.include_router(invoices_router)\n' },
  { path: 'app/routes/__init__.py', content: '' },
  { path: 'app/routes/invoices.py', content: 'from fastapi import APIRouter\nfrom app.services.totals import compute_invoice_total\n\nrouter = APIRouter()\n\n@router.get("/invoices/{invoice_id}/total")\ndef read_total(invoice_id: str):\n    return {"total": compute_invoice_total(invoice_id)}\n' },
  { path: 'app/services/__init__.py', content: '' },
  { path: 'app/services/totals.py', content: 'from app.models import Invoice\n\ndef compute_invoice_total(invoice_id: str) -> int:\n    """Sum of the line items. Not rounded."""\n    return Invoice.load(invoice_id).sum_lines()\n' },
  { path: 'app/services/emails.py', content: 'def send_receipt(invoice_id: str) -> None:\n    """total is mentioned here but this is not the calculation."""\n    return None\n' },
  { path: 'app/models.py', content: 'class Invoice:\n    @staticmethod\n    def load(invoice_id: str) -> "Invoice":\n        return Invoice()\n\n    def sum_lines(self) -> int:\n        return 0\n' },
  { path: 'tests/test_totals.py', content: 'from app.services.totals import compute_invoice_total\n\ndef test_total_of_empty_invoice_is_zero():\n    assert compute_invoice_total("x") == 0\n' },
  { path: 'tests/test_routes.py', content: 'from app.main import app\n\ndef test_app_has_routes():\n    assert app\n' },
];

const GO_CLI: FakeFile[] = [
  { path: 'go.mod', content: 'module example.com/acme/tally\n\ngo 1.22\n' },
  { path: 'cmd/tally/main.go', content: 'package main\n\nimport (\n\t"fmt"\n\t"os"\n\n\t"example.com/acme/tally/internal/report"\n)\n\nfunc main() {\n\tfmt.Println(report.Render(os.Args[1:]))\n}\n' },
  { path: 'internal/report/report.go', content: 'package report\n\nimport "example.com/acme/tally/internal/count"\n\n// Render prints the word counts.\nfunc Render(args []string) string {\n\treturn count.Summarize(args)\n}\n' },
  { path: 'internal/report/report_test.go', content: 'package report\n\nimport "testing"\n\nfunc TestRenderEmpty(t *testing.T) {\n\tif Render(nil) != "" {\n\t\tt.Fatal("expected empty")\n\t}\n}\n' },
  { path: 'internal/count/count.go', content: 'package count\n\nimport "strings"\n\n// Summarize counts words in each argument.\nfunc Summarize(args []string) string {\n\treturn strings.Join(args, ",")\n}\n\ntype Counter struct{ Total int }\n' },
  { path: 'internal/count/count_test.go', content: 'package count\n\nimport "testing"\n\nfunc TestSummarize(t *testing.T) {\n\tif Summarize(nil) != "" {\n\t\tt.Fatal("expected empty")\n\t}\n}\n' },
];

async function mapOf(files: FakeFile[]) {
  const gh = new FakeGitHub();
  gh.addAccount('tok', '501', 'alice');
  const repo = gh.addRepo({ fullName: 'acme/x', ownerId: '501', files, access: { '501': { pull: true } } });
  const source = new ExistingSourceService({ store: new InMemorySourceBindingStore(), tokenFor: async () => 'tok', portFor: (t) => gh.port(t), verifyMaxAgeMs: 0 });
  const intel = new ExistingSourceIntelligence({ source, store: new InMemoryCodeIndexStore(), coordinator: new IndexCoordinator() });
  const { binding } = await source.link(USER, { repositoryId: repo });
  await intel.ensure(USER, binding.id);
  return { intel, id: binding.id };
}

describe('a Python API', () => {
  it('follows absolute imports to the service, finds the route, and links tests to what they import', async () => {
    const { intel, id } = await mapOf(PYTHON_API);
    const located = await intel.locate(USER, id, { instruction: 'The invoice total endpoint should round to whole cents. compute_invoice_total is not rounded.' });
    assert.equal(located.relevance.targets[0]!.path, 'app/services/totals.py');
    assert.ok(!located.relevance.targets.some((t) => t.path === 'app/services/emails.py'), 'a file that only mentions "total" in a docstring is not a target');
    const near = await intel.neighborhood(USER, id, { path: 'app/services/totals.py' });
    assert.deepEqual(near.dependedOnBy, ['app/routes/invoices.py', 'tests/test_totals.py']);
    assert.deepEqual(near.dependsOn, ['app/models.py']);
    assert.deepEqual(near.tests, ['tests/test_totals.py']);
    assert.ok(near.affected.includes('app/main.py'), 'the change reaches the app entrypoint through the router');
    const route = await intel.search(USER, id, { query: 'read_total', kind: 'symbol' });
    assert.equal(route.results[0]!.path, 'app/routes/invoices.py');
    const pkg = located.relevance.packages[0];
    assert.ok(!pkg || pkg.testCommand === null || /pytest/.test(pkg.testCommand));
  });
});

describe('a Go CLI', () => {
  it('resolves module-path imports between packages and pairs _test.go files with their package', async () => {
    const { intel, id } = await mapOf(GO_CLI);
    const near = await intel.neighborhood(USER, id, { path: 'internal/count/count.go' });
    assert.ok(near.dependedOnBy.includes('internal/report/report.go'), 'importer found through the go.mod module path');
    assert.ok(near.tests.includes('internal/count/count_test.go'));
    assert.ok(near.affected.includes('cmd/tally/main.go'), 'the change reaches the command');
    const located = await intel.locate(USER, id, { instruction: '`Summarize` should skip empty arguments' });
    assert.equal(located.relevance.targets[0]!.path, 'internal/count/count.go');
    assert.ok(located.relevance.tests.some((t) => t.path === 'internal/count/count_test.go'));
    const found = await intel.search(USER, id, { query: 'Counter', kind: 'symbol' });
    assert.equal(found.results[0]!.path, 'internal/count/count.go');
  });
});
