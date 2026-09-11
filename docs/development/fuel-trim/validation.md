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
| Deployment/rollback fixtures | PASS: dry runs, complete hashes, original backup preservation, injected copy failure rollback, restore prior absence, unrelated add-ons, junctions, unsafe paths, duplicate aircraft and dependency version enforcement |

The baseline's two fuel failures expected A320 CG positions (`-11.12`, `-8.99` ft). Their original load scenarios and 300-second stabilization were retained, with A339X positions (`-30.94`, `-27.22` ft). Remaining baseline failures concern air conditioning, airframe/payload assumptions and flap tests. They were not suppressed or represented as green. Full logs identify each case.

Per-step conservation tolerance is `1e-7 kg`, moment tolerance `1e-6 kg*ft`, cumulative long-run mass tolerance `1e-5 kg`, and equal-duration distribution tolerance `1e-5 US gal`. These cover floating-point accumulation while remaining far below cockpit display resolution. Rust density/moment checks use `1e-8` absolute tolerance. These arithmetic tolerances are not claims about simulator integration accuracy.

The bundled lock-highlight manifest originally required aircraft version `0.300.0` while this checkout produces `0.9.0`. A separate packaging fix makes the companion dependency match the aircraft version produced in the same build. External Microsoft dependency minimums were retained.

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

For the inspected MSFS 2024 installation, external dependency validation blocks installation: airliner instruments `0.1.13` is below declared `0.1.129`, and aircraft-common `0.1.41` is below declared `0.1.125`. Both installed manifests and their layout files were verified. Whether the 2024 packages are functionally compatible despite this different version sequence is unresolved. The guard was not bypassed and the minimum versions were not lowered to force installation.

## Simulator procedure: NOT RUN

No native simulator-control tool was available in this session. A compiled package is not a flight-verified aircraft. All cases below remain NOT RUN, including native CG readback and component failure behavior inside MSFS 2024.

1. Resolve the declared dependency mismatch using verified compatibility evidence or a supported package revision. Close MSFS, run the deployment dry run, then deploy. Record build identity and backup record.
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
