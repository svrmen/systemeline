import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import vm from 'vm';
import url from 'url';

const htmlPath = url.fileURLToPath(new URL('../../index.html', import.meta.url));
const html = readFileSync(htmlPath, 'utf8');
const script = html.split('<script>')[1].split('</script>')[0];

function extractConst(name) {
  const regex = new RegExp(`const\\s+${name}\\s*=\\s*([\\s\\S]*?);`);
  const match = script.match(regex);
  if (!match) throw new Error(`Const ${name} not found`);
  return `globalThis.${name} = ${match[1].trim()};`;
}

function extractFunction(name) {
  const token = `function ${name}`;
  const start = script.indexOf(token);
  if (start === -1) throw new Error(`Function ${name} not found`);
  let idx = script.indexOf('{', start);
  let depth = 0;
  for (let i = idx; i < script.length; i++) {
    const ch = script[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        const body = script.slice(start, i + 1);
        return `globalThis.${name} = ${body.replace(token, `function ${name}`)};`;
      }
    }
  }
  throw new Error(`Could not parse function ${name}`);
}

function runInContext(snippets, globals = {}) {
  const context = { ...globals };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(snippets.join('\n'), context);
  return context;
}

describe('adv', () => {
  it('advances coordinates along axes', () => {
    const ctx = runInContext([
      extractConst('axis'),
      extractConst('sgn'),
      extractFunction('adv')
    ]);
    expect(ctx.adv([0, 0, 0], '+X', 5)).toEqual([5, 0, 0]);
    expect(ctx.adv([10, 20, 30], '-Y', 7)).toEqual([10, 13, 30]);
    expect(ctx.adv([3, 4, 5], '-Z', 2)).toEqual([3, 4, 3]);
  });
});

describe('elbowCuts', () => {
  beforeEach(() => {
    global.$ = () => ({ value: '1000' });
  });

  it('returns horizontal elbow lengths from lookup', () => {
    const ctx = runInContext([
      extractConst('axis'),
      extractConst('H_ELBOW_BY_R'),
      extractConst('VERT_ELBOW'),
      extractFunction('elbowCuts')
    ], { $: global.$ });
    expect(ctx.elbowCuts('+X', '+Y')).toEqual({ a: 270, b: 270 });
  });

  it('returns vertical elbow defaults when axis includes Z', () => {
    const ctx = runInContext([
      extractConst('axis'),
      extractConst('H_ELBOW_BY_R'),
      extractConst('VERT_ELBOW'),
      extractFunction('elbowCuts')
    ], { $: global.$ });
    expect(ctx.elbowCuts('+X', '+Z')).toEqual({ a: 320, b: 320 });
  });
});

describe('elbowSolidAtVertex', () => {
  it('uses bus height for horizontal plane thickness', () => {
    const captured = {};
    const ctx = runInContext([
      extractConst('axis'),
      extractConst('sgn'),
      extractConst('VEC'),
      extractFunction('dirVec'),
      extractFunction('cross'),
      extractFunction('LpolyCornerSolid'),
      extractFunction('elbowSolidAtVertex')
    ], {
      extrudeSolid: (...args) => { captured.args = args; }
    });
    ctx.elbowSolidAtVertex([0, 0, 0], '+X', '+Y', 100, 150, 200, 120);
    expect(captured.args[1]).toBe(120);
    const poly = captured.args[0];
    const halves = poly.map(p => Math.abs(p[1])).filter(Boolean);
    expect(halves.includes(100)).toBe(true);
  });

  it('uses bus width for vertical plane thickness', () => {
    const captured = {};
    const ctx = runInContext([
      extractConst('axis'),
      extractConst('sgn'),
      extractConst('VEC'),
      extractFunction('dirVec'),
      extractFunction('cross'),
      extractFunction('LpolyCornerSolid'),
      extractFunction('elbowSolidAtVertex')
    ], {
      extrudeSolid: (...args) => { captured.args = args; }
    });
    ctx.elbowSolidAtVertex([0, 0, 0], '+X', '+Z', 80, 120, 220, 140);
    expect(captured.args[1]).toBe(220);
    const poly = captured.args[0];
    const halves = poly.map(p => Math.abs(p[1])).filter(Boolean);
    expect(halves.includes(70)).toBe(true);
  });
});

describe('segBox', () => {
  it('uses bus height for vertical segment cross-section', () => {
    const calls = [];
    const ctx = runInContext([
      extractConst('axis'),
      extractConst('sgn'),
      extractFunction('segBox')
    ], {
      solidBox: (...args) => { calls.push(args); },
      BUS_COLOR: '#3C6EDC'
    });
    ctx.segBox([0, 0, 0], '+Z', 500, 200, 120);
    expect(calls).toHaveLength(1);
    expect(calls[0][3]).toBe(200);
    expect(calls[0][4]).toBe(120);
  });
});
