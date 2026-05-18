PYTHON ?= python3
PROFILE ?= core
RELEASE ?= R22-VS-22

.PHONY: doctor docs-validate guardrails-scan ddl-validate data-dictionary-validate schema-validate migrate testdata-compile testdata-load testdata-verify object-manifest-validate audit-smoke migration-smoke test-data-foundation test-contract test-integration test-time security-evidence scenario-lifecycle-validate simulation-run-validate worker-queue-validate worker-execution-validate trajectory-kernel-validate run-orchestration-validate conflict-probe-validate conflict-result-validate kpi-aggregation-validate kpi-report-comparison-validate report-render-validate report-export-queue-validate runtime-export-worker-validate runtime-dependency-rehearsal-validate runtime-dependency-evidence-validate runtime-dependency-evidence-import-validate external-evidence-trust-validate limited-scope-review-board-validate evidence-local evidence-review-board-ui-shell-validate frontend-ui-shell-validate evidence-review-board-workbench-v22-validate evidence-review-board-workbench-v23-validate evidence-review-board-workbench-v24-validate evidence-review-board-workbench-v27-validate evidence-pack

doctor:
	$(PYTHON) tools/validate.py doctor

docs-validate:
	$(PYTHON) tools/validate.py docs-validate

guardrails-scan:
	$(PYTHON) tools/validate.py guardrails-scan

ddl-validate:
	$(PYTHON) tools/validate.py ddl-validate

data-dictionary-validate:
	$(PYTHON) tools/validate.py data-dictionary-validate

schema-validate:
	$(PYTHON) tools/validate.py schema-validate

migrate:
	$(PYTHON) tools/validate.py migrate

testdata-compile:
	$(PYTHON) tools/validate.py testdata-compile

testdata-load:
	$(PYTHON) tools/validate.py testdata-load

testdata-verify:
	$(PYTHON) tools/validate.py testdata-verify

object-manifest-validate:
	$(PYTHON) tools/validate.py object-manifest-validate

audit-smoke:
	$(PYTHON) tools/validate.py audit-smoke

migration-smoke:
	$(PYTHON) tools/validate.py migration-smoke

test-data-foundation:
	$(PYTHON) tools/validate.py test-data-foundation

test-contract:
	$(PYTHON) tools/validate.py test-contract

test-integration:
	$(PYTHON) tools/validate.py test-integration

test-time:
	$(PYTHON) tools/validate.py test-time

security-evidence:
	$(PYTHON) tools/validate.py security-evidence

scenario-lifecycle-validate:
	$(PYTHON) tools/validate.py scenario-lifecycle-validate

simulation-run-validate:
	$(PYTHON) tools/validate.py simulation-run-validate

worker-queue-validate:
	$(PYTHON) tools/validate.py worker-queue-validate

worker-execution-validate:
	$(PYTHON) tools/validate.py worker-execution-validate

trajectory-kernel-validate:
	$(PYTHON) tools/validate.py trajectory-kernel-validate

run-orchestration-validate:
	$(PYTHON) tools/validate.py run-orchestration-validate

conflict-probe-validate:
	$(PYTHON) tools/validate.py conflict-probe-validate

conflict-result-validate:
	$(PYTHON) tools/validate.py conflict-result-validate

kpi-aggregation-validate:
	$(PYTHON) tools/validate.py kpi-aggregation-validate

kpi-report-comparison-validate:
	$(PYTHON) tools/validate.py kpi-report-comparison-validate

report-render-validate:
	$(PYTHON) tools/validate.py report-render-validate

report-export-queue-validate:
	$(PYTHON) tools/validate.py report-export-queue-validate

runtime-export-worker-validate:
	$(PYTHON) tools/validate.py runtime-export-worker-validate

runtime-dependency-rehearsal-validate:
	$(PYTHON) tools/validate.py runtime-dependency-rehearsal-validate

runtime-dependency-evidence-validate:
	$(PYTHON) tools/validate.py runtime-dependency-evidence-validate

runtime-dependency-evidence-import-validate:
	$(PYTHON) tools/validate.py runtime-dependency-evidence-import-validate

external-evidence-trust-validate:
	$(PYTHON) tools/validate.py external-evidence-trust-validate

limited-scope-review-board-validate:
	$(PYTHON) tools/validate.py limited-scope-review-board-validate

evidence-local:
	$(PYTHON) tools/validate.py evidence-local

evidence-pack:
	$(PYTHON) tools/validate.py evidence-pack


evidence-review-board-ui-shell-validate:
	$(PYTHON) tools/validate.py evidence-review-board-ui-shell-validate

frontend-ui-shell-validate:
	$(PYTHON) tools/validate.py frontend-ui-shell-validate


evidence-review-board-workbench-v22-validate:
	$(PYTHON) tools/validate.py evidence-review-board-workbench-v22-validate


evidence-review-board-workbench-v23-validate:
	$(PYTHON) tools/validate.py evidence-review-board-workbench-v23-validate


evidence-review-board-workbench-v24-validate:
	$(PYTHON) tools/validate.py evidence-review-board-workbench-v24-validate

evidence-review-board-workbench-v27-validate:
	$(PYTHON) tools/validate.py evidence-review-board-workbench-v27-validate

evidence-review-board-workbench-v28-validate:
	$(PYTHON) tools/validate.py evidence-review-board-workbench-v28-validate


evidence-review-board-workbench-v29-validate:
	$(PYTHON) tools/validate.py evidence-review-board-workbench-v29-validate
