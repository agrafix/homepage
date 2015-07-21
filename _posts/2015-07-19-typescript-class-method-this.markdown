---
layout: post
title:  "TypeScript and 'this' in class methods"
date:   2015-07-19 14:09:35
---

At [Checkpad][cp] we are moving JavaScript code to [TypeScript][ts]. Apart from some initial "take-off" issues like finding, modifying and/or writing missing [.d.ts files][dts] for libraries, or getting our build pipeline to work, the process was pretty smooth. A few months into that, I've discovered some road bumps and will share one today.

I'm currently writing a web frontend for a new feature of our product using TypeScript and [React][react] ([TypedReact][typed-react]). While working with callbacks and class methods I've discovered a flaw (or more a missing feature) in the compiler. Consider the following code:

{% highlight javascript %}
class Foo {
    private bar: string = "Bar";
        
    logBar(): void {
        console.log("Bar's value is: " + this.bar);
    }
}
    
// many javascript frameworks rebind the this context for callbacks,
// see for example jQuery's $("foo").click or React's onClick will bind to the
// DOM element firing the event
function fireCallback(cb: (() => any)): void {
    let someObj = {
        hello: "42"
    };
    cb.call(someObj);
}
    
let x = new Foo();
fireCallback(x.logBar);
{% endhighlight %}

The naive expected output would be: `Bar's value is: Bar`. Let's compile the snippet and run it:

```
$ tsc --version
message TS6029: Version 1.5.0-beta
$ tsc --noImplicitAny main.ts && node main.ts
Bar's value is: undefined
```

That's not the expected result! `this.bar` is `undefined`. Looking at the code again it's quite obvious why this happened: We can change the context of `this` and bypass the TypeScript type checker. The type system does not track the type of `this` correctly. Luckily there are suggestions to fix that (see [Github Issue #3694][gh-3694] for example), but these will take a while to ripe. That's why I would suggest that the TypeScript compiler automatically performs a transformation on class methods as arguments to preserve the `this` context like so:

{% highlight javascript %}
fireCallback((...args: any[]) => x.logBar.call(x, args));
{% endhighlight %}

This should be okay, be cause inside a method the compiler assumes that `this` is of the classes type so there's no way to interact with later bound `this` contexts anyhow. 

I've filed an [issue][gh-3927], let's see what the community and the typescript team thinks!

### Update July 21, 2015

Unfortunately the ES6 standard seems to define "broken" `this` semantics. TypeScript wants to strictly comply to the standard, so they probably will not change anything here (soon). We came up with a better proposal to fix the wrong `this` semantics which you could use as coding convention in your code:

{% highlight javascript %}
class Foo {
    private bar: string = "Bar";

    logBar = () => {
        console.log("Bar's value is: " + this.bar);
    }
}
{% endhighlight %}

This is about 25% slower when called, but at least you get expected `this` semantics. Hopefully TypeScript will add proper `this`-typing to their type system soon.


[cp]: http://www.checkpad.de
[ts]: http://www.typescriptlang.org/
[dts]: https://github.com/borisyankov/DefinitelyTyped
[gh-3694]: https://github.com/Microsoft/TypeScript/issues/3694
[gh-3927]: https://github.com/Microsoft/TypeScript/issues/3927
[react]:https://facebook.github.io/react/
[typed-react]:https://github.com/Asana/typed-react