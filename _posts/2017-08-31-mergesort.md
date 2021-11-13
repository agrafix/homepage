---
layout: post
title:  "Type Level Merge Sort (Haskell)"
date:   2017-08-31 11:00:00
tags:   blog
---

The recently presented Haskell library [superrecord][superrecord] is still under heavy development and making great progress. While working on it we noticed that application code using the library would become very slow to compile when the record size exceeded 10 fields. Without any deeper thought, I guessed that the current type level insertion sort (which is `O(n^2)` in worse case complexity) was at fault. This turned out to be wrong, but I still implemented a more efficient merge sort at type level and would like to share the journey as it was quite fun.

## Motivation

Just for as a quick recall, records in superrecord are represented as lists of type level pairs, one holding the key and one the type of the value. For example:

{% highlight haskell %}
type Example = Record '["int" := Int, "foo" := String]
{% endhighlight %}

(For more information see the original [post][superrecord-post])

Our goal is now to write a type family that given a type level list like `'["int" := Int, "foo" := String]`, it returns `'[ "foo" := String, "int" := Int]` (`"int" > "foo"`). Thus we want to implement:

{% highlight haskell %}
type family FieldListSort (xs :: [*]) :: [*] where
    -- implementation missing
{% endhighlight %}

The reason we need this is that the user does not need to provide the fields in order of the type when construction a record.

## Basics

If we look at a [Wikipedia implementation of a "Top-down implementation using lists"][merge-wiki], we read:

> Pseudocode for top down merge sort algorithm which recursively divides the input list into smaller sublists until the sublists are trivially sorted, and then merges the sublists while returning up the call chain.

Thus, we need a mechanism for breaking type level list into "smaller sublists", in our case we'll break all lists into halves. There are multiple ways to do this, here's one:

First, we describe a type level `take` and a type level `drop` function:

{% highlight haskell %}
type family ListTake (xs :: [k]) (n :: Nat) :: [k] where
    ListTake '[] n = '[]
    ListTake xs 0 = '[]
    ListTake (x ': xs) n = (x ': ListTake xs (n - 1))

type family ListDrop (xs :: [k]) (n :: Nat) :: [k] where
    ListDrop '[] n = '[]
    ListDrop xs 0 = xs
    ListDrop (x ': xs) n = ListDrop xs (n - 1)
{% endhighlight %}

These are very similar and straight forward to implement. For take we take one element at a time from the list until the desired length is reached, for drop we drop elements and then return the rest. We can now write a small unit test for these functions:

{% highlight haskell %}
_testDrop2 :: ( ListDrop '[1, 2, 3, 4] 2 ~ x, x ~ '[3, 4] ) => Proxy x
_testDrop2 = Proxy
{% endhighlight %}

If we implemented everything correctly, this should just compile. Otherwise, a "overlapping patterns" warning will be produced, and turned into an error using `-Werror`.

As you recall, we want to break lists into halves, so we need to know the length:

{% highlight haskell %}
type family LengthOf (xs :: [k]) :: Nat where
    LengthOf '[] = 0
    LengthOf (x ': xs) = 1 + LengthOf xs

-- aaaand test it:
_testLengthOf :: ( LengthOf '[1, 2, 3, 4] ~ x, x ~ 4 ) => Proxy x
_testLengthOf = Proxy
{% endhighlight %}

## Division

Now here comes an interesting part: To actually break the list in half using the combinators above, we need to divide a type level number by two. This is currently not provided by the `GHC.TypeLits` module, so we have to roll our own. Before starting, I figured that a high-level combinator like

{% highlight haskell %}
type family If (cond :: Bool) (ifTrue :: k) (ifFalse :: k) :: k where
    If 'True x y = x
    If 'False x y = y
{% endhighlight %}

could be very useful. But the problem with a combinator like this at the type level - especially when using it with recursion - is that it's not "lazy". This means, both branches will get fully reduced, so you can not use this to check for a terminating condition as it will just recurse forever. In a sense, writing type families is just stating reduction rules. So you have to implement this checking inline in your type family:

{% highlight haskell %}
type family HalfOfHelper (n :: Nat) (i :: Nat) (dist :: Nat) (o :: Ordering) :: Nat where
    HalfOfHelper n m dist 'GT = m - 1
    HalfOfHelper n m dist 'EQ = m
    HalfOfHelper n m 1 'LT = m
    HalfOfHelper n m dist 'LT = HalfOfHelper n (m + 2) (n - ((m + 2) * 2)) (CmpNat ((m + 2) * 2) n)

type family HalfOf (n :: Nat) :: Nat where
    -- some optimizations for faster compilation
    HalfOf 0 = 0
    HalfOf 1 = 1
    HalfOf 2 = 1
    HalfOf 3 = 1
    HalfOf 4 = 2
    HalfOf 5 = 2
    HalfOf 6 = 3
    HalfOf 7 = 3
    HalfOf 8 = 4
    HalfOf 9 = 4
    HalfOf 10 = 5
    -- the general case
    HalfOf n = HalfOfHelper n 0 n 'LT -- usually (CmpNat 0 n), but 0 ist already handled!

-- This gives us for example:

_testHalfOf99 :: ( HalfOf 99 ~ x, x ~ 49 ) => Proxy x
_testHalfOf99 = Proxy

_testHalfOf100 :: ( HalfOf 100 ~ x, x ~ 50 ) => Proxy x
_testHalfOf100 = Proxy

{% endhighlight %}

Note that due to the reduction limitation of the type checker (`201` by default), with this idea we can only divide numbers by two up to `n = 793`. This will be fine for our use case.

## Merging

With this in place, the last combinator missing is the list merge combinator:

{% highlight haskell %}
type family FieldListMergeHelper (xs :: [*]) (ys :: [*]) (o :: Ordering) :: [*] where
    FieldListMergeHelper (x := xv ': xs) (y := yv ': ys) 'GT =
        (y := yv) ': FieldListMerge (x := xv ': xs) ys
    FieldListMergeHelper (x := xv ': xs) (y := yv ': ys) leq =
        (x := xv) ': FieldListMerge xs (y := yv ': ys)

type family FieldListMerge (xs :: [*]) (ys :: [*]) :: [*] where
    FieldListMerge xs '[] = xs
    FieldListMerge '[] ys = ys
    FieldListMerge (x := xv ': xs) (y := yv ': ys) =
        FieldListMergeHelper (x := xv ': xs) (y := yv ': ys) (CmpSymbol x y)
{% endhighlight %}

Again, we used a helper to remove the need of an `if-then-else` and depending on the key of our `(key := type)` tuple we merge the head of either the left or the right list.

## Putting it all together

Now that we can merge and split lists as required for the merge sort, we can implement the full sorting algorithm:

{% highlight haskell %}
type family ListSortStep (xs :: [*]) (halfLen :: Nat) :: [*] where
    ListSortStep xs halfLen =
        FieldListMerge
            (FieldListSort (ListTake xs halfLen))
            (FieldListSort (ListDrop xs halfLen))

-- | Sort a list of fields using merge sort
type family FieldListSort (xs :: [*]) :: [*] where
    FieldListSort '[] = '[]
    FieldListSort '[x] = '[x]
    FieldListSort '[x, y] = FieldListMerge '[x] '[y] -- not needed, just an optimization
    FieldListSort xs =
        ListSortStep xs (HalfOf (LengthOf xs))
{% endhighlight %}

The helper is used to prevent the duplicate reduction of `HalfOf (LengthOf xs)`. And that's really all that there is to it:

{% highlight haskell %}
_testSort2 ::
    ( FieldListSort '["test" := Int, "abc" := String] ~ x
    , x ~ '["abc" := String, "test" := Int]
    ) => Proxy x
_testSort2 = Proxy

_testSort3 ::
    ( FieldListSort '["test" := Int, "abc" := String, "def" := String] ~ x
    , x ~ '["abc" := String, "def" := String, "test" := Int]
    ) => Proxy x
_testSort3 = Proxy
{% endhighlight %}

It works! One could probably generalize the `FieldListSort` to a `MergeSortBy` that allows sorting lists of `[k]` provided a comparator function `f -> f -> Ordering` and a mapper `k -> f` to extract the sorting criterion.

## Alternative approaches

* Instead of using the `drop`/`take` approach with the length, one could also implement at type family that takes a list taking the two first elements at a time and putting them into different components of a tuple.
* The `singletons` package is probably a great fit for this type of problem

[superrecord]: http://hackage.haskell.org/package/superrecord
[superrecord-post]: http://hackage.haskell.org/package/superrecord
[merge-wiki]: https://en.wikipedia.org/wiki/Merge_sort
