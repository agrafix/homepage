---
layout: post
title:  "Optimistic UI and Reactive Programming with Elm"
date:   2015-07-26 13:18:00
tags:   blog
---

I'm still on the hunt for "the right" programming language for web front-ends. JavaScript is fun and very good for quickly hacking together something, but as soon as your project grows you either need a large number of tests and discipline or your going to break something with every refactoring. TypeScript seemed like a good rescue - but coming from Haskell I have high standards for type systems and the TypeScript one still has [loop holes][ts-this]. The other problem with both languages is, that you are responsible for managing and syncing your state and model correctly. [React][react-js] and [other][rxjs] [frameworks][ember] help you with this, but you still have to use them [correctly][flux] and there's always a way to sneak around. [Elm][elm] to the rescue? Let's see!

**Warning: the recent [Elm Version][elm-18] does things a bit differently, so this walk-through will not work anymore**

## Diving into Elm

*If you're not new to Elm, jump to section 'Real world Elm'*

A [typical Elm program][elm-arch] is divided into three parts: view, model and update.

### The model

The model defines your local state
{% highlight haskell %}
type Operation
   = AddOp
   | SubOp

type alias Model =
    { displayed : Int
    , lastResult : Int
    , op : Operation
    }
{% endhighlight %}

### The update

The update part defines a pure function running an action on your model
{% highlight haskell %}
type Action
   = PressNumber Int
   | Add
   | Subtract
   | Result
   | Clear
   | ClearAll

update : Action -> Model -> Model
update action model =
    case action of
        PressNumber i ->
            let (Ok newNumber) = String.toInt (toString model.displayed ++ toString i)
            in { model | displayed <- newNumber }
        Add ->
            { model | displayed <- 0, lastResult <- model.displayed, op <- AddOp }
        -- ...
{% endhighlight %}

### The view

The view is just a pure function converting your model into something "renderable" like HTML or a canvas image.
{% highlight haskell %}
header : Html
header =
    div' { class = "header clearfix "}
    [ nav_  []
    , h3' { class = "text-muted" } [ text "Elm Calculator" ]
    ]

view : Signal.Address Action -> Model -> Html
view address model =
    let numBtn i =
            colXs_ 3 [ btnDefault_ { btnParam | label <- Just (toString i) } address (PressNumber i) ]
        opBtn desc op =
            colXs_ 3 [ btnPrimary_ { btnParam | label <- Just desc } address op ]
    in container_
        [ header
        , div' { class = "result" } [ text (toString model.displayed) ]
        , div' { class = "num-pad "}
           [ row_ [ numBtn 1, numBtn 2, numBtn 3, opBtn "+" Add ]
           , row_ [ numBtn 4, numBtn 5, numBtn 6, opBtn "-" Subtract ]
           , row_ [ numBtn 7, numBtn 8, numBtn 9, opBtn "=" Result ]
           , row_ [ opBtn "Clear" Clear, opBtn "Clear All" ClearAll ]
           ]
        ]
{% endhighlight %}

It's really just that simple. And it comes with some cool advantages: Your `update` function is pure! This means you can test is very easily. There's a simple package to wire all this together called [start-app][elm-startapp].

### Wiring it all up
{% highlight haskell %}
main =
    StartApp.start
    { model = init
    , update = update
    , view = view
    }
{% endhighlight %}

That's all that's needed for a tiny calculator. I left out the "boring" parts like imports and the full `update` implementation, but the full code for this calculator is [available][elm-calc].

Coming from Haskell implementing this was pretty quick and fun. The only major issue I came across was that it's quite hard to explore the [Elm ecosystem][elm-packages]. The types in the documentation are not yet hyperlinked, so it's difficult to trace down what comes from where and how everything should work together.

## Real world Elm

The next logical step for me was to try out Elm in the real world. The frontend of [TramCloud][tc] currently heavily relies on React and JavaScript; but it's also very modular so I decided to implement a new component using Elm. I first created a new module to access the backend API:

{% highlight haskell %}
module Lib.Api where

import Http
import Json.Decode as Json exposing ((:=))
import Task exposing (..)

type alias ReferenceProfileId = Int

type alias ReferenceProfile =
    { id: ReferenceProfileId
    , name : String
    , notes : String
    , measurePointOffset : Float
    , profile : RawMeasurement
    }

referenceProfileDec : Json.Decoder ReferenceProfile
referenceProfileDec =
    Json.object5 ReferenceProfile
        ("id" := Json.int)
        ("name" := Json.string)
        ("notes" := Json.string)
        ("measurePointOffset" := Json.float)
        ("data" := rawMeasurementDec)

-- ...

listReferenceProfiles : Task Http.Error (List (ReferenceProfile))
listReferenceProfiles =
    Http.get (Json.list referenceProfileDec) "/api/referenceprofile/list"

deleteReferenceProfile : ReferenceProfileId -> Task Http.Error Bool
deleteReferenceProfile rpid =
    let bdy = Http.multipart [ Http.stringData "profile-id" (toString rpid) ]
    in Http.post Json.bool "/api/referenceprofile/delete" bdy

-- (don't worry - the endpoints are fake)
{% endhighlight %}

The `Json.Decoder` needs to match our Haskell [aeson][hs-aeson] instance for the type, and I don't think writing all this by hand is a good idea. But I've already got something planned to automatically generate an Elm API module from Haskell using [Spock][hs-spock] and [highjson][hs-highjson]. Stay tuned for that ;-)

Now we need to write the actual logic working with these `ReferenceProfile`s. We would like to define a table to display them and allow actions like modifying and deleting. This means jumping through the same steps as before: model, view and update:

### The model

The model is just the list of `ReferenceProfile`s:
{% highlight haskell %}
type alias Model =
    { list : List Api.ReferenceProfile
    }

initModel =
    { list = []
    }
{% endhighlight %}

### The update

The update part is a little bit more complex, as we want [optimistic UI][meteor-latency]. Let's define our actions first:
{% highlight haskell %}
type ServerMessage
    = ProfileList (List (Api.ReferenceProfile))
type ServerQuery
    = SqRefreshProfiles
    | SqDeleteProfile Api.ReferenceProfileId
    | SqNoop
type Action
    = ServerAction ServerMessage
    | ClientAction ServerQuery
{% endhighlight %}

The `ServerQuery` are the possible queries that can be sent to the server. The `ServerMessage` are the possible responses. The `Action`s on the model are a combination of the queries and the responses. This is important, as that's used to implement optimistic UI.

Now wee need several [Mailbox][elm-mailbox]es to manage queries and responses:
{% highlight haskell %}
serverResults : Signal.Mailbox (Maybe ServerMessage)
serverResults =
    Signal.mailbox Nothing

serverQuery : Signal.Mailbox (Maybe ServerQuery)
serverQuery =
    Signal.mailbox Nothing
{% endhighlight %}

These will be wired together using a [port][elm-port]:
{% highlight haskell %}
runQuery : ServerQuery -> Task Http.Error (Maybe ServerMessage)
runQuery q =
    case q of
        SqRefreshProfiles ->
            Task.map (Just << ProfileList) Api.listReferenceProfiles
        SqDeleteProfile pid ->
            Task.map (Just << ProfileList) (Api.deleteReferenceProfile pid `Task.andThen` \_ -> Api.listReferenceProfiles)
        SqNoop ->
            Task.succeed Nothing

port apiRequestPort : Signal (Task Http.Error ())
port apiRequestPort =
    serverQuery.signal
    |> Signal.filterMap identity SqRefreshProfiles
    |> Signal.map runQuery
    |> Signal.map (\task -> task `Task.andThen` Signal.send serverResults.address)
{% endhighlight %}

You can think of a port as task runner for [Task][elm-task]s that need to interface with the outside world. Note the default `SqRefreshProfiles` in `filterMap` to load everything on app launch once. Now we are ready to define our update function:

{% highlight haskell %}
update : Action -> Model -> Model
update a m =
    case a of
        ServerAction (ProfileList l) -> { m | list <- l }
        ClientAction SqNoop -> m
        ClientAction SqRefreshProfiles -> m
        ClientAction (SqDeleteProfile x) -> { m | list <- List.filter (\p -> p.id /= x) m.list }
{% endhighlight %}

Nothing surprising here, just applying the actions to our model.

### The view

Just rendering the `Model` to `Html` and wiring our `Address` to our button(s).
{% highlight haskell %}
view : Signal.Address ServerQuery -> Model -> Html
view addr m =
    div_
    [ div' { class = "page-header" } [ h1_ "Reference profiles: Catalog" ]
    , tableStriped_
        [ thead_
            [ Html.th [ Html.style [ ("width", "100px") ] ] [ text "profile" ]
            , Html.th [ Html.style [ ("width", "100px") ] ] []
            , th_ [ text "name" ]
            , th_ [ text "measurepoint "]
            , th_ [ text "description "]
            , th_ []
            ]
        , tbody_ (List.map (referenceProfileRow addr) m.list)
        ]
    ]

referenceProfileRow : Signal.Address ServerQuery -> Api.ReferenceProfile -> Html
referenceProfileRow addr rp =
    let buttons =
            [ btnSmDefault_
                    { btnParam
                        | label <- Just "delete"
                        , icon <- Just glyphiconTrash_
                    } addr (SqDeleteProfile rp.id)
            ]
    in tr_
        [ td_ [ Rp.renderProfile 100 100 rp.profile.leftData ]
        , td_ [ Rp.renderProfile 100 100 rp.profile.rightData ]
        , td_ [ text rp.name ]
        , td_ [ text (toString rp.measurePointOffset ++ " mm") ]
        , td_ [ text rp.notes ]
        , td_ buttons
        ]
{% endhighlight %}

### Wire it up

Now we need to connect everything:

* Signals coming from the UI and the Server should go into our `update` function and fold over our `Model`
* Signals coming from the UI should trigger custom logic that may send HTTP requests (`serverQuery` mailbox)
* The UI should not be able to send an empty (`Nothing`) signal.
{% highlight haskell %}
main : Signal Html
main =
    let address = Signal.forwardTo serverQuery.address Just
        serverSignals : Signal Action
        serverSignals =
            Signal.filterMap (Maybe.map ServerAction) (ServerAction (ProfileList [])) serverResults.signal
        clientSignals : Signal Action
        clientSignals =
            Signal.filterMap (Maybe.map ClientAction) (ClientAction SqNoop) serverQuery.signal
        model =
            Signal.foldp (\action model -> update action model) initModel (Signal.merge clientSignals serverSignals)
    in Signal.map (view address) model
{% endhighlight %}

That's it! Optimistic UI, talking to a Rest API, a good looking UI and maintainable code. All this took a day to figure out and once it typechecked it worked. Cool! I can not draw any final conclusion on Elm yet (have not used it enough), but it looks very promising. I will continue to use it for now.

## Comments

Looking forward to your Feedback on [Reddit][reddit-post] and [HackerNews][hn-post].

[ts-this]: /2015/07/19/typescript-class-method-this.html
[react-js]: https://facebook.github.io/react/
[flux]: https://facebook.github.io/flux/docs/overview.html
[rxjs]: http://reactivex.io/
[ember]: http://emberjs.com/
[elm]: http://elm-lang.org/
[elm-18]: http://elm-lang.org/blog/the-perfect-bug-report
[elm-arch]: https://github.com/evancz/elm-architecture-tutorial/
[elm-calc]: https://gist.github.com/agrafix/a267a7e0e34566aad829
[elm-startapp]: http://package.elm-lang.org/packages/evancz/start-app/1.0.1
[elm-packages]: http://package.elm-lang.org/packages
[tc]: https://www.tramcloud.net
[hs-aeson]: http://hackage.haskell.org/package/aeson
[hs-spock]: http://hackage.haskell.org/package/Spock
[hs-highjson]: http://hackage.haskell.org/package/highjson
[meteor-latency]: http://info.meteor.com/blog/optimistic-ui-with-meteor-latency-compensation
[elm-mailbox]: http://package.elm-lang.org/packages/elm-lang/core/2.1.0/Signal#Mailbox
[elm-port]: http://elm-lang.org/guide/interop
[elm-task]: http://package.elm-lang.org/packages/elm-lang/core/2.1.0/Task
[reddit-post]: https://www.reddit.com/r/elm/comments/3enlub/optimistic_ui_and_reactive_programming_with_elm/
[hn-post]: https://news.ycombinator.com/item?id=9950901
