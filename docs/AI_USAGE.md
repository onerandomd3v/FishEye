# How We used AI to build FishEye

AI helped me research, plan, build and review FishEye. we used it as a **research and development assistant**, not as a replacement for making product decisions or checking the results.

## Our workflow

| Stage | How we used AI |
| --- | --- |
| **1. Understand the problem** | we used AI to explore insider threats, suspicious account activity and the challenges security teams face when investigating alerts. |
| **2. Research and validate** | we used AI to find and examine supporting research, including FITC banking fraud reports and Verizon's breach report, and to compare existing products such as Microsoft Purview, Splunk and Exabeam. we separated what those sources established from what we still needed to test. |
| **3. Define the solution** | we discussed possible approaches with AI and narrowed FishEye to context-aware, explainable alert prioritization instead of attempting to build a complete security platform. |
| **4. Plan the architecture** | AI helped me compare technologies, identify trade-offs and prepare product and engineering documentation. we chose a web console, FastAPI backend, PostgreSQL, a separate Python worker and a synthetic-data evaluation workflow. |
| **5. Design and implement** | we used AI-assisted design and coding workflows, including Codex, to help turn the product plan into frontend screens, backend endpoints, data processing and supporting infrastructure. |
| **6. Test and improve** | we used AI to inspect implementation issues, review pull-request feedback, suggest fixes and check that changes matched the product requirements. GitHub CI and actual test results remained the checks for whether changes were ready. |
| **7. Document and present** | AI helped me draft and refine the README, architecture explanations, Mermaid diagrams and project pitch so others could understand the problem and the system. |

## How decisions were made

Our approach was to **ask questions, compare options, make a decision, implement, test and revise**. we did not treat AI suggestions as proof that an idea was correct or that code worked.

For example, we chose to start with **rules and statistical baselines** rather than add a trained AI model immediately. This gives us an explainable starting point that we can compare with machine learning in future experiments.

## What AI does — and doesn't do — in FishEye

**AI was part of the development process.** The current FishEye detection engine itself **does not use a trained AI model**. It uses rule-based detection and statistical analysis to score synthetic employee activity.

The current evaluation uses **synthetic banking data**. It can test a proposed approach, but it does not establish that the system reduces false alerts in a real bank.

The purpose of using AI throughout development was to **research faster, explore decisions carefully, implement more efficiently and improve the quality of the work**—while keeping the decisions and claims open to review.
