import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assessState,
  parseArgs,
  policy,
  targetFromEnv,
  validateOperation,
  validatePolicy,
  validateTarget,
  verifyPostconditions,
} from './production-scale.mjs';

const target = { subscription: '11111111-2222-3333-4444-555555555555', resourceGroup: 'example-prod-rg', name: 'example-app' };
const event = policy.modes.event;
const safeEventState = {
  minReplicas: 1,
  maxReplicas: 1,
  activeRevisionsMode: 'Single',
  latestRevision: 'sparkplug--rev1',
  latestReadyRevision: 'sparkplug--rev1',
  provisioningState: 'Succeeded',
  configurationFingerprint: 'config-1',
  runtimeFingerprint: 'runtime-1',
  images: [{ name: 'server', image: 'ghcr.io/example/sparkplug:sha' }],
};

test('parses explicit event apply confirmations', () => {
  const args = parseArgs(['--mode', 'event', '--apply', '--confirm-app', 'example-app', '--confirm-data-loss']);
  assert.deepEqual(args.errors, []);
  assert.deepEqual(validateOperation(args, target), []);
});

test('rejects apply without exact app and data-loss confirmations', () => {
  const args = parseArgs(['--mode', 'idle', '--apply', '--confirm-app', 'other-app']);
  assert.deepEqual(validateOperation(args, target), [
    '--apply requires --confirm-data-loss because scaling can erase in-memory event data',
    '--apply requires --confirm-app to exactly match AZURE_CONTAINER_APP',
  ]);
});

test('rejects an unsupported mode and mutually exclusive operation flags', () => {
  const args = parseArgs(['--mode', 'two-replicas', '--check', '--apply', '--confirm-app', 'example-app', '--confirm-data-loss']);
  assert.deepEqual(validateOperation(args, target), [
    '--mode must be event or idle',
    '--apply and --check cannot be used together',
  ]);
});

test('rejects inherited object property names as modes', () => {
  const args = parseArgs(['--mode', '__proto__']);
  assert.deepEqual(validateOperation(args, target), ['--mode must be event or idle']);
});

test('rejects duplicate operation arguments', () => {
  const args = parseArgs(['--mode', 'event', '--mode', 'idle', '--check', '--check']);
  assert.deepEqual(args.errors, ['duplicate argument: --mode', 'duplicate argument: --check']);
});

test('requires all local target environment values', () => {
  const result = targetFromEnv({ AZURE_SUBSCRIPTION_ID: 's', AZURE_RESOURCE_GROUP: 'rg' });
  assert.deepEqual(result.missing, ['AZURE_CONTAINER_APP']);
});

test('accepts the exact Azure target formats and rejects shell metacharacters', () => {
  assert.deepEqual(validateTarget({
    subscription: '11111111-2222-3333-4444-555555555555',
    resourceGroup: 'example-prod-rg',
    name: 'example-app',
  }), []);
  assert.deepEqual(validateTarget({
    subscription: 'Minoru-PAYG & whoami',
    resourceGroup: 'rg;whoami',
    name: 'example-app&whoami',
  }), [
    'AZURE_SUBSCRIPTION_ID must be a subscription UUID, not a display name',
    'AZURE_RESOURCE_GROUP contains unsupported characters',
    'AZURE_CONTAINER_APP must be a valid lowercase Container Apps name',
  ]);
  assert.deepEqual(validateTarget({
    subscription: '11111111-2222-3333-4444-555555555555',
    resourceGroup: 'example-prod-rg',
    name: 'example--app',
  }), ['AZURE_CONTAINER_APP must not contain consecutive hyphens']);
});

test('rejects a policy that permits multiple replicas', () => {
  const unsafePolicy = structuredClone(policy);
  unsafePolicy.modes.event.maxReplicas = 2;
  assert.deepEqual(validatePolicy(unsafePolicy), ['policy mode event must keep maxReplicas at 1']);
});

test('rejects a policy that swaps event and idle minimums', () => {
  const unsafePolicy = structuredClone(policy);
  unsafePolicy.modes.event.minReplicas = 0;
  unsafePolicy.modes.idle.minReplicas = 1;
  assert.deepEqual(validatePolicy(unsafePolicy), [
    'policy mode event minReplicas must be 1',
    'policy mode idle minReplicas must be 0',
  ]);
});

test('marks only exact Single/event state as a no-op', () => {
  assert.equal(assessState(safeEventState, event).noOp, true);
  assert.equal(assessState({ ...safeEventState, maxReplicas: 3 }, event).noOp, false);
  assert.equal(assessState({ ...safeEventState, activeRevisionsMode: 'Multiple' }, event).noOp, false);
  assert.equal(assessState({ ...safeEventState, latestReadyRevision: 'sparkplug--rev0' }, event).noOp, false);
});

test('defaults to a read-only operation when apply is absent', () => {
  const args = parseArgs(['--mode', 'event']);
  assert.equal(args.apply, false);
  assert.deepEqual(validateOperation(args, target), []);
});

test('postcondition verification detects scale, image, ingress, and runtime drift', () => {
  const after = {
    ...safeEventState,
    minReplicas: 0,
    latestReadyRevision: 'sparkplug--rev0',
    provisioningState: 'Failed',
    configurationFingerprint: 'config-2',
    runtimeFingerprint: 'runtime-2',
    images: [{ name: 'server', image: 'ghcr.io/example/sparkplug:other' }],
  };
  const result = verifyPostconditions(safeEventState, after, event);
  assert.equal(result.ok, false);
  assert.deepEqual(result.failures, [
    'minReplicas is 0, expected 1',
    'provisioningState is Failed, expected Succeeded',
    'latest revision is not ready',
    'container image changed unexpectedly',
    'ingress or revision configuration changed unexpectedly',
    'container runtime configuration changed unexpectedly',
  ]);
});

test('postcondition verification requires a new revision when scale changes', () => {
  const before = { ...safeEventState, minReplicas: 0 };
  const result = verifyPostconditions(before, safeEventState, event);
  assert.equal(result.ok, false);
  assert.deepEqual(result.failures, ['scale changed without a new revision']);
});
