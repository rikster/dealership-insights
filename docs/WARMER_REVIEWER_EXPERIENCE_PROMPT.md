# AutoGrab reviewer-experience revision prompt

Copy the prompt below into a Codex task opened at the repository root.

---

## Prompt

Revise this AutoGrab submission so it feels warmer, more customer-focused, collaborative, and product-minded while retaining its technical credibility, safeguards, and auditability.

The intended story is:

> Here is a useful dealership experience. Here is how it helps people make better decisions. Here are the thoughtful engineering controls that make those answers dependable.

The current implementation overemphasises words such as “bounded,” “guardrails,” “refusal,” “rejected,” “forbidden,” “failed,” and “deliberately absent.” Preserve those concepts internally where they are technically necessary, but present them to reviewers in constructive, customer-friendly language.

Work autonomously. Begin by inspecting the current repository, Git state, project instructions, UI, documentation, and tests. Preserve unrelated changes and implement only what remains necessary. Do not rewrite working architecture or weaken security boundaries merely to change the tone.

### Constraints

- Preserve workflow behaviour, permissions, freshness rules, deterministic calculations, evidence validation, internal statuses, and API contracts.
- Internal names such as `refused`, `forbidden`, and `refuse` may remain unchanged.
- Translate internal outcomes into warmer reviewer-facing language.
- Do not introduce unsupported product claims.
- Do not send email, deploy, change repository visibility, or perform other external publication actions.
- The GitHub repository is now public. Use the public links below and do not add a private-repository or access warning.
- Verify that every public link resolves before finalising the email draft.
- Do not imply that the original exercise requested a POC. Describe it as an optional exploration built following the interview discussion.
- Avoid emphasising implementation hours, “going beyond the minimum,” the implementation-plan size, the build-log size, or jokes about the effort involved.

### 1. Update the visual design

Retain a dark identity for the hero and selected technical panels, but make the rest of the page feel like a polished, approachable AutoGrab product.

Use this palette as the design direction:

- Main background: `#F6F7FB`
- Card background: `#FFFFFF`
- Primary text: `#172033`
- Secondary text: `#5E687A`
- Dark hero: `#17264D`
- Primary blue: `#3157D5`
- Supporting violet: `#6657D9`
- Positive green: `#168765`
- Positive background: `#E7F6F0`
- Warning amber: `#A66400`
- Warning background: `#FFF3D9`
- Border: `#E2E6EF`

Use a dark navy or blue-violet hero, warm off-white page background, white cards, 12–16px corner radii, and subtle shadows. Prefer sentence-case labels. Reserve green for fresh or successful results, amber for data requiring attention, and red for genuine unexpected failures. Preserve responsive behaviour, keyboard access, focus states, and accessible contrast. Refine the existing UI instead of creating a large design system.

### 2. Replace the hero copy

Use:

Eyebrow:

> AUTOGRAB AI SQUAD · DESIGN WALKTHROUGH

Heading:

> Fresh dealership insights, with the evidence behind them.

Description:

> A focused proof of concept showing how dealership teams can ask natural-language questions and receive fast, traceable answers from authorised, up-to-date data.

Add or retain two actions:

- Try the workflow
- View the architecture

Add this note:

> Prepared by Richard Hounslow as a discussion companion to the systems-design exercise.

Ensure the actions navigate or scroll to the correct content.

### 3. Improve the query form wording

Use the heading:

> Try a dealership question

Use the supporting text:

> Select a user role and demo condition to explore access, freshness and source availability.

Apply these reviewer-facing label changes without changing internal values:

| Current | Replacement |
| --- | --- |
| Simulated identity | User role |
| Scenario · demo only | Demo condition |
| Normal | Fresh data |
| Stale inventory | Inventory needs refresh |
| Stale valuation | Valuation data needs refresh |
| Catalogue timeout | Catalogue temporarily unavailable |
| Forbidden site | Outside this role’s access |
| Run query | Get insight |
| Running bounded graph… | Checking the data… |

### 4. Reframe the safeguards panel

Replace “Fixed guardrails” with:

> Designed for dependable answers

Use this description:

> The workflow uses approved data sources, enforces role-based access, calculates metrics in application code and only presents claims supported by returned evidence.

Place the detailed constraints in a disclosure titled “View technical safeguards” containing:

- No generated SQL.
- No arbitrary tool selection.
- No expansion beyond the authorised dealership scope.
- No unsupported claims without evidence.

Keep these facts discoverable without making them the page’s dominant message.

### 5. Rework the closing section

Use the eyebrow:

> A focused workflow for live dealer conversations

Use the heading:

> AI understands the question. Application code verifies the answer.

Rename:

- Supported → Included in this prototype
- Deliberately absent → Additional data needed

Use this explanation:

> When the available sources cannot support a conclusion, the workflow explains what is missing rather than guessing.

### 6. Update result terminology

Use these reviewer-facing labels:

| Current | Replacement |
| --- | --- |
| ANSWER | INSIGHT |
| SCOPE + PLAN | HOW IT WAS ANSWERED |
| SOURCES + FRESHNESS | DATA USED |
| METRICS | KEY FIGURES |
| EVIDENCE | SUPPORTING RECORDS |
| VALIDATION + TIMINGS | QUALITY CHECKS |
| returned receipts | supporting records |
| No evidence was produced | No supporting records were required for this result |

Present an internal `refused` result contextually as “Not enough verified data” or “Access limited.” Do not alter the API status just for presentation. Explain constructively what needs refreshing, which source is unavailable, or why the selected role cannot access the requested dealership.

### 7. Revise the README

Open with:

> # AutoGrab dealership insights POC
>
> A reviewer-friendly TypeScript proof of concept exploring how dealership teams can ask natural-language questions and receive fast, evidence-backed answers.
>
> The AI interprets the question and explains verified results. Application code enforces role-based access, source selection, freshness, calculations and supporting evidence.

Rename relevant headings:

- What works → What the demo shows
- Safe refusal → Clear handling of unavailable or insufficient data
- Deliberately unsupported → Outside this prototype
- Five-minute reviewer demo → Suggested five-minute walkthrough

Keep the README concise. Make the live demo, reviewer path, architecture, and decisions easy to find; keep detailed engineering records as secondary links.

### 8. Revise the architecture document

Rename an opening “Safety boundary” section to “Architecture approach” and introduce it with:

> The POC uses a focused workflow rather than an open-ended tool loop. This keeps the experience fast and predictable while allowing the language model to do what it does well: understand dealership questions and explain verified results clearly.

Then describe the technical controls accurately. Internal diagram nodes such as `refuse` may remain. In surrounding prose, prefer “Explain why a verified answer is not currently available.” Do not dilute the actual boundaries.

### 9. Revise the decisions document

Rename “Rejected alternatives” to:

> Alternatives considered and why they were not selected for this POC

Prefer balanced wording such as:

> A Python/Pydantic service was considered, but a TypeScript-only implementation provided one consistent runtime and validation model.

Avoid categorical phrasing where a trade-off explanation is more accurate.

### 10. Reposition engineering records

For the build log:

- Title it “Build and verification record.”
- Add a concise opening summary covering what was implemented, what was verified, the current test result, what remains outside the prototype, and how to reproduce the checks.
- Preserve detailed phases as supporting evidence.

For the implementation plan:

- Keep it out of the primary reviewer journey.
- Name it “Historical implementation plan.”
- Set its status to “Completed; retained as a planning record.”
- Keep it under `docs/archive/` if it is already there; otherwise move it there and repair affected links.
- Do not delete useful historical evidence.

### 11. Replace the reviewer email draft

Update the repository’s reviewer email draft with the following. Use Markdown links if the file format supports them.

Subject: AutoGrab design exercise – interactive POC

Hi Daniel and Shane,

Thanks again for the thoughtful conversation and the opportunity to work through the AutoGrab design exercise.

Following our discussion, I continued exploring the idea and built a small optional proof of concept to make the architecture and trade-offs easier to explore. It shows how dealership teams could ask natural-language questions about stock ageing, market pricing and regional trends, while application code—not the language model—enforces role-based access, data freshness, calculations and supporting evidence.

The demo is intentionally focused. It includes three representative dealership questions and several controlled conditions showing how the workflow responds when information needs refreshing, a source is temporarily unavailable or a dealership falls outside the user’s access.

The result view makes the resolved scope, data sources, freshness checks, calculations, supporting records and timings visible, so the reliability controls can be inspected directly.

**Links**

- [Live demonstration](https://web-eight-ebon-57.vercel.app/)
- [Repository and reviewer guide](https://github.com/rikster/AutoGrabExercise)
- [Architecture](https://github.com/rikster/AutoGrabExercise/blob/main/docs/ARCHITECTURE.md)
- [Design decisions and trade-offs](https://github.com/rikster/AutoGrabExercise/blob/main/docs/DECISIONS.md)

A useful five-minute walkthrough is:

1. Select **Head Office Analyst** and run the stock-ageing question.
2. Try market pricing and regional model ageing to see the different source plans.
3. Select **Valuation data needs refresh** or **Outside this role’s access** to see how the workflow explains why a verified answer is not available.

I also included a deterministic local mode and a focused automated test suite, allowing the workflow to be reviewed without production credentials.

The POC is not intended as a complete AutoGrab product or a substitute for the architecture discussion. It is a concrete way to explore where a focused workflow provides useful speed and confidence, and how the design could evolve as real integrations, authentication and product requirements are introduced.

I enjoyed working through the problem and would be very happy to discuss the decisions, alternatives and possible next steps.

Kind regards,

Richard Hounslow

Keep the first email limited to those four destinations. Link the build record and historical plan from the README instead. Verify all four public URLs, but do not send the email.

### 12. Verify the work

Search the reviewer-facing UI and primary documents for unnecessarily dominant uses of:

- bounded
- guardrails
- refusal/refused
- rejected
- forbidden
- deliberately absent
- receipts

Do not blindly remove technically meaningful occurrences. Confirm that prominent customer-facing language has improved while internal accuracy remains intact.

Check navigation links, anchors, disclosure behaviour, loading states, error states, and responsive layout. Run the project’s existing checks, including where available:

```text
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Fix regressions introduced by the work. If practical, render or inspect the page at desktop and mobile widths. Do not claim a check passed unless it was run.

Finish with a concise report containing:

1. UI and copy changes completed.
2. Documentation updated.
3. Reviewer email and public-link verification status.
4. Commands run and their results.
5. Files changed.
6. Any remaining manual checks before sending the submission.

---

Begin by inspecting the current implementation and identifying which recommendations are already satisfied. Then implement the remaining changes and verify the finished result.
