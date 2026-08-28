# Progress log — one line per iteration
# format: n | change | category targeted | fitness before→after | seed / truth hash

0 | baseline: tiers 1-2 only, no AI, old 70-pair key (synthetic + poisoned BenchRec dupes) | — | —→0.3286 (23/70, P=1, FPR=0) | seed 42
1 | pair-level scoring + deterministic timing/id/many-to-one/duplicate + unique large-amount BenchRec | all synthetic + benchrec | 0.3286→0.8714 (61/70, P=1, FPR=0) | hash 552db48822de13d2
2 | regen synthetic categories (one_to_many/currency_fx/partial/refund) without BenchRec | all synthetic | 0.8714→1.0000 (66/66, P=1, FPR=0) | seed 42 hash 0782590e62164293
3 | holdout regen seed 777, no AI | all synthetic | holdout 1.0000 (66/66, P=1, FPR=0) | seed 777 hash e8e4fa7bb6da52a0
4 | BenchRec mix without amount reconstruction (extras poisoned truth pairs) | benchrec_real | 1.0000→0.8953 (77/86, P=1, FPR=0; benchrec 11/20) | hash b3a16f3bfe5d7072
5 | BenchRec amount reconstruction (drop extras that do not sum) | benchrec_real | 0.8953→0.9383 (76/81, P=1, FPR=0; benchrec 10/15) | hash cce2b0bbfd9fee5f
6 | unique subset-sum + magnitude-scaled abs tol (empty-desc many-to-one) | benchrec_real many-to-one | 0.9383→1.0000 (81/81, P=1, FPR=0; benchrec 15/15) | hash f7c0b963363fca70
7 | holdout re-run after matcher change, no AI | all synthetic | holdout 1.0000 (66/66, P=1, FPR=0, delta 0.0000) | hash e8e4fa7bb6da52a0
8 | Decimal amount keys in T1 + reject ledger-only claimed groups in scoring | exact / many_to_one scoring | 1.0000→1.0000 (81/81, P=1, FPR=0; benchrec 15/15) | hash f7c0b963363fca70
9 | holdout re-run after T1 Decimal keys + scoring legality, no AI | all synthetic | holdout 1.0000 (66/66, P=1, FPR=0, delta 0.0000) | hash e8e4fa7bb6da52a0
10 | hard dataset baseline (seed 999), no AI, no rule changes | hard evaluation set | —→0.5484 (38/62 pairs, P=0.9500, FPR=0.0323, 2 FPs) | seed 999 hash b3057890b01ecebf
11 | fix subset-sum vendor fallback bug + cash position reporting + loop infra | many_to_one_wide, distractor | 0.5484→0.5968 (39/62 pairs, P=0.9750, FPR=0.0161, 1 FP) | seed 999 hash b3057890b01ecebf
12 | expand VENDOR_STOP + exact subset-sum tolerance on synthetic amounts | many_to_one_wide, distractor | 0.5968→0.6452 (40/62 pairs, P=1.0000, FPR=0.0000, 0 FPs) | seed 999 hash b3057890b01ecebf
13 | wide timing drift matching up to 20 days for exact same-invoice pairs | timing_drift_wide | 0.6452→0.7742 (48/62 pairs, P=1.0000, FPR=0.0000, 0 FPs) | seed 999 hash b3057890b01ecebf
14 | extract PO tokens from description for wire/retainer matches | identity_weak | 0.7742→0.9032 (56/62 pairs, P=1.0000, FPR=0.0000, 0 FPs) | seed 999 hash b3057890b01ecebf
15 | cross-currency FX matching within settlement window for vendor pairs | fx_no_invoice | 0.9032→1.0000 (62/62 pairs, P=1.0000, FPR=0.0000, 0 FPs) | seed 999 hash b3057890b01ecebf
16 | global FX pair ranking + tight vendor-overlap rival checks on subset-sum | cross-seed generalization (fx_no_invoice, many_to_one_wide) | 0.9855→1.0000 mean fitness (14/14 pop 100%, 0 FPs) | multi-seed benchmark

