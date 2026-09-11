# Validation and repeatable commands

Run PowerShell 7.2+ from the repository root. The scripts resolve their own repository path. They use the development image digest in `scripts/dev-env/run.cmd`, the existing lockfile and recorded submodules. They never prune Docker images, pass the host environment file into a container, or deploy automatically.

```powershell
git submodule update --init --recursive
./scripts/fuel-trim/Build-A339X.ps1 -Baseline  # unchanged aircraft source only
./scripts/fuel-trim/Build-A339X.ps1            # setup, copy, tests, A339X build, package validation
./scripts/fuel-trim/Build-A339X.ps1 -SkipSetup # reuse declared dependencies
./scripts/fuel-trim/Test-A339XFuel.ps1         # requires generated Rust sources matching durable overrides
./scripts/fuel-trim/Test-Deployment.ps1       # temporary fixtures only
```

`-Baseline` is for the unmodified upstream aircraft source, not the completed feature checkout. For this run, the successful baseline was built before fuel integration. Its copied packages remain in the ignored artifact store. Build/test logs, source fingerprints, full file hashes and build identities are under `.fuel-trim-local`. A build record identifies its exact HEAD, any dirty source, submodule commits, image and command results.

The copy script recreates generated directories. The build wrapper cleans only the relevant Rust package artifacts afterward: preserving old source timestamps otherwise allowed Cargo to reuse a newer binary from different source. No dependency/toolchain upgrades were made. Clang-format 19.1.7 was installed only in disposable containers for changed-line formatting; the aircraft build image remained pinned.

## Automated results

| Check | Result |
| --- | --- |
| Unchanged A339X build and package inventory | PASS, all instruments and WASM modules |
| Modified A339X build and package inventory | PASS at clean source `bdd0439e787d91caeed0ae7099d1d59e1c07b24a`, artifact `20260911-131359-8539b55e`; all instruments and WASM modules, 858 files across both packages |
| C++ production transfer kernel | PASS: bounds, conservation, crossfeed, pump power/failure, stuck-open/closed valve, refuel/ground inhibits, invalid inputs, target stop/recovery |
| Timing | PASS: equal simulated hour at 60 Hz, 20 Hz, 1 Hz and 8-second steps; zero-time pause retains quantities/actuator state |
| Long duration | PASS: 50,000 fixed-seed variable steps with external snapshots, independent cumulative mass ledger, faults and recovery; constant-size model state |
| Production C++ persistence | PASS: missing/partial/malformed/over-capacity saves, old five-tank state, six-tank and fractional round trips, failed-write preservation |
| JavaScript/SimConnect contracts | PASS: four cross-language tank/index/arm/definition/ownership checks |
| Production EFB/refuel tests | PASS: nine tests, real/fast/instant, shared budgets, exact full/partial/zero/asymmetric targets, external-batch sequence, initialization and airborne/pause/invalid inhibits |
| Rust fuel tests | PASS: seven tests, including inherited low/high loads and new six-tank, moment and density cases |
| Broader Rust library baseline | 448 passed, 17 failed, 9 ignored |
| Broader Rust library modified | 454 passed, 15 failed, 9 ignored; no new failing case names |
| ESLint, changed TS/TSX files | PASS |
| TypeScript EFB / SD / MCDU | NOT GREEN: 7 / 7 / 29 diagnostics, exactly matching baseline after normalizing line/column; no diagnostics in changed fuel files |
| Deployment/rollback fixtures | PASS: dry runs, complete hashes, original backup preservation, injected copy failure rollback, restore prior absence, unrelated add-ons, junctions, unsafe paths, duplicate aircraft and dependency checks |

The baseline's two fuel failures expected A320 CG positions (`-11.12`, `-8.99` ft). Their original load scenarios and 300-second stabilization were retained, with A339X positions (`-30.94`, `-27.22` ft). Remaining baseline failures concern air conditioning, airframe/payload assumptions and flap tests. They were not suppressed or represented as green. Full logs identify each case.

Per-step conservation tolerance is `1e-7 kg`, moment tolerance `1e-6 kg*ft`, cumulative long-run mass tolerance `1e-5 kg`, and equal-duration distribution tolerance `1e-5 US gal`. These cover floating-point accumulation while remaining far below cockpit display resolution. Rust density/moment checks use `1e-8` absolute tolerance. These arithmetic tolerances are not claims about simulator integration accuracy.

The bundled lock-highlight manifest originally declared aircraft version `0.300.0` while this checkout produces `0.9.0`. A separate packaging fix makes the companion dependency match the aircraft version produced in the same build. External Microsoft dependency declarations were retained.

## Deployment and restore

Machine-specific paths belong only in ignored `.fuel-trim-local/deployment.json`. It contains verified `userCfgPath`, exact `communityPath`, external `backupRoot`, and optionally a verified MSFS 2024 `steamAppManifestPath`. Do not put a Git checkout or backups in Community. The actual machine paths and dependency evidence are recorded locally, not in these public documents.

```powershell
$artifact = (Get-ChildItem .fuel-trim-local/artifacts -Directory |
  Sort-Object LastWriteTime -Descending | Select-Object -First 1).FullName
./scripts/fuel-trim/Deploy-A339X.ps1 -ArtifactPath $artifact -WhatIf
./scripts/fuel-trim/Deploy-A339X.ps1 -ArtifactPath $artifact

# After an actual installation, use the printed deployment-record.json path.
./scripts/fuel-trim/Restore-A339X.ps1 -RecordPath '<absolute deployment-record.json path>' -WhatIf
./scripts/fuel-trim/Restore-A339X.ps1 -RecordPath '<absolute deployment-record.json path>'
```

Choose the build identity printed by the successful modified build; inspect `build-record.json` rather than assuming every artifact is modified. Deployment validates all layout entries, required binaries/assets and SHA256 hashes, resolves verified package roots, checks dependencies and rejects ambiguous identities/junctions. It checks that MSFS is closed and never terminates it. A complete copy and verified original backup are staged outside scanned package roots. Failed replacement restores the previous inventory. `initial-deployment-record.txt` preserves the first backup reference across later deployments.

For the inspected MSFS 2024 installation, dependency versions differ: airliner instruments `0.1.13` versus declared `0.1.129`, and aircraft-common `0.1.41` versus declared `0.1.125`. Both installed manifests and all 456 layout files were verified. The first dry run blocked because the script assumed minimum-version semantics. The [SDK dependency definition](https://docs.flightsimulator.com/msfs2024/retail/sdk-tools/package-tool/package-tool-xml-properties/#dependency) prescribes `Version="0.1.0"`; no authoritative runtime minimum comparison or cross-generation version equivalence was established. The script now requires verified dependency presence and warns about a lower declared-version comparison. Package declarations remain unchanged, and functional compatibility still requires a simulator load test.

## Simulator procedure: NOT RUN

No native simulator-control tool was available in this session. A compiled package is not a flight-verified aircraft. All cases below remain NOT RUN, including native CG readback and component failure behavior inside MSFS 2024.

1. Close MSFS, run the deployment dry run, then deploy if not already installed. Review dependency warnings and record build identity and rollback record. A successful copy does not establish runtime compatibility.
2. Launch MSFS 2024 and select Headwind A339X. Check missing gauges/initialization errors. Load cold-and-dark with a recorded partial fuel selection; compare all six native tanks, SD, EFB, total and native gross weight. Repeat running and airborne spawn; quantities must remain selected rather than reverting to a livery INI.
3. On the ground, test EFB real/fast/instant fill and defuel to zero, a partial load and full load. Check trim is included and no tank exceeds capacity. Attempt EFB refueling airborne; it must not start. Use the native fuel UI separately and verify its intentional changes are retained.
4. Observe engine consumption with trim disabled. Check `A32NX_FUEL_USED:1/2`, native fuel change and telemetry. Observe APU alone and confirm its native loss is not doubled. Account for native line storage/refueling when interpreting the net residual.
5. For an isolated developer transfer, record all tank quantities, native gross weight and `CG PERCENT` in **Percent** units. Disable existing native center transfer with its normal control so it cannot confound this measurement. Provide actual electrical power. In the SDK local-variable editor set target to 100 gallons above current trim (within 1646), rate to 1 US gal/s, command to 1, then experimental enable to 1. The rate is a test input, not an Airbus specification. Aft transfer requires airborne state in this experimental controller.
6. Enable telemetry. Verify center decreases exactly as trim increases, total mass remains constant apart from identified consumers, actual valve/pump indications agree, and native CG moves aft. Compare native CG delta with the summed trim-only prediction over a settled interval. Record observed tolerance; no simulator tolerance has yet been established.
7. During transfer set `A339X_TRIM_PUMP_FAILED=1`. Transfer must stop and SD must show the experimental fault; clear it and verify recovery. Test a valve stuck closed, then one stuck open; the latter may still pass powered flow. Removing pump supply must stop flow regardless of valve position.
8. Set command 2 and a lower trim target; verify forward transfer, center headroom bounds and CG direction. Check donor empty, receiver full and exact target holding. Return command and enable to 0 before normal flying.
9. Compare equal simulated-duration intervals at ordinary and accelerated simulation rates. Pause/resume without an artificial fuel jump. Check telemetry stops at 300 rows and restarts only after toggling capture off/on.
10. On the ground with engines stopped and refueling inactive, request an explicit save, change fuel intentionally, then request restore. Check status and six-tank readback. Test a valid older five-tank save and an over-capacity older center save; the latter must be rejected without changing native fuel or overwriting the old file. Reload a native saved flight and confirm native quantities are retained.

Save actual logs/screenshots and observations before changing these statuses. Do not treat these procedures as aircraft operating checklists.

## Flight-planning follow-up

The unit-setting fix at `9fde3453` passed the two-instrument regression and was built and installed as artifact `20260911-152244-ae36e4b8`. The user supplied screenshots showing the aircraft loaded, powered displays, and fuel increasing to 24,080 kg during refueling. These observations establish a basic load and refueling indication, not completed engine, CG, failure or flight validation.

STEP ALTS uses the existing FMS cruise-step model, VNAV predictions, STEP AHEAD and pilot FCU actions. SimBrief's explicit `general.stepclimb_string` is now preserved and imported after route expansion. Both the slash chain (`KSEA/0330/AVPUT/0350`) and separated pairs are accepted. Route matching must be unambiguous, and up to four valid steps can be imported. The initial cruise level is not converted into a waypoint constraint. New source checks exercise the actual parser, page edits and FCU handlers. They also reproduce a public [SimBrief JSON fixture](https://github.com/phpvms/phpvms/blob/main/tests/data/simbrief/briefing.json) containing a continuous slash chain.

Edits validate the replacement altitude and the complete sequence. Moving a step to its current waypoint no longer deletes it, and FCU-triggered removal uses FlightPlanService so changes are synchronized. The FL410 ceiling matches the existing A339 FMC; the performance-limited MAX FL indication still applies. OPT STEP and place/distance placement remain unsupported. Planning a step does not authorize or automatically initiate a climb.

Manual check after installation: generate a SimBrief OFP with Detailed Navlog and Plan Stepclimbs enabled, import it, open a cruise waypoint's VERT REV then STEP ALTS, and compare every imported step with the OFP. Edit one altitude, move it to the same fix, then clear it. At the planned step, select the cleared level on the FCU and initiate the climb; record managed-mode behavior and updated predictions. This in-simulator sequence remains NOT RUN.

### Takeoff data: supported report workflow, full calculator incomplete

The A339-only tablet Performance page now exposes a Takeoff tab that fetches the existing user's latest SimBrief OFP using the [documented read endpoint](https://developers.navigraph.com/docs/simbrief/fetching-ofp-data). Generate an A339 OFP with Runway Analysis enabled, import the matching flight into the tablet, then use **Import latest report** and select its runway. The page displays supplied V1/VR/V2, FLEX, configuration and conditions, with the original report as inert text for weight limits, distances and units. Missing or invalid results are not replaced with guessed values. The result is invalidated when the tablet's imported flight, weight, weather or route context changes.

This is **not a complete in-tablet recalculation engine**. The official SimBrief [performance calculator](https://dispatch.simbrief.com/performance) runs separately; changing it may not update a saved OFP's report. Regenerate the OFP before importing refreshed runway analysis. There is no automatic insertion into the MCDU. Current native simulator weight/weather changes do not recalculate this saved report.

Research confirmed A338/A339 calculations in SimBrief's [February 2025 changelog](https://www.simbrief.com/home/index.php?page=changelog). However, the [standalone performance API remains unavailable](https://forum.navigraph.com/t/takeoff-performance-api/15840), and no supported third-party authentication bridge was established for embedding the Coherent calculator. Public Airbus airport-planning charts do not provide a complete FLEX/V-speed model. The disabled local `a339x_takeoff.ts` retains A320-sized tables and is deliberately not enabled. A full native calculator remains blocked by a usable complete data/model source or supported calculation-service integration.

The raw TLR schema is illustrated in [this XML example](https://forum.navigraph.com/t/xml-fetching-tlr/17004). SimBrief staff's [XML/report comparison](https://forum.navigraph.com/t/performance-data-calculation/20726) demonstrates that raw distances can be feet while other samples use metres, and raw QNH can differ from printed QNH units. Therefore the page preserves the report instead of guessing distance or QNH conversions. Mass units are attached only when the raw report weight agrees with the OFP weight and its declared unit.

KSEA runway 16L is the first planned simulator test. The [FAA AIP](https://www.faa.gov/air_traffic/publications/atpubs/aip_html/part3_ad_2.0_washington.html) lists 11,901 ft declared distances, 150 ft width, 432.3 ft threshold elevation and 180 degrees true bearing; the [2025 FAA supplement, page 274](https://aeronav.faa.gov/Upload_313-d/supplements/CS_NW_20250220.pdf) gives 0.6% downhill. Verify current scenery/chart values and actual weather before testing. Automated report fixtures use synthetic speeds and FLEX, not measured KSEA performance or calibration data. No live A339 report or takeoff roll has been verified in this session.

```powershell
node --test scripts/step-climb/step-climb.test.cjs
node --test scripts/tests/takeoff-report.test.cjs
```

### Repeated Docker startup failure

Docker Desktop 4.75 on this Windows host repeatedly failed on inaccessible AF_UNIX socket files, including after a graceful stop. Disabling its optional AI component did not fix it and the original setting was restored. The [upstream issue](https://github.com/docker/desktop-feedback/issues/460) remains unresolved here.

`Start-A339XBuildEnvironment.ps1` is a tested project workaround. If the engine is healthy it returns without touching it. If Desktop is fully stopped, it preserves only the two verified runtime socket directories before starting Docker. It never deletes files, stops Desktop, changes security/settings or replaces a running engine. A failed Desktop with processes still present must first be quit. Two clean stop/start cycles and the active-container guard passed. Build-A339X invokes the helper automatically, and a local **Docker for A339X** desktop shortcut runs it. The ordinary Docker icon can still encounter the upstream failure.

```powershell
./scripts/fuel-trim/Start-A339XBuildEnvironment.ps1 -WhatIf
./scripts/fuel-trim/Start-A339XBuildEnvironment.ps1
```

### Takeoff import browser compatibility

The first installed Takeoff import handler constructed `AbortController` before its error handler or loading-state update. Coherent lacks that API (also noted by the inherited `simbridge/common.ts` timeout helper), so clicking Import could appear to do nothing. The regression suite reproduced the failure when that global was removed. Requests now use a bounded UI timeout and a request identifier; late responses and responses after unmount are ignored without requiring transport cancellation.

The page now uses SimBrief's existing plain `text.tlr_section` instead of parsing `plan_html`, removing its DOMParser dependency. Runway buttons and an explicit report-expansion button replace native select/details/pre elements. UI tests run without AbortController or DOMParser, preserve source text literally, and verify timeout, retry and late-response behavior. Actual updated behavior in MSFS still requires a reload and test.

### Preflight cruise schedule and minimum takeoff speed

The user reported gradual altitude predictions in F-PLN before pushback. During preflight, unconstrained en-route rows now display the initial planned cruise FL until the next explicit step waypoint, then that step's FL. SID/STAR segments, altitude constraints, holds, alternate/missed-approach legs and airborne predictions retain their existing behavior. This is a planned-altitude presentation, not a new waypoint crossing constraint or an alteration of the physical climb model. The actual F-PLN row builder is tested with FL350/370/390 steps and interpolated 36,940-foot predictions, including checks that the plan is not mutated.

The inherited climb model separately produced negative climb time/distance in a local numerical probe at some high-altitude A339 weight conditions. The reported flight's exact FMC state was unavailable after the simulator closed, so this has not been established as the cause of its predictions or corrected here. Airborne VNAV/performance accuracy remains unverified; planned FL presentation does not validate those predictions.

For the user's SimBrief KSEA 16L result (230.2 tonnes, CONF 1, V1/VR/V2 148/155/161), the stall-speed lookup rounded mass up to the 240-tonne row. That made the minimum V2 check 164 knots. `getVs1g` now linearly interpolates the existing 10-tonne table, giving a minimum check of 160 knots in this case. The production FMC warning method is tested with taxi fuel and the supplied speeds; it still rejects lower V1, VR, V2 and an insufficient V2 at a higher weight. Table nodes and bounded endpoints are checked across takeoff flap configurations. The existing control-speed thresholds and table values remain unchanged; this is not a validation of the full aircraft performance model.

```powershell
node --test scripts/step-climb/step-climb.test.cjs scripts/tests/takeoff-speeds.test.cjs
```
