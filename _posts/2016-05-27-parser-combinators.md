---
layout: post
title:  "Parser Combinators"
date:   2016-05-27 23:30:00
---

Today we will explore how to build a small parser combinator library in Haskell from scratch. This blog post is the result of an experiment to see how far I could actually implement this by only looking at the [base][hackage-base] and [text][hackage-text] documentation, explicitly without looking at other parser implementations or examples.

I think most other Haskell parser examples will work on `String`s, but since `String`s come with a lot of downsides I will try to run our parser on `Text` from the [text][hackage-text] package and see where that gets me. Thus, or parser will take a `Text` and return the leftover unparsed `Text`, and a parsed result `a` or a parse error:

{% highlight haskell %}
type ParseError = T.Text
newtype Parser a
	= Parser { runParser :: T.Text -> (T.Text, Either ParseError a) }
{% endhighlight %}

To go on, we should implement useful type classes such as `Functor`, `Applicative`, `Alternative` and `Monad`. This will give us lots of combinators for free.

Now let's define a `Functor` instance for our `Parser`. The complete minimal definition is `fmap :: (a -> b) -> f a -> f b` (apply a function `a -> b` to the "contained" value of `f`):

{% highlight haskell %}
instance Functor Parser where
    fmap f (Parser parse) =
        Parser $ \txt ->
        let (rest, result) = parse txt
        in (rest, fmap f result)
{% endhighlight %}

Next up is the `Applicative` instance which requires the definitions of `pure :: a -> f a` to lift a value `a` into the `f` "universe", and `(<*>) :: f (a -> b) -> f a -> f b` to sequentially apply two computations and combine the result.

{% highlight haskell %}
instance Applicative Parser where
    pure val = Parser $ \txt -> (txt, Right val)
    (Parser funParser) <*> continue =
        Parser $ \txt ->
        let (rest, result) = funParser txt
        in case result of
            Left err -> (rest, Left err)
            Right f -> runParser (fmap f continue) rest
{% endhighlight %}

The `<*>` implementation is a little bit more interesting, so here is what is does in words: first, we run the left hand parser to receive the function (`a -> b`) which we must apply to the value of the second parser. Then, we either propagate failure, or we use our previously defined `Functor` instance to convert the second parser `Parser a` to a `Parser b` and then run that on the left over of the left hand parser.

After defining `Applicative` we will also implement it's close friend and very handy `Alternative`:

{% highlight haskell %}
instance Alternative Parser where
    empty = Parser $ \txt -> (txt, Left "Parsing failed!")
    (Parser pa) <|> otherParser =
        Parser $ \txt ->
        case pa txt of
          full@(_, Right _) -> full
          _ -> runParser otherParser txt
{% endhighlight %}

`empty` is just a failing `Parser` that does nothing - this is because we can not invent an arbitrary `a`. `<|>` will first try to run the left hand side parser, and if that succeeds then it will return the result. Otherwise, the right hand parser is run.

Now it's time for becoming a `Monad`!

{% highlight haskell %}
instance Monad Parser where
    return = pure
    fail errMsg = Parser $ \txt -> (txt, Left $ T.pack errMsg)
    (Parser parse) >>= next =
        Parser $ \txt ->
        let (leftOver, res) = parse txt
        in case res of
             Left errMsg -> (leftOver, Left errMsg)
             Right val -> runParser (next val) leftOver
{% endhighlight %}

With all those abstract concepts implemented, we are ready to write concrete parsers. Let's start out by writing a parser that reads input until the predicate on each subsequent character fails:

{% highlight haskell %}
satisfy :: (Char -> Bool) -> Parser T.Text
satisfy f =
    Parser $ \txt ->
    let (matches, rest) = T.span f txt
    in (rest, Right matches)
{% endhighlight %}

This is very simple because the `text` library already provides a function `span :: (Char -> Bool) -> Text -> (Text, Text)` that essentially does the heavy lifting efficiently for us. We also want a `satisfy1` function, that requires that we read at least one character:

{% highlight haskell %}
satisfy1 :: (Char -> Bool) -> Parser T.Text
satisfy1 f =
    satisfy f >>= \res ->
    do when (T.null res) $ fail "skipWhile1 didn't ready anything!"
       pure res
{% endhighlight %}

This combination gives us `skileWhile` and `skipWhile1` for free:

{% highlight haskell %}
skipWhile :: (Char -> Bool) -> Parser ()
skipWhile = void . satisfy

skipWhile1 :: (Char -> Bool) -> Parser ()
skipWhile1 = void . satisfy1
{% endhighlight %}

Now we'll write a parser for a specific single character `Char`  and a whole string `T.Text`.

{% highlight haskell %}
char :: Char -> Parser Char
char c =
    Parser $ \txt ->
    case T.uncons txt of
      Just (firstC, rest) | firstC == c -> (rest, Right c)
      _ -> (txt, Left $ T.pack $ "Expected a " ++ show c)

string :: T.Text -> Parser T.Text
string t =
    Parser $ \txt ->
    let tlen = T.length t
    in if T.take tlen txt == t
       then (T.drop tlen txt, Right t)
       else (txt, Left $ T.pack $ "Expected " ++ show t)
{% endhighlight %}

To implement parsers for `Int` and `Double` we will cheat a little and use the `read :: Read a => String -> a` function from base. Usually I'd go for the `readMay :: Read a => String -> Maybe a` from the [safe][hackage-safe] package, but thanks to our already defined parser combinators we can be quite sure that our `read` will not crash at runtime:

{% highlight haskell %}
numStarter :: Parser T.Text
numStarter =
    do optNeg <- optional (char '-')
       rest <- satisfy1 isDigit
       pure $ maybe rest (`T.cons` rest) optNeg

int :: Parser Int
int = fmap (read . T.unpack) numStarter

double :: Parser Double
double =
    do firstPart <- numStarter
       secondPart <-
           optional $
           do ch <- char '.'
              rest <- satisfy1 isDigit
              pure (ch `T.cons` rest)
       pure $ (read . T.unpack) (firstPart <> fromMaybe "" secondPart)
{% endhighlight %}

Now is probably a good time to define some unit tests for our parsers. We use excellent [HTF][hackage-htf] package for this:

{% highlight haskell %}
test_char :: IO ()
test_char =
    do assertEqual ("Fooo", Right 'c') (runParser (char 'c') "cFooo")
       assertEqual ("Fooo", Left "Expected a 'c'") (runParser (char 'c') "Fooo")
       assertEqual ("", Left "Expected a 'c'") (runParser (char 'c') "")

test_string :: IO ()
test_string =
    do assertEqual ("Fooo", Right "cc") (runParser (string "cc") "ccFooo")
       assertEqual ("Fooo", Left "Expected \"cc\"") (runParser (string "cc") "Fooo")
       assertEqual ("", Left "Expected \"cc\"") (runParser (string "cc") "")

test_int :: IO ()
test_int =
    do assertEqual ("bar", Right 23) (runParser int "23bar")
       assertEqual ("bar", Right (-23)) (runParser int "-23bar")
       assertEqual (".bar", Right 23) (runParser int "23.bar")
       assertEqual ("a23.bar", Left "skipWhile1 didn't ready anything!") (runParser int "a23.bar")
       assertEqual ("", Left "skipWhile1 didn't ready anything!") (runParser int "")

test_double :: IO ()
test_double =
    do assertEqual ("bar", Right 23) (runParser double "23bar")
       assertEqual ("bar", Right (-23)) (runParser double "-23bar")
       assertEqual ("bar", Right 23.2) (runParser double "23.2bar")
       assertEqual (".bar", Right 23) (runParser double "23.bar")
       assertEqual ("a23.bar", Left "skipWhile1 didn't ready anything!") (runParser double "a23.bar")
       assertEqual ("", Left "skipWhile1 didn't ready anything!") (runParser double "")
{% endhighlight %}

Great, our basic building blocks seem to be working! As you can see the error messages our parsers produce are not quite useful (yet?), but this might be material a possible blog post in the near future.

Now let's write a parser for this simple data file:

{% endhighlight %}
language: haskell; type: functional;
language: purescript; type: functional;
language: java; type: oop;
{% endhighlight %}

into these Haskell types:

{% highlight haskell %}
data LanguageType
   = LanguageTypeFunctional
   | LanguageTypeOOP
   deriving (Show, Eq)

data Language
   = Language
   { l_name :: T.Text
   , l_type :: LanguageType
   } deriving (Show, Eq)

type LangList = [Language]
{% endhighlight %}

Let's start off by writing parsers for the building blocks, with tests:

{% highlight haskell %}
langType :: Parser LanguageType
langType =
    LanguageTypeFunctional <$ string "functional"
    <|> LanguageTypeOOP <$ string "oop"

langName :: Parser T.Text
langName = satisfy1 (\c -> not (isSpace c) && c /= ';')

test_langType :: IO ()
test_langType =
    do assertEqual ("", Right LanguageTypeFunctional) (runParser langType "functional")
       assertEqual ("", Right LanguageTypeOOP) (runParser langType "oop")
       assertEqual ("foobar", Left "Expected \"oop\"") (runParser langType "foobar")

test_langName :: IO ()
test_langName =
    do assertEqual ("", Right "haskell") (runParser langName "haskell")
       assertEqual ("", Right "java") (runParser langName "java")
       assertEqual (" bar baz", Right "java") (runParser langName "java bar baz")
{% endhighlight %}

and combining them to parse a single row:

{% highlight haskell %}
skipVertSpace :: Parser ()
skipVertSpace = skipWhile (\c -> c == ' ' || c == '\t')

lang :: Parser Language
lang =
    do void $ string "language:" *> skipVertSpace
       name <- langName
       skipVertSpace
       void $ char ';'
       skipVertSpace
       void $ string "type:" *> skipVertSpace
       ty <- langType
       skipVertSpace
       void $ char ';'
       skipVertSpace
       pure (Language name ty)

test_lang :: IO ()
test_lang =
    do assertEqual ("", Right $ Language "haskell" LanguageTypeFunctional)
           (runParser lang "language: haskell; type: functional;")
       assertEqual ("", Right $ Language "java" LanguageTypeOOP)
           (runParser lang "language:java; type:oop; ")
       assertEqual ("language1:!java; type:oop; ", Left "Expected \"language:\"")
           (runParser lang "language1:!java; type:oop; ")
{% endhighlight %}

To write a parser for the while file, we need to introduce two new parser combinators. `sepBy` will be used to parse values separated by a separator:

{% highlight haskell %}
sepBy :: Parser val -> Parser sep -> Parser [val]
sepBy valP sepP =
    do listHead <- optional valP
       case listHead of
         Nothing -> pure []
         Just x ->
             do rest <- many (sepP *> valP)
                pure (x : rest)
{% endhighlight %}

and `endOfInput` is a combinator to check if we consumed all input:

{% highlight haskell %}
endOfInput :: Parser ()
endOfInput =
    Parser $ \txt ->
    if T.null txt
    then (txt, Right ())
    else (txt, Left "Expecting endOfInput")
{% endhighlight %}

Putting it all together, or file parser (with test of course!) will look like this:

{% highlight haskell %}
langFile :: Parser LangList
langFile =
    (lang `sepBy` char '\n') <* skipWhile isSpace <* endOfInput

test_langFile :: IO ()
test_langFile =
    assertEqual ("", Right langList) (runParser langFile sampleFile)
    where
      langList =
          [ Language "haskell" LanguageTypeFunctional
          , Language "purescript" LanguageTypeFunctional
          , Language "java" LanguageTypeOOP
          ]
      sampleFile =
          T.unlines
          [ "language: haskell; type: functional;"
          , "language: purescript; type: functional;"
          , "language: java; type: oop;"
          ]
{% endhighlight %}

Success! Now this is just the beginning of a parser combinator library, there are still many areas to be explored such as nicer error messages, backtracking and performance concerns. You should probably use one of the awesome parser combinator libraries out there that address these issues:

* [attoparsec][hackage-attoparsec]: Addresses backtracking and performance concerns
* [parsec][hackage-parsec]: Addresses error messages and backtracking (`try` operator)
* [megaparsec][hackage-megaparsec]: modern version of `parsec`
* (and many more...)

That's all for now - a working project can be found on [GitHub: agrafix/parser-playground][gh-project]. To build and run the tests, clone the project an run `stack test`.

[hackage-text]: http://hackage.haskell.org/package/text-1.2.2.1
[hackage-base]: http://hackage.haskell.org/package/base-4.8.2.0
[hackage-safe]: http://hackage.haskell.org/package/safe-0.3.9
[hackage-htf]: http://hackage.haskell.org/package/HTF-0.13.1.0
[hackage-attoparsec]: http://hackage.haskell.org/package/attoparsec
[hackage-parsec]: http://hackage.haskell.org/package/parsec
[hackage-megaparsec]: http://hackage.haskell.org/package/megaparsec
[gh-project]: https://github.com/agrafix/parser-playground/tree/17d5715bf3fce85b09bde78b5bc04c89e29b8e51