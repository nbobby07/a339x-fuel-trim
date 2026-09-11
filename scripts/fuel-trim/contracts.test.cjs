// Cross-language contracts for the production tank configuration and adapters.
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const aircraft = 'hdw-a339x/src/base/headwindsim-aircraft-a330-900/SimObjects/Airplanes/Headwind_A330neo/';
const fadec = 'hdw-a339x/src/wasm/fadec_a339x/src/Fadec/';
const config = read(aircraft + 'flight_model.cfg');
const tanks = [...config.matchAll(/^Tank\.(\d+) = (.+)$/gm)].map((match) => {
    const fields = Object.fromEntries(
        match[2]
            .trim()
            .split('#')
            .map((field) => field.split(':')),
    );
    return {
        index: +match[1],
        name: fields.Name,
        capacity: +fields.Capacity,
        position: fields.Position.split(',').map(Number),
    };
});
test('native six-tank capacities and arms match the production C++ kernel', () => {
    assert.match(config, /Version = 4/);
    assert.deepEqual(
        tanks.map((t) => t.index),
        [1, 2, 3, 4, 5, 6],
    );
    assert.deepEqual(
        tanks.map((t) => t.name),
        ['Center', 'LeftInner', 'RightInner', 'LeftOuter', 'RightOuter', 'Trim'],
    );
    assert.equal(
        tanks.reduce((sum, t) => sum + t.capacity, 0),
        36743,
    );
    const model = read(fadec + 'FuelTrimModel.hpp');
    for (const [name, expected] of [
        ['TankCapacities', tanks.map((t) => t.capacity)],
        ['LongitudinalArms', tanks.map((t) => t.position[0])],
    ]) {
        const values = model
            .match(new RegExp(name + '\\{([^}]+)\\}'))[1]
            .split(',')
            .map(Number);
        assert.deepEqual(values, expected);
    }
    assert.match(config, /reference_datum_position = 0, 0, 0/);
});
test('Rust readers preserve native mapping, capacities and all three axes', () => {
    const rust = read('hdw-a339x/src/wasm/systems/a320_systems/src/fuel/mod.rs');
    const entries = [
        ...rust.matchAll(
            /fuel_tank_id:\s*"FUELSYSTEM TANK QUANTITY:(\d+)"[\s\S]*?position:\s*\(([^)]+)\)[\s\S]*?total_capacity_gallons:\s*([\d.]+)/g,
        ),
    ];
    assert.equal(entries.length, 6);
    for (const entry of entries) {
        const tank = tanks[Number(entry[1]) - 1];
        assert.equal(+entry[3], tank.capacity);
        assert.deepEqual(
            entry[2].split(',').map((x) => +x.trim()),
            tank.position,
        );
    }
    assert.match(rust, /FuelSystem<6, 5>/);
    const wasm = read('hdw-a339x/src/wasm/systems/a320_systems_wasm/src/lib.rs');
    assert.match(wasm, /provides_aircraft_variable_range\("FUELSYSTEM TANK QUANTITY", "gallons", 1\.\.=6\)/);
    assert.match(wasm, /provides_aircraft_variable\("FUEL WEIGHT PER GALLON", "kilograms", 0\)/);
});
test('SimConnect struct and data-definition order remain aligned', () => {
    const adapter = read(fadec + 'FadecSimData_A339X.hpp');
    const struct = adapter.match(/struct SimVarsData \{([\s\S]*?)\n  \};/)[1];
    const fields = [...struct.matchAll(/FLOAT64\s+\w+(?:\[(\d+)\])?\s*;/g)];
    const count = fields.reduce((sum, field) => sum + (field[1] ? +field[1] : 1), 0);
    const definition = adapter.match(/simVarsDataDef = \{([\s\S]*?)\n  \};/)[1];
    const rows = [...definition.matchAll(/\{"([^"]+)"\s*,\s*(\d+)\s*,\s*UNITS\.(\w+)\s*\}/g)];
    assert.equal(rows.length, count);
    assert.deepEqual(
        rows.filter((row) => row[1] === 'FUELSYSTEM TANK QUANTITY').map((row) => +row[2]),
        [1, 2, 4, 3, 5, 6],
    );
    const pair = adapter.match(/trimTankDataDef = \{([\s\S]*?)\n  \};/)[1];
    assert.deepEqual(
        [...pair.matchAll(/"FUELSYSTEM TANK QUANTITY",\s*(\d+),\s*UNITS.Gallons/g)].map((x) => +x[1]),
        [1, 6],
    );
    const restore = adapter.match(/fuelStateDataDef = \{([\s\S]*?)\n  \};/)[1];
    assert.deepEqual(
        [...restore.matchAll(/"FUELSYSTEM TANK QUANTITY",\s*(\d+),\s*UNITS.Gallons/g)].map((x) => +x[1]),
        [1, 2, 3, 4, 5, 6],
    );
});
test('native and custom ownership contract excludes competing trim paths and engine burn', () => {
    assert.match(read(aircraft + 'engines.cfg'), /fuel_flow_scalar\s*=\s*0\s*;/);
    assert.doesNotMatch(config, /(?:Source|Destination):Trim(?:#|\r?$)/m);
    const code = read(fadec + 'EngineControlA339X.cpp');
    const init = code.match(/void EngineControl_A339X::initializeFuelTanks\([^)]*\) \{([\s\S]*?)\n\}/)[1];
    assert.doesNotMatch(init, /writeDataToSim|loadConfigurationFromIni/);
    assert.match(code, /updateFuel\(msfsHandlerPtr->getSimulationDeltaTime\(\)\)/);
    assert.doesNotMatch(code, /apuBurn|xfrCenterToLeft|uiFuelTamper/);
    assert.match(code, /telemetrySamples >= 300/);
    assert.match(code, /if \(!simData\.trimTankDataPtr->writeDataToSim\(\)\)/);
    assert.match(code, /if \(!input\.trimEnabled \|\| invalidTrimControl\)/);
});
