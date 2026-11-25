import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import {
  AGENT_PROVIDERS,
  agentSessionTone,
  buildAgentResumeCommand,
  isAgentProvider,
  isValidAgentSessionId,
  parseAgentState,
  parseResumableAgent,
} from './agent.ts';

test('no construye comando para un agente sin ID de sesión', () => {
  for (const provider of AGENT_PROVIDERS) {
    assert.equal(buildAgentResumeCommand({ provider }), undefined);
  }
});

test('construye el resume con el ID explícito del agente', () => {
  assert.equal(
    buildAgentResumeCommand({ provider: 'codex', sessionId: 'codex-123' }),
    "codex resume 'codex-123'",
  );
  assert.equal(
    buildAgentResumeCommand({ provider: 'claude', sessionId: 'claude-123' }),
    "claude --resume 'claude-123'",
  );
  assert.equal(
    buildAgentResumeCommand({ provider: 'kiro', sessionId: 'kiro-123' }),
    "kiro-cli chat --resume-id 'kiro-123'",
  );
  assert.equal(
    buildAgentResumeCommand({ provider: 'muse', sessionId: 'muse-123' }),
    "muse resume 'muse-123'",
  );
  assert.equal(
    buildAgentResumeCommand({ provider: 'antigravity', sessionId: 'conversation-123' }),
    "agy --conversation 'conversation-123'",
  );
});

test('normaliza IDs de resume envueltos en comillas simples o dobles', () => {
  assert.deepEqual(parseAgentState({ provider: 'codex', sessionId: "'codex-123'" }), {
    provider: 'codex',
    sessionId: 'codex-123',
  });
  assert.deepEqual(parseAgentState({ provider: 'claude', sessionId: '"claude-123"' }), {
    provider: 'claude',
    sessionId: 'claude-123',
  });
  assert.equal(
    buildAgentResumeCommand({ provider: 'muse', sessionId: "'muse-123'" }),
    "muse resume 'muse-123'",
  );
  assert.equal(
    buildAgentResumeCommand({
      provider: 'codex',
      sessionId: "'01a164cb-0da6-7401-9c12-aa73e8a80bb7'",
    }),
    "codex resume '01a164cb-0da6-7401-9c12-aa73e8a80bb7'",
  );
});

test('valida proveedores e IDs sin aceptar comandos arbitrarios', () => {
  assert.equal(isAgentProvider('codex'), true);
  assert.equal(isAgentProvider('muse'), true);
  assert.equal(isAgentProvider('antigravity'), true);
  assert.equal(isAgentProvider('shell'), false);
  assert.equal(isValidAgentSessionId('abc-123_foo'), true);
  assert.equal(isValidAgentSessionId("abc'; rm -rf /"), false);
  assert.throws(() => buildAgentResumeCommand({ provider: 'codex', sessionId: "bad'id" }));
});

test('solo considera restaurable un agente con ID válido', () => {
  assert.deepEqual(parseResumableAgent({ provider: 'codex', sessionId: "'codex-123'" }), {
    provider: 'codex',
    sessionId: 'codex-123',
  });
  assert.equal(parseResumableAgent({ provider: 'codex' }), null);
  assert.equal(parseResumableAgent({ provider: 'codex', sessionId: "bad'id" }), null);
  assert.equal(parseResumableAgent({ provider: 'shell', sessionId: 'abc' }), null);
});

test('el nombre del agente en el split es verde con ID de sesión y amarillo sin ID', async () => {
  assert.equal(agentSessionTone({ provider: 'codex', sessionId: 'abc' }), 'with-id');
  assert.equal(agentSessionTone({ provider: 'claude' }), 'without-id');
  assert.equal(agentSessionTone(undefined), undefined);

  const header = await readFile(new URL('../pane-header/PaneHeader.vue', import.meta.url), 'utf8');
  const layout = await readFile(new URL('../layout/LayoutView.vue', import.meta.url), 'utf8');
  const css = await readFile(new URL('../../index.css', import.meta.url), 'utf8');
  assert.match(layout, /:agent-tone="agentSessionTone\(store\.panes\[id\]\?\.agent\)"/);
  assert.match(header, /class="command-badge"\s+:class="agentTone && `agent-\$\{agentTone\}`"/);
  assert.match(header, /\.command-badge\.agent-with-id \{\s*color: var\(--agent-with-id\);/);
  assert.match(header, /\.command-badge\.agent-without-id \{\s*color: var\(--agent-without-id\);/);
  assert.match(css, /--ok: #[0-9a-f]{6};/);
  assert.match(css, /--agent-with-id: var\(--ok\);/);
  assert.match(css, /--warning: #[0-9a-f]{6};/);
  assert.match(css, /--agent-without-id: var\(--warning\);/);
});
