---
layout: post
title:  "Making the Most of Code Review"
date:   2021-01-18 23:30:00
tags:   blog
---

Code review is one of the most important tools for successful collaboration on large code bases. It's an easy way to learn from each other and maintain a high code quality bar.

In the following I'd like to share how I approach code review to make it useful for both the author and the reviewer.

## Approach
Having a consistent approach to code review helps reduce blind spots and makes expectations clearer for everyone on the team.

For substantial changes to production systems, I use the following five steps as a guide. The depth of review should reflect the scope and risk of the change; a small fix rarely needs the same process as a large refactor.

### Step 1: Description
A clear description gives the reviewer a starting point. Depending on the change, this might be a short git commit message, a pull request description, or a separate design document.

A good description explains the motivation for the change (why and why now?) and outlines the change itself. Diagrams or screenshots can help when prose alone isn't enough.

The description helps keep pull requests focused, makes it easier to understand the change later, and sets expectations for the reviewer.

If the motivation or description is unclear, ask clarifying questions early. Work with the author to capture the answers in the description so future readers can benefit from the discussion too.

### Step 2: Tests
The next thing I consider is tests. As a reviewer, you can deduce which tests to expect by reading the description. For instance, if the description contains *"implement a function to validate a username. a valid username is defined by [...]"* you'd expect unit tests calling a function with different usernames asserting on different outcomes/error messages. 

Tests are a good starting point because they surface many common mistakes early. Let's consider the username validation function with a few examples:
* If you find the tests calling the mentioned username validation function with integers instead of username strings, the type signature of the function is likely weak/incorrect. 
* If the tests need a lot of unrelated setup code, it may be worth revisiting the function's interface.
* If the tests assert something seemingly unrelated, the change either includes unrelated changes, has unintended side-effects or the tests themselves are poorly constructed.

If the tests don't align with the description or miss important use cases, discuss the gaps with the author and agree on what needs coverage before merging. Some changes don't have a useful automated test; in those cases, the review should explain how the change was validated.

### Step 3: Implementation
Reviewing tests helps surface implementation flaws quickly, but tests by themselves don't guarantee that the implementation matches the intended behavior. Read the implementation with both the description and tests in mind, looking for missing cases or unrelated changes. Code-coverage tools highlighting affected lines can help identify areas to inspect.

I also think about types, interfaces and concepts. These questions often come up while reviewing tests, but a separate pass can help. My usual starting questions:
* Do introduced/modified types translate to easy-to-understand real world concepts? 
* How self-contained is the implementation? How much context (about the rest of the system) do I need to reason about the code at hand?
* Would code comments help me understand the code more quickly? Comments explaining the *why* can preserve useful context. If a comment is needed to explain the *what*, could clearer naming or structure make the implementation easier to follow?

### Step 4: Rollout Strategy
Large code bases often have complex deployment processes, and changes to critical systems deserve particular care.

For changes that affect production behavior, discuss how the change will be deployed and, if necessary, reverted. The amount of planning should reflect the risk. My key questions focus on backward/forward compatibility and recovery:

Does the change assume an atomic rollout? This assumption can become a burden even in simple client/server applications (e.g. an API and a single-page-application): there's no guarantee that deployment happens in lockstep -- if the client starts sending requests the server doesn't "understand" yet, your service will experience a downtime. A similar common pitfall are database schema changes; for instance adding a new enum option to an existing enum column will cause old consumers to crash when reading a record with the new option.

Can the change *easily* be reverted? If something unexpected does happen, how quickly can it be resolved? The best possible answer is that a single service needs a configuration/feature flag update easily triggered from a web-UI disabling the change. A worst possible answer is that multiple services need unspecified/unknown manual intervention. There's no blanket answer what's best and it depends on the scope and risk of the change itself.

Consider what could go wrong and work with the author to check that the rollout strategy addresses the main risks. This is also a chance to share operational context that may not be obvious from the code.

### Step 5: "gut check"

For a change with meaningful deployment risk, I ask myself a final question: Do I understand the change and its rollout well enough to help if something goes wrong? If not, I discuss the missing context with the author or bring in someone with the relevant expertise. The goal is shared confidence in the change and a clear recovery plan.

## Code Review is a Conversation

Code review is a conversation with another human. A useful way to think about written feedback is to imagine giving it face-to-face.

As a reviewer, explain the reasoning behind your feedback and distinguish concerns that need resolving before merging from suggestions or personal preferences. As an author, ask questions when feedback is unclear and explain the trade-offs behind your choices. Neither person necessarily has all the context at the start.

If written communication is causing friction or leading to misunderstandings, move to a video call or an in-person conversation early. Summarize what you agree on back in the review so the reasoning remains available to others.
