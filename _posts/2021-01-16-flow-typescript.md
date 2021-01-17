---
layout: post
title:  "Flow vs. TypeScript: A Real-World Case Study"
date:   2021-01-16 23:30:00
---

This week I was reviewing a pull request and the author had disabled [Flow type-checking](https://flow.org/) for a specific line via `$FlowDisableLine`. A simplified version of the code:

```javascript
/* @flow */

// auto-generated from our api
type CreateRequest = {
  user: {
    name: string,
  }
};

type UpdateRequest = {
  user: {
    name?: string,
  }
};

// custom code written
type MyRequest 
  = {type: 'create', payload: CreateRequest} 
  | {type: 'update', payload: UpdateRequest};

type Form = {
  user: {
    name : string,
  }
};

function formToRequest(type: 'create' | 'update', form: Form): MyRequest {
  if (type === 'create') {
    return {type: 'create', payload: {...form}};
  }
  return {type: 'update', payload: {...form}}; // $FlowDisableLine
}
```

The comment suppressed the following error (as of flow v0.142.0):

```
31:   return {type: 'update', payload: {...form}};
                                       ^ Cannot return object literal because string [1] is incompatible with undefined [2] in property `payload.user.name`. [incompatible-return]
References:
23:     name : string,
               ^ [1]
12:     name?: string,
               ^ [2]
```

At first sight, this seemed odd: the `UpdateRequest` type allows the `user.name` field to be `undefined` or a `string` and `user.name` in `Form` is a `string`, so why does flow complain about this?

Since disabling flow causes the loss of type-safety in how (in this example) API calls are constructed, I wanted to investigate this deeper.

## References and Mutability

Let's assume flow didn't throw an error and we wrote the following code calling our function from above:

```javascript
var form = {user: {name: "Alex"}};
var request = formToRequest("update", form);
```

As expected, the type of `form` is `Form` and the type of `request` is `MyRequest`. However, we can change the value of `form` to no longer be conform to the type `Form`:

```javascript
if (request.type === 'update') {
  request.payload.user.name = undefined;
}

console.log(form); // prints: {user: {name: undefined}}
```

Hence, the type the type checker considers for `form` doesn't match up with what happens at runtime anymore.

## The Fix

To fix this, we needed to copy `user` in our `formToRequest` implementation:

```javascript
function formToRequest(type: 'create' | 'update', form: Form): MyRequest {
  if (type === 'create') {
    return {type: 'create', payload: {...form}};
  }
  return {type: 'update', payload: {user: {...form.user}}};
}
```

Now, the return value can be changed without affecting the input parameters. 

### Alternative Fix: Annotate Fields as Read-Only

One could also mark the `name` field as read-only in the type definitions:

```javascript
type CreateRequest = {
  user: {
    +name: string,
  }
};

type UpdateRequest = {
  user: {
    +name?: string,
  }
};

type Form = {
  user: {
    +name : string,
  }
};
```

This wasn't an option in our case since `CreateRequest` and `UpdateRequest` are library provided. But, if available, this would have been my preferred fix: I personally like to avoid mutability to simplify reasoning about code.

## What about TypeScript?

It took the author and me a while to understand this -- it's not easy to reason through since the error only becomes apparent when considering how the function could be called. 

To contrast Flow with [TypeScript](https://www.typescriptlang.org/), TypeScript (as of v4.1.3) doesn't consider the original code invalid. This is [by design](https://www.typescriptlang.org/docs/handbook/type-compatibility.html) and wouldn't have produced any errors.

Did TypeScript make the right call? I think it depends. 

In some code bases, object property mutation like `request.payload.user.name = undefined;` is banned via ESLint requiring making an updated copy of the object. With that setting in mind, TypeScript would have saved us quite a bit of time with similar safety guarantees. 

Without ESLint, considering that ESLint can (and will be) disabled for certain pieces of code or third party libraries that don't follow this ESLint configuration, Flow is certainly going to catch more errors before they hit production.