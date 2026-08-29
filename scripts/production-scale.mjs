#!/usr/bin/env node

/**
 * Guarded Azure Container Apps scaling for SparkPlug's single-replica,
 * in-memory deployment. Target identity intentionally comes only from local
 * environment variables so production identifiers are never committed.
 */
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const policyUrl = new URL('../infra/production-scale-policy.json', import.meta.url);
export const policy = JSON.parse(readFileSync(policyUrl, 'utf8'));

function fingerprint(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export function validatePolicy(configuredPolicy = policy) {
  const errors = [];
  const expectedMinimums = { event: 1, idle: 0 };
  if (configuredPolicy.invariants?.maxReplicas !== 1) errors.push('policy invariant maxReplicas must be 1');
  if (configuredPolicy.invariants?.activeRevisionsMode !== 'Single') errors.push('policy invariant activeRevisionsMode must be Single');
  for (const mode of ['event', 'idle']) {
    const desired = configuredPolicy.modes?.[mode];
    if (!desired) {
      errors.push(`policy mode ${mode} is missing`);
      continue;
    }
    if (desired.maxReplicas !== 1) errors.push(`policy mode ${mode} must keep maxReplicas at 1`);
    if (desired.minReplicas !== expectedMinimums[mode]) {
      errors.push(`policy mode ${mode} minReplicas must be ${expectedMinimums[mode]}`);
    }
  }
  return errors;
}

export function parseArgs(argv) {
  const result = { mode: undefined, apply: false, check: false, confirmDataLoss: false, confirmApp: undefined, help: false, errors: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--mode' || arg === '--confirm-app') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) result.errors.push(`${arg} requires a value`);
      else {
        if (arg === '--mode') {
          if (result.mode !== undefined) result.errors.push('duplicate argument: --mode');
          else result.mode = value;
        } else {
          if (result.confirmApp !== undefined) result.errors.push('duplicate argument: --confirm-app');
          else result.confirmApp = value;
        }
        index += 1;
      }
    } else if (arg === '--apply') {
      if (result.apply) result.errors.push('duplicate argument: --apply');
      result.apply = true;
    } else if (arg === '--check') {
      if (result.check) result.errors.push('duplicate argument: --check');
      result.check = true;
    } else if (arg === '--confirm-data-loss') {
      if (result.confirmDataLoss) result.errors.push('duplicate argument: --confirm-data-loss');
      result.confirmDataLoss = true;
    }
    else if (arg === '--help' || arg === '-h') result.help = true;
    else result.errors.push(`unknown argument: ${arg}`);
  }
  return result;
}

export function validateOperation(args, target, configuredPolicy = policy) {
  const errors = [...args.errors];
  if (!args.help && !['event', 'idle'].includes(args.mode)) errors.push('--mode must be event or idle');
  if (args.apply && args.check) errors.push('--apply and --check cannot be used together');
  if (args.apply && !args.confirmDataLoss) errors.push('--apply requires --confirm-data-loss because scaling can erase in-memory event data');
  if (args.apply && args.confirmApp !== target?.name) errors.push('--apply requires --confirm-app to exactly match AZURE_CONTAINER_APP');
  return errors;
}

export function targetFromEnv(env) {
  const target = {
    subscription: env.AZURE_SUBSCRIPTION_ID,
    resourceGroup: env.AZURE_RESOURCE_GROUP,
    name: env.AZURE_CONTAINER_APP,
  };
  const missing = [
    ['AZURE_SUBSCRIPTION_ID', target.subscription],
    ['AZURE_RESOURCE_GROUP', target.resourceGroup],
    ['AZURE_CONTAINER_APP', target.name],
  ].filter(([, value]) => !value).map(([key]) => key);
  return { target, missing };
}

export function validateTarget(target) {
  const errors = [];
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(target.subscription ?? '')) {
    errors.push('AZURE_SUBSCRIPTION_ID must be a subscription UUID, not a display name');
  }
  if (!/^[A-Za-z0-9._-]{1,90}$/.test(target.resourceGroup ?? '')) {
    errors.push('AZURE_RESOURCE_GROUP contains unsupported characters');
  }
  if (!/^[a-z][a-z0-9-]{0,29}[a-z0-9]$/.test(target.name ?? '')) {
    errors.push('AZURE_CONTAINER_APP must be a valid lowercase Container Apps name');
  } else if (target.name.includes('--')) {
    errors.push('AZURE_CONTAINER_APP must not contain consecutive hyphens');
  }
  return errors;
}

export function normalizeState(app) {
  const properties = app?.properties ?? {};
  const template = properties.template ?? {};
  const scale = template.scale ?? {};
  const containers = template.containers ?? [];
  const { scale: _scale, revisionSuffix: _revisionSuffix, ...protectedTemplate } = template;
  return {
    minReplicas: scale.minReplicas,
    maxReplicas: scale.maxReplicas,
    activeRevisionsMode: properties.configuration?.activeRevisionsMode,
    configurationFingerprint: fingerprint(properties.configuration),
    runtimeFingerprint: fingerprint(protectedTemplate),
    latestRevision: properties.latestRevisionName,
    latestReadyRevision: properties.latestReadyRevisionName,
    provisioningState: properties.provisioningState,
    images: containers.map(({ name, image }) => ({ name, image })),
  };
}

export function assessState(current, desired, configuredPolicy = policy) {
  const expectedMode = configuredPolicy.invariants.activeRevisionsMode;
  const maxIsSafe = current.maxReplicas === configuredPolicy.invariants.maxReplicas;
  const singleRevision = current.activeRevisionsMode === expectedMode;
  const ready = current.provisioningState === 'Succeeded' && current.latestReadyRevision === current.latestRevision;
  const matchesDesiredScale = current.minReplicas === desired.minReplicas && current.maxReplicas === desired.maxReplicas;
  return {
    maxIsSafe,
    singleRevision,
    ready,
    matchesDesiredScale,
    noOp: maxIsSafe && singleRevision && ready && matchesDesiredScale,
    needsScaleUpdate: !matchesDesiredScale,
  };
}

export function verifyPostconditions(before, after, desired, configuredPolicy = policy) {
  const failures = [];
  if (after.minReplicas !== desired.minReplicas) failures.push(`minReplicas is ${String(after.minReplicas)}, expected ${desired.minReplicas}`);
  if (after.maxReplicas !== desired.maxReplicas) failures.push(`maxReplicas is ${String(after.maxReplicas)}, expected ${desired.maxReplicas}`);
  if (after.activeRevisionsMode !== configuredPolicy.invariants.activeRevisionsMode) failures.push(`activeRevisionsMode is ${String(after.activeRevisionsMode)}, expected ${configuredPolicy.invariants.activeRevisionsMode}`);
  if (after.provisioningState !== 'Succeeded') failures.push(`provisioningState is ${String(after.provisioningState)}, expected Succeeded`);
  if (after.latestReadyRevision !== after.latestRevision) failures.push('latest revision is not ready');
  const scaleUpdateExpected = before.minReplicas !== desired.minReplicas || before.maxReplicas !== desired.maxReplicas;
  if (scaleUpdateExpected && after.latestRevision === before.latestRevision) failures.push('scale changed without a new revision');
  if (JSON.stringify(after.images) !== JSON.stringify(before.images)) failures.push('container image changed unexpectedly');
  if (after.configurationFingerprint !== before.configurationFingerprint) failures.push('ingress or revision configuration changed unexpectedly');
  if (after.runtimeFingerprint !== before.runtimeFingerprint) failures.push('container runtime configuration changed unexpectedly');
  return { ok: failures.length === 0, failures };
}

export function safeSummary(state) {
  return {
    minReplicas: state.minReplicas,
    maxReplicas: state.maxReplicas,
    activeRevisionsMode: state.activeRevisionsMode,
    configurationFingerprint: state.configurationFingerprint,
    runtimeFingerprint: state.runtimeFingerprint,
    latestRevision: state.latestRevision,
    latestReadyRevision: state.latestReadyRevision,
    provisioningState: state.provisioningState,
    images: state.images,
  };
}

function usage() {
  return `Usage:\n  npm run production:scale -- --mode event [--check]\n  npm run production:scale -- --mode idle [--check]\n  npm run production:scale -- --mode event --apply --confirm-app <app-name> --confirm-data-loss\n\nRequired local environment variables: AZURE_SUBSCRIPTION_ID, AZURE_RESOURCE_GROUP, AZURE_CONTAINER_APP\n\nCheck mode is read-only. Apply changes only the selected min/max replica values. It refuses non-Single revision mode and verifies the account, exact app target, image, ingress, and container runtime configuration.`;
}

function runAz(args, { timeout = 120_000 } = {}) {
  // Azure CLI is installed as az.cmd on Windows, which must run through cmd.exe.
  // All variable arguments are format-validated by validateTarget before reaching here.
  const command = process.platform === 'win32' ? (process.env.ComSpec ?? 'cmd.exe') : 'az';
  const commandArgs = process.platform === 'win32' ? ['/d', '/s', '/c', 'az', ...args] : args;
  const result = spawnSync(command, commandArgs, { encoding: 'utf8', timeout, windowsHide: true });
  if (result.error?.code === 'ETIMEDOUT') throw new Error('Azure CLI update timed out');
  if (result.error) throw new Error(`Unable to run Azure CLI: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`Azure CLI command failed (exit ${String(result.status)})`);
  try {
    return result.stdout ? JSON.parse(result.stdout) : undefined;
  } catch {
    throw new Error('Azure CLI returned invalid JSON');
  }
}

function commonArgs(target) {
  return ['--subscription', target.subscription, '--resource-group', target.resourceGroup, '--name', target.name, '--output', 'json'];
}

function readApp(target) {
  const app = runAz(['containerapp', 'show', ...commonArgs(target)]);
  const expectedId = `/subscriptions/${target.subscription}/resourcegroups/${target.resourceGroup}/providers/microsoft.app/containerapps/${target.name}`.toLowerCase();
  if (app.name !== target.name || String(app.id).toLowerCase() !== expectedId) {
    throw new Error('Azure returned an app that does not exactly match the requested subscription, resource group, and name');
  }
  return app;
}

function verifySubscription(target) {
  const account = runAz(['account', 'show', '--subscription', target.subscription, '--output', 'json']);
  if (String(account.id).toLowerCase() !== target.subscription.toLowerCase()) throw new Error('The selected Azure account does not match AZURE_SUBSCRIPTION_ID');
}

function applyScale(target, desired) {
  runAz(['containerapp', 'update', '--min-replicas', String(desired.minReplicas), '--max-replicas', String(desired.maxReplicas), ...commonArgs(target)]);
}

function stateAfterAttempt(target, desired, before) {
  const after = normalizeState(readApp(target));
  const verification = verifyPostconditions(before, after, desired);
  console.log(`Post-change state: ${JSON.stringify(safeSummary(after))}`);
  if (!verification.ok) throw new Error(`Update outcome is not safe: ${verification.failures.join('; ')}`);
  return after;
}

export function main(argv = process.argv.slice(2), env = process.env) {
  const args = parseArgs(argv);
  if (args.help) {
    console.log(usage());
    return 0;
  }
  const policyErrors = validatePolicy();
  if (policyErrors.length > 0) {
    console.error(`Invalid production scale policy:\n${policyErrors.join('\n')}`);
    return 2;
  }
  const { target, missing } = targetFromEnv(env);
  if (missing.length > 0) {
    console.error(`Missing required environment variables: ${missing.join(', ')}`);
    return 2;
  }
  const targetErrors = validateTarget(target);
  if (targetErrors.length > 0) {
    console.error(targetErrors.join('\n'));
    return 2;
  }
  const errors = validateOperation(args, target);
  if (errors.length > 0) {
    console.error(errors.join('\n'));
    console.error(usage());
    return 2;
  }

  const desired = policy.modes[args.mode];
  verifySubscription(target);
  const before = normalizeState(readApp(target));
  console.log(`Target verified: ${target.resourceGroup}/${target.name}`);
  console.log(`Current state: ${JSON.stringify(safeSummary(before))}`);
  const assessment = assessState(before, desired);

  if (!args.apply) {
    console.log(`Check result: ${assessment.noOp ? 'compliant' : 'change required'} for ${args.mode} mode.`);
    return assessment.noOp ? 0 : 1;
  }
  if (assessment.noOp) {
    console.log(`No-op: ${args.mode} mode and single-replica invariants are already satisfied.`);
    return 0;
  }
  if (!assessment.singleRevision) {
    throw new Error('Refusing to mutate: activeRevisionsMode must already be Single');
  }

  try {
    if (assessment.needsScaleUpdate) applyScale(target, desired);
  } catch (error) {
    // Never retry an ambiguous update: a fresh read decides whether it completed safely.
    console.error(`Azure update did not complete cleanly: ${error.message}`);
    stateAfterAttempt(target, desired, before);
    console.log('The requested safe state was reached despite the Azure CLI error.');
    return 0;
  }

  stateAfterAttempt(target, desired, before);
  console.log(`Applied ${args.mode} mode safely.`);
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    process.exitCode = main();
  } catch (error) {
    console.error(`production-scale failed: ${error.message}`);
    process.exitCode = 1;
  }
}
