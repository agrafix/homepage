---
layout: post
title:  "Making the Most of Code Review"
date:   2021-01-18 23:30:00
---

Code review is one of the most important tools for successful collaboration on large code bases. It's an easy way to learn from each other and maintain a high code quality bar.

In the following I'd like to share how I approach code review in attempt to maximize it's success.

## Approach
Code review should be methodical and principled. Otherwise, it'll be inconsistent and potentially biased, making it less effective and a source of friction for you and your team. 

That's why I've developed a 5 step approach that I always follow for any code I'm asked to review.

### Step 1: Description
Every change should be accompanied with a human readable description. This can either be a long form message in a git commit, or a pull request description, or an entire design document.

A good description consists of the motivation for the change (why and why now?) as well as prose elaborating the change itself. Diagrams or screenshots can help explaining the code change.

The description is important because it helps keeping pull requests focused, it makes it easy to refer to the change later (and understand why it was made) and sets clear expectations for the reviewer.

As a reviewer, if you don't understand the motivation or the description of the change, send the pull request back asking clarifying questions. The answers to those questions should flow back into an updated description.

### Step 2: Tests
The next thing I consider is tests. As a reviewer, you can deduce which tests to expect by reading the description. For instance, if the description contains *"implement a function to validate a username. a valid username is defined by [...]"* you'd expect unit tests calling a function with different usernames asserting on different outcomes/error messages. 

Tests are a good starting point because they surface many common mistakes early. Let's consider the username validation function with a few examples:
* If you find the tests calling the mentioned username validation function with integers instead of username strings, the type signature of the function is likely weak/incorrect. 
* If you find the tests doing lot's of (irrelevant) setup code, the interface of the function is potentially not chosen correctly. 
* If the tests assert something seemingly unrelated, the change either includes unrelated changes, has unintended side-effects or the tests themselves are poorly constructed.

If you don't think the tests align with the description, or there are no tests, or the tests are unfocused or don't cover at minimum key use- and edge-cases, send back the pull request with this feedback.

### Step 3: Implementation
Reviewing tests helps surface implementation flaws quickly, but tests by themselves don't prevent the implementation from diverging from the actual intent. As a reviewer, you are responsible to check that the implementation is consistent with the tests. If that's not the case, the code change has additional unrelated changes or missing tests. Code-coverage tools highlighting affected lines can help with this.

After confirming consistency, I recommend thinking about types, interfaces and concepts. This comes up while reviewing tests too (e.g. lot's of setup code usually points to poor interfaces), but it's useful to consider this in isolation. My usual starting questions:
* Do introduced/modified types translate to easy-to-understand real world concepts? 
* How self-contained is the implementation? How much context (about the rest of the system) do I need to reason about the code at hand?
* Would code comments help me understand the code quicker? Comments explaining the *what* are indicative of an unclear implementation (or don't add any value), comments explaining the *why* in strategic places can get the reader on track quickly.

### Step 4: Rollout Strategy
Last but not least: large code bases usually have non-trivial deployment processes and power critical systems where any downtime needs to be avoided.

To reduce the risk during deployment, every change should have a clear rollout strategy. My key questions are centered around backward/forward compatibility and planning ahead:

Does the change assume an atomic rollout? This assumption can become a burden even in simple client/server applications (e.g. an API and a single-page-application): there's no guarantee that deployment happens in lockstep -- if the client starts sending requests the server doesn't "understand" yet, your service will experience a downtime. A similar common pitfall are database schema changes; for instance adding a new enum option to an existing enum column will cause old consumers to crash when reading a record with the new option.

Can the change *easily* be reverted? If something unexpected does happen, how quickly can it be resolved? The best possible answer is that a single service needs a configuration/feature flag update easily triggered from a web-UI disabling the change. A worst possible answer is that multiple services need unspecified/unknown manual intervention. There's no blanket answer what's best and it depends on the scope and risk of the change itself.

As a reviewer, you should be reasonably pessimistic: Things will go wrong and a careful rollout strategy can save the day. Work with the author such that you are confident in judging the risks and that the rollout strategy addresses them adequately.

### Step 5: "gut check"

Before pressing approve, I ask myself a final question: Would I agree to take over deploying the change while the original author is entirely unavailable to help me? Only if the answer is yes, I proceed.

## Code Review is a Conversation

Wrapping up, always remember that code review is a conversation with another human. Both the author and reviewer should enter code review with that mindset: A good way to think about code review is picturing doing the review itself face-to-face.

Imagine entering a room to get your work reviewed in person and your reviewer yells at you: "FIX THIS! FIX THAT! THIS IS BAD!". Or, imagine spending non trivial amounts of time to carefully and constructively review a code change to which the author responds by telling you that you are wrong and they will proceed with their version anyways. Both are unprofessional, unproductive and uncomfortable situations -- most importantly they are avoidable!

As a reviewer, do everything you can to make sure your commentary is constructive (and understood as such). As an author embrace any feedback, don't take it personal and try to learn from it. If you notice that the written communication is causing friction or leading to misunderstandings, seek a face-to-face conversation early (video call or in person meeting) and talk it over.