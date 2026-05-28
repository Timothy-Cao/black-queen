# Bid-weight A/B analysis
source=docs/bid_calibration/weight_ab.jsonl  seeds=10000

|       variant       | n |   Δ net vs baseline   | SE  |  Z  | %caller | % made (when caller) | avg bid (when caller) |
|---|---:|---:|---:|---:|---:|---:|---:|
| cap250               | 10000 |    5.56 | 0.89 | 6.24 | 25.7% | 74.9% | 239.4 |
| cap260               | 10000 |    5.64 | 0.96 | 5.89 | 25.9% | 74.7% | 239.6 |
| cap270               | 10000 |    6.00 | 0.98 | 6.13 | 26.0% | 74.7% | 239.7 |
| cap280               | 10000 |    6.05 | 0.98 | 6.16 | 26.0% | 74.7% | 239.7 |
| extra250             | 10000 |    6.05 | 0.98 | 6.16 | 26.0% | 74.7% | 239.7 |
| extra260             | 10000 |    4.44 | 0.82 | 5.43 | 24.1% | 76.0% | 238.9 |
| no-cap               | 10000 |    6.05 | 0.98 | 6.16 | 26.0% | 74.7% | 239.7 |

Δ net = mean(variant.net - baseline.net) on paired seeds (variance-cancelled).
Z > 2 ≈ significant at ~95%, Z > 3 ≈ ~99.7%.
%caller = SUBJECT (seat 0) became caller; %made = of those, won; avg bid = winning bid when caller.
