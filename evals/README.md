# Evals

Evals for the two AI parts of the backend. They call the real code (`src/ai/mentor.ts`, `src/ai/extract-tasks.ts`) with the env-configured models, so a run measures what users get.

```bash
# backend/.env: ANTHROPIC_API_KEY, AI_MODEL_MENTOR, AI_MODEL_EXTRACTION, optional AI_MODEL_JUDGE
npm run evals                         # both
npm run evals -- mentor               # or: onboarding
npm run evals -- mentor --only mt-01,mt-22
npm run evals -- --mock               # no key: checks the harness runs; scores mean nothing
```

Each run writes `evals/results/<component>-<timestamp>.json`: summary, and per case the checks, judge verdicts with reasons, the model output and the logged AI calls (model, ms, tokens, fallback reason). Commit the run you quote on the slide. The exit code is 1 if any case fails.

## Mentor: `datasets/mentor.json` (22 cases)

Copied from the frontend repo (`evals/mentor.json`, format in `evals/README.md` there). Edit it there and copy it here again.

Each case replays the app flow, with nothing revealed (first attempt):

| Case | Calls | Graded |
| --- | --- | --- |
| `card:<title>` | `askMentor`, context `lesson` | the reply |
| exercise + `learner_message` | `reviewMistake` (attempt 1), then `askMentor` with that exchange as history | the ask reply |
| exercise + `learner_message: null` | `reviewMistake` | the proactive review |

**Pass:** the reply came from the model (no fallback, the answer guard did not fire), no hidden correct option quoted verbatim (`leaksAnswer`), and the judge passes `expected_behavior`, every `must` and every `must_not`. Reported, not gated: main text ≤ 60 words, review source, latency.

## Onboarding: `datasets/onboarding-extraction.json` (20 cases)

The only model call in onboarding is free text → work tasks. The chaos map and the plan are built from those tasks by code (`src/domain/`), and the e2e tests cover that code.

Cases cover the 3 roles, Ukrainian input, a prompt injection (`ox-06`), text that is too vague (`ox-07`), job search mixed in (`ox-12`) and tasks that need human judgment (`ox-03`, `ox-11`, `ox-17`).

**Pass:** all code checks pass, and the judge agrees that every task is grounded in the text (R1) and is routine work (R2).

| Check | Rule |
| --- | --- |
| `from_model` | no template fallback |
| `expected_skills` | every expected skill present |
| `extra_skills` | ≤ 1 skill outside `expected_skills` ∪ `acceptable_skills` |
| `forbidden_skills`, `forbidden_title_words` | none present |
| `hours` | stated hours kept: sum for that skill within `[min, max]` |
| `human_task` | a task matching the keywords, if returned, is `human` |
| `max_tasks` | at most N tasks |
| `english_titles` | no Cyrillic in titles |

Also reported: skill recall and precision, and grounded rate.

## Judge

`lib/judge.ts`: one call per case, temperature 0, numbered rules with a yes/no verdict and a one-line reason each. A rule with no verdict counts as failed. The judge sees the correct answer so it can catch indirect leaks ("not B", paraphrases). The judge model is `AI_MODEL_JUDGE`, or `AI_MODEL_MENTOR` when unset. A judge from a different model family than the one under test is less biased.

The datasets were drafted by an LLM. Before you quote numbers, read every failure and 5 random passes, and fix wrong expectations (see the frontend evals README).
