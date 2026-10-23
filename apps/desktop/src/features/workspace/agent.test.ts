import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildAgentCommand,
  isAgentProvider,
  isValidAgentSessionId,
  type AgentState,
} from './agent.ts';

test('construye una sesión nueva para cada agente soportado', () => {
  assert.equal(buildAgentCommand({ provider: 'codex' }), 'codex');
  assert.equal(buildAgentCommand({ provider: 'claude' }), 'claude');
  assert.equal(buildAgentCommand({ provider: 'kiro' }), 'kiro-cli chat');
  assert.equal(buildAgentCommand({ provider: 'muse' }), 'muse');
  assert.equal(buildAgentCommand({ provider: 'antigravity' }), 'agy');
});

test('construye el resume con el ID explícito del agente', () => {
  assert.equal(
    buildAgentCommand({ provider: 'codex', sessionId: 'codex-123' }),
    "codex resume 'codex-123'",
  );
  assert.equal(
    buildAgentCommand({ provider: 'claude', sessionId: 'claude-123' }),
    "claude --resume 'claude-123'",
  );
  assert.equal(
    buildAgentCommand({ provider: 'kiro', sessionId: 'kiro-123' }),
    "kiro-cli chat --resume-id 'kiro-123'",
  );
  assert.equal(
    buildAgentCommand({ provider: 'muse', sessionId: 'muse-123' }),
    "muse resume 'muse-123'",
  );
  assert.equal(
    buildAgentCommand({ provider: 'antigravity', sessionId: 'conversation-123' }),
    "agy --conversation 'conversation-123'",
  );
});

test('valida proveedores e IDs sin aceptar comandos arbitrarios', () => {
  assert.equal(isAgentProvider('codex'), true);
  assert.equal(isAgentProvider('muse'), true);
  assert.equal(isAgentProvider('antigravity'), true);
  assert.equal(isAgentProvider('shell'), false);
  assert.equal(isValidAgentSessionId('abc-123_foo'), true);
  assert.equal(isValidAgentSessionId("abc'; rm -rf /"), false);
  assert.throws(() => buildAgentCommand({ provider: 'codex', sessionId: "bad'id" }));
});

test('un agente sin ID conserva el modo de iniciar una sesión nueva', () => {
  const agent: AgentState = { provider: 'codex' };
  assert.equal('sessionId' in agent, false);
  assert.equal(buildAgentCommand(agent), 'codex');
});
