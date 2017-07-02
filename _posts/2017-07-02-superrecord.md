---
layout: post
title:  "SuperRecord: Anonymous Records for Haskell"
date:   2017-07-02 18:00:00
---

Many mainstream Haskell programs that reach a certain size need to solve at least two core problems. First, all your logic will run in some kind of environment that provides logging, configuration, other external data such as templates and/or some global application state. This environment must be managed somehow and correctly be passed to the specific logic. Secondly, you will need to read and write out data into the real world, for example to talk to a JSON REST-API. Let's take a look in detail at these problems and how we can solve them today.

## Motivation

### Environments

A common simplified example for an environment will look similar to this

```haskell
data Config
    = Config
    { c_port :: Int
    , c_oauthToken :: String
    , -- ...
    }

data Logger
    = Logger
    { l_logInfo :: String -> IO ()
    , -- ...
    }

data Env
    = Env
    { e_config :: Config
    , e_logger :: Logger
    , e_http :: HTTPClient -- used to make HTTP requests
    , e_db :: Connection
    }
```

The `Env` is created once at the start of the program and then passed to all components of the application. This can easily be achieved by simply passing it to every function as parameter

```haskell
setupEnv :: IO Env
setupEnv = undefined -- read config files, ...

main :: IO ()
main =
    do env <- setupEnv
       doWork env

doWork :: Env -> IO ()
doWork env =
    do l_logInfo (e_logger env) "Now doing some work..."
       blogPosts <- runQuery (e_db env) "SELECT * FROM pending_posts"
       sendToBlogApi (e_http env) (c_oauthToken $ e_config env) blogPosts
       -- ....
```

Now for this example, this may look like a reasonable thing to do, but the approach has two drawbacks: As the program grows, we have to pass around this `env :: Env` many times which will result in slightly obfuscated code. More importantly though, if further down the stack in a function we only need smaller portions of `Env`, like for example only `l_logInfo` of `Logger` and `c_port` of `Config`, we will either need to introduce a new data type containing only the needed fields (`LogInfoPort`) and convert the `Env` to that, or we still take `Env` as parameter and have a hard time reasoning about what the function does and reusing/testing it because we need to then fill in all the other unused fields with garbage.

To solve the problem of passing things around to everything, we can use the `ReaderT Env IO a` monad. This will get rid of having to pass around the parameter all the time. To attack the second problem, we can introduce type classes that denote single components of our config

```haskell
class HasHttpClient env where
    getHTTPClient :: env -> HTTPClient

class HasConfig env where
    getConfig :: env -> Config

-- ...
```

And then describe what our function needs using those constraints:

```
doDeepWork :: (MonadReader env m, HasHttpClient env) => m ()
doDeepWork =
    do cli <- asks getHTTPClient
       sendToBlogApi cli "mytoken" ["Post #1"]
```

This idea is explored in depth in a recent [FPComplete post by Michael Snoyman][reader-t-pattern]. This idea is pretty decent, but it also has some drawbacks: How do we express nested constraints? If we for example only need `c_port` of `Config` we could add a new type class

```haskell
class HasPort env where
   getPort :: env -> Int
```

and write two instances, one for `Config` and one for `Env` using that. The result is lot's of type classes and we start to loose track of what happens again. Another drawback is that we now can construct smaller environments for testing (or reusage sites), but we still need to introduce new types and write type class instances for every smaller bit.

We will look into solutions, but let's introduce the other problem before hand.

### Talking to the real world

Whether talking to a REST API or writing a REST service, one always needs to specify the structure of the data that is being accepted or sent. A common path with Haskell here is to use JSON as data format using `aeson` as library and the `ToJSON` and `FromJSON` type classes to specify what the structure of the JSON sent or parsed should be. This requires you to define a Haskell type for each JSON payload you want to send. For example, when implementing a REST service, we would define a `RequestXX` and a `ResponseXX` type for each end point, implement `FromJSON RequestXX` and  `ToJSON ResponseXX`. In our handler we would first read the request into `RequestXX` and then deconstruct and work in the data of the `RequestXX` type, and then pack the results back into a `ResponseXX` type. For good maintainability, code reuse and testability we should not implement business logic functions in terms of any `RequestXX` or `ResponseXX` type, thus we will always write converting between business logic types and these request/response types. Also, if our response/request type only slightly differs between end points, we need to introduce a new type again (and implement serialization/parsing again). Some of these problems can partially be resolved similar to the `ReaderT` case, we could also write these `HasXX` type classes and implement instances for our request/response types, but it does not solve the problem of defining many types and writing many similar json parsers/serializers and comes with the drawbacks mentioned above.


### A solution?

One way to solve these problems can be via anonymous records. Let's take a look.

## Anonymous records

An anonymous record is similar to a `data` type, but instead of defining it up front with a `data` declaration we can declare/use it on the fly. Here's an example from the proposed Haskell [superrecord[superrecord] package which implements the idea of anonymous records:

```haskell
person =
    #name := "Alex"
    & #age := 23
    & rnil
```

The type of person is `person :: Rec '["name" := String, "age" := Int]`. This basically means `person` is a record (`Rec`) that has the fields `name` and `age` of types `String` and `Int`. We will explain the concrete meaning and machinery later on. Using Haskell's native `data` types, it would look like this:

```haskell
data Person = Person { name :: String, age :: Int }
person = Person { name = "Alex", age = 23 }
```

On trivial example why the first representation is beneficial is that we can write a function that requires at least a field `name`:

```haskell
greet :: Has "name" r String => Rec r -> String
greet r = "Hello " ++ get #name r
```

where the `Has "name" r String` constraint means: "The record of type `Rec r` must have a field `name` of value `String`".. This function can work on many values like:

```haskell
person = #name := "Alex" & #age = 23 & rnil
person2 = #name := "Laura" & rnil
person3 = #favoriteColor := "green" & #name = "Dorothee" & rnil
```

where as the function

```haskell
greet :: Person -> String
greet p = "Hello " ++ name p
```

can only work on values of type `Person`. Again, this could be solved using type classes, but you'd still need to write a new `PersonX` type for the three examples above and implement a `HasName` instance for all of them. Circling down on the "environment problem", we can now model our environments as anonymous records and use the `Has` constraint to explain exactly what we need! For example or `doDeepWork` from above

```haskell
doDeepWork :: (MonadReader (Rec r) m, Has "httpClient" r HTTPClient) => m ()
doDeepWork =
    do cli <- asks (get #httpClient)
       sendToBlogApi cli "mytoken" ["Post #1"]
```

We can also easily express nested environment constraints

```haskell
doDeepMoreWork ::
    ( MonadReader (Rec r) m
    , Has "config" r (Rec rc)
    , Has "port" rc Int
    ) => m ()
doDeepMoreWork =
    do port <- asks (get #port . get #config)
       pingPort port
```

The big advantage here is that we do not need to introduce any new data types or type classes, we can simply write down what dependencies or functions actually have, and then after combining them or when testing them providing just what they need. For example:

```haskell
myUnitTests =
  do test $ runReaderT doDeepMoreWork ("config" := ("port" := 123 & rnil) & rnil)
     someClient <- newClient
     test $ runReaderT doDeepWork ("httpClient" := someClient & rnil)

-- or

doMuchWork ::
    ( MonadReader (Rec r) m
    , Has "config" r (Rec rc)
    , Has "port" rc Int
    , Has "httpClient" r HTTPClient
    ) => m ()
doMuchWork =
  do doDeepMoreWork
     doDeepWork
```

Moving to our real world data problem, these record already look a lot like JSON. They seem to fit our request/response problem pretty well. In fact the `superrecord` library has a JSON representation built in, that works as expected:

```haskell
toJSON (#name := "Alex" & #age = 23 & rnil)
   == "{\"name\": \"Alex\", \"age\": 23}"
```

This means that we no longer need to write `RequestXX` and `ResponseXX` types, but instead can directly parse as a `superrecord` record and read/write fields as needed when converting to/from business logic types, while automatically having the json parsing/serialization taken care of. There's even an [interesting library][schematic] in the works by Denis Redozubov that could one day provide automatic migrations on top of that.

### Related work

Before looking at how `superrecord` works, we discuss the existing options. We discovered the following Haskell packages: `labels`, `vinyl`, `rawr` and `bookkeeper`.

#### `vinyl`

The [vinyl][vinyl] package is one of the oldest packages, with the first release in 2012. The core type of `vinyl` is:

```haskell
data Rec :: (u -> *) -> [u] -> * where
  RNil :: Rec f '[]
  (:&) :: !(f r) -> !(Rec f rs) -> Rec f (r ': rs)
```

This is basically a heterogeneous linked list that allows tracking it's contents at type level. It's very general, using the first type parameter you can control the structure of individual values. If we provide `Identity`, we basically get a heterogeneous list. If we provide

```haskell
data ElField (field :: (Symbol, *)) where
  Field :: KnownSymbol s => !t -> ElField '(s,t)
```

we can now add a label to each value and thus get the desired anonymous records described earlier. The library provides many useful combinators to work with them, but comes with a major drawback: The core type is a linked list! Thus already each access will be `O(n)` (compared to `O(1)` for native `data` types) - practically meaning that if you read fields "in the back of" the record it will take more time as the record grows. The library also does not have out-of-the-box support for [OverloadedLabels][overloaded-labels] to allow syntax like `get #somefield`, but this could trivially be added.

#### `bookkeeper`

The [bookkeeper][bookkeeper] package is more concrete than `vinyl`, it focuses on anonymous records and encourages the use of `OverloadedLabels`. Take a look at the example from the README:

```haskell
{-# LANGUAGE DataKinds #-}
{-# LANGUAGE TypeOperators #-}
{-# LANGUAGE OverloadedLabels #-}
import Bookkeeper

jane :: Book '[ "name" :=> String, "age" :=> Int ]
jane = emptyBook
     & #name =: "Jane"
     & #age =: 30

-- >>> jane
-- Book {age = 30, name = "Jane"}
-- >>> jane ?: #name
-- "Jane"
```

It also provides a type class to convert to native Haskell types with the same structure (via `Generic`), but unfortunately the core data type is defined as

```haskell
newtype Book' (a :: [Mapping Symbol Type]) = Book { getBook :: Map a }

-- with
data Map (n :: [Mapping Symbol *]) where
    Empty :: Map '[]
    Ext :: Var k -> v -> Map m -> Map ((k :-> v) ': m)
```

which is essentially also a linked list with a degrade in performance compared to native Haskell `data` types.

#### `rawr` and `labels`

Bot [rawr][rawr] and [labels][labels] packages are build around Haskell tuples. Thus, they do not have a core data type, but instead build up records using type classes defined on tuples and a `Field` data type. Taken from the `labels` package:

```haskell
-- | Field named @l@ labels value of type @t@.
-- Example: @(#name := \"Chris\") :: (\"name\" := String)@
data label := value = KnownSymbol label => Proxy label := value

-- with instances
instance Has l a (u1, (:=) l a)
instance Has l a ((:=) l a, u2)
-- ...
```

Records look like this: `(#foo := "hi", #bar := 123)`. This is an interesting idea, especially as GHC can optimize these tuples like native `data` types thus giving similar performance as the type classes explicitly encode a read to a field by getting the n-th element from the tuple. The major drawback here is that it is very tedious to define new type class instances for these records as one must use code generation (e.g. TemplateHaskell) to generate instances for all the tuple combinations up to a certain size.

## SuperRecord

The drawbacks of the mentioned libraries resulted in the design and implementation of `superrecord`. The goals are to provide fast anonymous records while still having a manageable way to define type class instances. This resulted in the idea of having a heterogeneous array holding the values and tracking the contents on type level. We define a core data type:

```haskell
-- | The core record type.
data Rec (lts :: [*])
   = Rec { _unRec :: SmallArray# Any } -- Note that the values are physically in reverse order
```

At type level, we track which field has what position in the physical storage array (in our case, equal to the location in the type level list), and what the type of that field is. We erased the type on the lowest level (all elements are `Any`) and did not use something like `Data.Dynamic` to remove the overhead of useless casting as we - if our type families are correct - certainly know the types of all elements. We did not pick `Vector` from the [vector][vector] library as our holding type, as it internally still does some bounds checking (which we don't need for the same reason). Also `Vector` is represented as `Array#`, but typically records are smaller than 128 fields and we directly freeze all arrays to remain with functional semantics so `SmallArray#` is a better suited representation from a space and performance point of view (e.g. no card table is needed).

With this definition at hand, we can now start building our record library. We also need a type for labeled fields, similar to the `labels` approach

```haskell
data label := value = KnownSymbol label => FldProxy label := !value
```

with which we can now define functions for building a `Rec`. `FldProxy` is `data FldProxy (t :: Symbol) = FldProxy` to allow writing a non-orphan instance `IsLabel l (FldProxy l)` to allow `OverloadedLabels` and the `get #field` notation. To create an empy record we write

```haskell
-- | An empty record
rnil :: Rec '[]
rnil =
    unsafePerformIO $! IO $ \s# ->
    case newSmallArray# 0# (error "No Value") s# of
      (# s'#, arr# #) ->
          case unsafeFreezeSmallArray# arr# s'# of
            (# s''#, a# #) -> (# s''# , Rec a# #)
```

This allocates a new `SmallArray#` with zero elements and directly freezes it. On the type level, we
track that the record is empty `Rec '[]`. To add field and value to the record, we define

```haskell
-- | Prepend a record entry to a record 'Rec'
rcons ::
    forall l t lts s.
    (RecSize lts ~ s, KnownNat s, KeyDoesNotExist l lts)
    => l := t -> Rec lts -> Rec (l := t ': lts)
rcons (_ := val) (Rec vec#) =
    unsafePerformIO $! IO $ \s# ->
    case newSmallArray# newSize# (error "No value") s# of
      (# s'#, arr# #) ->
          case copySmallArray# vec# 0# arr# 0# size# s'# of
            s''# ->
                case writeSmallArray# arr# size# (unsafeCoerce# val) s''# of
                  s'''# ->
                      case unsafeFreezeSmallArray# arr# s'''# of
                        (# s''''#, a# #) -> (# s''''#, Rec a# #)
    where
        !(I# newSize#) = size + 1
        !(I# size#) = size
        size = fromIntegral $ natVal' (proxy# :: Proxy# s)
```

This allocates a new `SmallArray#`, which is one larger that the given array, copies all the
elements (physically pointers) into the new array and writes the new element into the free slot. Finally, the array is frozen again. The new element must also be cast to `Any` using `unsafeCoerce`. At type level, we check that the provided key `l` does not already exist in the existing record `Rec lts`

```haskell
type family KeyDoesNotExist (l :: Symbol) (lts :: [*]) :: Constraint where
    KeyDoesNotExist l '[] = 'True ~ 'True
    KeyDoesNotExist q (l := t ': lts) = KeyDoesNotExist q lts
```

and we compute the size of the existing record

```haskell
type family RecSize (lts :: [*]) :: Nat where
    RecSize '[] = 0
    RecSize (l := t ': lts) = 1 + RecSize lts
```

Finally, we add the label and the new fields type to our record type and get `Rec (l := t ': lts)`. Note that the physical order of the elements is the reverse of the order on type level. There's no up or downside here, we could also copy the old array to an offset `1` and write the new element to position `0`. We only need to keep this in mind when combining two records and reading/writing to them.

Reading a field from the record is now simply

```haskell
-- | Require a record to contain a label
type Has l lts v =
   ( RecTy l lts ~ v
   , KnownNat (RecSize lts)
   , KnownNat (RecVecIdxPos l lts)
   )

-- | Get an existing record field
get ::
    forall l v lts.
    ( Has l lts v )
    => FldProxy l -> Rec lts -> v
get _ (Rec vec#) =
    let !(I# readAt#) =
            fromIntegral (natVal' (proxy# :: Proxy# (RecVecIdxPos l lts)))
        anyVal :: Any
        anyVal =
           case indexSmallArray# vec# readAt# of
             (# a# #) -> a#
    in unsafeCoerce# anyVal
```

using `RecTy l lts` to compute the type of the field with label `l` in record `Rec lts`

```haskell
type family RecTy (l :: Symbol) (lts :: [*]) :: k where
    RecTy l (l := t ': lts) = t
    RecTy q (l := t ': lts) = RecTy q lts
```

and `RecVecIdxPos l lts` to compute the physical index position of the label `l` in the record `Rec lts`.

```haskell
type RecVecIdxPos l lts = RecSize lts - RecTyIdxH 0 l lts - 1

type family RecTyIdxH (i :: Nat) (l :: Symbol) (lts :: [*]) :: Nat where
    RecTyIdxH idx l (l := t ': lts) = idx
    RecTyIdxH idx m (l := t ': lts) = RecTyIdxH (1 + idx) m lts
    RecTyIdxH idx m '[] =
        TypeError
        ( 'Text "Could not find label "
          ':<>: 'Text m
        )
```

Using `natVal'` we bring the index position to value level and read our `SmallArray#` at that position, using `unsafeCoerce` to cast it back to it's original value. Setting a field is implemented using the same information used for `get` and `rcons`. All other operations are either implemented in terms of `get` and `set`, or leverage the presented ideas to compute physical locations from the type structure.

We can also convert our records to and from native Haskell `data` types leveraging `GHC.Generics` in
a very straight forward way:

```haskell
-- | Conversion helper to bring a record back into a Haskell type. Note that the
-- native Haskell type must be an instance of 'Generic'
class ToNative a lts | a -> lts where
    toNative' :: Rec lts -> a x

instance ToNative cs lts => ToNative (D1 m cs) lts where
    toNative' xs = M1 $ toNative' xs

instance ToNative cs lts => ToNative (C1 m cs) lts where
    toNative' xs = M1 $ toNative' xs

instance
    (Has name lts t)
    => ToNative (S1 ('MetaSel ('Just name) p s l) (Rec0 t)) lts
    where
    toNative' r =
        M1 $ K1 (get (FldProxy :: FldProxy name) r)

instance
    ( ToNative l lts
    , ToNative r lts
    )
    => ToNative (l :*: r) lts where
    toNative' r = toNative' r :*: toNative' r

-- | Convert a record to a native Haskell type
toNative :: (Generic a, ToNative (Rep a) lts) => Rec lts -> a
toNative = to . toNative'
```

To implement type classes like `ToJSON`, we implement a reflection mechanism

```haskell
-- | Apply a function to each key element pair for a record
reflectRec ::
    forall c r lts. (RecApply lts lts c)
    => Proxy c
    -> (forall a. c a => String -> a -> r)
    -> Rec lts
    -> [r]
reflectRec _ f r =
    recApply (\(Dict :: Dict (c a)) s v -> f s v) r (Proxy :: Proxy lts)

class RecApply (rts :: [*]) (lts :: [*]) c where
    recApply :: (forall a. Dict (c a) -> String -> a -> r) -> Rec rts -> Proxy lts -> [r]

instance RecApply rts '[] c where
    recApply _ _ _ = []

instance
    ( KnownSymbol l
    , RecApply rts (RemoveAccessTo l lts) c
    , Has l rts v
    , c v
    ) => RecApply rts (l := t ': lts) c where
    recApply f r (_ :: Proxy (l := t ': lts)) =
        let lbl :: FldProxy l
            lbl = FldProxy
            val = get lbl r
            res = f Dict (symbolVal lbl) val
            pNext :: Proxy (RemoveAccessTo l (l := t ': lts))
            pNext = Proxy
        in (res : recApply f r pNext)

type family RemoveAccessTo (l :: Symbol) (lts :: [*]) :: [*] where
    RemoveAccessTo l (l := t ': lts) = RemoveAccessTo l lts
    RemoveAccessTo q (l := t ': lts) = (l := t ': RemoveAccessTo l lts)
    RemoveAccessTo q '[] = '[]
```

which allows to apply a function given some constraints `c` to be applied to each field and value of
a record. For example converting any `Rec lts` to a `aeson` `Value` would look like this:

```haskell
recToValue :: forall lts. (RecApply lts lts ToJSON) => Rec lts -> Value
recToValue r = toJSON $ reflectRec @ToJSON Proxy (\k v -> (T.pack k, toJSON v)) r

instance ( RecApply lts lts ToJSON ) => ToJSON (Rec lts) where
    toJSON = recToValue
    -- toEncoding is also provided, but left out here for simplicity.
```

This confirms that we reached our first goal and can reason about the structure of the `Rec lts` using type classes and type families allowing to write general type class instances and transformations without the need of code generation or other boilerplate.

The library also provides many more type class instances and combinators which can be found on in the [superrecord Haddock documentation][superrecord].

### Benchmarks

To confirm that our second goal, performance, was met, we conduct some benchmarks. We also looked at generated assembler code to confirm that a simple field get with `superrecord` results in the same code as a native field read. We benchmark against the three other approaches (native, tuples and linked lists) via (`labels`, `bookkeeper` and native `data` types).

(all times in **ns**)
| library       |             get | nested get |
| ------------- | --------------: | ---------: |
| native        |             7.7 |       17.1 |
| labels        |             8.1 |       20.2 |
| bookkeeper    |             9.3 |       24.2 |
| superrecord   |             8.0 |       23.0 |

(all times in **µs**)
| library       | json read write |
| ------------- | --------------: |
| native        |           334.9 |
| superrecord   |           274.1 |

TODO: elaborate and more benchmarks...

### Outlook

One idea that surfaced during development was that it may be possible for nested records to inline them into a single `SmallArray#` to speed up nested getting and setting. The problem is that this would remove sharing if one extracted a subrecord and worked with it, but the usual coding path we found in our applications mostly read individual fields (leaves) which would indead benefit from such approach.

Another area of exploration would be database libraries, where SQL is writting in a type driven DSL (for example [opaleye][opaleye]). In the case of joins we the help of anonymous records should greatly simplify library APIs.

## Conclusion

The end result is pretty satisifing: A practical library for anonymous records that is both fast and has an ergonomic interface for both using and extending it.

[reader-t-pattern]: https://www.fpcomplete.com/blog/2017/06/readert-design-pattern
[schematic]: https://github.com/dredozubov/schematic
[vinyl]: https://hackage.haskell.org/package/vinyl
[bookkeeper]: https://hackage.haskell.org/package/bookkeeper
[rawr]: http://hackage.haskell.org/package/rawr
[labels]: http://hackage.haskell.org/package/labels
[vector]: http://hackage.haskell.org/package/vector
[superrecord]: http://hackage.haskell.org/package/superrecord
[opaleye]: http://hackage.haskell.org/package/opaleye
[overloaded-labels]: https://ghc.haskell.org/trac/ghc/wiki/Records/OverloadedRecordFields/OverloadedLabels
