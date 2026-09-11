/* eslint-env node */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

const source = fs.readFileSync(
    path.join(__dirname, '../../hdw-a339x/src/systems/instruments/src/MCDU/legacy/NXSpeeds.ts'),
    'utf8',
);
const context = { exports: {}, Avionics: { Utils: { lerpAngle: (a, b, t) => a + (b - a) * t } } };
vm.runInNewContext(
    ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText,
    context,
);
const speeds = context.exports.NXSpeedsUtils;
const fmcSource = fs.readFileSync(
    path.join(__dirname, '../../hdw-a339x/src/systems/instruments/src/MCDU/legacy/A32NX_FMCMainDisplay.ts'),
    'utf8',
);
const fmcTree = ts.createSourceFile('fmc.ts', fmcSource, ts.ScriptTarget.Latest, true);
const warningMethod = fmcTree.statements
    .filter(ts.isClassDeclaration)
    .flatMap((declaration) => Array.from(declaration.members))
    .find((member) => member.name?.getText(fmcTree) === 'getToSpeedsTooLow');
context.NXSpeedsUtils = speeds;
context.FlightPlanIndex = { Active: 0 };
vm.runInNewContext(
    ts.transpileModule(
        `class Warning { ${warningMethod.getText(fmcTree)} } exports.check = Warning.prototype.getToSpeedsTooLow;`,
        {
            compilerOptions: { module: ts.ModuleKind.CommonJS },
        },
    ).outputText,
    context,
);

test('KSEA 230.2t CONF 1 uses interpolated stall speed, retaining minimum-speed checks', () => {
    const minimumV2 = Math.trunc(1.13 * speeds.getVs1g(230.2, 1, true));
    assert.equal(minimumV2, 160);
    assert.ok(161 >= minimumV2);
    assert.ok(159 < minimumV2);
    assert.ok(148 >= Math.trunc(speeds.getVmcg(432)));
    assert.ok(155 >= Math.trunc(1.05 * speeds.getVmca(432)));
    assert.ok(161 >= Math.trunc(1.1 * speeds.getVmca(432)));
    const rig = {
        getGrossWeight: () => 231.3,
        getFlightPlan: () => ({ performanceData: { takeoffFlaps: { get: () => 1 }, taxiFuel: { get: () => 1.1 } } }),
        getDepartureElevation: () => 432,
        getPressureAltAtElevation: () => 432,
        getBaroCorrection1: () => 29.97,
        isAnEngineOn: () => false,
        v1Speed: 148,
        vRSpeed: 155,
        v2Speed: 161,
    };
    assert.equal(context.exports.check.call(rig), false);
    assert.equal(context.exports.check.call({ ...rig, v2Speed: 159 }), true);
    assert.equal(context.exports.check.call({ ...rig, v1Speed: 120 }), true);
    assert.equal(context.exports.check.call({ ...rig, vRSpeed: 125 }), true);
    assert.equal(context.exports.check.call({ ...rig, getGrossWeight: () => 241.1 }), true);
    for (const conf of [1, 2, 3]) {
        for (let mass = 130; mass < 250; mass += 10) {
            const lower = speeds.getVs1g(mass, conf, true);
            const upper = speeds.getVs1g(mass + 10, conf, true);
            assert.equal(speeds.getVs1g(mass + 5, conf, true), (lower + upper) / 2);
        }
    }
    assert.equal(speeds.getVs1g(127, 1, true), speeds.getVs1g(130, 1, true));
    assert.equal(speeds.getVs1g(251, 1, true), speeds.getVs1g(250, 1, true));
});
