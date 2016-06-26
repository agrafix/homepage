---
layout: post
title:  "Interview Question: Wine Bottles"
date:   2016-06-26 10:30:00
use_math: true
---

A popular puzzle interview question goes like this: "Sir Blake has 200 bottles of wine in his wine cellar. 99% of those bottles are red wine and 1% of them are white wine. How many bottles of red and/or white wine does Sir Blake need to drink to reduce the percentage of red wine to 98%?"

The intuition misleads us thinking that the number of bottles to drink must be rather small, but this is not the case. In the original state we have 198 bottles of red wine and 2 bottles of white wine. Now if we want to reduce the share of red wine to 98% we will need a 2% share of white wine. Because the number of white wine bottles is a natural number $$ b_w \in \{0, 1, 2\} $$ the easiest way to come up with a solution is to figure out what the corresponding amount of red wine bottles would be to get the ratio of 98% to 2%:

|------------+----------|
| White wine | Red wine |
|============+==========|
| 0          | -        |
| 1          | 49       |
| 2          | 98       |
|------------+----------|

Thus he can either drink $$ 198 - 98 = 100 $$ bottles of red wine and no white wine or $$ 198 - 49 = 149 $$ bottles of red wine and $$ 2 - 1 = 1 $$ bottle of white wine.

You could also fire up the [Z3 Theorem Prover][z3]:

```smt
(declare-const rt Int)
(declare-const wt Int)

(assert (<= rt 198))
(assert (>= rt 0))

(assert (<= wt 2))
(assert (>= wt 0))

(assert (= 0.98 (/ (- 198.0 (to_real rt)) (- 200.0 (+ (to_real rt) (to_real wt))))))
(assert (= 0.02 (/ (- 2.0 (to_real wt)) (- 200.0 (+ (to_real rt) (to_real wt))))))

(check-sat)
(get-model)

(minimize (+ rt wt))
(check-sat)
(get-model)
```

Outputs:

```smt
sat
(model
  (define-fun wt () Int
    1)
  (define-fun rt () Int
    149)
)
sat
(model
  (define-fun wt () Int
    0)
  (define-fun rt () Int
    100)
)
```

Looking forward to your Feedback on [HackerNews][hn].

[z3]: https://github.com/Z3Prover/z3
[hn]: https://news.ycombinator.com/item?id=11980652